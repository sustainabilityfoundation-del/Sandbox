import type { CalculationManifest, CheckResult, ManifestLimits, ResultRange, StatusBasis, ValidityResult } from './evaluate'

/**
 * C11 qualifications of a calculation, derived from a manifest of any supported version. This is what
 * Conceptualize stores next to calculated evidence and what trade studies, Pareto comparisons, rationale and
 * reasoning outputs carry unchanged (contract-change-requests.md, CR-C8/C11 storage contract).
 *
 * Older manifests are mapped conservatively: R1 vertex results become `sampled-range` (never bounds), and a
 * status established by sampling is reported as `uncertain` (it was never proven).
 */
export interface CalculationQualifications {
  manifestVersion: 1 | 2 | 3
  uncertainty: CalculationManifest['uncertainty']
  outputs: { symbol: string; unit: string; value: number; range: ResultRange }[]
  checks: { relationId: string; text: string; unit: string; margin: number; nominalSatisfied: boolean; status: CheckResult['status']; statusBasis: StatusBasis; marginRange: ResultRange }[]
  validity: ValidityResult
  limits: ManifestLimits
}

type LegacyOutput = { symbol: string; value: number; unit: string; range?: ResultRange; min?: number; max?: number; bounds?: { min: number; max: number; quality: 'exact' | 'enclosure' | 'vertices'; inner?: { min: number; max: number }; note?: string } }
type LegacyCheck = { relationId: string; text?: string; unit: string; margin: number; satisfied?: boolean; nominalSatisfied?: boolean; status: CheckResult['status']; statusBasis?: StatusBasis; marginRange?: ResultRange; marginBounds?: LegacyOutput['bounds'] }

function legacyRange(o: { min?: number; max?: number; bounds?: LegacyOutput['bounds'] }, vertexMode: boolean): ResultRange {
  if (o.bounds) {
    if (o.bounds.quality === 'vertices') return { kind: 'sampled-range', min: o.bounds.min, max: o.bounds.max, method: 'vertices', samples: 0, note: 'Vertex sampling (manifest v1 method): not a bound.' }
    const out: ResultRange = { kind: 'bounds', quality: o.bounds.quality, min: o.bounds.min, max: o.bounds.max }
    if (o.bounds.inner) out.sampled = { kind: 'sampled-range', min: o.bounds.inner.min, max: o.bounds.inner.max, method: 'vertices-and-nominal', samples: 0, note: 'Values attained at sample points (manifest v2 "inner"); not a bound.' }
    if (o.bounds.note) out.note = o.bounds.note
    return out
  }
  if (vertexMode && o.min !== undefined && o.max !== undefined) return { kind: 'sampled-range', min: o.min, max: o.max, method: 'vertices', samples: 0, note: 'Vertex sampling (manifest v1 method): not a bound.' }
  return { kind: 'point' }
}

export function qualifyManifest(manifest: CalculationManifest): CalculationQualifications {
  const version = (manifest.manifestVersion ?? 1) as 1 | 2 | 3
  const vertexMode = manifest.uncertainty === 'interval-vertices'
  const ranged = manifest.uncertainty !== 'point' && manifest.inputs.some((i) => i.min !== undefined && i.max !== undefined && i.min !== i.max)
  const outputs = (manifest.outputs as LegacyOutput[]).map((o) => ({ symbol: o.symbol, unit: o.unit, value: o.value, range: o.range ?? legacyRange(o, vertexMode) }))
  const checks = (manifest.checks as LegacyCheck[]).map((c) => {
    const nominalSatisfied = c.nominalSatisfied ?? c.satisfied ?? false
    let statusBasis: StatusBasis = c.statusBasis ?? (!ranged ? 'point' : vertexMode ? 'sampled' : c.marginBounds?.quality === 'exact' ? 'exact-bounds' : 'enclosure')
    let status = c.status
    // A status established by sampling was never proven over the range (C11).
    if (statusBasis === 'sampled') status = 'uncertain'
    if (!ranged) statusBasis = 'point'
    // v1 recorded no margin range: only the nominal (point) margin is known.
    const marginRange: ResultRange = c.marginRange ?? (c.marginBounds ? legacyRange({ bounds: c.marginBounds }, false) : { kind: 'point' })
    return { relationId: c.relationId, text: c.text ?? c.relationId, unit: c.unit, margin: c.margin, nominalSatisfied, status, statusBasis, marginRange }
  })
  const v = manifest.validity as Partial<ValidityResult> & { satisfied: boolean; violated: string[] }
  const validity: ValidityResult = {
    satisfied: v.satisfied && !(ranged && vertexMode),
    violated: v.violated,
    uncertain: v.uncertain ?? (ranged && vertexMode ? ['validity sampled at range vertices only (manifest v1)'] : []),
    over: v.over ?? (ranged ? 'range' : 'point'),
  }
  const limits: ManifestLimits = manifest.limits ?? { establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'not-recorded', modelBasis: 'not-recorded' }
  return { manifestVersion: version, uncertainty: manifest.uncertainty, outputs, checks, validity, limits }
}
