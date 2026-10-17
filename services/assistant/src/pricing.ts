import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Decimal from 'decimal.js'
import { matchesModel, RegistryValidationError } from './models'
import type { ProviderUsage } from './providers/types'

/**
 * Pricing registry and cost calculator. Versioned JSON under config/pricing/<provider>.json, loaded into
 * `assistant.pricing`; money is decimal.js end to end (never a JS number) and leaves this module as a string.
 * A ledger row stores the pricing version AND the rates used, so a historical cost is reproduced from the
 * row alone after the registry has changed (`costFromSnapshot`). Specification:
 * docs/modules/ai-interface/metering-and-pricing.md and ADR-0079.
 */

/** Calculation context: 50 significant digits, half-up; the stored scale is MONEY_SCALE (numeric(20,10)). */
export const Money = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })
export const MONEY_SCALE = 10
export const PRICING_SCHEMA_VERSION = 1
export const PRICING_CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'pricing')

/** Standard token dimensions; any other key is a per-unit dimension (image, second, request, ...). */
export const TOKEN_DIMENSIONS = ['input', 'output', 'cachedInput', 'cacheWrite', 'reasoning'] as const
/** Every token dimension, including the cache-lifetime split. A modifier applies to these unless it says otherwise. */
export const DEFAULT_MODIFIER_DIMENSIONS: readonly string[] = [...TOKEN_DIMENSIONS, 'cacheWrite5m', 'cacheWrite1h']
const DIMENSION_RE = /^[a-z][A-Za-z0-9_-]*$/

export interface RateTier {
  /** Upper bound of this tier in dimension units (cumulative); null for the last tier. */
  upTo: number | null
  /** Price per `per` units. */
  price: string
}

/** The price of `per` units of a dimension (for example "2.50" per 1000000 tokens), flat or graduated. */
export interface Rate {
  price?: string
  per: number
  tiers?: RateTier[]
  /** The provider's unit wording, for people ('USD per 1M tokens'). */
  unit?: string
}

export interface Discount {
  name: string
  /** Multiplier, for example "0.5" for a batch discount. */
  factor: string
  /** Dimensions it multiplies; absent means every dimension (record-level discounts). Modifiers always record it explicitly. */
  appliesTo?: string[]
}

/** Typed pricing failure: an adapter bug or an invalid modifier selection, never silently corrected. */
export class PricingError extends Error {
  constructor(readonly code: 'negative-uncached-input' | 'negative-visible-output' | 'modifier-refused' | 'unknown-modifier', message: string) {
    super(message)
    this.name = 'PricingError'
  }
}

/** A price band within a model, selected by the request's input size (long-context pricing). Bounds are inclusive. */
export interface ContextBand {
  label: string
  minInputTokens?: number
  maxInputTokens?: number
}

/** A price modifier that applies only when the caller says so (batch, priority, regional endpoint, data residency). */
export interface PriceModifier {
  name: string
  /** Multiplier on the dimensions it applies to: 0.5 for a 50% batch discount, 1.1 for a 10% uplift, 2 for priority. */
  factor: string
  /**
   * Dimensions the factor multiplies. Default: the token dimensions only (tool, search and per-unit fees are not
   * discounted or uplifted unless listed here).
   */
  appliesTo?: string[]
  /** The tier this modifier stands for. It is refused when the matched record already is that tier (the rates include it). */
  serviceTier?: string
  /** Model IDs it applies to; absent means every model of the provider. */
  models?: string[]
  unit?: string
  sourceUrl?: string | null
  note?: string
}

export interface PricingRecord {
  pricingVersion: string
  /** Model ID or `*` pattern. */
  model: string
  /** ISO date; the record applies to usage from this date on. */
  effectiveFrom: string
  currency: string
  /** False until a person reviewed the rates against sourceUrl. Unverified costs are shown as estimates. */
  verified: boolean
  /** Placeholder records carry no rates and no source. */
  placeholder?: boolean
  sourceUrl: string | null
  retrievedAt: string | null
  rates: Record<string, Rate>
  discounts?: Discount[]
  note?: string
  /** standard (default), batch, fast, priority, ultrafast. */
  serviceTier?: string
  contextBand?: ContextBand
  /** What the source page said about its own version or date. Providers rarely state an effective date. */
  sourceVersion?: string
  /** Per-dimension remarks from the source. */
  notes?: Record<string, string>
}

