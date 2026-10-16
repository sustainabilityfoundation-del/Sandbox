import { massProperties, type CadDocument, type RegenerationResult } from '@ews/cad-core'
import type { ConceptsService, ConstraintSummary } from '@ews/platform-sdk'

/**
 * Model checks (demonstration D1, ADR-0070 item 3). The regenerated CAD model is measured and the
 * measurements are compared with design-constraint bounds read from Conceptualize
 * (`ConceptsService.getConstraint`). Bounds supplied by a caller are never used.
 *
 * Every result records what was measured and how, the CAD document, its stored revision and model
 * version, and the kernel name and version. Results report geometry and parameter values only; they
 * make no claim about structural adequacy, safety or compliance.
 */

/** What to measure. Lengths in mm, angles in degrees, volume in mm³, area in mm², mass in kg. */
export type MeasureSpec =
  | { kind: 'parameter'; name: string }
  | { kind: 'dimension'; constraintId?: string; name?: string }
  | { kind: 'bounding-size'; axis: 'x' | 'y' | 'z' | 'max' | 'min' }
  | { kind: 'volume' }
  | { kind: 'surface-area' }
  | { kind: 'mass' }
  | { kind: 'pattern-spacing' | 'pattern-gap' | 'pattern-count'; featureId: string }

export interface CheckRequest {
  measure: MeasureSpec
  /** Design constraint in Conceptualize; without revision the latest is used. */
  constraint: { id: string; revision?: number }
  partId?: string
}

export type CheckStatus = 'satisfied' | 'violated' | 'not-checkable'

export interface CheckBound {
  constraint: { module: 'conceptualize'; kind: 'constraint'; id: string; revision: number }
  key: string
  statement: string
  latestRevision: number
  operator: NonNullable<ConstraintSummary['bound']>['operator']
  value?: number | null
  min?: number | null
  max?: number | null
  unit: string
  strength: ConstraintSummary['strength']
  constraintStatus: ConstraintSummary['status']
  basis: string
}

export interface CheckResult {
  checkId: string
  quantity: string
  /** Measured value in the bound's unit when comparable, else in the model unit. */
  measured: { value: number; unit: string } | null
  /** The measured value in model units, before conversion. */
  measuredModel: { value: number; unit: string } | null
  bound: CheckBound | null
  status: CheckStatus
  reason?: string
  method: string
  /** How the parameter's binding relates to this check (bindings only). */
  binding?: { parameter: string; pinnedRevision?: number }
  documentId: string
  documentRevision: number | null
  modelVersion: number
  kernel: { name: string; version: string }
}

export interface CheckReport {
  documentId: string
  documentTitle: string
  /** Stored revision in the CAD service, or null when the model was never stored. */
  documentRevision: number | null
  modelVersion: number
  /** True when the measured model differs from the stored revision (results refer to the unsaved model). */
  unsavedChanges: boolean
  kernel: { name: string; version: string; licence: string }
  results: CheckResult[]
  /** Open assumptions and limits that affect how the results can be used. */
  assumptions: string[]
  summary: Record<CheckStatus, number>
}

// ---- units ------------------------------------------------------------------------------------------

