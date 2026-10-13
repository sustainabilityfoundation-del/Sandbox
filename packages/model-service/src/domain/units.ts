import type { PropertyValue, Quantity } from './types'

export function isQuantity(value: unknown): value is Quantity {
  return typeof value === 'object' && value !== null && 'value' in value && 'unit' in value
}

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Number(value.toPrecision(Math.max(digits, 1)))
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

export function formatQuantity(q: Quantity): string {
  return q.unit && q.unit !== '-' ? `${formatNumber(q.value)} ${q.unit}` : formatNumber(q.value)
}

export function formatValue(value: PropertyValue | undefined): string {
  if (value === undefined) return '—'
  if (isQuantity(value)) return formatQuantity(value)
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return formatNumber(value)
  return value
}

const LABELS: Record<string, string> = {
  partNumber: 'Part number',
  outerDiameter: 'Outer diameter',
  wallThickness: 'Wall thickness',
  elasticModulus: 'Elastic modulus',
  effectiveLength: 'Effective length',
  endFixityFactor: 'End-fixity factor K',
  designFactor: 'Design factor',
  ratedPower: 'Rated power',
  ratedSpeed: 'Rated speed',
  operatingLoad: 'Operating load',
  verificationMethods: 'Verification methods',
  acceptanceCriteria: 'Acceptance criteria',
}

/** "outerDiameter" → "Outer diameter", unless a specific label is defined. */
export function propertyLabel(key: string): string {
  if (LABELS[key]) return LABELS[key]
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
