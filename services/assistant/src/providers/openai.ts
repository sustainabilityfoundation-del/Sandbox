import { ProviderError, type AssistantProvider, type ProviderCredential, type ProviderMessage, type ProviderModel, type ProviderTool, type RespondInput, type RespondOutput } from './types'

/**
 * OpenAI adapter (Responses API, plain fetch; no SDK dependency). Sources, checked 15 October 2026:
 * - Responses API and function calling: https://developers.openai.com/api/docs/guides/function-calling
 * - Models (default gpt-6.1-sol, "a balance of intelligence and cost"): https://developers.openai.com/api/docs/models
 * - Sign in with ChatGPT, ChatGPT plan usage (open-source and personal projects that run locally):
 *   https://developers.openai.com/siwc/token-sharing-open-source and its pages "Registration and sign-in",
 *   "Models and inference", "Accounts and sessions", "Errors and recovery", "Preview limitations";
 *   discovery: https://auth.openai.com/.well-known/openid-configuration
 *
 * Two connection methods:
 * - `api-key`: the person's OpenAI API project key (platform.openai.com), billed to the API account.
 * - `chatgpt`: Sign in with ChatGPT with ChatGPT plan usage (OAuth, PKCE, dynamic client registration, loopback
 *   redirect). Requests must set store: false and stream: true, must not send max_output_tokens, and group
 *   function tools in namespaces (Preview limitations).
 */

export const OPENAI_DEFAULT_MODEL = 'gpt-6.1-sol'
export const CHATGPT_METHOD = 'chatgpt'
export const API_KEY_METHOD = 'api-key'

/** Platform tool names (`requirements.update`) → provider function names (`requirements__update`). */
export function toFunctionName(name: string): string {
  const fn = name.replace(/\./g, '__').replace(/[^A-Za-z0-9_-]/g, '_')
  return fn.length > 64 ? fn.slice(0, 64) : fn
}

const NOT_CHAT = /(embedding|tts|whisper|dall-e|image|moderation|audio|realtime|transcribe|search|babbage|davinci|sora|computer-use)/i

export interface OpenAIProviderOptions {
  baseUrl?: string
  fetch?: typeof fetch
  defaultModel?: string
  /** Offer Sign in with ChatGPT (only where the API host is a local loopback installation). */
  chatgptSignIn?: boolean
}

function authHeader(credential: ProviderCredential): string {
  return `Bearer ${credential.kind === 'api-key' ? credential.apiKey : credential.accessToken}`
}

/** Maps an HTTP failure to a ProviderError with a message a person can act on. */
async function failure(response: Response, method: string): Promise<ProviderError> {
  let code: string | undefined
  let message: string | undefined
  try {
    const body = (await response.json()) as { error?: { code?: string; type?: string; message?: string } }
    code = body.error?.code ?? body.error?.type
    message = body.error?.message
  } catch {
    /* no JSON body */
  }
  const s = response.status
  const via = method === CHATGPT_METHOD ? 'your ChatGPT sign-in' : 'the API key'
  if (s === 401) return new ProviderError('invalid-credential', `OpenAI did not accept ${via}. ${method === CHATGPT_METHOD ? 'Sign in again.' : 'Check the key, or create a new one at platform.openai.com.'}`, s, code)
  if (s === 403) {
    if (code === 'subscription_sharing_user_not_eligible') return new ProviderError('not-permitted', 'This ChatGPT account is not eligible to use its plan in other apps.', s, code)
    return new ProviderError('not-permitted', `OpenAI refused the request (permission or region policy)${message ? `: ${message}` : ''}.`, s, code)
  }
  if (s === 404) return new ProviderError('model-not-found', `The model is not available to this account${message ? ` (${message})` : ''}. Choose another model in Settings → AI and reasoning.`, s, code)
  if (s === 429) {
    if (code === 'insufficient_quota') return new ProviderError('insufficient-quota', 'The OpenAI API account has no remaining quota or credit. Add billing at platform.openai.com (API usage is separate from a ChatGPT subscription).', s, code)
    if (code === 'subscription_sharing_usage_limit_exceeded') return new ProviderError('usage-limit', 'Your ChatGPT plan usage limit for apps is reached. See Manage usage (chatgpt.com/settings/usage).', s, code)
    return new ProviderError('rate-limit', 'OpenAI is rate-limiting requests. Wait a moment and try again.', s, code)
  }
  if (s >= 500) return new ProviderError('unavailable', 'OpenAI is not responding correctly right now. Try again shortly.', s, code)
  return new ProviderError('bad-request', `OpenAI rejected the request${message ? `: ${message}` : ''}.`, s, code)
}

