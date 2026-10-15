import { version as mathjsVersion } from 'mathjs'
import type { ComparisonOp, Expr } from './ast'
import { GRAMMAR } from './ast'
import { calculationBasis, type Basis } from './basis'
import { canonicalNumber, digestOf } from './digest'
import { asCalcError, CalcError } from './errors'
import { evalInterval, monotonicity, nodeCount, substitute, type Interval, type Monotonicity } from './interval'
import { compileModel, type CalculationModelDefinition, type CompiledModel, type CompiledRelation } from './model'
import { calcUnit, fromSI, sameDims, siUnitOf, toSI } from './units'

export const ENGINE_NAME = '@ews/engineering-calc'
export const ENGINE_VERSION = '0.3.0'
/** Manifest format written by this engine; versions it can verify. */
export const MANIFEST_VERSION = 3
export const SUPPORTED_MANIFEST_VERSIONS = [1, 2, 3] as const
export const DIGEST_SPEC = 'ews-digest/1'

/** Where an input value came from. Refs are opaque to the engine (DesignRef / ArtifactRef shapes). */
export interface InputSource {
  kind: 'literal' | 'binding'
  ref?: { module: string; type?: string; id: string; revision?: number }
  property?: string
  revision?: number
  /** e.g. 'client-attested' for twin values supplied by the browser (CR-P1). */
  via?: string
  basis: Basis
}

export interface InputValue {
  value?: number | null
  min?: number
  max?: number
  unit: string
  source?: InputSource
}

/**
 * 'point': nominal values only. 'interval': ranges are propagated as bounds (exact where monotonicity is
 * proven, enclosures otherwise). The R1 vertex method is not offered any more; it exists internally only to
 * verify version 1 manifests.
 */
export type UncertaintyMode = 'point' | 'interval'
/** Mode recorded in manifests; 'interval-vertices' appears only in version 1 manifests. */
export type ManifestUncertaintyMode = UncertaintyMode | 'interval-vertices'

export interface EvaluateOptions {
  uncertainty?: UncertaintyMode
  /** Cooperative deadline for this evaluation (default 2000 ms). */
  timeoutMs?: number
  /** Maximum interpreter operations (default 5 000 000). */
  maxOperations?: number
  /** Clock for evaluatedAt (tests pass a fixed one); not part of any digest. */
  now?: () => Date
}

// ---- C11 result kinds ------------------------------------------------------------------------------------

/** Values evaluated at sample points. NOT a bound: the true range may be wider. */
export interface SampledRange {
  kind: 'sampled-range'
  min: number
  max: number
  method: 'vertices' | 'vertices-and-nominal'
  samples: number
  note: string
}

/**
 * Bounds over the input ranges. exact: the range is attained (monotonicity proven in every ranged input).
 * enclosure: the true range lies inside [min, max] (sound interval arithmetic) and may be narrower.
 * `sampled` lists values actually attained at sample points; it is typed separately and never a bound.
 */
export interface BoundsRange {
  kind: 'bounds'
  quality: 'exact' | 'enclosure'
  min: number
  max: number
  sampled?: SampledRange
  note?: string
}

export interface PointResult {
  kind: 'point'
}

/** C11 (integration milestone 1): every value says whether it is a point, a sampled range or bounds. */
export type ResultRange = PointResult | SampledRange | BoundsRange

export interface QuantityOut {
  symbol: string
  /** Value at the nominal inputs. */
  value: number
  unit: string
  range: ResultRange
}

/** How a check's status was established. Only point evaluation and bounds can prove anything. */
export type StatusBasis = 'point' | 'exact-bounds' | 'enclosure' | 'sampled'

export interface CheckResult {
  relationId: string
  text: string
  op: ComparisonOp
  /** Nominal values in `unit`. */
  lhs: number
  rhs: number
  unit: string
  /** Margin at the nominal inputs: positive when satisfied with room, negative when violated (in `unit`). */
  margin: number
  /** lhs/rhs for ≥, rhs/lhs for ≤ (dimensionless), when defined. */
  marginRatio?: number
  /** Whether the comparison holds at the nominal inputs (a point result, never a statement about a range). */
  nominalSatisfied: boolean
  /**
   * Over the inputs considered: point → the nominal result; ranges → `satisfied` or `violated` only when proven
   * for the whole range by bounds, otherwise `uncertain`.
   */
  status: 'satisfied' | 'violated' | 'uncertain'
  statusBasis: StatusBasis
  /** Range of the margin (same kinds as outputs). */
  marginRange: ResultRange
}

