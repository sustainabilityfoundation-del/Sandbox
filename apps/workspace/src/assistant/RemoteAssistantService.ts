import type { AssistantRequest, AssistantResponse, AssistantService } from './types'

/**
 * Assistant provider backed by OUR application backend (not the model provider
 * directly). The backend holds the API credentials, calls the model with the
 * tool definitions in `request.tools`, and returns either tool calls or a final
 * answer. Tool calls are executed here in the app, through the same repository
 * and validation as the engineering tools, and their results are sent back on
 * the next request. See workspace/README.md, "Connecting ChatGPT".
 *
 * Not used by default. Enable it with VITE_ASSISTANT_ENDPOINT=/api/assistant.
 */
export class RemoteAssistantService implements AssistantService {
  readonly info = {
    name: 'ChatGPT',
    kind: 'remote' as const,
    description: 'Responses from the application backend’s ChatGPT integration.',
  }

  private readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = endpoint
  }

  async respond(request: AssistantRequest, signal: AbortSignal): Promise<AssistantResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // the user's session with our backend; never a provider API key
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) throw new Error(`Assistant service error (HTTP ${response.status})`)
    const body = (await response.json()) as AssistantResponse
    if (body?.type !== 'final' && body?.type !== 'tool_calls') throw new Error('Unexpected response from assistant service')
    return body
  }
}