type Dim = 'length' | 'area' | 'volume' | 'mass' | 'angle' | 'count'
const UNITS: Record<string, { dim: Dim; factor: number }> = {
  // factor: one unit in model units (mm, mm², mm³, kg, deg, 1)
  mm: { dim: 'length', factor: 1 },
  cm: { dim: 'length', factor: 10 },
  m: { dim: 'length', factor: 1000 },
  µm: { dim: 'length', factor: 0.001 },
  um: { dim: 'length', factor: 0.001 },
  in: { dim: 'length', factor: 25.4 },
  ft: { dim: 'length', factor: 304.8 },
  'mm²': { dim: 'area', factor: 1 },
  mm2: { dim: 'area', factor: 1 },
  'cm²': { dim: 'area', factor: 100 },
  cm2: { dim: 'area', factor: 100 },
  'm²': { dim: 'area', factor: 1e6 },
  m2: { dim: 'area', factor: 1e6 },
  'mm³': { dim: 'volume', factor: 1 },
  mm3: { dim: 'volume', factor: 1 },
  'cm³': { dim: 'volume', factor: 1000 },
  cm3: { dim: 'volume', factor: 1000 },
  ml: { dim: 'volume', factor: 1000 },
  l: { dim: 'volume', factor: 1e6 },
  'm³': { dim: 'volume', factor: 1e9 },
  m3: { dim: 'volume', factor: 1e9 },
  'in³': { dim: 'volume', factor: 25.4 ** 3 },
  in3: { dim: 'volume', factor: 25.4 ** 3 },
  kg: { dim: 'mass', factor: 1 },
  g: { dim: 'mass', factor: 0.001 },
  mg: { dim: 'mass', factor: 1e-6 },
  lb: { dim: 'mass', factor: 0.45359237 },
  oz: { dim: 'mass', factor: 0.028349523125 },
  deg: { dim: 'angle', factor: 1 },
  '°': { dim: 'angle', factor: 1 },
  rad: { dim: 'angle', factor: 180 / Math.PI },
  '': { dim: 'count', factor: 1 },
  '1': { dim: 'count', factor: 1 },
  count: { dim: 'count', factor: 1 },
  none: { dim: 'count', factor: 1 },
  '-': { dim: 'count', factor: 1 },
  pcs: { dim: 'count', factor: 1 },
}
const MODEL_UNIT: Record<Dim, string> = { length: 'mm', area: 'mm²', volume: 'mm³', mass: 'kg', angle: 'deg', count: '' }

export function convert(value: number, fromModel: Dim, toUnit: string): number | undefined {
  const u = UNITS[toUnit.trim()]
  if (!u || u.dim !== fromModel) return undefined
  return value / u.factor
}

// ---- measuring --------------------------------------------------------------------------------------

interface Measured {
  value: number
  dim: Dim
  quantity: string
  method: string
}

