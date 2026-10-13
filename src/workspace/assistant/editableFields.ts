import type { ObjectType, PropertyValue, RelationshipType } from '../domain/types'
import { COMPLIANCE_LABEL } from '../sdk/ui'

/**
 * Explicit allowlist of what the assistant may propose to change. Anything not
 * listed here is rejected, whatever the assistant asks for.
 */

type TargetKind = 'scenario' | ObjectType

interface BaseRule {
  target: TargetKind
  property: string
  label: string
}

export type FieldRule =
  | (BaseRule & { type: 'quantity'; unit: string; min: number; max: number })
  | (BaseRule & { type: 'text'; maxLength: number })
  | (BaseRule & { type: 'enum'; options: string[] })
  | (BaseRule & { type: 'enum-list'; options: string[] })

export const EDITABLE_FIELDS: FieldRule[] = [
  { target: 'scenario', property: 'operatingLoad', label: 'Operating load', type: 'quantity', unit: 'kN', min: 0.1, max: 500 },
  { target: 'scenario', property: 'ambientTemperature', label: 'Ambient temperature', type: 'quantity', unit: '°C', min: -60, max: 200 },
  { target: 'part', property: 'designFactor', label: 'Design factor', type: 'quantity', unit: '-', min: 1, max: 10 },
  { target: 'part', property: 'diameter', label: 'Diameter', type: 'quantity', unit: 'mm', min: 1, max: 500 },
  { target: 'part', property: 'effectiveLength', label: 'Effective length', type: 'quantity', unit: 'mm', min: 1, max: 10000 },
  { target: 'requirement', property: 'statement', label: 'Statement', type: 'text', maxLength: 600 },
  { target: 'requirement', property: 'compliance', label: 'Compliance status', type: 'enum', options: Object.keys(COMPLIANCE_LABEL) },
  {
    target: 'requirement',
    property: 'verificationMethods',
    label: 'Verification methods',
    type: 'enum-list',
    options: ['Analysis', 'Test', 'Inspection', 'Demonstration'],
  },
]

export const EDITABLE_RELATIONSHIPS: { type: RelationshipType; from: ObjectType[]; to: ObjectType[] }[] = [
  { type: 'allocated-to', from: ['requirement'], to: ['assembly', 'part'] },
  { type: 'verifies', from: ['procedure'], to: ['requirement'] },
]

/** Maximum number of changes in one proposal (one transaction). */
export const MAX_CHANGES_PER_PROPOSAL = 5

export function findFieldRule(target: TargetKind, property: string): FieldRule | undefined {
  return EDITABLE_FIELDS.find((r) => r.target === target && r.property === property)
}

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
        return {
          ok: false,
          code: 'range',
          message: `${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}.`,
        }
      }
      return {
        ok: true,
        value: { value: converted, unit: rule.unit },
        note: factor !== 1 ? `converted from ${value} ${given}` : undefined,
      }
    }
    case 'text': {
      if (typeof raw !== 'string' || !raw.trim()) return { ok: false, code: 'type', message: `${rule.label} must be text.` }
      if (raw.length > rule.maxLength) {
        return { ok: false, code: 'range', message: `${rule.label} is limited to ${rule.maxLength} characters.` }
      }
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