export interface ValidityResult {
  /** True only when every condition holds (at the point, or proven over the whole range). */
  satisfied: boolean
  violated: string[]
  /** Conditions not proven over the range (range evaluations only). */
  uncertain: string[]
  over: 'point' | 'range'
}

/**
 * What a manifest does NOT establish (C11). A reproducible computation shows that these outputs follow from
 * this model revision and these inputs; it says nothing about whether the model is valid for the design or
 * whether any requirement is satisfied. Model validation is a separate record made by a person.
 */
export interface ManifestLimits {
  establishesModelValidity: false
  establishesRequirementSatisfaction: false
  /** The model's validation status recorded in its definition at evaluation time (not established here). */
  modelValidationStatus: CalculationModelDefinition['validationStatus'] | 'not-recorded'
  modelBasis: Basis | 'not-recorded'
}

export interface CalculationManifest {
  /** 3 (C11); 2 for R3 manifests; absent in v1 (R1). */
  manifestVersion?: 2 | 3
  digestSpec?: typeof DIGEST_SPEC
  engine: { name: string; version: string; mathjs: string; grammar: typeof GRAMMAR }
  model: { id: string; revision: number; digest: string }
  inputs: { symbol: string; value: number | null; min?: number; max?: number; unit: string; source: InputSource }[]
  outputs: QuantityOut[]
  checks: CheckResult[]
  validity: ValidityResult
  uncertainty: ManifestUncertaintyMode
  basis: 'calculated' | 'estimate'
  limits: ManifestLimits
  inputDigest: string
  outputDigest: string
  evaluatedAt: string
  durationMs: number
  operations?: number
}

export interface CalculationResult {
  outputs: Record<string, QuantityOut>
  checks: CheckResult[]
  validity: ValidityResult
  basis: 'calculated' | 'estimate'
  warnings: string[]
  manifest: CalculationManifest
}

export const MAX_INTERVAL_INPUTS = 10
export const DEFAULT_TIMEOUT_MS = 2000
export const DEFAULT_MAX_OPERATIONS = 5_000_000
/** Inlined expressions or derivatives larger than this fall back to enclosures. */
const MAX_ANALYSIS_NODES = 20_000

const FN: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, exp: Math.exp, log: Math.log, log10: Math.log10,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
}

/** Interpreter with an operation budget and a cooperative deadline (portable: Node and browser). */
class Interpreter {
  operations = 0
  constructor(
    private readonly maxOperations: number,
    private readonly deadline: number,
  ) {}

  private tick() {
    if (++this.operations > this.maxOperations) throw new CalcError('resource-limit', `The evaluation exceeded its operation budget (${this.maxOperations}).`, { limit: this.maxOperations })
    if ((this.operations & 1023) === 0 && Date.now() > this.deadline) throw new CalcError('timeout', 'The evaluation exceeded its time budget.')
  }

  eval(e: Expr, env: Map<string, number>): number {
    this.tick()
    switch (e.k) {
      case 'num':
        return e.v
      case 'const':
        return e.n === 'pi' ? Math.PI : Math.E
      case 'sym': {
        const v = env.get(e.n)
        if (v === undefined) throw new CalcError('input', `No value for “${e.n}”.`, { symbol: e.n })
        return v
      }
      case 'neg':
        return -this.eval(e.a, env)
      case 'op': {
        const a = this.eval(e.a, env)
        const b = this.eval(e.b, env)
        return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '/' ? a / b : a ** b
      }
      case 'fn':
        return FN[e.f](...e.args.map((x) => this.eval(x, env)))
    }
  }

  checkDeadline() {
    if (Date.now() > this.deadline) throw new CalcError('timeout', 'The evaluation exceeded its time budget.')
  }
}

const EQUAL_TOLERANCE = 1e-9

function compare(op: ComparisonOp, l: number, r: number): boolean {
  switch (op) {
    case '>=':
      return l >= r
    case '>':
      return l > r
    case '<=':
      return l <= r
    case '<':
      return l < r
    case '=':
      return Math.abs(l - r) <= EQUAL_TOLERANCE * Math.max(Math.abs(l), Math.abs(r), 1e-300)
  }
}

function symbols(e: Expr, out = new Set<string>()): Set<string> {
  if (e.k === 'sym') out.add(e.n)
  else if (e.k === 'neg') symbols(e.a, out)
  else if (e.k === 'op') symbols(e.a, out), symbols(e.b, out)
  else if (e.k === 'fn') e.args.forEach((x) => symbols(x, out))
  return out
}

