import { describe, expect, it } from 'vitest'
import { CredentialVault } from './crypto'
import { createOpenAIProvider } from './providers/openai'
import { ProviderError, type ProviderTool } from './providers/types'

/** OpenAI adapter against a mocked fetch: no real provider is called. */

const KEY = 'sk-test-0123456789abcdefghijKLMN'
const tools: ProviderTool[] = [
  { name: 'read_object', description: 'Read', parameters: { type: 'object', properties: { id: { type: 'string' } } }, group: 'workspace' },
  { name: 'requirements.update', description: 'Update', parameters: { type: 'object', properties: {} }, group: 'requirements' },
]

function sse(events: unknown[]): Response {
  const body = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  }) as unknown as typeof fetch
  return { f, calls }
}

const input = (method = 'api-key') => ({
  credential: method === 'api-key' ? ({ kind: 'api-key', apiKey: KEY } as const) : ({ kind: 'oauth', accessToken: 'at-123' } as const),
  method,
  model: 'gpt-6.1-sol',
  instructions: 'be helpful',
  messages: [
    { type: 'message' as const, role: 'user' as const, text: 'hi' },
    { type: 'tool_call' as const, callId: 'call_1', name: 'requirements.update', arguments: { a: 1 } },
    { type: 'tool_result' as const, callId: 'call_1', name: 'requirements.update', output: '{"ok":true}' },
  ],
  tools,
  maxOutputTokens: 1000,
  signal: new AbortController().signal,
})

