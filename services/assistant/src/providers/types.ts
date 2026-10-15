/**
 * Provider interface (framework-free). A provider adapter translates a provider-neutral conversation and
 * tool list into one model provider's API. Adding a provider (Anthropic, Azure OpenAI, a local
 * OpenAI-compatible server…) means writing one adapter and registering it; the workspace, the tools, the
 * executor and the access policy do not change.
 *
 * Adapters are called only by the server, with credentials decrypted for the one request. They must not
 * log credentials, prompts or tool results.
 */

/** A provider-neutral conversation item. Tool names are the platform's (e.g. `requirements.update`). */
export type ProviderMessage =
  | { type: 'message'; role: 'user' | 'assistant'; text: string }
  | { type: 'tool_call'; callId: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; output: string }

export interface ProviderTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  /** Module the tool belongs to (adapters may group tools by it, e.g. OpenAI namespaces). */
  group?: string
}

export type ProviderCredential =
  | { kind: 'api-key'; apiKey: string }
  /** OAuth access token (e.g. Sign in with ChatGPT plan usage). */
  | { kind: 'oauth'; accessToken: string }

export interface RespondInput {
  credential: ProviderCredential
  /** Authentication method of the connection (adapters may need method-specific request rules). */
  method: string
  model: string
  instructions: string
  messages: ProviderMessage[]
  tools: ProviderTool[]
  /** Output token limit; adapters omit it where the provider route does not accept it. */
  maxOutputTokens?: number
  signal: AbortSignal
}

export interface ProviderUsage {
  inputTokens?: number
  outputTokens?: number
}

export type RespondOutput = (
  | { type: 'final'; text: string }
  | { type: 'tool_calls'; calls: { callId: string; name: string; arguments: Record<string, unknown> }[]; text?: string }
) & { usage?: ProviderUsage; model?: string }

export interface ProviderModel {
  id: string
  label: string
}

/** How a person connects their account with this provider. */
export type AuthMethod =
  | {
      id: string
      kind: 'api-key'
      label: string
      /** Field label, e.g. "OpenAI API key". */
      keyLabel: string
      /** Plain explanation shown next to the field (where to create a key, billing). */
      help: string
      /** Link to where the person creates a key. */
      keyUrl?: string
      /** Quick syntactic check before calling the provider (never logged). */
      keyPattern?: RegExp
    }
  | {
      id: string
      kind: 'oauth'
      label: string
      /** Label of the sign-in button (provider branding rules). */
      buttonLabel: string
      help: string
      /** Usage page the provider asks apps to link to. */
      manageUsageUrl?: string
      oauth: OAuthConfig
    }

export interface OAuthConfig {
  authorizationEndpoint: string
  tokenEndpoint: string
  revocationEndpoint?: string
  jwksUri: string
  issuer: string
  /** First-time (dynamic registration) client ID. */
  registrationClientId: string
  /** Display name sent on first registration. */
  agentName: string
  scopes: string[]
  /** Scope that must be granted before inference. */
  requiredScope: string
  resource?: string
  /** Loopback-only flows (the redirect must be http://127.0.0.1:<port>/<path>). */
  loopbackOnly: boolean
  callbackPath: string
}

export type ProviderErrorKind =
  | 'invalid-credential'
  | 'not-permitted'
  | 'rate-limit'
  | 'usage-limit'
  | 'insufficient-quota'
  | 'timeout'
  | 'unavailable'
  | 'bad-request'
  | 'model-not-found'

/** A provider failure with a message a person can act on (never containing credentials). */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
    readonly providerCode?: string,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface AssistantProvider {
  /** Stable ID, e.g. 'openai'. */
  readonly id: string
  readonly displayName: string
  /** Short description for the settings page. */
  readonly description: string
  readonly methods: AuthMethod[]
  /** Default model when the account's list offers it (verified in the provider's documentation). */
  readonly defaultModel: string
  /** Models the credential may use. Cheap; also used to validate a credential. */
  listModels(credential: ProviderCredential, method: string, signal: AbortSignal): Promise<ProviderModel[]>
  /** Checks a credential with a cheap call; throws ProviderError('invalid-credential' …) when it is refused. */
  validateCredential(credential: ProviderCredential, method: string, signal: AbortSignal): Promise<{ models: ProviderModel[] }>
  respond(input: RespondInput): Promise<RespondOutput>
}
