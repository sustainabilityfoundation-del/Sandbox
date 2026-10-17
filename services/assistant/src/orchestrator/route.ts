import { AssistantError } from '../errors'
import type { LatencyClass } from '../models'
import { calculateCost, isPriced, Money, resolvePricing, type PricingFile, type PricingRecord } from '../pricing'
import type { UsageBilling, UsageSource } from '../ledger'
import type { RoutingMode } from './settings'

/**
 * Model selection (docs/modules/ai-interface/orchestration.md, plan section 2). A pure function over the candidate models:
 *
 * Phase 1 filters (every automatic mode and Manual): an account that is configured and valid; a provider the person and the
 * project allow; tool support when tools are offered; a known price for developer-key use (verified, unless unverified
 * prices are allowed); a worst case that fits the remaining development budget (automatic modes).
 * Automatic modes also exclude models the registry does not know and ChatGPT-plan connections (Manual only).
 * Scoring: quality = highest tier; balanced = cheapest of tier 2 or higher; economy = cheapest with reliable tool calling.
 *
 * Manual never falls back: a model that is not eligible is refused with the reason (fallback across providers is Phase 2 and
 * will respect the same filters).
 */

export interface Candidate {
  /** Stable ID of the account the model is reached through, e.g. `dev:openai`, `conn:<id>`, `mock:fake`. */
  accountId: string
  source: UsageSource
  billing: UsageBilling
  simulated: boolean
  provider: string
  providerLabel: string
  /** Authentication method of the account (adapters may need method-specific rules). */
  method: string
  /** ChatGPT plan connection: offered in Manual mode only. */
  chatgptPlan: boolean
  model: string
  label: string
  /** The model registry knows the model (capabilities, tier). Unknown models are Manual only. */
  known: boolean
  tier?: 1 | 2 | 3
  latency?: LatencyClass
  toolsCapable: boolean
  isDefault: boolean
  /** Set when the account cannot be used at all (invalid key, adapter pending...); the reason is shown. */
  unavailableReason?: string
  /** Pricing file of the provider; absent for providers without prices. */
  pricing?: PricingFile
}

export interface RouteRequest {
  mode: RoutingMode
  /** Providers switched off in the person's or the project's settings. */
  disallowedProviders?: ReadonlySet<string>
  needTools: boolean
  /** Rough size of the request, to select the price band and to bound the worst case. */
  estimatedInputTokens: number
  maxOutputTokens: number
  /** Manual selection (the request's choice); without it Manual uses the person's own connection. */
  manual?: { provider?: string; model?: string }
  /** The model used earlier in this turn's tool loop or conversation. */
  sticky?: { accountId: string; model: string; mode: RoutingMode }
  allowUnverifiedPricing: boolean
  /** User mode: a user-connection candidate passes the automatic-mode exclusions (unknown model, ChatGPT plan). */
  ownConnectionAlwaysUsable?: boolean
  /** Remaining development budget as a decimal string; automatic modes skip models whose worst case exceeds it. */
  remainingBudget?: string
  now?: Date
}

export interface Evaluation {
  candidate: Candidate
  eligible: boolean
  /** Why a model is disabled (shown beside it in the model selector). */
  reason?: string
  record?: PricingRecord
  /** Typical cost used for ranking (decimal string), null when unpriced. */
  rankCost: string | null
  /** Cost if the request used its whole input estimate and output limit; null when unpriced. */
  worstCase: string | null
}

export interface RouteDecision {
  mode: RoutingMode
  reason: string
  sticky: boolean
  candidate: Candidate
  record?: PricingRecord
  rankCost: string | null
  worstCase: string | null
  considered: { provider: string; model: string; eligible: boolean; reason?: string }[]
}

export class RoutingError extends AssistantError {
  constructor(code: 'no-model-available' | 'model-unavailable' | 'manual-selection-required' | 'budget-exceeded', message: string, status: number, details?: Record<string, unknown>) {
    super(code, message, status, details)
    this.name = 'RoutingError'
  }
}

const TYPICAL_OUTPUT_TOKENS = 1000
const BUDGET_REASON = 'Its worst-case cost exceeds the remaining development budget.'

function costOf(record: PricingRecord | undefined, inputTokens: number, outputTokens: number): string | null {
  if (!record || !isPriced(record)) return null
  return calculateCost({ inputTokens, outputTokens }, record).total
}

/** Every candidate with its eligibility for this request (the disabled ones carry their reason). */
export function evaluate(candidates: Candidate[], req: RouteRequest): Evaluation[] {
  const now = req.now ?? new Date()
  return candidates.map((candidate): Evaluation => {
    const record = candidate.pricing ? resolvePricing(candidate.pricing.records, candidate.model, now, { inputTokens: req.estimatedInputTokens }) : undefined
    const rankCost = costOf(record, req.estimatedInputTokens, Math.min(req.maxOutputTokens, TYPICAL_OUTPUT_TOKENS))
    const worstCase = costOf(record, req.estimatedInputTokens, req.maxOutputTokens)
    const out = (reason?: string): Evaluation => ({ candidate, eligible: !reason, ...(reason ? { reason } : {}), ...(record ? { record } : {}), rankCost, worstCase })
    if (candidate.unavailableReason) return out(candidate.unavailableReason)
    if (req.disallowedProviders?.has(candidate.provider)) return out('This provider is switched off in your routing settings or by the project.')
    if (req.needTools && !candidate.toolsCapable) return out('This model does not support operations (tool calls).')
    if (candidate.source === 'developer-key') {
      if (!record || !isPriced(record)) return out('No price is known for this model, so it cannot be used with developer keys.')
      if (!record.verified && !req.allowUnverifiedPricing) return out('The price of this model is unverified and unverified prices are not allowed (EWS_AI_ALLOW_UNVERIFIED_PRICING).')
      if (worstCase === null) return out('The price of this model does not cover everything a request can use.')
    }
    // User mode: the person's own connection is their choice, usable in every routing mode (even unknown models and a ChatGPT plan).
    const ownChoice = req.ownConnectionAlwaysUsable && candidate.source === 'user-connection'
    if (req.mode !== 'manual' && !ownChoice) {
      if (!candidate.known) return out('Capabilities unknown: choose this model in Manual mode.')
      if (candidate.chatgptPlan) return out('A ChatGPT plan connection is used in Manual mode only.')
      if (candidate.source === 'developer-key' && req.remainingBudget !== undefined && worstCase !== null && new Money(worstCase).gt(req.remainingBudget)) return out(BUDGET_REASON)
    }
    return out()
  })
}

