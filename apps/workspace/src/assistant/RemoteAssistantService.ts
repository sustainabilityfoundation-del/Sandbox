import type { AssistantRequest, AssistantResponse, AssistantService } from './types'

/**
 * Assistant provider backed by OUR application backend (not the model provider directly). The backend
 * (`/api/assistant/v1/respond`, services/assistant) holds the person's credential, applies their AI access
 * policy, calls the model with the allowed tool definitions and returns either signed tool calls or a final
 * answer. Tool calls are executed here in the app, through the same repository and validation as the
 * engineering tools, and their results are sent back on the next request. The browser never sees a
 * provider credential.
 */
export class RemoteAssistantService implements AssistantService {
  readonly info: AssistantService['info']

  private readonly endpoint: string
  private readonly headers: () => Record<string, string>

  constructor(endpoint: string, options: { headers?: () => Record<string, string>; info?: AssistantService['info'] } = {}) {
    this.endpoint = endpoint
    this.headers = options.headers ?? (() => ({}))
    this.info = options.info ?? { name: 'ChatGPT', kind: 'remote', description: 'Responses from the application backend’s model connection.' }
  }

  async respond(request: AssistantRequest, signal: AbortSignal): Promise<AssistantResponse> {
    let response: Response
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        credentials: 'include', // the user's session with our backend; never a provider API key
        body: JSON.stringify(request),
        signal,
      })
    } catch (e) {
      if (signal.aborted) throw e
      throw new Error('The application backend is not reachable, so the assistant cannot answer. Check that the backend is running.')
    }
    const text = await response.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = undefined
    }
    if (!response.ok) {
      const err = (body as { error?: { code?: string; message?: string } } | undefined)?.error
      throw new AssistantServiceError(err?.code ?? `http-${response.status}`, err?.message ?? `Assistant service error (HTTP ${response.status}).`)
    }
    const r = body as AssistantResponse
    if (r?.type !== 'final' && r?.type !== 'tool_calls') throw new Error('Unexpected response from the assistant service.')
    return r
  }
}

/** A failure the backend explained (no connection, invalid key, rate limit, timeout, provider down …). */
export class AssistantServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AssistantServiceError'
  }
}