/** Unit used to report a comparison: the first parameter on either side with the comparison's dimensions. */
function displayUnit(model: CompiledModel, rel: CompiledRelation): string {
  for (const s of [...symbols(rel.lhs!), ...symbols(rel.rhs!)]) {
    const d = model.dims.get(s)
    if (d && sameDims(d, rel.dims)) return model.definition.parameters.find((p) => p.symbol === s)!.unit
  }
  return siUnitOf(rel.dims)
}

interface PointOutcome {
  env: Map<string, number>
  checks: { rel: CompiledRelation; l: number; r: number; ok: boolean }[]
  validity: { rel: CompiledRelation; ok: boolean }[]
}

function evaluatePoint(model: CompiledModel, inputsSI: Map<string, number>, run: Interpreter): PointOutcome {
  const env = new Map(inputsSI)
  for (const a of model.assignments) {
    const v = run.eval(a.expr!, env)
    if (!Number.isFinite(v)) throw new CalcError('domain-error', `${a.target} is not a finite number (${a.text}) at the given inputs; check the inputs and the relation's domain.`, { relationId: a.id, symbol: a.target })
    env.set(a.target!, v)
  }
  const checks = model.constraints.map((rel) => {
    const l = run.eval(rel.lhs!, env)
    const r = run.eval(rel.rhs!, env)
    if (!Number.isFinite(l) || !Number.isFinite(r)) throw new CalcError('domain-error', `Constraint ${rel.id} is not finite at the given inputs.`, { relationId: rel.id })
    return { rel, l, r, ok: compare(rel.op!, l, r) }
  })
  const validity = model.validity.map((rel) => ({ rel, ok: compare(rel.op!, run.eval(rel.lhs!, env), run.eval(rel.rhs!, env)) }))
  return { env, checks, validity }
}

/** g ≥ 0 means the comparison holds (for =, |g| ≈ 0). */
function slack(rel: CompiledRelation): Expr {
  const lhs = rel.lhs!
  const rhs = rel.rhs!
  return rel.op === '<=' || rel.op === '<' ? { k: 'op', op: '-', a: rhs, b: lhs } : { k: 'op', op: '-', a: lhs, b: rhs }
}

interface BoundsSI {
  min: number
  max: number
  quality: 'exact' | 'enclosure'
  sampled?: { min: number; max: number; samples: number }
  monotonicity: Record<string, Monotonicity>
}

/**
 * Bounds of an inlined expression (inputs only) over the box. Exact when the derivative's sign is proven in
 * every ranged input; otherwise a sound enclosure, with the values attained at the vertices and the nominal
 * point recorded separately as a sampled range. An unbounded enclosure (a divisor range containing zero) is a
 * domain error: the relation may be singular in the range.
 */
function boundsOf(expr: Expr, box: Map<string, Interval>, ranged: string[], nominal: Map<string, number>, run: Interpreter, where: { relationId: string; symbol?: string }): BoundsSI {
  const relevant = ranged.filter((v) => symbols(expr).has(v))
  const mono: Record<string, Monotonicity> = {}
  const tooBig = nodeCount(expr) > MAX_ANALYSIS_NODES
  for (const v of relevant) mono[v] = tooBig ? 'unknown' : monotonicity(expr, v, box, MAX_ANALYSIS_NODES)
  run.checkDeadline()
  const singular = () =>
    new CalcError('domain-error', `${where.symbol ?? `Relation ${where.relationId}`} is unbounded or undefined over the input ranges: a divisor or a function argument reaches a singular value (for example division by a range containing zero).`, { ...where, reason: 'singularity' })
  const at = (pick: (v: string, m: Monotonicity) => number) => {
    const env = new Map(nominal)
    for (const v of relevant) env.set(v, pick(v, mono[v]))
    return run.eval(expr, env)
  }
  if (relevant.every((v) => mono[v] !== 'unknown')) {
    const lo = at((v, m) => (m === 'decreasing' ? box.get(v)!.hi : box.get(v)!.lo))
    const hi = at((v, m) => (m === 'decreasing' ? box.get(v)!.lo : box.get(v)!.hi))
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw singular()
    return { min: Math.min(lo, hi), max: Math.max(lo, hi), quality: 'exact', monotonicity: mono }
  }
  let enclosure: Interval
  try {
    enclosure = evalInterval(expr, box)
  } catch (e) {
    if (e instanceof CalcError && e.code === 'domain-error') throw new CalcError('domain-error', `Over the input ranges: ${e.message}`, { ...where, reason: 'domain' })
    throw e
  }
  if (!Number.isFinite(enclosure.lo) || !Number.isFinite(enclosure.hi)) throw singular()
  const values = [run.eval(expr, nominal)]
  if (relevant.length <= MAX_INTERVAL_INPUTS) {
    for (let mask = 0; mask < 1 << relevant.length; mask++) {
      const env = new Map(nominal)
      relevant.forEach((v, i) => env.set(v, mask & (1 << i) ? box.get(v)!.hi : box.get(v)!.lo))
      values.push(run.eval(expr, env))
    }
  }
  const finite = values.filter(Number.isFinite)
  if (finite.length < values.length) throw singular()
  const sampled = { min: Math.min(...finite), max: Math.max(...finite), samples: finite.length }
  return { min: Math.min(enclosure.lo, sampled.min), max: Math.max(enclosure.hi, sampled.max), quality: 'enclosure', sampled, monotonicity: mono }
}

