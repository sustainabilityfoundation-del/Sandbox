import { describe, expect, it } from 'vitest'
import { createOpenAIProvider } from '../src/providers/openai'

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