function networkFailure(error: unknown, signal: AbortSignal): ProviderError {
  if (signal.aborted) return new ProviderError('timeout', 'The model did not answer within the time limit (Settings → AI and reasoning → Limits).')
  if (error instanceof ProviderError) return error
  return new ProviderError('unavailable', 'OpenAI could not be reached from the server (network).')
}

/** Input items for the Responses API from provider-neutral messages (stateless replay of tool calls). */
export function toInputItems(messages: ProviderMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.type === 'message') return { type: 'message', role: m.role, content: m.text }
    if (m.type === 'tool_call') return { type: 'function_call', call_id: m.callId, name: toFunctionName(m.name), arguments: JSON.stringify(m.arguments ?? {}) }
    return { type: 'function_call_output', call_id: m.callId, output: m.output }
  })
}

/** Function tools; grouped into namespaces for ChatGPT plan usage (Preview limitations). */
export function toTools(tools: ProviderTool[], method: string): unknown[] {
  const fn = (t: ProviderTool) => ({ type: 'function', name: toFunctionName(t.name), description: t.description.slice(0, 1024), parameters: t.parameters })
  if (method !== CHATGPT_METHOD) return tools.map(fn)
  const groups = new Map<string, ProviderTool[]>()
  for (const t of tools) groups.set(t.group ?? 'workspace', [...(groups.get(t.group ?? 'workspace') ?? []), t])
  return [...groups].map(([name, list]) => ({ type: 'namespace', name: name.replace(/[^A-Za-z0-9_-]/g, '_'), description: `Engineering workspace operations: ${name}`, tools: list.map(fn) }))
}

interface OutputItem {
  type: string
  call_id?: string
  name?: string
  arguments?: string
  content?: { type: string; text?: string }[]
}

/** Reads a server-sent event stream until response.completed (or a failure event). */
async function readStream(response: Response, method: string): Promise<{ output: OutputItem[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string }> {
  if (!response.body) throw new ProviderError('unavailable', 'OpenAI returned an empty response.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // Some backends (the ChatGPT plan route) send the finished items only as `response.output_item.done` events and
  // leave `response.completed.response.output` empty; collect them so text and tool calls are not lost.
  const streamed: OutputItem[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })
    let index: number
    while ((index = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index).replace(/^\r?\n\r?\n/, '')
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue
      let event: { type?: string; item?: OutputItem; response?: { output?: OutputItem[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string; error?: { code?: string; message?: string } }; error?: { code?: string; message?: string }; code?: string; message?: string }
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }
      if (event.type === 'response.output_item.done' && event.item) {
        streamed.push(event.item)
        continue
      }
      if (event.type === 'response.completed') {
        await reader.cancel().catch(() => undefined)
        const completed = event.response?.output ?? []
        return { output: completed.length ? completed : streamed, usage: event.response?.usage, model: event.response?.model }
      }
      if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
        await reader.cancel().catch(() => undefined)
        const code = event.response?.error?.code ?? event.error?.code ?? event.code
        if (code === 'subscription_sharing_usage_limit_exceeded' || code === 'rate_limit_exceeded' || code === 'insufficient_quota') {
          throw await failure(new Response(JSON.stringify({ error: { code } }), { status: 429 }), method)
        }
        throw new ProviderError('unavailable', `The model stopped without completing the answer${code ? ` (${code})` : ''}. Try again.`, undefined, code)
      }
    }
    if (done) break
  }
  throw new ProviderError('unavailable', 'The response stream ended before the answer was complete. Try again.')
}

/** Interprets the completed output: function calls, otherwise the text. */
export function interpretOutput(output: OutputItem[], tools: ProviderTool[]): RespondOutput {
  const byFunction = new Map(tools.map((t) => [toFunctionName(t.name), t.name]))
  const calls = output
    .filter((o) => o.type === 'function_call')
    .map((o) => {
      let args: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(o.arguments || '{}')
        args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        args = { _unparseable: String(o.arguments ?? '').slice(0, 200) }
      }
      // Unknown function names are passed through as-is; the access policy refuses them.
      return { callId: String(o.call_id ?? ''), name: byFunction.get(String(o.name)) ?? String(o.name), arguments: args }
    })
  const text = output
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text' && c.text)
    .map((c) => c.text)
    .join('\n')
  return calls.length ? { type: 'tool_calls', calls, ...(text ? { text } : {}) } : { type: 'final', text }
}