function measure(doc: CadDocument, regen: RegenerationResult, partId: string, spec: MeasureSpec): Measured | { reason: string; quantity: string } {
  const part = doc.parts.find((p) => p.id === partId)
  const pr = regen.parts.find((p) => p.partId === partId)
  if (!part || !pr) return { reason: `Part ${partId} does not exist.`, quantity: spec.kind }
  const bodies = pr.bodies
  switch (spec.kind) {
    case 'parameter': {
      const p = pr.parameters.find((x) => x.name === spec.name)
      const own = part.parameters.find((x) => x.name === spec.name)
      if (!p || !own) return { reason: `Parameter ${spec.name} does not exist.`, quantity: `parameter ${spec.name}` }
      if (p.error || p.value === undefined) return { reason: `Parameter ${spec.name} has no value: ${p.error?.message ?? 'not evaluated'}.`, quantity: `parameter ${spec.name}` }
      return { value: p.value, dim: own.unit === 'mm' ? 'length' : own.unit === 'deg' ? 'angle' : 'count', quantity: `parameter ${spec.name}`, method: `value of parameter ${spec.name} = ${own.expression}, evaluated in the regenerated model` }
    }
    case 'dimension': {
      for (const f of part.features) {
        if (f.type !== 'sketch') continue
        const c = f.constraints.find((x) => (spec.constraintId ? x.id === spec.constraintId : x.name === spec.name))
        if (!c) continue
        const res = pr.features.find((r) => r.featureId === f.id)
        const label = `dimension ${c.name ?? c.id} (${c.type}) in ${f.name}`
        if (!res || res.status !== 'ok' || !res.sketch) return { reason: `Sketch ${f.id} did not regenerate.`, quantity: label }
        const v = c.driving === false ? res.sketch.solution.driven[c.id] : res.sketch.values[c.id]
        if (v === undefined) return { reason: `Dimension ${c.id} has no value.`, quantity: label }
        if (c.driving !== false && res.sketch.solution.status !== 'fully-constrained' && res.sketch.solution.status !== 'under-constrained') return { reason: `Sketch ${f.id} is ${res.sketch.solution.status}.`, quantity: label }
        return { value: v, dim: c.type === 'angle' ? 'angle' : 'length', quantity: label, method: `${c.driving === false ? 'driven (measured)' : 'driving'} ${c.type} dimension of the solved sketch` }
      }
      return { reason: `No dimension ${spec.constraintId ?? spec.name} in part ${partId}.`, quantity: `dimension ${spec.constraintId ?? spec.name}` }
    }
    case 'bounding-size': {
      if (!bodies.length) return { reason: 'The part has no body.', quantity: `bounding size ${spec.axis}` }
      const min = [0, 1, 2].map((k) => Math.min(...bodies.map((b) => b.analysis.boundingBox.min[k])))
      const max = [0, 1, 2].map((k) => Math.max(...bodies.map((b) => b.analysis.boundingBox.max[k])))
      const size = [0, 1, 2].map((k) => max[k] - min[k])
      const value = spec.axis === 'max' ? Math.max(...size) : spec.axis === 'min' ? Math.min(...size) : size['xyz'.indexOf(spec.axis)]
      return { value, dim: 'length', quantity: `bounding size ${spec.axis}`, method: 'axis-aligned bounding box of the regenerated B-rep bodies' }
    }
    case 'volume':
    case 'surface-area': {
      if (!bodies.length) return { reason: 'The part has no body.', quantity: spec.kind }
      const v = bodies.reduce((s, b) => s + (spec.kind === 'volume' ? b.analysis.volume : b.analysis.area), 0)
      return { value: v, dim: spec.kind === 'volume' ? 'volume' : 'area', quantity: spec.kind === 'volume' ? 'volume' : 'surface area', method: `${spec.kind === 'volume' ? 'volume' : 'surface area'} of the regenerated B-rep (kernel mass properties)` }
    }
    case 'mass': {
      if (!bodies.length) return { reason: 'The part has no body.', quantity: 'mass' }
      if (!part.material) return { reason: 'No material is set for the part, so mass cannot be computed.', quantity: 'mass' }
      const m = massProperties(doc, regen, partId).reduce((s, b) => s + (b.mass ?? 0), 0)
      return { value: m, dim: 'mass', quantity: 'mass', method: `volume of the regenerated B-rep × density ${part.material.density} kg/m³ (${part.material.name}, uniform)` }
    }
    case 'pattern-spacing':
    case 'pattern-gap':
    case 'pattern-count': {
      const r = pr.features.find((x) => x.featureId === spec.featureId)
      const what = spec.kind === 'pattern-spacing' ? 'spacing' : spec.kind === 'pattern-gap' ? 'gap between neighbouring occurrences' : 'count'
      const label = `pattern ${spec.featureId} ${what}`
      if (!r || r.type !== 'pattern-linear') return { reason: `${spec.featureId} is not a linear pattern.`, quantity: label }
      if (r.status !== 'ok' || !r.pattern) return { reason: `Pattern ${spec.featureId} did not regenerate (${r.error?.message ?? r.status}).`, quantity: label }
      if (spec.kind === 'pattern-count') return { value: r.pattern.count, dim: 'count', quantity: label, method: 'evaluated pattern count' }
      if (spec.kind === 'pattern-spacing') return { value: r.pattern.spacing, dim: 'length', quantity: label, method: 'evaluated pattern spacing (centre to centre along the direction)' }
      if (r.pattern.gap === null) return { reason: 'The kernel did not provide a distance measurement.', quantity: label }
      return { value: r.pattern.gap, dim: 'length', quantity: label, method: 'kernel minimum distance between the tool solids of occurrences 1 and 2 (material left between neighbouring cuts)' }
    }
  }
}

// ---- comparing --------------------------------------------------------------------------------------

