import { randomUUID } from 'node:crypto'
import { AssistantError } from '../errors'
import { LedgerError, priceUsage, type UsageEventInput } from '../ledger'
import { findRegistryModel, intersectModels, loadModelRegistry, type ModelRegistryFile } from '../models'
import { evaluate, route, type Candidate, type Evaluation, type RouteDecision, type RouteRequest } from '../orchestrator/route'
import type { RoutingMode } from '../orchestrator/settings'
import { isPriced, loadPricing, Money, resolvePricing, selectModifiers, type PricingFile, type PricingRecord } from '../pricing'
import type { ProviderRegistry } from '../providers/registry'
import { ProviderError, type ProviderCredential, type ProviderUsage, type RespondInput, type RespondOutput } from '../providers/types'
import type { DeveloperAccounts } from './accounts'
import type { BudgetState } from './budget'
import type { Metering } from './metering'
import type { AiRuntimeConfig } from './runtime'
import type { CostView, RoutingView, UsageView } from './types'

/**
 * The gateway: the single dispatch point for model requests (ADR-0080, docs/modules/ai-interface/orchestration.md).
 * `call()` runs, in this order:
 *   1. route (orchestrator: filters, scoring, stickiness);
 *   2. preflight budget (developer keys: advisory transaction lock and a worst-case reservation, using `reserved_cost`);
 *   3. ledger `started`;
 *   4. the adapter call;
 *   5. ledger `completed`, `failed` or `cancelled`, priced with `priceUsage` and the applied modifiers.
 * Fail-safe: when `started` cannot be written the request is refused (503 `metering-unavailable`) and nothing is sent to a
 * provider. When an end event cannot be written after retries, the gateway is degraded: developer-key calls are refused
 * (503 `metering-degraded`) until a ledger write succeeds again; the unwritten events are kept and retried.
 */

/** A person's own connection, described without its secret; `credential()` decrypts it for one request. */
export interface UserConnectionHandle {
  id: string
  provider: string
  method: string
  model: string
  credential: () => Promise<ProviderCredential>
}

export interface GatewayCall {
  userId: string
  projectId?: string
  conversationId?: string
  /** What is being done, e.g. `assistant.respond`; with `workflowId` it groups the model calls of one task. */
  operationId: string
  workflowId?: string
  /** Context package the request was built from (ECII Amendment 2). */
  contextId?: string
  routing: { mode: RoutingMode; disallowedProviders?: ReadonlySet<string>; manual?: { provider?: string; model?: string } }
  userConnection?: UserConnectionHandle
  /** The provider request without credential, method, model and signal (the gateway fills those from the decision). */
  input: Omit<RespondInput, 'credential' | 'method' | 'model' | 'signal'>
  /** Aborts on the caller's timeout or cancellation. */
  signal: AbortSignal
  /** The person's own cancellation (a closed browser request): an abort by it is recorded as `cancelled`, not `failed`. */
  cancelSignal?: AbortSignal
  /** Names of price modifiers to apply (for example `batchDiscount`); none by default. */
  modifiers?: string[]
  /** Where the model choice is remembered (conversation, or user and project for a tool loop without a conversation). */
  stickyKey?: string
  stickyTtlMs?: number
}

export interface GatewayResult {
  output: RespondOutput
  routing: RoutingView
  cost: CostView
  usage: UsageView
  requestId: string
  /** Provider, method and model that served the request (for the audit record). */
  target: { provider: string; method: string; model: string }
}

export interface GatewayOptions {
  providers: ProviderRegistry
  accounts: DeveloperAccounts
  metering: Metering
  runtime: AiRuntimeConfig
  log?: { warn: (obj: unknown, msg?: string) => void }
  now?: () => Date
  /** Waits between attempts to write an end event (default 100, 400, 1600 ms). */
  retryDelaysMs?: number[]
}

const MOCK_PROVIDER = 'fake'
const DEFAULT_STICKY_TTL_MS = 24 * 3600 * 1000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function registryOf(provider: string): ModelRegistryFile | undefined {
  try {
    return loadModelRegistry(provider)
  } catch {
    return undefined
  }
}

function pricingOf(provider: string): PricingFile | undefined {
  try {
    return loadPricing(provider)
  } catch {
    return undefined
  }
}

