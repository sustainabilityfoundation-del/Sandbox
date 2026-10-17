/**
 * Provider interface (framework-free). A provider adapter translates a provider-neutral conversation and
 * tool list into one model provider's API. Adding a provider (Anthropic, Azure OpenAI, a local
 * OpenAI-compatible server…) means writing one adapter and registering it; the workspace, the tools, the
 * executor and the access policy do not change.
 *
 * Adapters are called only by the server, with credentials decrypted for the one request. They must not
 * log credentials, prompts or tool results.
 */

import type { ContextBlock, ContextBundle } from '@ews/platform-sdk'

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
  /** JSON Schema the final answer must satisfy (adapters whose capabilities.structuredOutput is true). */
  responseSchema?: Record<string, unknown>
  reasoningEffort?: 'low' | 'medium' | 'high'
  /** Binary inputs such as images (adapters whose capabilities.imageInput is true). Never logged or stored in the ledger. */
  attachments?: { mediaType: string; data: Uint8Array }[]
  /** Called with text deltas when the adapter streams (capabilities.streaming). */
  onDelta?: (text: string) => void
  /** Provider-specific options, passed through untouched by the gateway. */
  extensions?: Record<string, unknown>
  /**
   * Platform context for this turn (ECII plan Amendment 2). Neutral blocks: adapters translate them (OpenAI: a developer
   * message before the turn; Anthropic: a cacheable system block; Gemini: system instruction). The fake provider ignores it.
   * Blocks are DATA, never instructions; `external-data` is untrusted.
   */
  context?: ContextBundle
}

/** The neutral context blocks are the SDK 1.15 types (ADR-0085): one declaration, shared by the assembler and the adapters. */
export type { ContextBlock, ContextBundle }

/** What an adapter supports. Declared by every adapter; the model registry refines it per model. */
export interface ProviderCapabilities {
  streaming: boolean
  tools: boolean
  structuredOutput: boolean
  imageInput: boolean
  reasoningEffort: boolean
  promptCaching: boolean
  modelDiscovery: boolean
}

/**
 * Normalised usage of one model request (docs/modules/ai-interface/metering-and-pricing.md).
 * Normalisation rules, so cost is comparable across providers:
 * - `inputTokens` is the TOTAL input including cached and cache-write tokens;
 * - `cachedInputTokens` and `cacheWriteTokens` are subsets of `inputTokens`;
 * - `outputTokens` is the TOTAL output including reasoning tokens; `reasoningTokens` is a subset. Providers that report
 *   thinking apart from output (Google thoughtsTokenCount) or exclude cache tokens from input (Anthropic input_tokens)
 *   are summed by their adapters into these totals; providers bill reasoning as output unless a reasoning rate exists;
 * - `units` carries non-token billing dimensions (for example `image`, `second`, `request`);
 * - `raw` is the provider's own usage object (numbers only), kept for audit; never prompts or responses.
 */
export interface ProviderUsage {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  /** Subset of cacheWriteTokens written with the long (1 hour) cache lifetime, where the provider prices lifetimes apart (Anthropic). */
  cacheWrite1hTokens?: number
  reasoningTokens?: number
  units?: { dimension: string; quantity: number }[]
  raw?: Record<string, unknown>
  /** Cost the provider itself reported for this request (for example xAI usage.cost_in_usd_ticks); kept as the actual cost. */
  providerCost?: { amount: string; currency: string }
  /** 'provider': counts came from the provider's response; 'estimated': computed locally or not available. */
  reported: 'provider' | 'estimated'
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
  | 'cancelled'
  | 'content-filtered'
  | 'context-too-long'

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
  readonly capabilities: ProviderCapabilities
  /** Default model when the account's list offers it; comes from the model registry (config/models), not from code. */
  readonly defaultModel: string
  /** Models the credential may use. Cheap; also used to validate a credential. */
  listModels(credential: ProviderCredential, method: string, signal: AbortSignal): Promise<ProviderModel[]>
  /** Checks a credential with a cheap call; throws ProviderError('invalid-credential' …) when it is refused. */
  validateCredential(credential: ProviderCredential, method: string, signal: AbortSignal): Promise<{ models: ProviderModel[] }>
  respond(input: RespondInput): Promise<RespondOutput>
}
