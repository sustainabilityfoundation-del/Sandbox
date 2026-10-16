import type { CalculationQualifications, ResultRange, StatusBasis } from '@ews/conceptualize-client'

/**
 * Display vocabulary of the C11 storage contract (contract-change-requests.md, "CR-C8 and C11: storage contract"
 * §4). Labels only: the qualifications themselves come unchanged from the calculation engine through the service.
 */

const n = (x: number) => Number(x.toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 6 })

export function rangeLabel(range: ResultRange, unit: string): string {
  const u = unit && unit !== '-' ? ` ${unit}` : ''
  if (range.kind === 'point') return 'point value'
  if (range.kind === 'sampled-range') return `sampled values ${n(range.min)}–${n(range.max)}${u} (${range.samples} samples; not a bound)`
  return range.quality === 'exact' ? `exact bounds ${n(range.min)}–${n(range.max)}${u}` : `enclosure ${n(range.min)}–${n(range.max)}${u} (true range may be narrower)`
}

/** Sampled values that come with bounds stay a separate, labelled field (Q3). */
export function sampledWithinLabel(range: ResultRange, unit: string): string | null {
  if (range.kind !== 'bounds' || !range.sampled) return null
  const u = unit && unit !== '-' ? ` ${unit}` : ''
  return `sampled values ${n(range.sampled.min)}–${n(range.sampled.max)}${u} (${range.sampled.samples} samples; not a bound)`
}

export function checkStatusLabel(status: 'satisfied' | 'violated' | 'uncertain', basis: StatusBasis): string {
  if (status === 'uncertain') return 'uncertain: not proven over the input ranges'
  if (basis === 'point') return `${status} at the nominal point`
  if (basis === 'exact-bounds') return `${status} over the input ranges (proven, exact bounds)`
  if (basis === 'enclosure') return `${status} over the input ranges (proven from an enclosure)`
  // A status established by sampling is never proven; the engine reports it as uncertain (Q4).
  return 'uncertain: not proven over the input ranges'
}

export function limitsText(limits: CalculationQualifications['limits']): string {
  return `Reproducible calculation. It does not establish that the model is valid for this design (validation status: ${limits.modelValidationStatus}) or that any requirement is satisfied.`
}

export const STATUS_TONE = { satisfied: 'success', violated: 'danger', uncertain: 'warning' } as const
