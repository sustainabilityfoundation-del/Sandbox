import type { Pool, PoolClient } from 'pg'
import { calculateCost, MONEY_SCALE, Money, snapshotOf, type PricingFile, type PricingRecord, type RatesSnapshot } from './pricing'
import type { ProviderUsage } from './providers/types'

/**
 * Usage ledger over `assistant.usage_events` (migration 0003): insert-only, idempotent, aggregable, corrected only by
 * compensating rows. It stores identifiers, counts and money, never prompts or responses (the table has no column
 * for them, and `raw` provider usage is reduced to numbers). Specification: docs/modules/ai-interface/metering-and-pricing.md.
 */

export type UsageEventKind = 'started' | 'completed' | 'failed' | 'cancelled' | 'correction'
export type UsageSource = 'developer-key' | 'user-connection' | 'mock'
export type UsageBilling = 'meter_only' | 'byok' | 'consumer-plan' | 'mock'
export type AccountingStatus = 'estimated' | 'provisional' | 'settled' | 'reconciled'

export class LedgerError extends Error {
  constructor(readonly code: 'credits-not-allowed' | 'invalid-event' | 'not-found' | 'pricing-conflict', message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}

export interface UsageEventInput {
  /** Unique per logical event; a retry or repeated callback with the same key adds no row. */
  idempotencyKey: string
  event: UsageEventKind
  requestId: string
  operationId: string
  workflowId?: string
  organizationId?: string
  userId?: string
  projectId?: string
  moduleId?: string
  conversationId?: string
  provider: string
  model: string
  source: UsageSource
  billing: UsageBilling
  simulated?: boolean
  usage?: ProviderUsage
  currency?: string
  /** Money as decimal strings (never numbers). */
  estimatedProviderCost?: string
  actualProviderCost?: string
  reservedCost?: string
  creditsCharged?: string
  pricingVersion?: string
  ratesUsed?: RatesSnapshot
  accountingStatus?: AccountingStatus
  occurredAt?: string
}

export interface UsageEventRow {
  id: string
  idempotencyKey: string
  event: UsageEventKind
  requestId: string
  operationId: string
  workflowId?: string
  organizationId?: string
  userId?: string
  projectId?: string
  moduleId?: string
  conversationId?: string
  provider: string
  model: string
  source: UsageSource
  billing: UsageBilling
  simulated: boolean
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  cacheWrite1hTokens?: number
  reasoningTokens?: number
  units: { dimension: string; quantity: number }[]
  providerUsageDetails?: Record<string, unknown>
  usageReported: 'provider' | 'estimated' | 'none'
  currency: string
  estimatedProviderCost?: string
  actualProviderCost?: string
  reservedCost?: string
  creditsCharged?: string
  pricingVersion?: string
  ratesUsed?: RatesSnapshot
  accountingStatus: AccountingStatus
  correctsEventId?: string
  reason?: string
  occurredAt: string
}

/** Keeps only numbers, booleans and nested objects of them: nothing that could be request or response text. */
export function sanitizeRaw(raw: unknown, depth = 0): Record<string, unknown> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || depth > 4) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'object') {
      const nested = sanitizeRaw(v, depth + 1)
      if (nested && Object.keys(nested).length) out[k] = nested
    }
  }
  return Object.keys(out).length ? out : undefined
}

/** Fills the cost fields of a `completed` event from provider usage and the pricing record in force. */
export function priceUsage(usage: ProviderUsage, record: PricingRecord | undefined): Pick<UsageEventInput, 'estimatedProviderCost' | 'pricingVersion' | 'ratesUsed' | 'currency'> {
  if (!record) return {}
  const cost = calculateCost(usage, record)
  return { ...(cost.total !== null ? { estimatedProviderCost: cost.total } : {}), pricingVersion: record.pricingVersion, ratesUsed: snapshotOf(record), currency: record.currency }
}