function compare(v: number, b: NonNullable<ConstraintSummary['bound']>): CheckStatus | 'no-value' {
  const q = b.quantity
  const tol = (x: number) => 1e-9 * Math.max(1, Math.abs(x))
  const val = q.value ?? undefined
  switch (b.operator) {
    case '<=':
      return val === undefined || val === null ? 'no-value' : v <= val + tol(val) ? 'satisfied' : 'violated'
    case '<':
      return val === undefined || val === null ? 'no-value' : v < val ? 'satisfied' : 'violated'
    case '>=':
      return val === undefined || val === null ? 'no-value' : v >= val - tol(val) ? 'satisfied' : 'violated'
    case '>':
      return val === undefined || val === null ? 'no-value' : v > val ? 'satisfied' : 'violated'
    case '=':
      return val === undefined || val === null ? 'no-value' : Math.abs(v - val) <= tol(val) ? 'satisfied' : 'violated'
    case 'in-range': {
      const lo = q.min ?? undefined
      const hi = q.max ?? undefined
      if (lo === undefined && hi === undefined) return 'no-value'
      return (lo === undefined || v >= lo - tol(lo)) && (hi === undefined || v <= hi + tol(hi)) ? 'satisfied' : 'violated'
    }
  }
}

export interface RunChecksOptions {
  projectId: string
  concepts?: Pick<ConceptsService, 'getConstraint'>
  requests?: CheckRequest[]
  /** Also check every parameter bound to a Conceptualize constraint (default true). */
  bindings?: boolean
  storedRevision: number | null
  unsavedChanges: boolean
}