/** Rough token count of a request: three characters per token errs on the high side, which is the safe side for a reservation. */
export function estimateInputTokens(input: GatewayCall['input']): number {
  return Math.ceil(JSON.stringify({ i: input.instructions, m: input.messages, t: input.tools, c: input.context, a: input.attachments?.length ?? 0 }).length / 3)
}

export class Gateway {
  private readonly now: () => Date
  private readonly delays: number[]
  private readonly sticky = new Map<string, { accountId: string; model: string; mode: RoutingMode; expires: number }>()
  /** End events that could not be written yet (kept in memory, retried; budget checks count them). */
  private pending: UsageEventInput[] = []
  private degradedFlag = false

  constructor(private readonly o: GatewayOptions) {
    this.now = o.now ?? (() => new Date())
    this.delays = o.retryDelaysMs ?? [100, 400, 1600]
  }

  get runtime(): AiRuntimeConfig {
    return this.o.runtime
  }

  /** True while an end event could not be written: developer-key calls are refused until a write succeeds. */
  get degraded(): boolean {
    return this.degradedFlag
  }

  // ---- candidates -----------------------------------------------------------------------------------------

  /**
   * Every model the current mode can reach. Mock mode: only the mock personas, never the person's connection. Development
   * mode: developer-key accounts and the person's connection. User mode: the person's connection.
   */
  async candidates(userConnection?: UserConnectionHandle): Promise<Candidate[]> {
    const mode = this.o.runtime.mode
    if (mode === 'mock') return this.mockCandidates()
    const out: Candidate[] = []
    if (mode === 'development') {
      await this.o.accounts.ensureValidated()
      out.push(...this.developerCandidates())
    }
    if (userConnection) out.push(...this.connectionCandidates(userConnection))
    return out
  }

  private mockCandidates(): Candidate[] {
    const provider = this.o.providers.get(MOCK_PROVIDER)
    if (!provider) return []
    const registry = registryOf(provider.id)
    const pricing = pricingOf(provider.id)
    return (registry?.models ?? [])
      .filter((m) => !m.id.includes('*'))
      .map((m): Candidate => ({
        accountId: `mock:${provider.id}`,
        source: 'mock',
        billing: 'mock',
        simulated: true,
        provider: provider.id,
        providerLabel: 'Mock',
        method: provider.methods.find((x) => x.kind === 'api-key')?.id ?? 'api-key',
        chatgptPlan: false,
        model: m.id,
        label: `Mock · ${m.label}`,
        known: true,
        ...(m.qualityTier ? { tier: m.qualityTier } : {}),
        ...(m.latencyClass ? { latency: m.latencyClass } : {}),
        toolsCapable: m.capabilities.tools ?? provider.capabilities.tools,
        isDefault: !!m.default,
        ...(pricing ? { pricing } : {}),
      }))
  }

  private developerCandidates(): Candidate[] {
    const out: Candidate[] = []
    for (const account of this.o.accounts.list()) {
      const adapter = this.o.providers.get(account.provider)
      if (!account.configured || !adapter || account.state !== 'valid') continue
      const registry = registryOf(account.provider)
      const pricing = pricingOf(account.provider)
      const base = { accountId: `dev:${account.provider}`, source: 'developer-key' as const, billing: 'meter_only' as const, simulated: false, provider: account.provider, providerLabel: account.name, method: adapter.methods.find((m) => m.kind === 'api-key')?.id ?? 'api-key', chatgptPlan: false, ...(pricing ? { pricing } : {}) }
      if (!registry) {
        for (const m of account.models) out.push({ ...base, model: m.id, label: m.label, known: false, toolsCapable: adapter.capabilities.tools, isDefault: false })
        continue
      }
      const split = intersectModels(registry, account.models)
      for (const m of split.available) {
        out.push({ ...base, model: m.id, label: m.label, known: true, ...(m.entry.qualityTier ? { tier: m.entry.qualityTier } : {}), ...(m.entry.latencyClass ? { latency: m.entry.latencyClass } : {}), toolsCapable: m.entry.capabilities.tools ?? adapter.capabilities.tools, isDefault: !!m.entry.default })
      }
      for (const m of split.unknown) out.push({ ...base, model: m.id, label: m.label, known: false, toolsCapable: adapter.capabilities.tools, isDefault: false })
      for (const m of split.unavailable) {
        if (m.id.includes('*')) continue
        out.push({ ...base, model: m.id, label: m.label, known: true, toolsCapable: m.capabilities.tools ?? adapter.capabilities.tools, isDefault: !!m.default, unavailableReason: 'This model is not available on this account.' })
      }
    }
    return out
  }

