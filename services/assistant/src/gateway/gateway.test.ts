import { describe, expect, it } from 'vitest'
import { AssistantError } from '../errors'
import type { UsageEventInput } from '../ledger'
import { Money } from '../pricing'
import { createFakeProvider } from '../providers/fake'
import { createOpenAIProvider } from '../providers/openai'
import { ProviderRegistry } from '../providers/registry'
import { ProviderError } from '../providers/types'
import { DeveloperAccounts } from './accounts'
import { monthOf, type BudgetState } from './budget'
import { Gateway, type GatewayCall, type UserConnectionHandle } from './gateway'
import type { Metering } from './metering'
import { DEFAULT_AI_RUNTIME, type AiRuntimeConfig } from './runtime'

/**
 * Gateway sequence and fail-safe, without a database (mock tier). The ledger is an in-memory Metering; the providers are the
 * fake provider and the OpenAI adapter over a stubbed fetch. Prices come from the repository's pricing files (unverified).
 */

function memoryMetering(log: string[] = []) {
  const events: UsageEventInput[] = []
  const m = {
    events,
    failBegin: false,
    failRecord: 0,
    async begin(started: UsageEventInput, reservation?: { limit: string; at: Date; extraUsed: string }) {
      if (m.failBegin) throw new Error('connection refused')
      if (reservation) {
        const state = await m.state(reservation.limit, reservation.at, reservation.extraUsed)
        if (new Money(started.reservedCost ?? '0').gt(state.remaining)) throw new AssistantError('budget-exceeded', 'The monthly development budget would be exceeded.', 429)
      }
      log.push('begin')
      events.push(started)
    },
    async record(event: UsageEventInput) {
      if (m.failRecord > 0) {
        m.failRecord--
        throw new Error('connection refused')
      }
      if (events.some((e) => e.idempotencyKey === event.idempotencyKey)) return
      log.push(`record:${event.event}`)
      events.push(event)
    },
    async state(limit: string, at: Date, extraUsed = '0'): Promise<BudgetState> {
      const ended = new Set(events.filter((e) => e.event !== 'started').map((e) => e.requestId))
      const used = events.filter((e) => e.source === 'developer-key' && e.event === 'completed').reduce((s, e) => s.plus(e.estimatedProviderCost ?? '0'), new Money(extraUsed))
      const reserved = events.filter((e) => e.source === 'developer-key' && e.event === 'started' && !ended.has(e.requestId)).reduce((s, e) => s.plus(e.reservedCost ?? '0'), new Money(0))
      const remaining = new Money(limit).minus(used).minus(reserved)
      return { period: monthOf(at).label, currency: 'USD', limit, used: used.toFixed(10), reserved: reserved.toFixed(10), remaining: remaining.isNegative() ? '0' : remaining.toFixed(10) }
    },
  }
  return m satisfies Metering & { events: UsageEventInput[]; failBegin: boolean; failRecord: number }
}

function sse(events: unknown[]): Response {
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** OpenAI over a stubbed fetch that answers every request with a short text and fixed usage. */
function stubbedOpenAI(log: string[] = []) {
  const requests: { url: string; auth: string | null; body: any }[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const auth = new Headers(init?.headers).get('authorization')
    if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6-luna' }, { id: 'gpt-experimental' }] }), { status: 200 })
    requests.push({ url: u, auth, body: JSON.parse(String(init?.body ?? '{}')) })
    log.push('respond')
    return sse([{ type: 'response.completed', response: { model: 'gpt-6.1-sol', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }], usage: { input_tokens: 1000, output_tokens: 500 } } }])
  }) as typeof fetch
  return { provider: createOpenAIProvider({ fetch: f }), requests }
}

const USER = { userId: 'eli' }
function call(over: Partial<GatewayCall> = {}): GatewayCall {
  return {
    ...USER,
    projectId: 'PRJ-ACT100',
    conversationId: 'CONV-1',
    operationId: 'assistant.respond',
    routing: { mode: 'balanced' },
    input: { instructions: 'x', messages: [{ type: 'message', role: 'user', text: 'hello' }], tools: [], maxOutputTokens: 1000 },
    signal: AbortSignal.timeout(5000),
    ...over,
  }
}