export async function runChecks(doc: CadDocument, regen: RegenerationResult, options: RunChecksOptions): Promise<CheckReport> {
  const kernel = { name: regen.kernel.name, version: regen.kernel.version }
  const common = { documentId: doc.documentId, documentRevision: options.storedRevision, modelVersion: doc.version, kernel }
  const assumptions: string[] = []
  const results: CheckResult[] = []
  const defaultPart = doc.parts[0]?.id ?? ''
  const constraintCache = new Map<string, Promise<ConstraintSummary | undefined>>()
  const readConstraint = (id: string, revision?: number) => {
    const key = `${id}@${revision ?? 'latest'}`
    if (!constraintCache.has(key)) constraintCache.set(key, options.concepts!.getConstraint!(id, { projectId: options.projectId, ...(revision ? { revision } : {}) }))
    return constraintCache.get(key)!
  }

  if (options.unsavedChanges) assumptions.push(`The measured model (version ${doc.version}) has changes that are not stored in the CAD service; save it so the results refer to a stored revision.`)
  if (options.storedRevision === null) assumptions.push('The document is not stored in the project, so the results cannot refer to a document revision.')
  if (!regen.ok) assumptions.push('The model has regeneration failures; measurements involving failed features are not checkable.')

  // Solid validity of every body (no bound needed).
  for (const pr of regen.parts) {
    for (const b of pr.bodies) {
      results.push({
        checkId: `solid-valid:${pr.partId}:${b.bodyId}`,
        quantity: `solid validity of body ${b.bodyId}`,
        measured: null,
        measuredModel: null,
        bound: null,
        status: b.analysis.valid ? 'satisfied' : 'violated',
        method: 'kernel B-rep validity check of the regenerated solid',
        ...common,
      })
    }
  }

  const requests: (CheckRequest & { binding?: CheckResult['binding'] })[] = [...(options.requests ?? [])]
  if (options.bindings !== false) {
    for (const part of doc.parts) {
      for (const p of part.parameters) {
        const ref = p.binding?.ref
        if (!ref) continue
        if (ref.module !== 'conceptualize' || ref.kind !== 'constraint') {
          assumptions.push(`Parameter ${p.name} is bound to ${ref.module}/${ref.kind} ${ref.id}; only Conceptualize constraints can be checked.`)
          continue
        }
        requests.push({ measure: { kind: 'parameter', name: p.name }, constraint: { id: ref.id }, partId: part.id, binding: { parameter: p.name, ...(ref.revision !== undefined ? { pinnedRevision: ref.revision } : {}) } })
      }
    }
  }

  for (const req of requests) {
    const partId = req.partId ?? defaultPart
    const m = measure(doc, regen, partId, req.measure)
    const checkId = `${req.constraint.id}:${partId}:${JSON.stringify(req.measure)}`
    const base = { checkId, ...common, ...(req.binding ? { binding: req.binding } : {}) }
    if ('reason' in m) {
      results.push({ ...base, quantity: m.quantity, measured: null, measuredModel: null, bound: null, status: 'not-checkable', reason: m.reason, method: 'not measured' })
      if (req.measure.kind === 'mass' && /material/.test(m.reason)) assumptions.push('Mass is not checkable: the part has no material (density).')
      continue
    }
    const measuredModel = { value: m.value, unit: MODEL_UNIT[m.dim] }
    if (!options.concepts?.getConstraint) {
      results.push({ ...base, quantity: m.quantity, measured: measuredModel, measuredModel, bound: null, status: 'not-checkable', reason: 'Design constraints cannot be read in this host (Conceptualize constraint reads are not available).', method: m.method })
      continue
    }
    let c: ConstraintSummary | undefined
    try {
      c = await readConstraint(req.constraint.id, req.constraint.revision)
    } catch (e) {
      results.push({ ...base, quantity: m.quantity, measured: measuredModel, measuredModel, bound: null, status: 'not-checkable', reason: `The constraint could not be read: ${e instanceof Error ? e.message : String(e)}`, method: m.method })
      continue
    }
    if (!c) {
      results.push({ ...base, quantity: m.quantity, measured: measuredModel, measuredModel, bound: null, status: 'not-checkable', reason: `Constraint ${req.constraint.id}${req.constraint.revision ? ` revision ${req.constraint.revision}` : ''} does not exist in project ${options.projectId}.`, method: m.method })
      continue
    }
    const bound: CheckBound | null = c.bound
      ? {
          constraint: { module: 'conceptualize', kind: 'constraint', id: c.id, revision: c.revision },
          key: c.key,
          statement: c.statement,
          latestRevision: c.latestRevision,
          operator: c.bound.operator,
          value: c.bound.quantity.value,
          min: c.bound.quantity.min,
          max: c.bound.quantity.max,
          unit: c.bound.quantity.unit,
          strength: c.strength,
          constraintStatus: c.status,
          basis: c.basis,
        }
      : null
    if (!c.bound) {
      results.push({ ...base, quantity: m.quantity, measured: measuredModel, measuredModel, bound, status: 'not-checkable', reason: `${c.key} has no quantitative bound (${c.kind}).`, method: m.method })
      continue
    }
    const converted = convert(m.value, m.dim, c.bound.quantity.unit)
    if (converted === undefined) {
      results.push({ ...base, quantity: m.quantity, measured: measuredModel, measuredModel, bound, status: 'not-checkable', reason: `The bound unit “${c.bound.quantity.unit}” cannot be compared with the measured ${m.dim} (${MODEL_UNIT[m.dim] || 'count'}).`, method: m.method })
      continue
    }
    const status = compare(converted, c.bound)
    results.push({
      ...base,
      quantity: m.quantity,
      measured: { value: converted, unit: c.bound.quantity.unit },
      measuredModel,
      bound,
      status: status === 'no-value' ? 'not-checkable' : status,
      ...(status === 'no-value' ? { reason: `${c.key} has a ${c.bound.operator} bound without a value.` } : {}),
      method: m.method,
    })
    if (c.basis !== 'user-assertion' && c.basis) assumptions.push(`${c.key} (revision ${c.revision}) rests on ${c.basis.replace(/-/g, ' ')}, not on a stated requirement.`)
    if (c.status !== 'active') assumptions.push(`${c.key} is ${c.status}.`)
    if (req.binding?.pinnedRevision !== undefined && req.binding.pinnedRevision < c.latestRevision) assumptions.push(`Parameter ${req.binding.parameter} is bound to ${c.key} revision ${req.binding.pinnedRevision}; it was checked against revision ${c.revision} (latest ${c.latestRevision}). See cad-modeler.check_bindings.`)
  }

  const summary: Record<CheckStatus, number> = { satisfied: 0, violated: 0, 'not-checkable': 0 }
  for (const r of results) summary[r.status]++
  return {
    documentId: doc.documentId,
    documentTitle: doc.metadata.title,
    documentRevision: options.storedRevision,
    modelVersion: doc.version,
    unsavedChanges: options.unsavedChanges,
    kernel: { ...kernel, licence: regen.kernel.licence },
    results,
    assumptions: [...new Set(assumptions)],
    summary,
  }
}