interface InternalOptions extends EvaluateOptions {
  /** Internal: re-evaluate with the R1 vertex method to verify a version 1 manifest. */
  legacyVertexMode?: boolean
}

/**
 * Evaluates a calculation model deterministically (mathematics.md §6). Inputs are given per symbol in any
 * unit of the right dimension; constants come from the model. Returns outputs in their declared units with
 * their result kind (C11), constraint checks, validity, the result basis and a reproducibility manifest.
 */
export function evaluateModel(definitionOrCompiled: CalculationModelDefinition | CompiledModel, inputs: Record<string, InputValue>, options: EvaluateOptions = {}): CalculationResult {
  try {
    return evaluateUnsafe(definitionOrCompiled, inputs, options)
  } catch (e) {
    throw asCalcError(e)
  }
}

function evaluateUnsafe(definitionOrCompiled: CalculationModelDefinition | CompiledModel, inputs: Record<string, InputValue>, options: InternalOptions): CalculationResult {
  const started = Date.now()
  const run = new Interpreter(options.maxOperations ?? DEFAULT_MAX_OPERATIONS, started + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  const model = 'digest' in definitionOrCompiled ? definitionOrCompiled : compileModel(definitionOrCompiled)
  const def = model.definition
  if ((options.uncertainty as string) === 'interval-vertices') throw new CalcError('input', 'The vertex-sampling mode is no longer offered (it does not give bounds); use "interval".')
  const mode: ManifestUncertaintyMode = options.legacyVertexMode ? 'interval-vertices' : (options.uncertainty ?? 'point')
  const warnings: string[] = []

  const nominal = new Map<string, number>()
  const ranges: { symbol: string; lo: number; hi: number }[] = []
  const manifestInputs: CalculationManifest['inputs'] = []
  const inputBases: Basis[] = []
  for (const k of Object.keys(inputs)) if (!def.parameters.some((p) => p.symbol === k)) throw new CalcError('input', `“${k}” is not a parameter of ${def.key ?? def.id}.`, { symbol: k })

  for (const p of def.parameters) {
    if (p.role === 'output') {
      if (inputs[p.symbol]) throw new CalcError('input', `“${p.symbol}” is an output and cannot be given as an input.`, { symbol: p.symbol })
      continue
    }
    const target = model.units.get(p.symbol)!
    if (p.role === 'constant') {
      if (inputs[p.symbol]) throw new CalcError('input', `“${p.symbol}” is a model constant and cannot be overridden.`, { symbol: p.symbol })
      nominal.set(p.symbol, toSI(p.value!, target))
      continue
    }
    const given = inputs[p.symbol]
    if (!given) throw new CalcError('input', `Missing input “${p.symbol}” (${p.name}, ${p.unit}).`, { symbol: p.symbol })
    const u = calcUnit(given.unit, `input ${p.symbol}`)
    if (!sameDims(u.dims, target.dims)) throw new CalcError('unit-error', `Input ${p.symbol} is given in ${given.unit}, which is not compatible with ${p.unit}.`, { symbol: p.symbol })
    const nums = [given.value, given.min, given.max].filter((v): v is number => typeof v === 'number')
    if (!nums.length || nums.some((v) => !Number.isFinite(v))) throw new CalcError('input', `Input ${p.symbol} needs a finite value or range.`, { symbol: p.symbol })
    if (given.min !== undefined && given.max !== undefined && given.min > given.max) throw new CalcError('input', `Input ${p.symbol}: min exceeds max.`, { symbol: p.symbol })
    if (typeof given.value === 'number' && ((given.min !== undefined && given.value < given.min) || (given.max !== undefined && given.value > given.max))) throw new CalcError('input', `Input ${p.symbol}: the value lies outside its range.`, { symbol: p.symbol })
    let value = given.value ?? undefined
    if (value === undefined || value === null) {
      if (given.min === undefined || given.max === undefined) throw new CalcError('input', `Input ${p.symbol} needs a value or both min and max.`, { symbol: p.symbol })
      value = (given.min + given.max) / 2
      warnings.push(`${p.symbol}: no nominal value; the midpoint of the range is used.`)
    }
    nominal.set(p.symbol, toSI(value, u))
    if (given.min !== undefined && given.max !== undefined && given.min !== given.max) ranges.push({ symbol: p.symbol, lo: toSI(given.min, u), hi: toSI(given.max, u) })
    const source: InputSource = given.source ?? { kind: 'literal', basis: 'user-assertion' }
    inputBases.push(source.basis)
    manifestInputs.push({ symbol: p.symbol, value: given.value ?? null, min: given.min, max: given.max, unit: given.unit, source })
  }

  const point = evaluatePoint(model, nominal, run)
  const POINT: PointResult = { kind: 'point' }
  const outputs: Record<string, QuantityOut> = {}
  for (const a of model.assignments) {
    const p = def.parameters.find((x) => x.symbol === a.target)!
    outputs[a.target!] = { symbol: a.target!, value: fromSI(point.env.get(a.target!)!, model.units.get(a.target!)!), unit: p.unit, range: POINT }
  }
  const checkUnits = point.checks.map((c) => displayUnit(model, c.rel))
  const checkStatus: CheckResult['status'][] = point.checks.map((c) => (c.ok ? 'satisfied' : 'violated'))
  const statusBasis: StatusBasis[] = point.checks.map(() => 'point')
  const marginRanges: ResultRange[] = point.checks.map(() => POINT)
  const violated = point.validity.filter((v) => !v.ok).map((v) => v.rel.text)
  const uncertain: string[] = []
  const overRange = mode !== 'point' && ranges.length > 0

  if (mode === 'interval-vertices' && ranges.length) {
    // R1 algorithm, only to verify v1 manifests: results are SAMPLED ranges, statuses are sampled (not proven).
    if (ranges.length > MAX_INTERVAL_INPUTS) throw new CalcError('limit', `Interval evaluation supports at most ${MAX_INTERVAL_INPUTS} inputs with ranges (got ${ranges.length}).`, { limit: MAX_INTERVAL_INPUTS })
    const corners: PointOutcome[] = []
    for (let mask = 0; mask < 1 << ranges.length; mask++) {
      const env = new Map(nominal)
      ranges.forEach((r, i) => env.set(r.symbol, mask & (1 << i) ? r.hi : r.lo))
      corners.push(evaluatePoint(model, env, run))
    }
    for (const a of model.assignments) {
      const u = model.units.get(a.target!)!
      const vals = corners.map((c) => fromSI(c.env.get(a.target!)!, u))
      outputs[a.target!].range = { kind: 'sampled-range', min: Math.min(...vals), max: Math.max(...vals), method: 'vertices', samples: vals.length, note: 'Vertex sampling (manifest v1 method): not a bound.' }
    }
    point.checks.forEach((c, i) => {
      const oks = corners.map((k) => k.checks[i].ok)
      checkStatus[i] = oks.every(Boolean) && c.ok ? 'satisfied' : oks.some(Boolean) || c.ok ? 'uncertain' : 'violated'
      statusBasis[i] = 'sampled'
    })
    for (const k of corners) for (const v of k.validity) if (!v.ok && !violated.includes(v.rel.text)) violated.push(v.rel.text)
  } else if (mode === 'interval' && ranges.length) {
    // Inline assignments so every expression depends on inputs and constants only.
    const inlined = new Map<string, Expr>()
    for (const [s, v] of nominal) if (def.parameters.find((p) => p.symbol === s)?.role === 'constant') inlined.set(s, { k: 'num', v })
    for (const a of model.assignments) {
      const e = substitute(a.expr!, inlined)
      if (nodeCount(e) > MAX_ANALYSIS_NODES) throw new CalcError('limit', `Inlining ${a.target} exceeds ${MAX_ANALYSIS_NODES} nodes; interval analysis is not possible for this model.`, { limit: MAX_ANALYSIS_NODES })
      inlined.set(a.target!, e)
    }
    const box = new Map<string, Interval>()
    for (const [s, v] of nominal) box.set(s, { lo: v, hi: v })
    for (const r of ranges) box.set(r.symbol, { lo: r.lo, hi: r.hi })
    const rangedNames = ranges.map((r) => r.symbol)
    const toRange = (b: BoundsSI, conv: (x: number) => number, note?: string): BoundsRange => {
      const a = conv(b.min)
      const z = conv(b.max)
      const out: BoundsRange = { kind: 'bounds', quality: b.quality, min: Math.min(a, z), max: Math.max(a, z) }
      if (b.sampled) {
        const sa = conv(b.sampled.min)
        const sz = conv(b.sampled.max)
        out.sampled = { kind: 'sampled-range', min: Math.min(sa, sz), max: Math.max(sa, sz), method: 'vertices-and-nominal', samples: b.sampled.samples, note: 'Values attained at the range vertices and the nominal point; not a bound.' }
      }
      if (note) out.note = note
      return out
    }
    let enclosures = 0
    for (const a of model.assignments) {
      const u = model.units.get(a.target!)!
      const b = boundsOf(inlined.get(a.target!)!, box, rangedNames, nominal, run, { relationId: a.id, symbol: a.target })
      if (b.quality === 'enclosure') enclosures++
      const nonMono = Object.entries(b.monotonicity).filter(([, m]) => m === 'unknown').map(([v]) => v)
      outputs[a.target!].range = toRange(b, (x) => fromSI(x, u), b.quality === 'enclosure' ? `Not proven monotonic in ${nonMono.join(', ')}: the true range lies inside [min, max] and contains the sampled values.` : undefined)
    }
    model.constraints.forEach((rel, i) => {
      const b = boundsOf(substitute(slack(rel), inlined), box, rangedNames, nominal, run, { relationId: rel.id })
      const u = calcUnit(checkUnits[i], 'display unit')
      marginRanges[i] = toRange(b, (x) => fromSI(x, u))
      statusBasis[i] = b.quality === 'exact' ? 'exact-bounds' : 'enclosure'
      if (rel.op === '=') checkStatus[i] = Math.abs(b.min) <= EQUAL_TOLERANCE && Math.abs(b.max) <= EQUAL_TOLERANCE ? 'satisfied' : 'uncertain'
      else {
        const strict = rel.op === '>' || rel.op === '<'
        const holdsEverywhere = strict ? b.min > 0 : b.min >= 0
        const failsEverywhere = strict ? b.max <= 0 : b.max < 0
        checkStatus[i] = holdsEverywhere ? 'satisfied' : failsEverywhere ? 'violated' : 'uncertain'
      }
      if (b.quality === 'enclosure') enclosures++
    })
    for (const rel of model.validity) {
      const b = boundsOf(substitute(slack(rel), inlined), box, rangedNames, nominal, run, { relationId: rel.id })
      const strict = rel.op === '>' || rel.op === '<'
      const holds = rel.op === '=' ? false : strict ? b.min > 0 : b.min >= 0
      const fails = strict ? b.max <= 0 : b.max < 0
      if (!holds && !violated.includes(rel.text)) (fails ? violated : uncertain).push(rel.text)
    }
    if (enclosures) warnings.push(`${enclosures} bound${enclosures === 1 ? ' is an enclosure' : 's are enclosures'}: monotonicity could not be proven, so the true range may be narrower than reported; sampled values are recorded separately.`)
  } else if (mode !== 'point' && !ranges.length) {
    warnings.push('No input has a range; point values only.')
  }

  const checks: CheckResult[] = point.checks.map((c, i) => {
    const unit = checkUnits[i]
    const u = calcUnit(unit, 'display unit')
    const lhs = fromSI(c.l, u)
    const rhs = fromSI(c.r, u)
    const op = c.rel.op!
    const margin = op === '>=' || op === '>' ? lhs - rhs : op === '<=' || op === '<' ? rhs - lhs : -Math.abs(lhs - rhs)
    const ratio = op === '>=' || op === '>' ? (rhs !== 0 ? lhs / rhs : undefined) : op === '<=' || op === '<' ? (lhs !== 0 ? rhs / lhs : undefined) : undefined
    return { relationId: c.rel.id, text: c.rel.text, op, lhs, rhs, unit, margin, marginRatio: ratio, nominalSatisfied: c.ok, status: checkStatus[i], statusBasis: statusBasis[i], marginRange: marginRanges[i] }
  })
  const validity: ValidityResult = { satisfied: violated.length === 0 && uncertain.length === 0, violated, uncertain, over: overRange ? 'range' : 'point' }
  if (violated.length) warnings.push(`domain-warning: outside the model's validity (${violated.join('; ')}).`)
  if (uncertain.length) warnings.push(`domain-warning: validity not shown for the whole input range (${uncertain.join('; ')}).`)

  const basis = calculationBasis(def, inputBases)
  const manifest: CalculationManifest = {
    manifestVersion: 3,
    digestSpec: DIGEST_SPEC,
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, mathjs: mathjsVersion, grammar: GRAMMAR },
    model: { id: def.id, revision: def.revision, digest: model.digest },
    inputs: manifestInputs,
    outputs: Object.values(outputs),
    checks,
    validity,
    uncertainty: mode,
    basis,
    limits: { establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: def.validationStatus, modelBasis: def.basis },
    inputDigest: inputDigestOf(model.digest, manifestInputs, mode),
    outputDigest: '',
    evaluatedAt: (options.now ?? (() => new Date()))().toISOString(),
    durationMs: Date.now() - started,
    operations: run.operations,
  }
  manifest.outputDigest = outputDigestOf(manifest)
  return { outputs, checks, validity, basis, warnings, manifest }
}

