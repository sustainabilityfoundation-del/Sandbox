import { refKey, type AnyRef } from '@ews/design-reasoning-core'
import type { ContextBudget, ContextBudgetUsage, ContextOmission, ContextRef, ContextSection, ContextSnapshotItem } from '@ews/platform-sdk'

/**
 * Packing (ADR-0085): merge the selectors' items, drop duplicates by reference key, order mandatory first then by rank, and fit
 * the budget. Pure and deterministic, so it is tested without a database or a model.
 *
 * - Mandatory items (safety-relevant constraints, critical interfaces, material unknowns) are never dropped or summarised. If they
 *   alone exceed the budget the package is `overBudget` and they are all kept.
 * - Numbers are never compressed: quantities pass through untouched (the same objects, byte for byte).
 * - Summaries are bounded to 2,000 characters (a selector should not send more; an overlong one is cut with an ellipsis).
 */

export const DEFAULT_MAX_TOKENS = 12_000
export const MAX_ITEMS = 400
export const MAX_BYTES = 256 * 1024
export const SUMMARY_LIMIT = 2000
/** Items that are people-supplied files (project documents) or other external content: rendered as `external-data`. */
export const isExternalItem = (item: ContextSnapshotItem): boolean => (item.ref.module === 'projects' && item.ref.kind === 'document') || item.ref.module === 'external'

/** The budget of one package: the smaller of the setting and a quarter of the model's context limit; at most 400 items and 256 KB. */
export function budgetFor(settingMaxTokens: number | undefined, modelContextLimit: number | undefined): ContextBudget {
  const setting = Number.isFinite(settingMaxTokens) && (settingMaxTokens as number) > 0 ? Math.floor(settingMaxTokens as number) : DEFAULT_MAX_TOKENS
  const quarter = Number.isFinite(modelContextLimit) && (modelContextLimit as number) > 0 ? Math.floor((modelContextLimit as number) / 4) : Infinity
  return { maxTokens: Math.max(1, Math.min(setting, quarter)), maxItems: MAX_ITEMS, maxBytes: MAX_BYTES }
}

/** Conservative token estimate (the gateway uses the same three characters per token). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3)

const SECTION_ORDER: ContextSection[] = ['objective', 'systems', 'interfaces', 'requirements', 'constraints', 'decisions', 'evidence', 'assumptions', 'unknowns', 'readiness', 'background']
export const sectionRank = (s: ContextSection | undefined): number => {
  const i = SECTION_ORDER.indexOf(s ?? 'background')
  return i < 0 ? SECTION_ORDER.length : i
}
export const SECTIONS = SECTION_ORDER

/** Identity of an item: the reference without its revision (Design Reasoning `refKey`) plus kind and the fields it carries. */
export const itemKey = (item: ContextSnapshotItem): string => `${refKey(item.ref as unknown as AnyRef)}#${item.ref.kind ?? ''}#${[...item.fields].sort().join(',')}`

/**
 * Folds ANY text into one plain line: every control character, Unicode line or paragraph separator and run of whitespace becomes
 * one space. Applied to every field that reaches a rendered block (labels, statuses, summaries, quantity names, units and datums,
 * reference parts, readiness issues), so data can never start a new line or forge a block marker.
 */
export const fold = (s: unknown): string => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\s]+/g, ' ').trim()

/** One-line text of a quantity, exactly as stored (numbers are never touched; the words around them are folded). */
export function quantityText(q: NonNullable<NonNullable<ContextSnapshotItem['projection']>['quantities']>[number]): string {
  const tol = q.tolerance ? ` (-${q.tolerance.minus}/+${q.tolerance.plus})` : ''
  return `${fold(q.name)} = ${q.value} ${fold(q.unit)}${tol}${q.datum ? ` from ${fold(q.datum)}` : ''}`
}

/** The text an item contributes to a rendered block: always exactly one line, starting with "- ". */
export function itemLine(item: ContextSnapshotItem): string {
  const p = item.projection
  const flags = [`r${item.revision ?? '-'}`, item.mandatory && 'mandatory', item.stale && 'STALE (a newer revision exists)', p?.status && fold(p.status)].filter(Boolean).join(', ')
  const sub = item.fields.length && item.ref.module === 'conceptualize' && item.ref.kind === 'intent' ? `[${item.fields.map(fold).join(',')}]` : ''
  const head = `- ${fold(item.ref.module)}:${fold(item.ref.kind ?? item.ref.type ?? 'item')}:${fold(item.ref.id)}${sub} ${p?.label ? fold(p.label) : ''} (${flags})`
  const summary = p?.summary ? ` ${fold(p.summary)}` : ''
  const quantities = p?.quantities?.length ? ` Values: ${p.quantities.map(quantityText).join('; ')}.` : ''
  return `${head}${summary}${quantities}`
}

/** Text shown instead of data the person chose not to share (same wording as operation results). */
export const WITHHELD = '[withheld by your AI data-sharing settings]'

/**
 * Applies the person's `ai.sharing.*` settings to items before they are packed or returned (the same rules as operation
 * results, `redact` in wire.ts): without requirement text, the statements of requirements, constraints and decisions are
 * withheld; without element details, every value and every free-text summary is withheld except the objective, the unknowns and
 * the readiness. Identity (reference, revision, label, status) always stays.
 */