const num = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v))
const str = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v))

function mapRow(r: Record<string, unknown>): UsageEventRow {
  const drop = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  return drop({
    id: r.id as string,
    idempotencyKey: r.idempotency_key as string,
    event: r.event as UsageEventKind,
    requestId: r.request_id as string,
    operationId: r.operation_id as string,
    workflowId: str(r.workflow_id),
    organizationId: str(r.organization_id),
    userId: str(r.user_id),
    projectId: str(r.project_id),
    moduleId: str(r.module_id),
    conversationId: str(r.conversation_id),
    provider: r.provider as string,
    model: r.model as string,
    source: r.source as UsageSource,
    billing: r.billing as UsageBilling,
    simulated: r.simulated as boolean,
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cachedInputTokens: num(r.cached_input_tokens),
    cacheWriteTokens: num(r.cache_write_tokens),
    cacheWrite1hTokens: num(r.cache_write_1h_tokens),
    reasoningTokens: num(r.reasoning_tokens),
    units: (r.units as UsageEventRow['units']) ?? [],
    providerUsageDetails: (r.provider_usage_details as Record<string, unknown> | null) ?? undefined,
    usageReported: r.usage_reported as UsageEventRow['usageReported'],
    currency: r.currency as string,
    estimatedProviderCost: str(r.estimated_provider_cost),
    actualProviderCost: str(r.actual_provider_cost),
    reservedCost: str(r.reserved_cost),
    creditsCharged: str(r.credits_charged),
    pricingVersion: str(r.pricing_version),
    ratesUsed: (r.rates_used as RatesSnapshot | null) ?? undefined,
    accountingStatus: r.accounting_status as AccountingStatus,
    correctsEventId: str(r.corrects_event_id),
    reason: str(r.reason),
    occurredAt: (r.occurred_at as Date).toISOString(),
  }) as UsageEventRow
}

export interface AggregateQuery {
  groupBy: 'conversation' | 'operation' | 'period'
  /** For groupBy 'period': day or month (default month, UTC). */
  period?: 'day' | 'month'
  conversationId?: string
  operationId?: string
  projectId?: string
  userId?: string
  provider?: string
  /** Inclusive start / exclusive end, ISO timestamps. */
  from?: string
  to?: string
  /** Restrict to simulated (true) or real (false) usage; default both. */
  simulated?: boolean
}

export interface AggregateRow {
  key: string
  requests: number
  failed: number
  cancelled: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  /** Sum of estimated provider cost (corrections included). */
  estimatedProviderCost: string
  actualProviderCost: string
  /** Per event, the actual cost when settled, otherwise the estimate. */
  cost: string
  creditsCharged: string
  currency: string
}

type Queryable = Pick<Pool | PoolClient, 'query'>

const COLUMNS = `idempotency_key, event, request_id, operation_id, workflow_id, organization_id, user_id, project_id, module_id, conversation_id,
  provider, model, source, billing, simulated, input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, cache_write_1h_tokens, reasoning_tokens, units,
  provider_usage_details, usage_reported, currency, estimated_provider_cost, actual_provider_cost, reserved_cost, credits_charged,
  pricing_version, rates_used, accounting_status, corrects_event_id, reason, occurred_at`

export class UsageLedger {
  constructor(private readonly db: Queryable) {}

  /**
   * Appends an event. Idempotent: a second call with the same idempotency key inserts nothing and returns the
   * stored row (`inserted: false`), so retries and repeated callbacks never double count or double charge.
   */
  async record(input: UsageEventInput): Promise<{ inserted: boolean; event: UsageEventRow }> {
    return this.insert(input)
  }