  private connectionCandidates(h: UserConnectionHandle): Candidate[] {
    const adapter = this.o.providers.get(h.provider)
    if (!adapter) return []
    const registry = registryOf(h.provider)
    const entry = registry ? findRegistryModel(registry, h.model) : undefined
    const pricing = pricingOf(h.provider)
    const chatgptPlan = h.method === 'chatgpt'
    return [
      {
        accountId: `conn:${h.id}`,
        source: 'user-connection',
        billing: chatgptPlan ? 'consumer-plan' : 'byok',
        simulated: false,
        provider: h.provider,
        providerLabel: adapter.displayName,
        method: h.method,
        chatgptPlan,
        model: h.model,
        label: entry?.label ?? h.model,
        known: !!entry,
        ...(entry?.qualityTier ? { tier: entry.qualityTier } : {}),
        ...(entry?.latencyClass ? { latency: entry.latencyClass } : {}),
        toolsCapable: entry?.capabilities.tools ?? adapter.capabilities.tools,
        isDefault: !!entry?.default,
        ...(pricing ? { pricing } : {}),
      },
    ]
  }

  /** The candidates with their eligibility (the model selector shows the disabled ones with their reasons). */
  async options(userConnection: UserConnectionHandle | undefined, req: Omit<RouteRequest, 'allowUnverifiedPricing' | 'now'>): Promise<Evaluation[]> {
    return evaluate(await this.candidates(userConnection), { ...req, allowUnverifiedPricing: this.o.runtime.allowUnverifiedPricing, ownConnectionAlwaysUsable: this.o.runtime.mode === 'user', now: this.now() })
  }

  // ---- budget ---------------------------------------------------------------------------------------------

  /** Estimated cost of events that could not be written yet, so a budget check does not forget them. */
  private pendingCost(): string {
    return this.pending.filter((e) => e.source === 'developer-key').reduce((sum, e) => sum.plus(e.estimatedProviderCost ?? '0'), new Money(0)).toFixed(10)
  }

  budget(): Promise<BudgetState> {
    return this.o.metering.state(this.o.runtime.monthlyBudgetUsd, this.now(), this.pendingCost())
  }

  // ---- the single dispatch point --------------------------------------------------------------------------

