import type { UsageBilling, UsageSource } from '../ledger'
import type { RoutingMode } from '../orchestrator/settings'

/** What the response meta tells the workspace about the routing decision (no account identifiers, no keys). */
export interface RoutingView {
  mode: RoutingMode
  /** Why this model, in one sentence a person can read. */
  reason: string
  provider: string
  providerName: string
  model: string
  label: string
  source: UsageSource
  billing: UsageBilling
  /** Mock persona: the answer is simulated, not a real model's. */
  simulated: boolean
  /** The same model as earlier in the conversation or the tool loop. */
  sticky: boolean
  /** The other models that were considered and, for those not eligible, why not. */
  alternatives: { provider: string; model: string; eligible: boolean; reason?: string }[]
}

/** Cost of one request as the person sees it: always an estimate, never an invoice. */
export interface CostView {
  /** Decimal string (USD), or null when the model has no price (own connections only). */
  estimated: string | null
  currency: string
  /** False: the rates are from a source nobody has reviewed yet ("unverified estimate"). */
  verified: boolean
  billing: UsageBilling
}

export interface UsageView {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  /** 'provider': counted by the provider; 'estimated': computed here. */
  reported: 'provider' | 'estimated'
}