export function applySharing(items: ContextSnapshotItem[], sharing: { requirementText: boolean; elementDetails: boolean }): ContextSnapshotItem[] {
  if (sharing.requirementText && sharing.elementDetails) return items
  return items.map((item) => {
    const p = item.projection
    if (!p) return item
    const section = item.section ?? 'background'
    const statement = section === 'requirements' || section === 'constraints' || section === 'decisions'
    const detail = !['objective', 'unknowns', 'readiness'].includes(section)
    const hideText = (!sharing.requirementText && statement) || (!sharing.elementDetails && detail)
    const hideValues = !sharing.elementDetails
    if (!hideText && !hideValues) return item
    const { quantities, summary, ...rest } = p
    return { ...item, projection: { ...rest, ...(hideText && summary ? { summary: WITHHELD } : summary ? { summary } : {}), ...(!hideValues && quantities ? { quantities } : {}) } }
  })
}

/** Bounds free text and drops items that are not references. */
export function sanitize(item: ContextSnapshotItem): ContextSnapshotItem | null {
  if (!item || !item.ref || typeof item.ref.module !== 'string' || typeof item.ref.id !== 'string' || !item.ref.id) return null
  const p = item.projection
  const projection = p ? { ...p, ...(p.summary !== undefined ? { summary: p.summary.length > SUMMARY_LIMIT ? `${p.summary.slice(0, SUMMARY_LIMIT - 1)}…` : p.summary } : {}), ...(p.label !== undefined && p.label.length > 300 ? { label: `${p.label.slice(0, 299)}…` } : {}) } : undefined
  const next: ContextSnapshotItem = { ...item, fields: Array.isArray(item.fields) ? item.fields : [], revision: item.revision ?? item.ref.revision ?? null, ...(projection ? { projection } : {}) }
  next.estimatedTokens = estimateTokens(itemLine(next))
  return next
}

export const itemBytes = (item: ContextSnapshotItem): number => Buffer.byteLength(JSON.stringify(item), 'utf8')

export interface PackResult {
  items: ContextSnapshotItem[]
  omitted: ContextOmission[]
  used: ContextBudgetUsage
  overBudget: boolean
  /** Plain-language notes (for example mandatory items cut at the absolute limit); stored with the package and shown in the rendered context. */
  notes: string[]
}

/** Merges duplicates: the highest rank and revision win, mandatory wins over not mandatory. */
function dedupe(items: ContextSnapshotItem[]): ContextSnapshotItem[] {
  const byKey = new Map<string, ContextSnapshotItem>()
  for (const item of items) {
    const key = itemKey(item)
    const have = byKey.get(key)
    if (!have) {
      byKey.set(key, item)
      continue
    }
    const newer = (item.revision ?? 0) > (have.revision ?? 0)
    const base = newer ? item : have
    const other = newer ? have : item
    byKey.set(key, { ...base, ...(base.mandatory || other.mandatory ? { mandatory: true } : {}), rank: Math.max(base.rank ?? 0, other.rank ?? 0) })
  }
  return [...byKey.values()]
}

export function pack(input: ContextSnapshotItem[], budget: ContextBudget, carried: ContextOmission[] = []): PackResult {
  const clean = dedupe(input.map(sanitize).filter((i): i is ContextSnapshotItem => !!i))
  clean.sort((a, b) => Number(!!b.mandatory) - Number(!!a.mandatory) || (b.rank ?? 0) - (a.rank ?? 0) || sectionRank(a.section) - sectionRank(b.section) || itemKey(a).localeCompare(itemKey(b)))
  const kept: ContextSnapshotItem[] = []
  const dropped: ContextRef[] = []
  let droppedCount = 0
  let truncated = 0
  const used: ContextBudgetUsage = { estimatedTokens: 0, items: 0, bytes: 0 }
  for (const item of clean) {
    const tokens = item.estimatedTokens ?? estimateTokens(itemLine(item))
    const bytes = itemBytes(item)
    const fits = used.items + 1 <= budget.maxItems && used.estimatedTokens + tokens <= budget.maxTokens && used.bytes + bytes <= budget.maxBytes
    // The absolute ceiling (400 items, 256 KB) holds even for mandatory items: they are kept up to it, never beyond.
    const withinHard = used.items + 1 <= MAX_ITEMS && used.bytes + bytes <= MAX_BYTES
    if (item.mandatory && !withinHard) {
      truncated++
      droppedCount++
      if (dropped.length < 200) dropped.push(item.ref)
    } else if ((item.mandatory || fits) && withinHard) {
      kept.push(item)
      used.items++
      used.estimatedTokens += tokens
      used.bytes += bytes
    } else {
      droppedCount++
      if (dropped.length < 200) dropped.push(item.ref)
    }
  }
  const overBudget = truncated > 0 || used.items > budget.maxItems || used.estimatedTokens > budget.maxTokens || used.bytes > budget.maxBytes
  const omitted: ContextOmission[] = [...carried]
  if (droppedCount) omitted.push({ reason: 'budget', count: droppedCount, refs: dropped })
  const notes = truncated ? [`${truncated} mandatory record${truncated === 1 ? ' was' : 's were'} left out because the absolute limit of ${MAX_ITEMS} items and ${MAX_BYTES / 1024} KB per package was reached; the package is over budget and incomplete.`] : []
  return { items: kept, omitted, used, overBudget, notes }
}