function build(runtime: Partial<AiRuntimeConfig>, metering = memoryMetering(), log: string[] = []) {
  const openai = stubbedOpenAI(log)
  const fake = createFakeProvider()
  const providers = new ProviderRegistry().register(openai.provider).register(fake)
  const rt: AiRuntimeConfig = { ...DEFAULT_AI_RUNTIME, ...runtime }
  const accounts = new DeveloperAccounts(rt.developerKeys, providers)
  const gateway = new Gateway({ providers, accounts, metering, runtime: rt, retryDelaysMs: [0, 0, 0] })
  return { gateway, metering, openai, fake, accounts, log }
}

const DEV: Partial<AiRuntimeConfig> = { mode: 'development', developerKeys: { openai: 'sk-test-0123456789abcdef0123' }, allowUnverifiedPricing: true, monthlyBudgetUsd: '25' }

describe('the dispatch sequence', () => {
  it('routes, reserves, records started, calls the adapter, then records completed with cost', async () => {
    const log: string[] = []
    const { gateway, metering } = build(DEV, memoryMetering(log), log)
    const r = await gateway.call(call())
    expect(log).toEqual(['begin', 'respond', 'record:completed'])
    const [started, completed] = metering.events
    expect(started).toMatchObject({ event: 'started', source: 'developer-key', billing: 'meter_only', simulated: false, conversationId: 'CONV-1', operationId: 'assistant.respond' })
    expect(Number(started.reservedCost)).toBeGreaterThan(0)
    expect(completed).toMatchObject({ event: 'completed', requestId: started.requestId, usage: { inputTokens: 1000, outputTokens: 500, reported: 'provider' } })
    expect(completed.estimatedProviderCost).toMatch(/^\d+\.\d{10}$/)
    expect(completed.ratesUsed?.verified).toBe(false)
    expect(r.cost).toMatchObject({ estimated: completed.estimatedProviderCost, currency: 'USD', verified: false, billing: 'meter_only' })
    expect(r.routing).toMatchObject({ provider: 'openai', source: 'developer-key', mode: 'balanced', simulated: false })
    expect(r.usage).toMatchObject({ inputTokens: 1000, outputTokens: 500, reported: 'provider' })
  })

  it('records failed and cancelled requests, and rethrows the provider error', async () => {
    const { gateway, metering, fake } = build({ mode: 'mock' })
    const original = fake.respond
    fake.respond = async () => {
      throw new ProviderError('unavailable', 'down')
    }
    await expect(gateway.call(call())).rejects.toThrow('down')
    fake.respond = async () => {
      throw new ProviderError('cancelled', 'stopped')
    }
    await expect(gateway.call(call())).rejects.toThrow('stopped')
    fake.respond = original
    expect(metering.events.map((e) => e.event)).toEqual(['started', 'failed', 'started', 'cancelled'])
  })

  it('developer-key usage that cannot be priced is charged at the reserved worst case, never as zero', async () => {
    const { gateway, metering, openai } = build(DEV)
    const original = openai.provider.respond
    openai.provider.respond = async (input) => ({ ...(await original(input)), usage: { inputTokens: 10, outputTokens: 10, units: [{ dimension: 'unpriced-unit', quantity: 3 }], reported: 'provider' } })
    const r = await gateway.call(call())
    const [started, completed] = metering.events
    expect(completed.estimatedProviderCost).toBe(started.reservedCost)
    expect(completed.accountingStatus).toBe('provisional')
    expect(r.cost.estimated).toBe(started.reservedCost)
  })

  it('applies named price modifiers to the stored snapshot', async () => {
    const { gateway, metering } = build(DEV)
    await gateway.call(call({ modifiers: ['dataResidencyUplift'] }))
    expect(metering.events.at(-1)!.ratesUsed?.discounts?.map((d) => d.name)).toContain('dataResidencyUplift')
  })
})