export interface PricingFile {
  schemaVersion: 1
  provider: string
  note?: string
  records: PricingRecord[]
  /** Per-unit rates not tied to a model (tool and search fees). Merged under a record's own rates by `withSharedRates`. */
  sharedRates?: Record<string, Rate>
  /** Optional multipliers, applied only when selected (they are added to the snapshot's discounts). */
  modifiers?: PriceModifier[]
}

/** What a ledger row keeps so its cost can be recomputed without the registry. */
export interface RatesSnapshot {
  pricingVersion: string
  currency: string
  verified: boolean
  rates: Record<string, Rate>
  discounts?: Discount[]
  serviceTier?: string
  contextBand?: ContextBand
}

export interface CostLine {
  dimension: string
  quantity: string
  /** Set when the dimension was billed at another dimension's rate (cachedInput, cacheWrite → input; reasoning → output). */
  billedAs?: string
  amount: string
}

export interface CostResult {
  currency: string
  pricingVersion: string
  verified: boolean
  lines: CostLine[]
  /** Dimensions that were used but have no rate. */
  missing: string[]
  /** Total at MONEY_SCALE, or null when a used dimension is unpriced (never a misleading partial total). */
  total: string | null
  /** Sum of the priced lines only (for diagnostics). */
  pricedTotal: string
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isDecimalString = (v: unknown): v is string => typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)

