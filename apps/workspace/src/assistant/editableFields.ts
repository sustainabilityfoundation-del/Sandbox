import type { PropertyValue } from '@ews/model-service'
import type { CreatableObjectRule, EntitlementId, FieldRule, RelationshipRule } from '@ews/platform-sdk'
import { useEntitlements } from '../platform/entitlements'
import { getTools } from '../platform/registry'

/**
 * What the assistant may propose to change: the union of the rules contributed
 * by the tools the subscription includes. Anything not covered is rejected,
 * whatever the assistant asks for. Each rule remembers which entitlement made
 * it available, so applying a proposal can check that access still exists.
 */

type Sourced<T> = T & { entitlement: EntitlementId }

export interface AssistantRules {
  fields: Sourced<FieldRule>[]
  relationships: Sourced<RelationshipRule>[]
  creatable: Sourced<CreatableObjectRule>[]
}

export function collectRules(): AssistantRules {
  const { has } = useEntitlements.getState()
  const rules: AssistantRules = { fields: [], relationships: [], creatable: [] }
  for (const tool of getTools()) {
    if (!has(tool.entitlement) || !tool.assistant) continue
    const tag = <T,>(r: T): Sourced<T> => ({ ...r, entitlement: tool.entitlement })
    rules.fields.push(...(tool.assistant.editableFields ?? []).map(tag))
    rules.relationships.push(...(tool.assistant.editableRelationships ?? []).map(tag))
    rules.creatable.push(...(tool.assistant.creatableObjects ?? []).map(tag))
  }
  return rules
}

/** Maximum number of changes in one proposal (one transaction). */
export const MAX_CHANGES_PER_PROPOSAL = 6

/** Unit aliases → factor to the field's canonical unit. */
const CONVERSIONS: Record<string, Record<string, number>> = {
  kN: { kN: 1, kn: 1, N: 0.001, n: 0.001, MN: 1000 },
  mm: { mm: 1, cm: 10, m: 1000 },
  '°C': { '°C': 1, C: 1, degC: 1, '°c': 1 },
  '-': { '-': 1, '': 1 },
}

export type Normalized =
  | { ok: true; value: PropertyValue; note?: string }
  | { ok: false; code: 'unit' | 'range' | 'type'; message: string }

/** Validates and converts a proposed value for an allowlisted field. */
export function normalizeValue(rule: FieldRule, raw: unknown, unit?: string): Normalized {
  switch (rule.type) {
    case 'quantity': {
      const value = typeof raw === 'string' ? Number(raw) : raw
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, code: 'type', message: `${rule.label} must be a number.` }
      }
      const given = (unit ?? '').trim()
      if (!given && rule.unit !== '-') {
        return { ok: false, code: 'unit', message: `${rule.label} needs a unit (expected ${rule.unit}).` }
      }
      const factor = CONVERSIONS[rule.unit]?.[given]
      if (factor === undefined) {
        return { ok: false, code: 'unit', message: `“${given}” is not a unit for ${rule.label.toLowerCase()} (expected ${rule.unit}).` }
      }
      const converted = Number((value * factor).toPrecision(12))
      if (converted < rule.min || converted > rule.max) {
        return { ok: false, code: 'range', message: `${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}.` }
      }
      return { ok: true, value: { value: converted, unit: rule.unit }, note: factor !== 1 ? `converted from ${value} ${given}` : undefined }
    }
    case 'text': {
      if (typeof raw !== 'string' || !raw.trim()) return { ok: false, code: 'type', message: `${rule.label} must be text.` }
      if (raw.length > rule.maxLength) return { ok: false, code: 'range', message: `${rule.label} is limited to ${rule.maxLength} characters.` }
      return { ok: true, value: raw.trim() }
    }
    case 'enum': {
      if (typeof raw !== 'string' || !rule.options.includes(raw)) {
        return { ok: false, code: 'type', message: `${rule.label} must be one of ${rule.options.join(', ')}.` }
      }
      return { ok: true, value: raw }
    }
    case 'enum-list': {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !rule.options.includes(v))) {
        return { ok: false, code: 'type', message: `${rule.label} must be a list of ${rule.options.join(', ')}.` }
      }
      return { ok: true, value: [...new Set(raw as string[])] }
    }
  }
}
