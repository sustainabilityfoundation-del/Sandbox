import { describe, expect, it } from 'vitest'
import { createFakeImageAdapter } from './adapters/fake'
import { createOpenAIImageAdapter, estimateOpenAICost } from './adapters/openai'
import { AdapterRegistry } from './adapters/registry'
import { AdapterError, composePrompt, type GenerateInput } from './adapters/types'
import { idempotencyKey } from './service'

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const KEY = 'sk-test-0123456789abcdefghijklmnop'
const input = (over: Partial<GenerateInput> = {}): GenerateInput => ({ model: 'gpt-image-2.5-flare', prompt: composePrompt('A hinged clip'), size: '1536x1024', quality: 'medium', background: 'opaque', references: [], credential: { kind: 'api-key', apiKey: KEY }, attempt: 1, signal: new AbortController().signal, ...over })

function stub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof globalThis.fetch
  return { calls, fetch }
}

describe('OpenAI image adapter (stubbed HTTP; never a real provider)', () => {
  it('accepts only an OpenAI API key connection and explains every other case', () => {
    const a = createOpenAIImageAdapter()
    expect(a.accepts(null)).toMatchObject({ ok: false, code: 'not-connected' })
    expect(a.accepts({ provider: 'fake', method: 'api-key', purpose: 'assistant' })).toMatchObject({ ok: false, code: 'provider-missing' })
    const chatgpt = a.accepts({ provider: 'openai', method: 'chatgpt', purpose: 'assistant' })
    expect(chatgpt).toMatchObject({ ok: false, code: 'method-unsupported' })
    expect(chatgpt.ok === false && chatgpt.message).toMatch(/does not offer image generation on ChatGPT plan usage/)
    expect(a.accepts({ provider: 'openai', method: 'api-key', purpose: 'assistant' })).toEqual({ ok: true })
  })

  it('calls /images/generations with the key, the preface and the options, and returns the PNG with usage and cost', async () => {
    const s = stub(200, { data: [{ b64_json: PNG.toString('base64'), revised_prompt: 'a clip' }], usage: { input_tokens: 50, output_tokens: 1000, input_tokens_details: { text_tokens: 50, image_tokens: 0 } } })
    const out = await createOpenAIImageAdapter({ fetch: s.fetch }).generate(input())
    expect(s.calls[0].url).toBe('https://api.openai.com/v1/images/generations')
    expect((s.calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(String(s.calls[0].init.body))
    expect(body).toMatchObject({ model: 'gpt-image-2.5-flare', n: 1, size: '1536x1024', quality: 'medium', background: 'opaque', output_format: 'png' })
    expect(body.prompt).toMatch(/^Illustrative concept sketch.*Do not draw any text.*\n\nA hinged clip$/s)
    expect(out).toMatchObject({ mediaType: 'image/png', width: 1, height: 1, revisedPrompt: 'a clip', usage: { inputTokens: 50, outputTokens: 1000, estimatedCostUsd: 0.03025 } })
  })

  it('sends reference images to /images/edits as multipart', async () => {
    const s = stub(200, { data: [{ b64_json: PNG.toString('base64') }] })
    await createOpenAIImageAdapter({ fetch: s.fetch }).generate(input({ references: [{ bytes: new Uint8Array(PNG), mediaType: 'image/png', fileName: 'reference-1.png' }] }))
    expect(s.calls[0].url).toBe('https://api.openai.com/v1/images/edits')
    const form = s.calls[0].init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.5-flare')
    expect(form.getAll('image[]')).toHaveLength(1)
  })

  it('maps provider errors to retryable or final job errors without echoing the key', async () => {
    const cases: [number, unknown, string, boolean][] = [
      [401, { error: { code: 'invalid_api_key', message: `Incorrect API key provided: ${KEY}` } }, 'provider-invalid-credential', false],
      [403, { error: { message: 'verify' } }, 'provider-not-permitted', false],
      [429, { error: { code: 'rate_limit_exceeded' } }, 'provider-rate-limit', true],
      [429, { error: { code: 'insufficient_quota' } }, 'provider-usage-limit', false],
      [400, { error: { code: 'moderation_blocked' } }, 'moderation-blocked', false],
      [500, {}, 'provider-unavailable', true],
    ]
    for (const [status, body, code, retryable] of cases) {
      const err = await createOpenAIImageAdapter({ fetch: stub(status, body).fetch }).generate(input()).catch((e) => e)
      expect(err).toBeInstanceOf(AdapterError)
      expect({ code: err.code, retryable: err.retryable }).toEqual({ code, retryable })
      expect(err.message).not.toContain(KEY)
    }
    const notImage = await createOpenAIImageAdapter({ fetch: stub(200, { data: [{ b64_json: Buffer.from('hello').toString('base64') }] }).fetch }).generate(input()).catch((e) => e)
    expect(notImage.code).toBe('output-invalid')
  })

  it('estimates cost from the published token prices', () => {
    expect(estimateOpenAICost({ input_tokens: 1_000_000, output_tokens: 0, input_tokens_details: { text_tokens: 1_000_000, image_tokens: 0 } })).toBe(5)
    expect(estimateOpenAICost({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(30)
    expect(estimateOpenAICost({})).toBeUndefined()
  })
})

describe('fake test adapter and registry', () => {
  it('returns a deterministic SVG that says it is a test asset', async () => {
    const fake = createFakeImageAdapter()
    const a = await fake.generate(input({ credential: { kind: 'none' } }))
    const b = await fake.generate(input({ credential: { kind: 'none' } }))
    expect(a.mediaType).toBe('image/svg+xml')
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true)
    expect(new TextDecoder().decode(a.bytes)).toContain('TEST ASSET')
    expect(fake.testOnly).toBe(true)
  })

  it('is never registered in production', () => {
    expect(() => new AdapterRegistry({ production: true }).register(createFakeImageAdapter())).toThrow(/never registered in production/)
    expect(new AdapterRegistry({ production: false }).register(createFakeImageAdapter()).list()).toHaveLength(1)
  })
})

describe('derived idempotency key', () => {
  const base = { projectId: 'P', kind: 'illustration', subject: { id: 'A1B2C3D4-0000-4000-8000-000000000001', revision: 2 }, instruction: 'A  clip\n with a hinge ', adapter: 'fake-test', model: 'm', options: { size: '1536x1024', quality: 'medium', background: 'opaque' }, referenceSha256: ['b', 'a'] }
  it('ignores whitespace, ID case and reference order, and changes with every input that changes the image', () => {
    const k = idempotencyKey(base)
    expect(idempotencyKey({ ...base, instruction: 'A clip with a hinge', subject: { ...base.subject, id: base.subject.id.toLowerCase() }, referenceSha256: ['a', 'b'] })).toBe(k)
    for (const change of [{ subject: { ...base.subject, revision: 3 } }, { instruction: 'A clip without a hinge' }, { adapter: 'openai-images' }, { model: 'n' }, { options: { ...base.options, quality: 'high' } }, { referenceSha256: ['a'] }, { projectId: 'Q' }]) {
      expect(idempotencyKey({ ...base, ...change })).not.toBe(k)
    }
  })
})
