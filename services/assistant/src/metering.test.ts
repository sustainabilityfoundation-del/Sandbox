import { describe, expect, it } from 'vitest'
import { LedgerError, priceUsage, sanitizeRaw, UsageLedger, type UsageEventInput } from './ledger'
import { createFakeProvider } from './providers/fake'
import { createOpenAIProvider, normaliseOpenAIUsage } from './providers/openai'
import type { PricingRecord } from './pricing'

/** Mock tier (no network, no database): brief section 17 criteria 8 (usage normalised) and 20 (BYOK carries no credits). */

const KEY = 'sk-test-0123456789abcdefghijKLMN'
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
const respondInput = (model: string) => ({
  credential: { kind: 'api-key' as const, apiKey: KEY },
  method: 'api-key',
  model,
  instructions: 'x',
  messages: [{ type: 'message' as const, role: 'user' as const, text: 'hi' }],
  tools: [],
  signal: new AbortController().signal,
})

describe('criterion 8: provider usage is normalised', () => {
  it('maps OpenAI cached and reasoning token details and keeps the raw numbers', () => {
    const u = normaliseOpenAIUsage({ input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 1000 }, output_tokens_details: { reasoning_tokens: 120 } })
    expect(u).toMatchObject({ inputTokens: 1200, outputTokens: 300, cachedInputTokens: 1000, reasoningTokens: 120, reported: 'provider' })
    expect(u.raw).toMatchObject({ input_tokens: 1200 })
  })

  it('leaves detail fields out when OpenAI does not report them, and flags missing usage as not provider-reported', () => {
    const u = normaliseOpenAIUsage({ input_tokens: 5, output_tokens: 2 })
    expect(u).not.toHaveProperty('cachedInputTokens')
    expect(u).not.toHaveProperty('reasoningTokens')
    expect(normaliseOpenAIUsage(undefined)).toEqual({ reported: 'estimated' })
  })

  it('the OpenAI adapter returns normalised usage through respond() (mocked fetch)', async () => {
    const f = (async () => sse([{ type: 'response.completed', response: { model: 'm', usage: { input_tokens: 50, output_tokens: 9, input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 4 } }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] } }])) as unknown as typeof fetch
    const out = await createOpenAIProvider({ fetch: f }).respond(respondInput('m'))
    expect(out.usage).toMatchObject({ inputTokens: 50, outputTokens: 9, cachedInputTokens: 20, reasoningTokens: 4, reported: 'provider' })
  })

  it('every adapter declares capabilities, and the fake provider labels its usage as estimated', async () => {
    const openai = createOpenAIProvider({})
    const fake = createFakeProvider()
    for (const p of [openai, fake]) expect(Object.keys(p.capabilities).sort()).toEqual(['imageInput', 'modelDiscovery', 'promptCaching', 'reasoningEffort', 'streaming', 'structuredOutput', 'tools'])
    const out = await fake.respond({ ...respondInput('fake-small'), credential: { kind: 'api-key', apiKey: 'fake-0123456789' } })
    expect(out.usage?.reported).toBe('estimated')
  })

  it('ledger raw usage keeps numbers only, never text', () => {
    expect(sanitizeRaw({ input_tokens: 5, prompt: 'secret text', nested: { a: 1, b: 'text' }, flag: true, deep: { s: 'only text' } })).toEqual({ input_tokens: 5, nested: { a: 1 }, flag: true })
    expect(sanitizeRaw('a string')).toBeUndefined()
  })

  it('builds the cost fields of a ledger event from usage and the pricing record in force', () => {
    // TEST FIXTURE rate, not a provider price.
    const record: PricingRecord = { pricingVersion: 'TEST-FIXTURE-v1', model: 'm', effectiveFrom: '2026-01-01', currency: 'USD', verified: false, sourceUrl: null, retrievedAt: null, rates: { input: { price: '1.00', per: 1_000_000 }, output: { price: '2.00', per: 1_000_000 } } }
    const fields = priceUsage({ inputTokens: 1_000_000, outputTokens: 500_000, reported: 'provider' }, record)
    expect(fields).toMatchObject({ estimatedProviderCost: '2.0000000000', pricingVersion: 'TEST-FIXTURE-v1', currency: 'USD' })
    expect(fields.ratesUsed?.rates.input.price).toBe('1.00')
    expect(priceUsage({ inputTokens: 1, reported: 'provider' }, undefined)).toEqual({})
  })
})

describe('criterion 20: BYOK and consumer-plan usage carries no credits', () => {
  const base: UsageEventInput = { idempotencyKey: 'k', event: 'completed', requestId: 'r', operationId: 'o', provider: 'openai', model: 'm', source: 'user-connection', billing: 'byok' }
  // A database that fails the test if reached: the rule is enforced before any SQL.
  const noDb = new UsageLedger({ query: async () => { throw new Error('database must not be reached') } } as never)

  it('refuses credits on byok and consumer-plan events before touching the database', async () => {
    for (const billing of ['byok', 'consumer-plan'] as const) {
      await expect(noDb.record({ ...base, billing, creditsCharged: '1.5' })).rejects.toMatchObject({ code: 'credits-not-allowed' })
    }
    await expect(noDb.record({ ...base, billing: 'byok', creditsCharged: '0' })).rejects.toBeInstanceOf(LedgerError)
  })

  it('requires an idempotency key', async () => {
    await expect(noDb.record({ ...base, idempotencyKey: '' })).rejects.toMatchObject({ code: 'invalid-event' })
  })
})
