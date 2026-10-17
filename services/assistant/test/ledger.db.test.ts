import '../../api/test/providedContext'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import { dropDatabase, ensureDatabase } from '../../api/src/database'
import { migrateAssistant } from '../src/db/migrate'
import { LedgerError, syncPricing, UsageLedger, type UsageEventInput } from '../src/ledger'
import { listPricingProviders, loadPricing } from '../src/pricing'

/**
 * Integration tier (real PostgreSQL, npm run ai:test:db): the usage ledger. Brief section 17 criterion 12 (duplicate
 * events do not produce duplicate charges) plus the schema's own guarantees. No provider is called.
 */

let pool: pg.Pool
let ledger: UsageLedger
let admin: string
const name = `ews_test_${randomBytes(5).toString('hex')}`

beforeAll(async () => {
  admin = inject('pgAdminUrl')
  await ensureDatabase(admin, name)
  const u = new URL(admin)
  u.pathname = `/${name}`
  pool = new pg.Pool({ connectionString: u.toString(), max: 10 })
  await migrateAssistant(pool)
  ledger = new UsageLedger(pool)
})

afterAll(async () => {
  await pool?.end()
  await dropDatabase(admin, name)
})

const event = (over: Partial<UsageEventInput> = {}): UsageEventInput => ({
  idempotencyKey: `k-${randomBytes(6).toString('hex')}`,
  event: 'completed',
  requestId: 'req-1',
  operationId: 'op-1',
  conversationId: 'conv-1',
  provider: 'fake',
  model: 'fake-small',
  source: 'mock',
  billing: 'mock',
  usage: { inputTokens: 100, outputTokens: 20, reported: 'estimated' },
  estimatedProviderCost: '0.0010000000',
  pricingVersion: 'TEST-FIXTURE-v1',
  ...over,
})

describe('criterion 12: duplicate events do not produce duplicate charges', () => {
  it('one row for a repeated idempotency key, also when the repeats race', async () => {
    const e = event({ conversationId: 'conv-dup' })
    const results = await Promise.all(Array.from({ length: 8 }, () => ledger.record(e)))
    expect(results.filter((r) => r.inserted)).toHaveLength(1)
    expect(new Set(results.map((r) => r.event.id)).size).toBe(1)
    const rows = await pool.query('SELECT count(*)::int AS n FROM assistant.usage_events WHERE idempotency_key = $1', [e.idempotencyKey])
    expect(rows.rows[0].n).toBe(1)
    const [total] = await ledger.aggregate({ groupBy: 'conversation', conversationId: 'conv-dup' })
    expect(total).toMatchObject({ requests: 1, inputTokens: 100, outputTokens: 20, estimatedProviderCost: '0.0010000000' })
  })

  it('a retry with different content still adds nothing and returns the first row', async () => {
    const first = event({ idempotencyKey: 'k-retry', estimatedProviderCost: '0.0020000000' })
    await ledger.record(first)
    const again = await ledger.record({ ...first, estimatedProviderCost: '9.0000000000' })
    expect(again.inserted).toBe(false)
    expect(again.event.estimatedProviderCost).toBe('0.0020000000')
  })
})