export function createOpenAIProvider(options: OpenAIProviderOptions = {}): AssistantProvider {
  const base = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const doFetch = options.fetch ?? fetch
  const methods: AssistantProvider['methods'] = [
    {
      id: API_KEY_METHOD,
      kind: 'api-key',
      label: 'OpenAI API key',
      keyLabel: 'OpenAI API key',
      help: 'A project API key from platform.openai.com (API keys). Usage is billed to that OpenAI API account, which is separate from a ChatGPT Plus or Pro subscription. The key is sent once to this application’s server, checked with OpenAI, stored encrypted and never shown again.',
      keyUrl: 'https://platform.openai.com/api-keys',
      keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    },
  ]
  if (options.chatgptSignIn) {
    methods.unshift({
      id: CHATGPT_METHOD,
      kind: 'oauth',
      label: 'Sign in with ChatGPT (use your ChatGPT plan)',
      buttonLabel: 'Continue with ChatGPT',
      help: 'Sign in with your own ChatGPT account (Plus or Pro). Eligible usage in this app uses your ChatGPT plan. OpenAI offers this preview to open-source projects and personal projects that run locally; a hosted or paid deployment needs OpenAI’s approval first. It does not give this app access to your ChatGPT conversations.',
      manageUsageUrl: 'https://chatgpt.com/settings/usage',
      oauth: {
        authorizationEndpoint: 'https://auth.openai.com/api/accounts/authorize',
        tokenEndpoint: 'https://auth.openai.com/api/accounts/oauth/token',
        revocationEndpoint: 'https://auth.openai.com/api/accounts/oauth/revoke',
        jwksUri: 'https://auth.openai.com/.well-known/jwks.json',
        issuer: 'https://auth.openai.com',
        registrationClientId: 'dynamic_agent_client',
        agentName: 'Engineering Workspace',
        scopes: ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct'],
        requiredScope: 'chatgpt.tokens.use.direct',
        resource: 'https://api.openai.com/v1',
        loopbackOnly: true,
        callbackPath: '/auth/callback',
      },
    })
  }

  async function listModels(credential: ProviderCredential, method: string, signal: AbortSignal): Promise<ProviderModel[]> {
    let response: Response
    try {
      response = await doFetch(`${base}/models`, { headers: { Authorization: authHeader(credential) }, signal })
    } catch (e) {
      throw networkFailure(e, signal)
    }
    if (!response.ok) throw await failure(response, method)
    const body = (await response.json()) as { data?: { id: string }[]; models?: { slug: string; display_name?: string; visibility?: string }[] }
    // API keys: { data: [{ id }] }. ChatGPT plan usage: { models: [{ slug, display_name, visibility }] } (keep visibility "list", server order).
    if (Array.isArray(body.models)) return body.models.filter((m) => m.visibility === undefined || m.visibility === 'list').map((m) => ({ id: m.slug, label: m.display_name ?? m.slug }))
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !NOT_CHAT.test(id))
      .sort((a, b) => b.localeCompare(a))
      .map((id) => ({ id, label: id }))
  }

  return {
    id: 'openai',
    displayName: 'OpenAI (ChatGPT)',
    description: 'OpenAI models through the Responses API, with your own OpenAI account.',
    methods,
    defaultModel: options.defaultModel ?? OPENAI_DEFAULT_MODEL,
    listModels,
    async validateCredential(credential, method, signal) {
      return { models: await listModels(credential, method, signal) }
    },
    async respond(input: RespondInput): Promise<RespondOutput> {
      const plan = input.method === CHATGPT_METHOD
      const body: Record<string, unknown> = {
        model: input.model,
        instructions: input.instructions,
        input: toInputItems(input.messages),
        store: false,
        stream: true,
        ...(input.tools.length ? { tools: toTools(input.tools, input.method), tool_choice: 'auto', parallel_tool_calls: true } : {}),
        // ChatGPT plan usage rejects max_output_tokens (Preview limitations); API keys honour it.
        ...(!plan && input.maxOutputTokens ? { max_output_tokens: input.maxOutputTokens } : {}),
      }
      let response: Response
      try {
        response = await doFetch(`${base}/responses`, {
          method: 'POST',
          headers: { Authorization: authHeader(input.credential), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: input.signal,
        })
      } catch (e) {
        throw networkFailure(e, input.signal)
      }
      if (!response.ok) throw await failure(response, input.method)
      let completed
      try {
        completed = await readStream(response, input.method)
      } catch (e) {
        throw networkFailure(e, input.signal)
      }
      return { ...interpretOutput(completed.output, input.tools), usage: { inputTokens: completed.usage?.input_tokens, outputTokens: completed.usage?.output_tokens }, model: completed.model ?? input.model }
    },
  }
}