describe('OpenAI adapter', () => {
  it('sends a stateless Responses API request with function tools and maps calls back to platform names', async () => {
    const { f, calls } = mockFetch(() =>
      sse([
        { type: 'response.created' },
        { type: 'response.completed', response: { model: 'gpt-6.1-sol', usage: { input_tokens: 120, output_tokens: 9 }, output: [{ type: 'function_call', call_id: 'call_2', name: 'requirements__update', arguments: '{"requirementId":"REQ-003"}' }] } },
      ]),
    )
    const out = await createOpenAIProvider({ fetch: f }).respond(input())
    expect(out).toMatchObject({ type: 'tool_calls', calls: [{ callId: 'call_2', name: 'requirements.update', arguments: { requirementId: 'REQ-003' } }], usage: { inputTokens: 120, outputTokens: 9 } })
    const body = JSON.parse(String(calls[0].init.body))
    expect(calls[0].url).toBe('https://api.openai.com/v1/responses')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(body).toMatchObject({ model: 'gpt-6.1-sol', store: false, stream: true, max_output_tokens: 1000, instructions: 'be helpful' })
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['read_object', 'requirements__update'])
    expect(body.input[1]).toEqual({ type: 'function_call', call_id: 'call_1', name: 'requirements__update', arguments: '{"a":1}' })
    expect(body.input[2]).toEqual({ type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' })
  })

  it('follows the ChatGPT plan usage rules: namespaced tools, no max_output_tokens, OAuth bearer', async () => {
    const { f, calls } = mockFetch(() => sse([{ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }] } }]))
    const out = await createOpenAIProvider({ fetch: f, chatgptSignIn: true }).respond(input('chatgpt'))
    expect(out).toMatchObject({ type: 'final', text: 'Hello' })
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.max_output_tokens).toBeUndefined()
    expect(body.store).toBe(false)
    expect(body.stream).toBe(true)
    expect(body.tools.map((t: { type: string; name: string }) => `${t.type}:${t.name}`)).toEqual(['namespace:workspace', 'namespace:requirements'])
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer at-123')
  })

  it('reads text and tool calls from output_item.done events when response.completed carries no output (ChatGPT plan route)', async () => {
    const { f } = mockFetch(() =>
      sse([
        { type: 'response.created' },
        { type: 'response.output_item.done', item: { type: 'reasoning' } },
        { type: 'response.output_item.done', item: { type: 'message', content: [{ type: 'output_text', text: 'I will create the project.' }] } },
        { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call_9', name: 'requirements__update', arguments: '{"requirementId":"REQ-001"}' } },
        { type: 'response.completed', response: { output: [], usage: { input_tokens: 9000, output_tokens: 77 } } },
      ]),
    )
    const out = await createOpenAIProvider({ fetch: f, chatgptSignIn: true }).respond(input('chatgpt'))
    expect(out).toMatchObject({ type: 'tool_calls', text: 'I will create the project.', calls: [{ callId: 'call_9', name: 'requirements.update', arguments: { requirementId: 'REQ-001' } }] })
  })

  it('maps provider errors to clear messages without echoing the credential', async () => {
    const cases: [number, unknown, ProviderError['kind']][] = [
      [401, { error: { code: 'invalid_api_key', message: `Incorrect API key provided: ${KEY}` } }, 'invalid-credential'],
      [429, { error: { code: 'insufficient_quota' } }, 'insufficient-quota'],
      [429, { error: { code: 'rate_limit_exceeded' } }, 'rate-limit'],
      [429, { error: { code: 'subscription_sharing_usage_limit_exceeded' } }, 'usage-limit'],
      [404, { error: { code: 'model_not_found' } }, 'model-not-found'],
      [503, {}, 'unavailable'],
    ]
    for (const [status, body, kind] of cases) {
      const { f } = mockFetch(() => new Response(JSON.stringify(body), { status }))
      const e = await createOpenAIProvider({ fetch: f }).respond(input()).catch((x) => x)
      expect(e).toBeInstanceOf(ProviderError)
      expect(e.kind).toBe(kind)
      expect(e.message).not.toContain(KEY)
    }
  })

  it('reports a failed stream and a timeout', async () => {
    const failed = mockFetch(() => sse([{ type: 'response.failed', response: { error: { code: 'server_error' } } }]))
    await expect(createOpenAIProvider({ fetch: failed.f }).respond(input())).rejects.toMatchObject({ kind: 'unavailable' })
    const controller = new AbortController()
    const slow = mockFetch(
      (_u, init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = createOpenAIProvider({ fetch: slow.f }).respond({ ...input(), signal: controller.signal })
    controller.abort()
    await expect(p).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('lists models from both catalogue shapes', async () => {
    const api = mockFetch(() => new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }, { id: 'text-embedding-4' }, { id: 'gpt-6-luna' }, { id: 'whisper-2' }] })))
    expect((await createOpenAIProvider({ fetch: api.f }).listModels({ kind: 'api-key', apiKey: KEY }, 'api-key', new AbortController().signal)).map((m) => m.id)).toEqual(['gpt-6.1-sol', 'gpt-6-luna'])
    const plan = mockFetch(() => new Response(JSON.stringify({ models: [{ slug: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', visibility: 'list' }, { slug: 'internal', visibility: 'hide' }] })))
    expect(await createOpenAIProvider({ fetch: plan.f }).listModels({ kind: 'oauth', accessToken: 't' }, 'chatgpt', new AbortController().signal)).toEqual([{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }])
  })

  it('offers Sign in with ChatGPT only when enabled for a local installation', () => {
    expect(createOpenAIProvider().methods.map((m) => m.id)).toEqual(['api-key'])
    const methods = createOpenAIProvider({ chatgptSignIn: true }).methods
    expect(methods.map((m) => m.id)).toEqual(['chatgpt', 'api-key'])
    const m = methods[0]
    expect(m.kind === 'oauth' && m.buttonLabel).toBe('Continue with ChatGPT')
    expect(m.kind === 'oauth' && m.oauth.scopes).toContain('chatgpt.tokens.use.direct')
  })
})

describe('credential vault', () => {
  it('encrypts with a context binding and detects tampering', () => {
    const vault = new CredentialVault(CredentialVault.randomKey())
    const blob = vault.encrypt(KEY, 'connection:eli:1')
    expect(blob.toString('utf8')).not.toContain(KEY)
    expect(blob.toString('base64')).not.toContain(Buffer.from(KEY).toString('base64').slice(0, 16))
    expect(vault.decrypt(blob, 'connection:eli:1')).toBe(KEY)
    expect(() => vault.decrypt(blob, 'connection:rui:1')).toThrow()
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] ^= 1
    expect(() => vault.decrypt(tampered, 'connection:eli:1')).toThrow()
    expect(() => new CredentialVault(Buffer.alloc(16))).toThrow(/32 bytes/)
  })
})