describe('ledger schema', () => {
  it('is insert-only: update, delete and truncate are refused', async () => {
    const { event: row } = await ledger.record(event())
    await expect(pool.query('UPDATE assistant.usage_events SET input_tokens = 1 WHERE id = $1', [row.id])).rejects.toThrow(/insert-only/)
    await expect(pool.query('DELETE FROM assistant.usage_events WHERE id = $1', [row.id])).rejects.toThrow(/insert-only/)
    await expect(pool.query('TRUNCATE assistant.usage_events')).rejects.toThrow(/insert-only/)
  })

  it('refuses credits on BYOK and consumer-plan rows in the database itself, and marks mock rows simulated', async () => {
    const insert = (billing: string, credits: string | null, simulated: boolean) =>
      pool.query(`INSERT INTO assistant.usage_events (idempotency_key, event, request_id, operation_id, provider, model, source, billing, simulated, credits_charged) VALUES ($1, 'completed', 'r', 'o', 'p', 'm', 'user-connection', $2, $3, $4)`, [`raw-${randomBytes(4).toString('hex')}`, billing, simulated, credits])
    await expect(insert('byok', '1', false)).rejects.toThrow(/no_credits_for_byok/)
    await expect(insert('consumer-plan', '1', false)).rejects.toThrow(/no_credits_for_byok/)
    await expect(insert('mock', null, false)).rejects.toThrow(/mock_is_simulated/)
    await insert('meter_only', '1', false)
    const mock = await ledger.record(event({ simulated: false }))
    expect(mock.event.simulated).toBe(true)
  })

  it('stores money exactly (numeric(20,10)) and no prompt or response text', async () => {
    const { event: row } = await ledger.record(event({ estimatedProviderCost: '123456789.1234567891', usage: { inputTokens: 1, reported: 'provider', raw: { input_tokens: 1, prompt: 'confidential design text' } } }))
    expect(row.estimatedProviderCost).toBe('123456789.1234567891')
    expect(JSON.stringify(row)).not.toContain('confidential')
    const cols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'assistant' AND table_name = 'usage_events'`)).rows.map((r) => r.column_name as string)
    expect(cols.filter((c) => /prompt|response|content|message|text|output$/.test(c))).toEqual([])
  })

  it('keeps a provider-reported cost (xAI ticks) as the actual cost, and the 1 hour cache-write split', async () => {
    const { ticksToUsd } = await import('../src/pricing')
    const { event: row } = await ledger.record(event({ usage: { inputTokens: 10, cacheWriteTokens: 4, cacheWrite1hTokens: 3, providerCost: ticksToUsd(12_345_678_900), reported: 'provider' } }))
    expect(row).toMatchObject({ actualProviderCost: '1.2345678900', cacheWriteTokens: 4, cacheWrite1hTokens: 3 })
  })

  it('reproduces a stored cost from the row alone', async () => {
    const { costFromSnapshot } = await import('../src/pricing')
    // TEST FIXTURE rates.
    const ratesUsed = { pricingVersion: 'TEST-FIXTURE-v7', currency: 'USD', verified: false, rates: { input: { price: '3.00', per: 1_000_000 }, output: { price: '15.00', per: 1_000_000 } } }
    const usage = { inputTokens: 2_000, outputTokens: 500, reported: 'provider' as const }
    const cost = costFromSnapshot(usage, ratesUsed).total!
    const { event: row } = await ledger.record(event({ usage, estimatedProviderCost: cost, pricingVersion: 'TEST-FIXTURE-v7', ratesUsed, billing: 'meter_only', source: 'developer-key', provider: 'openai', model: 'm' }))
    const again = await ledger.get(row.idempotencyKey)
    expect(costFromSnapshot({ inputTokens: again!.inputTokens, outputTokens: again!.outputTokens }, again!.ratesUsed!).total).toBe(again!.estimatedProviderCost)
  })
})

describe('aggregation and corrections', () => {
  it('aggregates by conversation, operation and period; started rows are not usage', async () => {
    const conv = 'conv-agg'
    await ledger.record(event({ conversationId: conv, operationId: 'op-a', event: 'started', usage: undefined, estimatedProviderCost: undefined, reservedCost: '0.5000000000' }))
    await ledger.record(event({ conversationId: conv, operationId: 'op-a', estimatedProviderCost: '0.1000000000' }))
    await ledger.record(event({ conversationId: conv, operationId: 'op-a', estimatedProviderCost: '0.2000000000', usage: { inputTokens: 10, outputTokens: 5, reported: 'provider' } }))
    await ledger.record(event({ conversationId: conv, operationId: 'op-b', estimatedProviderCost: '0.3000000000', provider: 'fake' }))
    await ledger.record(event({ conversationId: conv, operationId: 'op-b', event: 'failed', usage: undefined, estimatedProviderCost: undefined }))
    const byOp = await ledger.aggregate({ groupBy: 'operation', conversationId: conv })
    expect(byOp.map((r) => [r.key, r.requests, r.failed, r.cost])).toEqual([['op-a', 2, 0, '0.3000000000'], ['op-b', 1, 1, '0.3000000000']])
    const [byConv] = await ledger.aggregate({ groupBy: 'conversation', conversationId: conv })
    expect(byConv).toMatchObject({ requests: 3, failed: 1, inputTokens: 210, cost: '0.6000000000', creditsCharged: '0.0000000000' })
    const byMonth = await ledger.aggregate({ groupBy: 'period', period: 'month', conversationId: conv })
    expect(byMonth).toHaveLength(1)
    expect(byMonth[0].key).toMatch(/^\d{4}-\d{2}-01$/)
    expect(await ledger.aggregate({ groupBy: 'conversation', conversationId: conv, simulated: false })).toEqual([])
  })

  it('corrects with compensating rows and leaves the original untouched', async () => {
    const conv = 'conv-corr'
    const { event: orig } = await ledger.record(event({ idempotencyKey: 'k-orig', conversationId: conv, estimatedProviderCost: '0.4000000000' }))
    const fix = await ledger.correct({ original: 'k-orig', idempotencyKey: 'k-fix', reason: 'provider invoice lower', deltas: { estimatedProviderCost: '-0.1000000000', inputTokens: -20 } })
    expect(fix.event).toMatchObject({ event: 'correction', correctsEventId: orig.id, reason: 'provider invoice lower', conversationId: conv })
    expect((await ledger.correct({ original: 'k-orig', idempotencyKey: 'k-fix', reason: 'again', deltas: { estimatedProviderCost: '-9' } })).inserted).toBe(false)
    const [t] = await ledger.aggregate({ groupBy: 'conversation', conversationId: conv })
    expect(t).toMatchObject({ requests: 1, inputTokens: 80, cost: '0.3000000000' })
    await ledger.reverse('k-orig', 'k-rev', 'recorded in error')
    const [after] = await ledger.aggregate({ groupBy: 'conversation', conversationId: conv })
    expect(after).toMatchObject({ inputTokens: -20, cost: '-0.1000000000' }) // original reversed once more on top of the first fix: compensations add up, they are not idempotent per original
    expect((await ledger.get('k-orig'))?.estimatedProviderCost).toBe('0.4000000000')
    await expect(ledger.correct({ original: 'k-fix', idempotencyKey: 'k-x', reason: 'r', deltas: {} })).rejects.toBeInstanceOf(LedgerError)
    await expect(ledger.correct({ original: 'missing', idempotencyKey: 'k-y', reason: 'r', deltas: {} })).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('pricing table', () => {
  it('loads the registry files idempotently and refuses changed content under the same version', async () => {
    const files = listPricingProviders().map((p) => loadPricing(p))
    const first = await syncPricing(pool, files)
    expect(first.inserted).toBeGreaterThan(0)
    expect(await syncPricing(pool, files)).toEqual({ inserted: 0, unchanged: first.inserted })
    const changed = structuredClone(files[0])
    changed.records[0].rates = { input: { price: '9.99', per: 1 } }
    await expect(syncPricing(pool, [changed])).rejects.toMatchObject({ code: 'pricing-conflict' })
    const rows = await pool.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE verified)::int AS verified, count(DISTINCT variant)::int AS variants FROM assistant.pricing WHERE provider = 'openai'`)
    expect(rows.rows[0].n).toBe(files.find((f) => f.provider === 'openai')!.records.length)
    expect(rows.rows[0].verified).toBe(0)
    expect(rows.rows[0].variants).toBeGreaterThan(1) // service tiers and context bands are part of the key
  })
})