/** Input digest: model digest, inputs exactly as given (canonical numbers), uncertainty mode. Unchanged since v1. */
function inputDigestOf(modelDigest: string, inputs: CalculationManifest['inputs'], mode: ManifestUncertaintyMode): string {
  return digestOf({ model: modelDigest, inputs: inputs.map((i) => ({ symbol: i.symbol, value: i.value, min: i.min, max: i.max, unit: i.unit })), uncertainty: mode })
}

const r12 = (v: number | undefined) => (v === undefined ? undefined : canonicalNumber(v, 12))
const rangeDigest = (r: ResultRange): unknown =>
  r.kind === 'point'
    ? { kind: 'point' }
    : r.kind === 'sampled-range'
      ? { kind: r.kind, min: r12(r.min), max: r12(r.max), method: r.method, samples: r.samples }
      : { kind: r.kind, quality: r.quality, min: r12(r.min), max: r12(r.max), sampled: r.sampled ? rangeDigest(r.sampled) : undefined }

/**
 * Output digest (digest spec ews-digest/1, manifest v3 layout): computed numbers at 12 significant digits.
 * It matches on the same runtime and almost always across runtimes; verification compares values with a
 * relative tolerance instead (verifyManifest).
 */
function outputDigestOf(m: Pick<CalculationManifest, 'outputs' | 'checks' | 'validity' | 'limits'>): string {
  return digestOf({
    v: 3,
    outputs: m.outputs.map((o) => ({ symbol: o.symbol, value: r12(o.value), unit: o.unit, range: rangeDigest(o.range) })),
    checks: m.checks.map((c) => ({ id: c.relationId, nominal: c.nominalSatisfied, status: c.status, basis: c.statusBasis, lhs: r12(c.lhs), rhs: r12(c.rhs), unit: c.unit, margin: rangeDigest(c.marginRange) })),
    validity: m.validity,
    limits: m.limits,
  })
}