export function validatePricingFile(raw: unknown, file = 'pricing registry'): PricingFile {
  const problems: string[] = []
  if (!isObject(raw)) throw new RegistryValidationError(file, ['not an object'])
  if (raw.schemaVersion !== PRICING_SCHEMA_VERSION) problems.push(`schemaVersion must be ${PRICING_SCHEMA_VERSION}`)
  if (typeof raw.provider !== 'string' || !raw.provider) problems.push('provider is required')
  if (!Array.isArray(raw.records)) problems.push('records must be an array')
  else {
    const keys = new Set<string>()
    raw.records.forEach((r, i) => {
      const at = `records[${i}]`
      if (!isObject(r)) return void problems.push(`${at} is not an object`)
      if (typeof r.pricingVersion !== 'string' || !r.pricingVersion) problems.push(`${at}.pricingVersion is required`)
      if (typeof r.model !== 'string' || !r.model) problems.push(`${at}.model is required`)
      const key = `${String(r.pricingVersion)}|${String(r.model)}|${String(r.serviceTier ?? 'standard')}|${String((r.contextBand as { label?: string } | undefined)?.label ?? '')}`
      if (keys.has(key)) problems.push(`${at}: (pricingVersion, model, serviceTier, contextBand) ${key} is duplicated`)
      keys.add(key)
      if (typeof r.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom)) problems.push(`${at}.effectiveFrom must be an ISO date`)
      if (typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency)) problems.push(`${at}.currency must be an ISO 4217 code`)
      if (typeof r.verified !== 'boolean') problems.push(`${at}.verified must be a boolean`)
      if (!(r.sourceUrl === null || (typeof r.sourceUrl === 'string' && /^https?:\/\//.test(r.sourceUrl)))) problems.push(`${at}.sourceUrl must be null or an http(s) URL`)
      if (r.verified === true && r.sourceUrl === null) problems.push(`${at}: a verified record needs a sourceUrl`)
      if (!(r.retrievedAt === null || typeof r.retrievedAt === 'string')) problems.push(`${at}.retrievedAt must be null or a date string`)
      if (!isObject(r.rates)) problems.push(`${at}.rates must be an object`)
      else
        for (const [dim, rate] of Object.entries(r.rates)) {
          const rat = `${at}.rates.${dim}`
          if (!DIMENSION_RE.test(dim)) problems.push(`${rat}: invalid dimension name`)
          if (!isObject(rate)) {
            problems.push(`${rat} is not an object`)
            continue
          }
          if (!(Number.isFinite(rate.per) && (rate.per as number) > 0)) problems.push(`${rat}.per must be a positive number`)
          if (rate.tiers !== undefined) {
            if (!Array.isArray(rate.tiers) || !rate.tiers.length) problems.push(`${rat}.tiers must be a non-empty array`)
            else {
              let prev = 0
              rate.tiers.forEach((t: unknown, j: number) => {
                if (!isObject(t) || !isDecimalString(t.price)) return void problems.push(`${rat}.tiers[${j}].price must be a decimal string`)
                const last = j === (rate.tiers as unknown[]).length - 1
                if (last ? t.upTo !== null : !(typeof t.upTo === 'number' && t.upTo > prev)) problems.push(`${rat}.tiers[${j}].upTo must be ${last ? 'null' : 'an increasing number'}`)
                else if (typeof t.upTo === 'number') prev = t.upTo
              })
            }
          } else if (!isDecimalString(rate.price)) problems.push(`${rat}.price must be a decimal string (not a number)`)
        }
      if (r.serviceTier !== undefined && !(typeof r.serviceTier === 'string' && /^[a-z][a-z-]*$/.test(r.serviceTier))) problems.push(`${at}.serviceTier must be a lower-case word`)
      if (r.contextBand !== undefined) {
        const b = r.contextBand
        if (!isObject(b) || typeof b.label !== 'string') problems.push(`${at}.contextBand needs a label`)
        else for (const k of ['minInputTokens', 'maxInputTokens']) if (b[k] !== undefined && !(Number.isInteger(b[k]) && (b[k] as number) >= 0)) problems.push(`${at}.contextBand.${k} must be a non-negative integer`)
      }
      if (r.discounts !== undefined) {
        if (!Array.isArray(r.discounts)) problems.push(`${at}.discounts must be an array`)
        else r.discounts.forEach((d: unknown, j: number) => {
          if (!isObject(d) || typeof d.name !== 'string' || !isDecimalString(d.factor)) problems.push(`${at}.discounts[${j}] needs name and a decimal factor`)
        })
      }
    })
  }
  const checkRate = (rate: unknown, where: string) => {
    if (!isObject(rate) || !Number.isFinite(rate.per) || !((rate.per as number) > 0) || !(rate.tiers !== undefined || isDecimalString(rate.price))) problems.push(`${where} is not a valid rate`)
  }
  if (raw.sharedRates !== undefined) {
    if (!isObject(raw.sharedRates)) problems.push('sharedRates must be an object')
    else for (const [dim, rate] of Object.entries(raw.sharedRates)) checkRate(rate, `sharedRates.${dim}`)
  }
  if (raw.modifiers !== undefined) {
    if (!Array.isArray(raw.modifiers)) problems.push('modifiers must be an array')
    else raw.modifiers.forEach((m: unknown, i: number) => {
      if (!isObject(m) || typeof m.name !== 'string' || !isDecimalString(m.factor)) problems.push(`modifiers[${i}] needs a name and a decimal factor`)
      else if (m.appliesTo !== undefined && !(Array.isArray(m.appliesTo) && m.appliesTo.length && m.appliesTo.every((d) => typeof d === 'string' && DIMENSION_RE.test(d)))) problems.push(`modifiers[${i}].appliesTo must be a non-empty array of dimension names`)
    })
  }
  if (problems.length) throw new RegistryValidationError(file, problems)
  return raw as unknown as PricingFile
}

const cache = new Map<string, PricingFile>()

export function loadPricing(provider: string, directory = PRICING_CONFIG_DIR): PricingFile {
  const key = `${directory}|${provider}`
  const hit = cache.get(key)
  if (hit) return hit
  const path = join(directory, `${provider}.json`)
  if (!existsSync(path)) throw new RegistryValidationError(path, ['no pricing file for this provider'])
  const parsed = validatePricingFile(JSON.parse(readFileSync(path, 'utf8')), path)
  if (parsed.provider !== provider) throw new RegistryValidationError(path, [`provider "${parsed.provider}" does not match the file name`])
  cache.set(key, parsed)
  return parsed
}

export function listPricingProviders(directory = PRICING_CONFIG_DIR): string[] {
  return readdirSync(directory).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
}

/**
 * The record in force for a model at a time: among records matching the model with effectiveFrom <= at, an exact
 * model match beats a pattern, then the latest effectiveFrom wins.
 */
export function resolvePricing(records: PricingRecord[], model: string, at: Date | string = new Date(), options: { serviceTier?: string; inputTokens?: number } = {}): PricingRecord | undefined {
  const day = (typeof at === 'string' ? at : at.toISOString()).slice(0, 10)
  const tier = options.serviceTier ?? 'standard'
  const n = options.inputTokens ?? 0
  const inBand = (b?: ContextBand) => !b || ((b.minInputTokens === undefined || n >= b.minInputTokens) && (b.maxInputTokens === undefined || n <= b.maxInputTokens))
  const candidates = records.filter((r) => r.effectiveFrom <= day && matchesModel(r.model, model) && (r.serviceTier ?? 'standard') === tier && inBand(r.contextBand))
  candidates.sort((a, b) => Number(b.model === model) - Number(a.model === model) || b.effectiveFrom.localeCompare(a.effectiveFrom))
  return candidates[0]
}

/** The snapshot a ledger row keeps. `applied` are the selected modifiers (batch, priority...), recorded as discounts so the cost reproduces. */
export const snapshotOf = (r: PricingRecord, applied: PriceModifier[] = []): RatesSnapshot => {
  const discounts: Discount[] = [...(r.discounts ?? []), ...applied.map((m) => ({ name: m.name, factor: m.factor, appliesTo: [...(m.appliesTo ?? DEFAULT_MODIFIER_DIMENSIONS)] }))]
  return { pricingVersion: r.pricingVersion, currency: r.currency, verified: r.verified, rates: r.rates, ...(discounts.length ? { discounts } : {}), ...(r.serviceTier ? { serviceTier: r.serviceTier } : {}), ...(r.contextBand ? { contextBand: r.contextBand } : {}) }
}

/** The record with the file's model-independent rates (tool and search fees) merged under its own rates. */
export const withSharedRates = (file: PricingFile, r: PricingRecord): PricingRecord => (file.sharedRates ? { ...r, rates: { ...file.sharedRates, ...r.rates } } : r)

/**
 * Selects modifiers by name for a matched record. Refuses an unknown name, a modifier not meant for the model, and a
 * modifier whose tier the record already is (a batch record already carries the batch price: applying batchDiscount
 * again would count it twice).
 */
export function selectModifiers(file: PricingFile, record: PricingRecord, names: string[]): PriceModifier[] {
  return names.map((name) => {
    const m = (file.modifiers ?? []).find((x) => x.name === name && (!x.models || x.models.some((p) => matchesModel(p, record.model))))
    if (!m) throw new PricingError('unknown-modifier', `No modifier "${name}" for ${file.provider}/${record.model}.`)
    if (m.serviceTier && m.serviceTier === (record.serviceTier ?? 'standard')) throw new PricingError('modifier-refused', `Modifier "${name}" is refused: the matched record is already the ${m.serviceTier} tier, so its rates include it.`)
    return m
  })
}

/** xAI reports cost in ticks (1e10 ticks = 1 USD); returns the provider-reported cost for ProviderUsage.providerCost. */
export const ticksToUsd = (ticks: number | string): { amount: string; currency: 'USD' } => ({ amount: new Money(ticks).div(10_000_000_000).toFixed(MONEY_SCALE), currency: 'USD' })

/** A record counts as priced when it has at least one rate. Unpriced models cannot be used with developer keys. */
export const isPriced = (r: PricingRecord | undefined): boolean => !!r && Object.keys(r.rates).length > 0

function amountFor(rate: Rate, quantity: Decimal): Decimal {
  const per = new Money(rate.per)
  if (!rate.tiers) return quantity.div(per).mul(rate.price!)
  let remaining = quantity
  let lower = new Money(0)
  let total = new Money(0)
  for (const tier of rate.tiers) {
    if (remaining.lte(0)) break
    const width = tier.upTo === null ? remaining : Decimal.min(remaining, new Money(tier.upTo).minus(lower))
    total = total.plus(width.div(per).mul(tier.price))
    remaining = remaining.minus(width)
    if (tier.upTo !== null) lower = new Money(tier.upTo)
  }
  return total
}

/** Token and unit quantities by billing dimension, following the normalisation rules of ProviderUsage. */
export function usageQuantities(usage: Pick<ProviderUsage, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteTokens' | 'cacheWrite1hTokens' | 'reasoningTokens' | 'units'>): Record<string, number> {
  const cached = usage.cachedInputTokens ?? 0
  const write = usage.cacheWriteTokens ?? 0
  const write1h = Math.min(usage.cacheWrite1hTokens ?? 0, write)
  const reasoning = usage.reasoningTokens ?? 0
  const q: Record<string, number> = {}
  if (usage.inputTokens !== undefined) {
    const uncached = usage.inputTokens - cached - write
    // Negative means cached or cache-write tokens were also counted outside inputTokens: an adapter double count. Fail loudly.
    if (uncached < 0) throw new PricingError('negative-uncached-input', `inputTokens ${usage.inputTokens} is smaller than cached ${cached} + cache-write ${write}; ProviderUsage.inputTokens must include them.`)
    q.input = uncached
    if (cached) q.cachedInput = cached
    if (write - write1h > 0) q.cacheWrite = write - write1h
    if (write1h) q.cacheWrite1h = write1h
  }
  if (usage.outputTokens !== undefined) {
    if (usage.outputTokens < reasoning) throw new PricingError('negative-visible-output', `outputTokens ${usage.outputTokens} is smaller than reasoning ${reasoning}; ProviderUsage.outputTokens must include reasoning.`)
    q.output = usage.outputTokens - reasoning
    if (reasoning) q.reasoning = reasoning
  }
  for (const u of usage.units ?? []) q[u.dimension] = (q[u.dimension] ?? 0) + u.quantity
  return q
}

/**
 * When a provider has no rate for a dimension, it is billed at the first of these that has one.
 * Choice for `cacheWrite1h`: with no 1 hour rate it is billed at the 5 minute cache-write rate (`cacheWrite5m`, then the
 * generic `cacheWrite`), never at the plain input rate: a cache write costs at least the 5 minute premium, so this is
 * the closest rate the provider publishes and the least likely to under-state the cost.
 */
const FALLBACK: Record<string, string[]> = { cachedInput: ['input'], cacheWrite: ['cacheWrite5m', 'input'], cacheWrite1h: ['cacheWrite5m', 'cacheWrite', 'input'], reasoning: ['output'] }

/**
 * Cost of one usage from a rates snapshot (the stored form). Pure and deterministic: the same snapshot and usage
 * always give the same string, which is how historical costs are reproduced.
 */
export function costFromSnapshot(usage: Parameters<typeof usageQuantities>[0], snapshot: RatesSnapshot): CostResult {
  const quantities = usageQuantities(usage)
  const lines: CostLine[] = []
  const missing: string[] = []
  let sum = new Money(0)
  const discounts = snapshot.discounts ?? []
  for (const [dimension, quantity] of Object.entries(quantities)) {
    if (!(quantity > 0)) continue
    let rate = snapshot.rates[dimension]
    let billedAs: string | undefined
    if (!rate) {
      billedAs = (FALLBACK[dimension] ?? []).find((d) => snapshot.rates[d])
      if (billedAs) rate = snapshot.rates[billedAs]
    }
    if (!rate) {
      missing.push(dimension)
      continue
    }
    // Each discount or modifier multiplies only the dimensions it applies to (all of them when appliesTo is absent).
    let amount = amountFor(rate, new Money(quantity))
    for (const d of discounts) if (!d.appliesTo || d.appliesTo.includes(dimension)) amount = amount.mul(d.factor)
    sum = sum.plus(amount)
    lines.push({ dimension, quantity: String(quantity), ...(billedAs ? { billedAs } : {}), amount: amount.toFixed(MONEY_SCALE) })
  }
  const pricedTotal = sum.toFixed(MONEY_SCALE)
  return { currency: snapshot.currency, pricingVersion: snapshot.pricingVersion, verified: snapshot.verified, lines, missing, total: missing.length ? null : pricedTotal, pricedTotal }
}

export const calculateCost = (usage: Parameters<typeof usageQuantities>[0], record: PricingRecord): CostResult => costFromSnapshot(usage, snapshotOf(record))

/** Decimal-safe helpers for callers that add or compare money strings. */
export const addMoney = (a: string, b: string): string => new Money(a).plus(b).toFixed(MONEY_SCALE)
export const negateMoney = (a: string): string => new Money(a).neg().toFixed(MONEY_SCALE)