/** Orders by cost; an unpriced model sorts last. Negative when `a` is cheaper. */
const lessCost = (a: string | null, b: string | null): number => (a === null || b === null ? Number(a === null) - Number(b === null) : new Money(a).comparedTo(b))
const rankOf = (e: Evaluation) => e.candidate.tier ?? 1

/** Picks the model, or throws a `RoutingError` that says why nothing qualified. */
export function route(candidates: Candidate[], req: RouteRequest): RouteDecision {
  const evals = evaluate(candidates, req)
  const considered = evals.map((e) => ({ provider: e.candidate.provider, model: e.candidate.model, eligible: e.eligible, ...(e.reason ? { reason: e.reason } : {}) }))
  const decide = (e: Evaluation, reason: string, sticky = false): RouteDecision => ({ mode: req.mode, reason, sticky, candidate: e.candidate, ...(e.record ? { record: e.record } : {}), rankCost: e.rankCost, worstCase: e.worstCase, considered })

  if (req.mode === 'manual') {
    const wanted = req.manual
    const pool = wanted?.model || wanted?.provider
      ? evals.filter((e) => (!wanted.provider || e.candidate.provider === wanted.provider) && (!wanted.model || e.candidate.model === wanted.model))
      : evals.filter((e) => e.candidate.source === 'user-connection')
    if (!wanted?.model && !wanted?.provider && !pool.length) {
      throw new RoutingError('manual-selection-required', 'Manual mode needs a provider and model. Choose one in the model selector, or connect an account.', 422, { considered })
    }
    const chosen = pool.find((e) => e.eligible) ?? pool[0]
    if (!chosen) {
      throw new RoutingError('model-unavailable', `${wanted?.provider ? `${wanted.provider} ` : ''}${wanted?.model ?? ''} is not available. Manual mode does not substitute another model; choose one that is enabled in the model selector.`.replace(/\s+/g, ' '), 409, { considered })
    }
    if (!chosen.eligible) throw new RoutingError('model-unavailable', `${chosen.candidate.model} cannot be used: ${chosen.reason} Manual mode does not substitute another model.`, 409, { provider: chosen.candidate.provider, model: chosen.candidate.model, reason: chosen.reason, considered })
    return decide(chosen, 'Manual selection.')
  }

  const eligible = evals.filter((e) => e.eligible)
  if (!eligible.length) {
    if (evals.some((e) => e.reason === BUDGET_REASON)) {
      throw new RoutingError('budget-exceeded', `The monthly development budget leaves no room for a request to any available model (${req.remainingBudget} USD remain).`, 429, { remaining: req.remainingBudget, considered })
    }
    const chatgptOnly = evals.length > 0 && evals.every((e) => e.candidate.chatgptPlan)
    throw new RoutingError(
      'no-model-available',
      chatgptOnly
        ? 'Only a ChatGPT plan connection is available, and it is used in Manual mode only. Set Model selection to Manual in Settings → AI and reasoning, or add an API key.'
        : 'No model is available for automatic selection. Check the configured providers and your routing settings.',
      409,
      { considered },
    )
  }

  if (req.sticky && req.sticky.mode === req.mode) {
    const same = eligible.find((e) => e.candidate.accountId === req.sticky!.accountId && e.candidate.model === req.sticky!.model)
    if (same) return decide(same, 'Same model as earlier in this conversation (kept for consistency and prompt caching).', true)
  }

  const byCostThenName = (a: Evaluation, b: Evaluation) =>
    lessCost(a.rankCost, b.rankCost) || Number(b.candidate.isDefault) - Number(a.candidate.isDefault) || (a.candidate.provider + a.candidate.model).localeCompare(b.candidate.provider + b.candidate.model)

  if (req.mode === 'quality') {
    const best = [...eligible].sort((a, b) => rankOf(b) - rankOf(a) || byCostThenName(a, b))[0]
    return decide(best, `Maximum quality: highest rated model available (tier ${rankOf(best)}).`)
  }
  if (req.mode === 'economy') {
    const tooled = eligible.filter((e) => e.candidate.toolsCapable)
    const pool = tooled.length ? tooled : eligible
    return decide([...pool].sort(byCostThenName)[0], 'Economy: cheapest model with reliable tool calling.')
  }
  const rated = eligible.filter((e) => rankOf(e) >= 2 && e.candidate.tier !== undefined)
  if (rated.length) return decide([...rated].sort(byCostThenName)[0], 'Balanced: cheapest model rated tier 2 or higher.')
  const best = [...eligible].sort((a, b) => rankOf(b) - rankOf(a) || byCostThenName(a, b))[0]
  return decide(best, 'Balanced: no available model is rated tier 2 or higher, so the best available was chosen.')
}