  private async insert(input: UsageEventInput, extra: { correctsEventId?: string; reason?: string } = {}): Promise<{ inserted: boolean; event: UsageEventRow }> {
    if (!input.idempotencyKey) throw new LedgerError('invalid-event', 'An idempotency key is required.')
    if (input.creditsCharged !== undefined && (input.billing === 'byok' || input.billing === 'consumer-plan')) {
      throw new LedgerError('credits-not-allowed', `${input.billing} usage is not consumed from the platform and never carries credits.`)
    }
    const billingMock = input.billing === 'mock'
    const u = input.usage
    const detail = sanitizeRaw(u?.raw)
    const hasUsage = !!u && (u.inputTokens !== undefined || u.outputTokens !== undefined || !!u.units?.length)
    const values = [
      input.idempotencyKey, input.event, input.requestId, input.operationId, input.workflowId ?? null, input.organizationId ?? null,
      input.userId ?? null, input.projectId ?? null, input.moduleId ?? null, input.conversationId ?? null, input.provider, input.model,
      input.source, input.billing, billingMock || !!input.simulated, u?.inputTokens ?? null, u?.outputTokens ?? null, u?.cachedInputTokens ?? null,
      u?.cacheWriteTokens ?? null, u?.cacheWrite1hTokens ?? null, u?.reasoningTokens ?? null, JSON.stringify(u?.units ?? []), detail ? JSON.stringify(detail) : null,
      hasUsage ? u!.reported : 'none', input.currency ?? 'USD', input.estimatedProviderCost ?? null, input.actualProviderCost ?? u?.providerCost?.amount ?? null,
      input.reservedCost ?? null, input.creditsCharged ?? null, input.pricingVersion ?? null, input.ratesUsed ? JSON.stringify(input.ratesUsed) : null,
      input.accountingStatus ?? 'estimated', extra.correctsEventId ?? null, extra.reason ?? null, input.occurredAt ?? new Date().toISOString(),
    ]
    const marks = values.map((_, i) => `$${i + 1}`).join(', ')
    const inserted = await this.db.query(`INSERT INTO assistant.usage_events (${COLUMNS}) VALUES (${marks}) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, values)
    if (inserted.rows[0]) return { inserted: true, event: mapRow(inserted.rows[0]) }
    const existing = await this.db.query('SELECT * FROM assistant.usage_events WHERE idempotency_key = $1', [input.idempotencyKey])
    return { inserted: false, event: mapRow(existing.rows[0]) }
  }

  async get(idempotencyKey: string): Promise<UsageEventRow | undefined> {
    const r = await this.db.query('SELECT * FROM assistant.usage_events WHERE idempotency_key = $1', [idempotencyKey])
    return r.rows[0] ? mapRow(r.rows[0]) : undefined
  }

  async list(filter: { conversationId?: string; operationId?: string; requestId?: string } = {}): Promise<UsageEventRow[]> {
    const where: string[] = []
    const params: unknown[] = []
    for (const [col, v] of [['conversation_id', filter.conversationId], ['operation_id', filter.operationId], ['request_id', filter.requestId]] as const) {
      if (v !== undefined) {
        params.push(v)
        where.push(`${col} = $${params.length}`)
      }
    }
    const r = await this.db.query(`SELECT * FROM assistant.usage_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY occurred_at, created_at, id`, params)
    return r.rows.map(mapRow)
  }

  /**
   * Compensating correction: a new 'correction' row pointing at the original, carrying signed deltas that are
   * summed with the rest. The original row is never changed.
   */
  async correct(options: {
    original: string
    idempotencyKey: string
    reason: string
    deltas: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number; cacheWrite1hTokens?: number; reasoningTokens?: number; estimatedProviderCost?: string; actualProviderCost?: string }
    accountingStatus?: AccountingStatus
  }): Promise<{ inserted: boolean; event: UsageEventRow }> {
    const original = await this.get(options.original)
    if (!original) throw new LedgerError('not-found', `No usage event with idempotency key ${options.original}.`)
    if (original.event === 'correction') throw new LedgerError('invalid-event', 'Correct the original event, not a correction.')
    const d = options.deltas
    const input: UsageEventInput = {
      idempotencyKey: options.idempotencyKey,
      event: 'correction',
      requestId: original.requestId,
      operationId: original.operationId,
      workflowId: original.workflowId,
      organizationId: original.organizationId,
      userId: original.userId,
      projectId: original.projectId,
      moduleId: original.moduleId,
      conversationId: original.conversationId,
      provider: original.provider,
      model: original.model,
      source: original.source,
      billing: original.billing,
      simulated: original.simulated,
      currency: original.currency,
      pricingVersion: original.pricingVersion,
      estimatedProviderCost: d.estimatedProviderCost,
      actualProviderCost: d.actualProviderCost,
      accountingStatus: options.accountingStatus ?? 'provisional',
      usage: { inputTokens: d.inputTokens, outputTokens: d.outputTokens, cachedInputTokens: d.cachedInputTokens, cacheWriteTokens: d.cacheWriteTokens, cacheWrite1hTokens: d.cacheWrite1hTokens, reasoningTokens: d.reasoningTokens, reported: 'provider' },
    }
    return this.insert(input, { correctsEventId: original.id, reason: options.reason })
  }

  /** A correction that cancels the original's tokens and costs exactly (for example a charge recorded in error). */
  async reverse(original: string, idempotencyKey: string, reason: string): Promise<{ inserted: boolean; event: UsageEventRow }> {
    const o = await this.get(original)
    if (!o) throw new LedgerError('not-found', `No usage event with idempotency key ${original}.`)
    const neg = (v?: number) => (v === undefined ? undefined : -v)
    const negMoney = (v?: string) => (v === undefined ? undefined : new Money(v).neg().toFixed(MONEY_SCALE))
    return this.correct({
      original,
      idempotencyKey,
      reason,
      deltas: {
        inputTokens: neg(o.inputTokens), outputTokens: neg(o.outputTokens), cachedInputTokens: neg(o.cachedInputTokens),
        cacheWriteTokens: neg(o.cacheWriteTokens), cacheWrite1hTokens: neg(o.cacheWrite1hTokens), reasoningTokens: neg(o.reasoningTokens),
        estimatedProviderCost: negMoney(o.estimatedProviderCost), actualProviderCost: negMoney(o.actualProviderCost),
      },
    })
  }

  /** Totals by conversation, operation or period. 'started' rows (reservations) are not usage and are excluded. */
  async aggregate(q: AggregateQuery): Promise<AggregateRow[]> {
    const params: unknown[] = []
    const where = [`event <> 'started'`]
    const add = (sql: string, v: unknown) => {
      params.push(v)
      where.push(sql.replace('?', `$${params.length}`))
    }
    if (q.conversationId !== undefined) add('conversation_id = ?', q.conversationId)
    if (q.operationId !== undefined) add('operation_id = ?', q.operationId)
    if (q.projectId !== undefined) add('project_id = ?', q.projectId)
    if (q.userId !== undefined) add('user_id = ?', q.userId)
    if (q.provider !== undefined) add('provider = ?', q.provider)
    if (q.from !== undefined) add('occurred_at >= ?', q.from)
    if (q.to !== undefined) add('occurred_at < ?', q.to)
    if (q.simulated !== undefined) add('simulated = ?', q.simulated)
    const trunc = q.period === 'day' ? 'day' : 'month'
    const key = q.groupBy === 'conversation' ? `COALESCE(conversation_id, '')` : q.groupBy === 'operation' ? 'operation_id' : `to_char(date_trunc('${trunc}', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
    const r = await this.db.query(
      `SELECT ${key} AS key,
         count(*) FILTER (WHERE event = 'completed') AS requests,
         count(*) FILTER (WHERE event = 'failed') AS failed,
         count(*) FILTER (WHERE event = 'cancelled') AS cancelled,
         COALESCE(sum(input_tokens), 0) AS input_tokens, COALESCE(sum(output_tokens), 0) AS output_tokens,
         COALESCE(sum(cached_input_tokens), 0) AS cached_input_tokens, COALESCE(sum(cache_write_tokens), 0) AS cache_write_tokens,
         COALESCE(sum(reasoning_tokens), 0) AS reasoning_tokens,
         COALESCE(sum(estimated_provider_cost), 0)::text AS estimated, COALESCE(sum(actual_provider_cost), 0)::text AS actual,
         COALESCE(sum(COALESCE(actual_provider_cost, estimated_provider_cost)), 0)::text AS cost,
         COALESCE(sum(credits_charged), 0)::text AS credits,
         COALESCE(min(currency), 'USD') AS currency
       FROM assistant.usage_events WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY 1`,
      params,
    )
    const money = (s: string) => new Money(s).toFixed(MONEY_SCALE)
    return r.rows.map((x) => ({
      key: x.key, requests: Number(x.requests), failed: Number(x.failed), cancelled: Number(x.cancelled),
      inputTokens: Number(x.input_tokens), outputTokens: Number(x.output_tokens), cachedInputTokens: Number(x.cached_input_tokens),
      cacheWriteTokens: Number(x.cache_write_tokens), reasoningTokens: Number(x.reasoning_tokens),
      estimatedProviderCost: money(x.estimated), actualProviderCost: money(x.actual), cost: money(x.cost), creditsCharged: money(x.credits), currency: x.currency,
    }))
  }
}

/** Service tier and context band label: with the model and pricing version, the key of a pricing row. */
export const variantOf = (r: PricingRecord): string => `${r.serviceTier ?? 'standard'}|${r.contextBand?.label ?? ''}`

const canonical = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null))

/**
 * Loads pricing files into `assistant.pricing`, idempotently. A (provider, model, pricing_version) is immutable: loading
 * the same record again changes nothing, and a record whose content differs under the same version is refused
 * (bump the pricing version instead), which keeps historical costs reproducible.
 */
export async function syncPricing(db: Queryable, files: PricingFile[]): Promise<{ inserted: number; unchanged: number }> {
  let inserted = 0
  let unchanged = 0
  for (const file of files) {
    for (const r of file.records) {
      const res = await db.query(
        `INSERT INTO assistant.pricing (provider, model, pricing_version, service_tier, context_band, variant, source_version, effective_from, currency, verified, placeholder, source_url, retrieved_at, rates, discounts, note)
         VALUES ($1, $2, $3, $13, $14, $15, $16, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (provider, model, pricing_version, variant) DO NOTHING RETURNING pricing_version`,
        [file.provider, r.model, r.pricingVersion, r.effectiveFrom, r.currency, r.verified, !!r.placeholder, r.sourceUrl, r.retrievedAt, JSON.stringify(r.rates), JSON.stringify(r.discounts ?? []), r.note ?? null, r.serviceTier ?? 'standard', r.contextBand ? JSON.stringify(r.contextBand) : null, variantOf(r), r.sourceVersion ?? null],
      )
      if (res.rows.length) {
        inserted++
        continue
      }
      const ex = (await db.query('SELECT effective_from::text AS effective_from, currency, verified, rates, discounts FROM assistant.pricing WHERE provider = $1 AND model = $2 AND pricing_version = $3 AND variant = $4', [file.provider, r.model, r.pricingVersion, variantOf(r)])).rows[0]
      const same = ex.effective_from === r.effectiveFrom && ex.currency === r.currency && ex.verified === r.verified && canonical(ex.rates) === canonical(r.rates) && canonical(ex.discounts) === canonical(r.discounts ?? [])
      if (!same) throw new LedgerError('pricing-conflict', `Pricing ${file.provider}/${r.model}@${r.pricingVersion} already exists with different content; pricing versions are immutable, publish a new pricingVersion.`)
      unchanged++
    }
  }
  return { inserted, unchanged }
}