export interface VerificationResult {
  ok: boolean
  reasons: string[]
  /** Whether the output digest matched exactly (same manifest version and runtime expected; informational). */
  exactDigestMatch?: boolean
}

/** Relative tolerance of numeric comparison in verification (cross-platform Math differences are ~1e-16). */
export const VERIFY_RELATIVE_TOLERANCE = 1e-10

const close = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? a === b : a === b || Math.abs(a - b) <= VERIFY_RELATIVE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b), 1e-300)

/** Reads value range and statuses from a manifest of any supported version (v1/v2 used other field names). */
type AnyOutput = { symbol: string; value: number; unit: string; range?: ResultRange; bounds?: { min: number; max: number }; min?: number; max?: number }
type AnyCheck = { relationId: string; lhs: number; rhs: number; status: string; nominalSatisfied?: boolean; satisfied?: boolean }
const rangeOf = (o: AnyOutput): { min: number; max: number } | undefined =>
  o.range ? (o.range.kind === 'point' ? undefined : { min: o.range.min, max: o.range.max }) : (o.bounds ?? (o.min !== undefined && o.max !== undefined ? { min: o.min, max: o.max } : undefined))

/**
 * Re-evaluates a manifest against the model definition (CR-C8: Conceptualize accepts evidence with basis
 * `calculated` only if this passes). Detects a different model, changed inputs and fabricated outputs.
 * Supports manifest versions 1 (R1), 2 (R3) and 3 (C11). Numbers are compared with a relative tolerance,
 * statuses and the basis exactly, so verification works across JavaScript engines. Verification shows that the
 * outputs are reproducible; it does not validate the model or establish any requirement (manifest `limits`).
 */