describe('mock mode', () => {
  it('uses only the mock personas, simulated and priced at zero, and never touches a person’s connection', async () => {
    const { gateway, metering, openai } = build({ mode: 'mock' })
    let credentialAsked = false
    const connection: UserConnectionHandle = { id: 'c1', provider: 'openai', method: 'api-key', model: 'gpt-6.1-sol', credential: async () => ((credentialAsked = true), { kind: 'api-key', apiKey: 'sk-real-owner-key-00000000' }) }
    const r = await gateway.call(call({ userConnection: connection }))
    expect(credentialAsked).toBe(false)
    expect(openai.requests).toHaveLength(0)
    expect(r.routing).toMatchObject({ provider: 'fake', source: 'mock', billing: 'mock', simulated: true })
    expect(r.cost).toMatchObject({ billing: 'mock', estimated: '0.0000000000' })
    expect(metering.events.every((e) => e.source === 'mock' && e.billing === 'mock' && e.simulated)).toBe(true)
    // Even Manual with the connection's provider and model finds nothing real.
    await expect(gateway.call(call({ userConnection: connection, routing: { mode: 'manual', manual: { provider: 'openai', model: 'gpt-6.1-sol' } } }))).rejects.toMatchObject({ code: 'model-unavailable' })
  })
})

describe('fail-safe (ledger outage)', () => {
  it('refuses with 503 metering-unavailable when started cannot be written, and sends nothing to the provider', async () => {
    const log: string[] = []
    const { gateway, metering } = build(DEV, memoryMetering(log), log)
    metering.failBegin = true
    await expect(gateway.call(call())).rejects.toMatchObject({ code: 'metering-unavailable', status: 503 })
    expect(log).not.toContain('respond')
  })

  it('degrades when completed cannot be written, blocks developer-key calls, and recovers on the next successful write', async () => {
    const log: string[] = []
    const { gateway, metering, openai } = build(DEV, memoryMetering(log), log)
    metering.failRecord = 99
    const answered = await gateway.call(call())
    expect(answered.output).toMatchObject({ type: 'final' })
    expect(gateway.degraded).toBe(true)
    // While degraded the developer key is paused (nothing is sent to the provider).
    const before = openai.requests.length
    await expect(gateway.call(call())).rejects.toMatchObject({ code: 'metering-degraded', status: 503 })
    expect(openai.requests.length).toBe(before)
    // The ledger comes back: the kept event is written and developer-key calls resume.
    metering.failRecord = 0
    await gateway.call(call())
    expect(gateway.degraded).toBe(false)
    expect(metering.events.filter((e) => e.event === 'completed')).toHaveLength(2)
  })

  it('does not block a person’s own connection while degraded', async () => {
    const { gateway, metering } = build(DEV)
    metering.failRecord = 99
    await gateway.call(call())
    expect(gateway.degraded).toBe(true)
    const own: UserConnectionHandle = { id: 'c2', provider: 'fake', method: 'api-key', model: 'fake-large', credential: async () => ({ kind: 'api-key', apiKey: 'fake-own-key-0123456' }) }
    metering.failRecord = 0
    const r = await gateway.call(call({ userConnection: own, routing: { mode: 'manual', manual: { provider: 'fake', model: 'fake-large' } } }))
    expect(r.routing).toMatchObject({ source: 'user-connection', billing: 'byok' })
    expect(gateway.degraded).toBe(false)
  })
})

describe('development budget', () => {
  it('refuses a request whose worst case does not fit, before anything is sent', async () => {
    const log: string[] = []
    const { gateway } = build({ ...DEV, monthlyBudgetUsd: '0.000001' }, memoryMetering(log), log)
    await expect(gateway.call(call())).rejects.toThrow()
    expect(log).not.toContain('respond')
  })

  it('counts finished requests against the one cap across providers', async () => {
    const { gateway } = build(DEV)
    const before = await gateway.budget()
    await gateway.call(call())
    const after = await gateway.budget()
    expect(new Money(after.used).gt(before.used)).toBe(true)
    expect(after.limit).toBe('25')
  })
})

describe('stickiness across a conversation', () => {
  it('keeps the model of the first call while it stays eligible', async () => {
    const { gateway } = build({ mode: 'mock' })
    const first = await gateway.call(call({ stickyKey: 'c:eli:CONV-1', routing: { mode: 'quality' } }))
    expect(first.routing.sticky).toBe(false)
    const second = await gateway.call(call({ stickyKey: 'c:eli:CONV-1', routing: { mode: 'quality' } }))
    expect(second.routing).toMatchObject({ sticky: true, model: first.routing.model })
    const other = await gateway.call(call({ stickyKey: 'c:eli:CONV-2', routing: { mode: 'economy' } }))
    expect(other.routing.sticky).toBe(false)
  })
})