  async call(c: GatewayCall): Promise<GatewayResult> {
    await this.flushPending()
    const now = this.now()
    const maxOutputTokens = c.input.maxOutputTokens ?? 32_000
    const estimatedInputTokens = estimateInputTokens(c.input)

    // 1. route
    const candidates = await this.candidates(c.userConnection)
    let remainingBudget: string | undefined
    if (this.o.runtime.mode === 'development' && candidates.some((x) => x.source === 'developer-key')) {
      remainingBudget = await this.budget().then((b) => b.remaining).catch(() => undefined)
    }
    const stickyEntry = c.stickyKey ? this.sticky.get(c.stickyKey) : undefined
    const decision = route(candidates, {
      mode: c.routing.mode,
      disallowedProviders: c.routing.disallowedProviders,
      needTools: c.input.tools.length > 0,
      estimatedInputTokens,
      maxOutputTokens,
      manual: c.routing.manual,
      sticky: stickyEntry && stickyEntry.expires > now.getTime() ? { accountId: stickyEntry.accountId, model: stickyEntry.model, mode: stickyEntry.mode } : undefined,
      allowUnverifiedPricing: this.o.runtime.allowUnverifiedPricing, ownConnectionAlwaysUsable: this.o.runtime.mode === 'user',
      remainingBudget,
      now,
    })
    const chosen = decision.candidate
    const developerKey = chosen.source === 'developer-key'
    if (developerKey && this.degradedFlag) {
      throw new AssistantError('metering-degraded', 'Usage metering is degraded: a usage record could not be saved, so calls with developer keys are paused until the database accepts writes again.', 503)
    }

    // The credential is fetched before anything is recorded: a failure here sends nothing and costs nothing.
    const adapter = this.o.providers.get(chosen.provider)
    if (!adapter) throw new AssistantError('provider-unavailable', `The provider ${chosen.provider} is not available on this server.`, 409)
    const credential = await this.credentialFor(chosen, c.userConnection)

    // 2. and 3. preflight budget and `started`
    const requestId = randomUUID()
    const base: Omit<UsageEventInput, 'idempotencyKey' | 'event'> = {
      requestId,
      operationId: c.operationId,
      ...(c.workflowId ? { workflowId: c.workflowId } : {}),
      ...(c.contextId ? { contextId: c.contextId } : {}),
      userId: c.userId,
      ...(c.projectId ? { projectId: c.projectId } : {}),
      ...(c.conversationId ? { conversationId: c.conversationId } : {}),
      provider: chosen.provider,
      model: chosen.model,
      source: chosen.source,
      billing: chosen.billing,
      simulated: chosen.simulated,
    }
    const started: UsageEventInput = { ...base, idempotencyKey: `${requestId}:started`, event: 'started', ...(developerKey && decision.worstCase ? { reservedCost: decision.worstCase } : {}), ...(decision.record ? { currency: decision.record.currency } : {}) }
    try {
      await this.o.metering.begin(started, developerKey ? { limit: this.o.runtime.monthlyBudgetUsd, at: now, extraUsed: this.pendingCost() } : undefined)
    } catch (e) {
      if (e instanceof AssistantError) throw e
      this.o.log?.warn({ requestId, err: e instanceof Error ? e.message : 'unknown' }, 'usage ledger unavailable: request refused')
      throw new AssistantError('metering-unavailable', 'Usage metering is unavailable, so the request was not sent to the AI provider. Try again shortly.', 503)
    }
    this.ledgerWriteSucceeded()

    // 4. the adapter call
    if (c.stickyKey) this.sticky.set(c.stickyKey, { accountId: chosen.accountId, model: chosen.model, mode: c.routing.mode, expires: now.getTime() + (c.stickyTtlMs ?? DEFAULT_STICKY_TTL_MS) })
    const target = { provider: chosen.provider, method: chosen.method, model: chosen.model }
    let output: RespondOutput
    try {
      output = await adapter.respond({ ...c.input, credential, method: chosen.method, model: chosen.model, signal: c.signal })
    } catch (error) {
      const cancelled = (error instanceof ProviderError && error.kind === 'cancelled') || !!c.cancelSignal?.aborted
      await this.writeEnd({ ...base, idempotencyKey: `${requestId}:${cancelled ? 'cancelled' : 'failed'}`, event: cancelled ? 'cancelled' : 'failed' })
      throw error
    }

    // 5. `completed`, priced from the usage the provider reported
    const usage: ProviderUsage = output.usage ?? this.estimateUsage(estimatedInputTokens, output)
    const file = chosen.pricing
    const record: PricingRecord | undefined = file ? (resolvePricing(file.records, chosen.model, this.now(), { inputTokens: usage.inputTokens ?? estimatedInputTokens }) ?? decision.record) : undefined
    let priced: ReturnType<typeof priceUsage> = {}
    if (file && record && isPriced(record)) {
      try {
        priced = priceUsage(usage, file, record, selectModifiers(file, record, c.modifiers ?? []))
      } catch (e) {
        this.o.log?.warn({ requestId, err: e instanceof Error ? e.message : 'unknown' }, 'usage could not be priced')
      }
    }
    // Developer-key usage that cannot be priced is never counted as zero: it is charged to the budget at the reserved worst case.
    const unpriced: { estimatedProviderCost?: string; accountingStatus?: 'provisional' } = developerKey && priced.estimatedProviderCost === undefined && decision.worstCase ? { estimatedProviderCost: decision.worstCase, accountingStatus: 'provisional' } : {}
    await this.writeEnd({ ...base, idempotencyKey: `${requestId}:completed`, event: 'completed', usage, ...priced, ...unpriced })

    return {
      output,
      routing: routingView(decision),
      cost: { estimated: priced.estimatedProviderCost ?? (unpriced.estimatedProviderCost ?? null), currency: priced.currency ?? record?.currency ?? 'USD', verified: priced.ratesUsed?.verified ?? record?.verified ?? false, billing: chosen.billing },
      usage: usageView(usage),
      requestId,
      target,
    }
  }

