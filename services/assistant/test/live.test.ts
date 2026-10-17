import { describe, expect, it } from 'vitest'
import { DeveloperAccounts } from '../src/gateway/accounts'
import { monthOf } from '../src/gateway/budget'
import { Gateway } from '../src/gateway/gateway'
import type { Metering } from '../src/gateway/metering'
import { DEFAULT_AI_RUNTIME } from '../src/gateway/runtime'
import type { UsageEventInput } from '../src/ledger'
import { createOpenAIProvider } from '../src/providers/openai'
import { ProviderRegistry } from '../src/providers/registry'

/**
 * OPT-IN live smoke test against OpenAI. Runs only when OPENAI_LIVE_TEST_KEY is set in the environment of the
 * test run (never commit a key). Optional: OPENAI_LIVE_TEST_MODEL. It sends one short request with one tool.
 */
const key = process.env.OPENAI_LIVE_TEST_KEY

describe.skipIf(!key)('OpenAI live smoke test (opt-in)', () => {
  it('validates the key, lists models and gets a tool call or an answer', async () => {
    const provider = createOpenAIProvider()
    const credential = { kind: 'api-key' as const, apiKey: key! }
    const { models } = await provider.validateCredential(credential, 'api-key', AbortSignal.timeout(20_000))
    expect(models.length).toBeGreaterThan(0)
    const model = process.env.OPENAI_LIVE_TEST_MODEL ?? (models.some((m) => m.id === provider.defaultModel) ? provider.defaultModel : models[0].id)
    const out = await provider.respond({
      credential,
      method: 'api-key',
      model,
      instructions: 'Use the read_object tool to read ROD-120.',
      messages: [{ type: 'message', role: 'user', text: 'What is ROD-120?' }],
      tools: [{ name: 'read_object', description: 'Read one object by stable ID.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } }],
      maxOutputTokens: 300,
      signal: AbortSignal.timeout(60_000),
    })
    expect(['tool_calls', 'final']).toContain(out.type)
  }, 90_000)
})

/**
 * Live tier, gateway: one real request through route, reservation, started, adapter and priced completed, with the key given as a
 * developer key. The ledger is in memory (no database). Reads only OPENAI_LIVE_TEST_KEY; never a connection record or the
 * ChatGPT sign-in. Costs a few cents at most (one short answer, capped at 200 output tokens).
 */
describe.skipIf(!key)('Gateway live smoke test (opt-in)', () => {
  it('meters one real request made with a developer key', async () => {
    const events: UsageEventInput[] = []
    const metering: Metering = {
      begin: async (e) => void events.push(e),
      record: async (e) => void events.push(e),
      state: async (limit, at) => ({ period: monthOf(at).label, currency: 'USD', limit, used: '0', reserved: '0', remaining: limit }),
    }
    const providers = new ProviderRegistry().register(createOpenAIProvider())
    const runtime = { ...DEFAULT_AI_RUNTIME, mode: 'development' as const, developerKeys: { openai: key! }, allowUnverifiedPricing: true, monthlyBudgetUsd: '1' }
    const gateway = new Gateway({ providers, accounts: new DeveloperAccounts(runtime.developerKeys, providers), metering, runtime })
    const result = await gateway.call({
      userId: 'live-test',
      operationId: 'live.smoke',
      routing: { mode: process.env.OPENAI_LIVE_TEST_MODEL ? 'manual' : 'economy', manual: process.env.OPENAI_LIVE_TEST_MODEL ? { provider: 'openai', model: process.env.OPENAI_LIVE_TEST_MODEL } : undefined },
      input: { instructions: 'Answer in one short sentence.', messages: [{ type: 'message', role: 'user', text: 'Say hello.' }], tools: [], maxOutputTokens: 200 },
      signal: AbortSignal.timeout(60_000),
    })
    expect(result.output.type).toBe('final')
    expect(events.map((e) => e.event)).toEqual(['started', 'completed'])
    expect(result.routing).toMatchObject({ provider: 'openai', source: 'developer-key', billing: 'meter_only' })
    expect(result.usage.inputTokens).toBeGreaterThan(0)
  }, 90_000)
})