export function verifyManifest(definition: CalculationModelDefinition, manifest: CalculationManifest): VerificationResult {
  const reasons: string[] = []
  const version = manifest.manifestVersion ?? 1
  if (!(SUPPORTED_MANIFEST_VERSIONS as readonly number[]).includes(version)) return { ok: false, reasons: [`Manifest version ${version} is not supported (supported: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')}).`] }
  if (manifest.engine.name !== ENGINE_NAME) reasons.push(`Produced by ${manifest.engine.name}, not ${ENGINE_NAME}.`)
  if (manifest.engine.version.split('.')[0] !== ENGINE_VERSION.split('.')[0]) reasons.push(`Engine major version ${manifest.engine.version} differs from ${ENGINE_VERSION}.`)
  let model: CompiledModel
  try {
    model = compileModel(definition)
  } catch (e) {
    return { ok: false, reasons: [...reasons, `The model does not compile: ${(e as Error).message}`] }
  }
  if (manifest.model.id !== definition.id || manifest.model.revision !== definition.revision) reasons.push(`The manifest is for ${manifest.model.id} revision ${manifest.model.revision}, not ${definition.id} revision ${definition.revision}.`)
  if (manifest.model.digest !== model.digest) reasons.push('The model digest differs from the definition.')
  if (inputDigestOf(manifest.model.digest, manifest.inputs, manifest.uncertainty) !== manifest.inputDigest) reasons.push('The input digest does not match the inputs.')
  const inputs: Record<string, InputValue> = {}
  for (const i of manifest.inputs) inputs[i.symbol] = { value: i.value, min: i.min, max: i.max, unit: i.unit, source: i.source }
  let exactDigestMatch: boolean | undefined
  try {
    const legacy = manifest.uncertainty === 'interval-vertices'
    const again = evaluateUnsafe(model, inputs, legacy ? { legacyVertexMode: true } : { uncertainty: manifest.uncertainty as UncertaintyMode })
    if (version === 3) exactDigestMatch = again.manifest.outputDigest === manifest.outputDigest
    const mismatch: string[] = []
    const given = manifest.outputs as AnyOutput[]
    for (const o of again.manifest.outputs) {
      const m = given.find((x) => x.symbol === o.symbol)
      const ra = rangeOf(o)
      const rb = m ? rangeOf(m) : undefined
      if (!m || m.unit !== o.unit || !close(m.value, o.value) || !close(ra?.min, rb?.min) || !close(ra?.max, rb?.max)) mismatch.push(o.symbol)
      if (version === 3 && m && m.range && (m.range.kind !== o.range.kind || (m.range.kind === 'bounds' && o.range.kind === 'bounds' && m.range.quality !== o.range.quality))) mismatch.push(`${o.symbol} result kind`)
    }
    if (given.length !== again.manifest.outputs.length) mismatch.push('output list')
    for (const c of again.manifest.checks) {
      const m = (manifest.checks as AnyCheck[]).find((x) => x.relationId === c.relationId)
      const nominal = m ? (m.nominalSatisfied ?? m.satisfied) : undefined
      if (!m || nominal !== c.nominalSatisfied || m.status !== c.status || !close(m.lhs, c.lhs) || !close(m.rhs, c.rhs)) mismatch.push(`check ${c.relationId}`)
    }
    if (manifest.validity.satisfied !== again.validity.satisfied) mismatch.push('validity')
    if (mismatch.length) reasons.push(`Re-evaluation gives different results (${mismatch.join(', ')}): the outputs were not produced by this model and these inputs.`)
    if (again.basis !== manifest.basis) reasons.push(`The basis should be ${again.basis}, not ${manifest.basis}.`)
  } catch (e) {
    reasons.push(`Re-evaluation failed: ${(e as Error).message}`)
  }
  return { ok: reasons.length === 0, reasons, exactDigestMatch }
}

/** Short, display-ready qualification of a result (C11), e.g. "exact bounds", "enclosure (may be narrower)". */
export function describeRange(r: ResultRange): string {
  if (r.kind === 'point') return 'point value'
  if (r.kind === 'sampled-range') return `sampled range (${r.samples} samples; not a bound)`
  return r.quality === 'exact' ? 'exact bounds' : 'enclosure (true range may be narrower)'
}