  private async credentialFor(chosen: Candidate, h?: UserConnectionHandle): Promise<ProviderCredential> {
    if (chosen.source === 'user-connection') {
      if (!h) throw new AssistantError('not-connected', 'No AI account is connected.', 409)
      return h.credential()
    }
    if (chosen.source === 'mock') return { kind: 'api-key', apiKey: 'fake-mock-persona-key' }
    const dev = this.o.accounts.usable(chosen.provider)
    if (!dev) throw new AssistantError('provider-unavailable', `The ${chosen.providerLabel} developer key is not usable.`, 409)
    return dev.credential
  }

  /** Counts for a provider that reported none: characters over three per token, flagged `estimated`. */
  private estimateUsage(inputTokens: number, output: RespondOutput): ProviderUsage {
    const text = output.type === 'final' ? output.text : JSON.stringify(output.calls) + (output.text ?? '')
    return { inputTokens, outputTokens: Math.ceil(text.length / 3), reported: 'estimated' }
  }

  // ---- fail-safe ------------------------------------------------------------------------------------------

  private ledgerWriteSucceeded() {
    // Degraded ends only when nothing is left unwritten: a write that succeeds while events are still pending does not clear it.
    if (this.pending.length) return
    if (this.degradedFlag) this.o.log?.warn({}, 'usage ledger accepts writes again: metering is no longer degraded')
    this.degradedFlag = false
  }

  /** Writes an end event, retrying; when it still fails, keeps it and degrades the gateway. Never throws: the call already happened. */
  private async writeEnd(event: UsageEventInput): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.o.metering.record(event)
        this.ledgerWriteSucceeded()
        return
      } catch (e) {
        if (attempt >= this.delays.length) {
          this.pending.push(event)
          if (this.pending.length > 1000) this.pending.shift()
          this.degradedFlag = true
          this.o.log?.warn({ requestId: event.requestId, event: event.event, err: e instanceof Error ? e.message : 'unknown' }, 'usage event could not be saved: metering is degraded')
          return
        }
        await sleep(this.delays[attempt])
      }
    }
  }

  /** Tries the events kept after a failure. A success ends the degraded state. */
  async flushPending(): Promise<void> {
    if (!this.pending.length) return
    const left: UsageEventInput[] = []
    for (const event of this.pending) {
      try {
        await this.o.metering.record(event)
      } catch (e) {
        // A rejected event (invalid content) can never succeed: report it loudly and stop retrying it.
        if (e instanceof LedgerError) this.o.log?.warn({ requestId: event.requestId, code: e.code }, 'usage event rejected by the ledger and dropped')
        else left.push(event)
      }
    }
    this.pending = left
    this.ledgerWriteSucceeded()
  }
}

export function routingView(d: RouteDecision): RoutingView {
  const c = d.candidate
  return {
    mode: d.mode,
    reason: d.reason,
    provider: c.provider,
    providerName: c.providerLabel,
    model: c.model,
    label: c.label,
    source: c.source,
    billing: c.billing,
    simulated: c.simulated,
    sticky: d.sticky,
    alternatives: d.considered.filter((x) => !(x.provider === c.provider && x.model === c.model)).slice(0, 12),
  }
}

export function usageView(u: ProviderUsage): UsageView {
  return {
    ...(u.inputTokens !== undefined ? { inputTokens: u.inputTokens } : {}),
    ...(u.outputTokens !== undefined ? { outputTokens: u.outputTokens } : {}),
    ...(u.cachedInputTokens !== undefined ? { cachedInputTokens: u.cachedInputTokens } : {}),
    ...(u.cacheWriteTokens !== undefined ? { cacheWriteTokens: u.cacheWriteTokens } : {}),
    ...(u.reasoningTokens !== undefined ? { reasoningTokens: u.reasoningTokens } : {}),
    reported: u.reported,
  }
}
