import { version as mathjsVersion } from 'mathjs'
import type { Expr, ComparisonOp } from './ast'
import { GRAMMAR, symbolsOf } from './ast'
import { calculationBasis, type Basis } from './basis'
import { digestOf } from './digest'
import { CalcError } from './errors'
import { compileModel, type CalculationModelDefinition, type CompiledModel, type CompiledRelation } from './model'
import { calcUnit, fromSI, sameDims, siUnitOf, toSI } from './units'

export const ENGINE_NAME = '@ews/engineering-calc'
export const ENGINE_VERSION = '0.1.0'

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

export type UncertaintyMode = 'point' | 'interval-vertices'

export interface EvaluateOptions {
  uncertainty?: UncertaintyMode
  /** Clock for evaluatedAt (tests pass a fixed one); not part of any digest. */
  now?: () => Date
}

export interface QuantityOut {
  symbol: string
  value: number
  min?: number
  max?: number
  unit: string
}

export interface CheckResult {
  relationId: string
  text: string
  op: ComparisonOp
  /** Nominal values in `unit`. */
  lhs: number
  rhs: number
  unit: string
  /** Positive when satisfied with room; negative when violated (in `unit`). */
  margin: number
  /** lhs/rhs for ≥, rhs/lhs for ≤ (dimensionless), when defined. */
  marginRatio?: number
  satisfied: boolean
  /** With interval inputs: satisfied at every vertex, at none, or at some. */
  status: 'satisfied' | 'violated' | 'uncertain'
}

export interface CalculationManifest {
  engine: { name: string; version: string; mathjs: string; grammar: typeof GRAMMAR }
  model: { id: string; revision: number; digest: string }
  inputs: { symbol: string; value: number | null; min?: number; max?: number; unit: string; source: InputSource }[]
  outputs: QuantityOut[]
  checks: CheckResult[]
  validity: { satisfied: boolean; violated: string[] }
  uncertainty: UncertaintyMode
  basis: 'calculated' | 'estimate'
  inputDigest: string
  outputDigest: string
  evaluatedAt: string
  durationMs: number
}

export interface CalculationResult {
  outputs: Record<string, QuantityOut>
  checks: CheckResult[]
  validity: { satisfied: boolean; violated: string[] }
  basis: 'calculated' | 'estimate'
  warnings: string[]
  manifest: CalculationManifest
}

export const MAX_INTERVAL_INPUTS = 10

const FN: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, exp: Math.exp, log: Math.log, log10: Math.log10,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
}

/** Evaluates a canonical AST on SI magnitudes. Only the whitelisted node set exists. */
function evalExpr(e: Expr, env: Map<string, number>): number {
  switch (e.k) {
    case 'num':
      return e.v
    case 'const':
      return e.n === 'pi' ? Math.PI : Math.E
    case 'sym': {
      const v = env.get(e.n)
      if (v === undefined) throw new CalcError('input', `No value for “${e.n}”.`)
      return v
    }
    case 'neg':
      return -evalExpr(e.a, env)
    case 'op': {
      const a = evalExpr(e.a, env)
      const b = evalExpr(e.b, env)
      return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '/' ? a / b : a ** b
    }
    case 'fn':
      return FN[e.f](...e.args.map((x) => evalExpr(x, env)))
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

/** Unit used to report a comparison: the first parameter on either side with the comparison's dimensions. */
function displayUnit(model: CompiledModel, rel: CompiledRelation): string {
  for (const s of [...symbolsOf(rel.lhs!), ...symbolsOf(rel.rhs!)]) {
    const d = model.dims.get(s)
    if (d && sameDims(d, rel.dims)) return model.definition.parameters.find((p) => p.symbol === s)!.unit
  }
  return siUnitOf(rel.dims)
}

/** Rounds to 12 significant digits for digests, so last-bit differences of Math functions across runtimes do not change them. */
const r12 = (v: number | undefined) => (v === undefined ? undefined : Number(v.toPrecision(12)))

interface PointOutcome {
  env: Map<string, number>
  checks: { rel: CompiledRelation; l: number; r: number; ok: boolean }[]
  validity: { rel: CompiledRelation; ok: boolean }[]
}

function evaluatePoint(model: CompiledModel, siInputs: Map<string, number>): PointOutcome {
  const env = new Map(siInputs)
  for (const a of model.assignments) {
    const v = evalExpr(a.expr!, env)
    if (!Number.isFinite(v)) throw new CalcError('domain-error', `${a.target} is not a finite number (${a.text}); check the inputs.`, { relationId: a.id })
    env.set(a.target!, v)
  }
  const checks = model.constraints.map((rel) => {
    const l = evalExpr(rel.lhs!, env)
    const r = evalExpr(rel.rhs!, env)
    if (!Number.isFinite(l) || !Number.isFinite(r)) throw new CalcError('domain-error', `Constraint ${rel.id} is not finite.`, { relationId: rel.id })
    return { rel, l, r, ok: compare(rel.op!, l, r) }
  })
  const validity = model.validity.map((rel) => ({ rel, ok: compare(rel.op!, evalExpr(rel.lhs!, env), evalExpr(rel.rhs!, env)) }))
  return { env, checks, validity }
}

/**
 * Evaluates a calculation model deterministically (mathematics.md §6). Inputs are given per symbol
 * in any unit of the right dimension; constants come from the model. Returns outputs in their declared
 * units, constraint checks with margins, validity, the result basis and a reproducibility manifest.
 */
export function evaluateModel(definitionOrCompiled: CalculationModelDefinition | CompiledModel, inputs: Record<string, InputValue>, options: EvaluateOptions = {}): CalculationResult {
  const started = Date.now()
  const model = 'digest' in definitionOrCompiled ? definitionOrCompiled : compileModel(definitionOrCompiled)
  const def = model.definition
  const mode = options.uncertainty ?? 'point'
  const warnings: string[] = []

  const nominal = new Map<string, number>()
  const ranges: { symbol: string; lo: number; hi: number }[] = []
  const manifestInputs: CalculationManifest['inputs'] = []
  const inputBases: Basis[] = []

  for (const p of def.parameters) {
    if (p.role === 'output') {
      if (inputs[p.symbol]) throw new CalcError('input', `“${p.symbol}” is an output and cannot be given as an input.`)
      continue
    }
    const target = model.units.get(p.symbol)!
    if (p.role === 'constant') {
      if (inputs[p.symbol]) throw new CalcError('input', `“${p.symbol}” is a model constant and cannot be overridden.`)
      nominal.set(p.symbol, toSI(p.value!, target))
      continue
    }
    const given = inputs[p.symbol]
    if (!given) throw new CalcError('input', `Missing input “${p.symbol}” (${p.name}, ${p.unit}).`)
    const u = calcUnit(given.unit, `input ${p.symbol}`)
    if (!sameDims(u.dims, target.dims)) throw new CalcError('unit-error', `Input ${p.symbol} is given in ${given.unit}, which is not compatible with ${p.unit}.`)
    const nums = [given.value, given.min, given.max].filter((v): v is number => typeof v === 'number')
    if (!nums.length || nums.some((v) => !Number.isFinite(v))) throw new CalcError('input', `Input ${p.symbol} needs a finite value or range.`)
    if (given.min !== undefined && given.max !== undefined && given.min > given.max) throw new CalcError('input', `Input ${p.symbol}: min exceeds max.`)
    let value = given.value ?? undefined
    if (value === undefined || value === null) {
      if (given.min === undefined || given.max === undefined) throw new CalcError('input', `Input ${p.symbol} needs a value or both min and max.`)
      value = (given.min + given.max) / 2
      warnings.push(`${p.symbol}: no nominal value; the midpoint of the range is used.`)
    }
    nominal.set(p.symbol, toSI(value, u))
    if (given.min !== undefined && given.max !== undefined && given.min !== given.max) ranges.push({ symbol: p.symbol, lo: toSI(given.min, u), hi: toSI(given.max, u) })
    const source: InputSource = given.source ?? { kind: 'literal', basis: 'user-assertion' }
    inputBases.push(source.basis)
    manifestInputs.push({ symbol: p.symbol, value: given.value ?? null, min: given.min, max: given.max, unit: given.unit, source })
  }

  const point = evaluatePoint(model, nominal)

  // Interval bounds by vertex enumeration (exact for monotonic relations; documented limitation).
  const corners: PointOutcome[] = []
  if (mode === 'interval-vertices' && ranges.length) {
    if (ranges.length > MAX_INTERVAL_INPUTS) throw new CalcError('limit', `Interval evaluation supports at most ${MAX_INTERVAL_INPUTS} inputs with ranges (got ${ranges.length}).`)
    for (let mask = 0; mask < 1 << ranges.length; mask++) {
      const env = new Map(nominal)
      ranges.forEach((r, i) => env.set(r.symbol, mask & (1 << i) ? r.hi : r.lo))
      corners.push(evaluatePoint(model, env))
    }
    warnings.push('Bounds by vertex enumeration: exact for monotonic relations, possibly too narrow otherwise.')
  }

  const outputs: Record<string, QuantityOut> = {}
  for (const a of model.assignments) {
    const p = def.parameters.find((x) => x.symbol === a.target)!
    const u = model.units.get(a.target!)!
    const out: QuantityOut = { symbol: a.target!, value: fromSI(point.env.get(a.target!)!, u), unit: p.unit }
    if (corners.length) {
      const vals = corners.map((c) => fromSI(c.env.get(a.target!)!, u))
      out.min = Math.min(...vals)
      out.max = Math.max(...vals)
    }
    outputs[a.target!] = out
  }

  const checks: CheckResult[] = point.checks.map((c, i) => {
    const unit = displayUnit(model, c.rel)
    const u = calcUnit(unit, 'display unit')
    const lhs = fromSI(c.l, u)
    const rhs = fromSI(c.r, u)
    const op = c.rel.op!
    const margin = op === '>=' || op === '>' ? lhs - rhs : op === '<=' || op === '<' ? rhs - lhs : -Math.abs(lhs - rhs)
    const ratio = op === '>=' || op === '>' ? (rhs !== 0 ? lhs / rhs : undefined) : op === '<=' || op === '<' ? (lhs !== 0 ? rhs / lhs : undefined) : undefined
    let status: CheckResult['status'] = c.ok ? 'satisfied' : 'violated'
    if (corners.length) {
      const oks = corners.map((k) => k.checks[i].ok)
      status = oks.every(Boolean) && c.ok ? 'satisfied' : oks.some(Boolean) || c.ok ? 'uncertain' : 'violated'
    }
    return { relationId: c.rel.id, text: c.rel.text, op, lhs, rhs, unit, margin, marginRatio: ratio, satisfied: c.ok, status }
  })

  const violated = point.validity.filter((v) => !v.ok).map((v) => v.rel.text)
  if (corners.length) {
    for (const k of corners) for (const v of k.validity) if (!v.ok && !violated.includes(v.rel.text)) violated.push(v.rel.text)
  }
  const validity = { satisfied: violated.length === 0, violated }
  if (!validity.satisfied) warnings.push(`domain-warning: outside the model's validity (${violated.join('; ')}).`)

  const basis = calculationBasis(def, inputBases)
  const digestInputs = manifestInputs.map((i) => ({ symbol: i.symbol, value: i.value, min: i.min, max: i.max, unit: i.unit }))
  const inputDigest = digestOf({ model: model.digest, inputs: digestInputs, uncertainty: mode })
  const outputDigest = digestOf({
    outputs: Object.values(outputs).map((o) => ({ symbol: o.symbol, value: r12(o.value), min: r12(o.min), max: r12(o.max), unit: o.unit })),
    checks: checks.map((c) => ({ id: c.relationId, satisfied: c.satisfied, status: c.status, lhs: r12(c.lhs), rhs: r12(c.rhs), unit: c.unit })),
    validity,
  })
  const manifest: CalculationManifest = {
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, mathjs: mathjsVersion, grammar: GRAMMAR },
    model: { id: def.id, revision: def.revision, digest: model.digest },
    inputs: manifestInputs,
    outputs: Object.values(outputs),
    checks,
    validity,
    uncertainty: mode,
    basis,
    inputDigest,
    outputDigest,
    evaluatedAt: (options.now ?? (() => new Date()))().toISOString(),
    durationMs: Date.now() - started,
  }
  return { outputs, checks, validity, basis, warnings, manifest }
}

export interface VerificationResult {
  ok: boolean
  reasons: string[]
}

/**
 * Re-evaluates a manifest against the model definition (CR-C8: Conceptualize accepts evidence with basis
 * `calculated` only if this passes). Detects a different model, changed inputs and fabricated outputs.
 */
export function verifyManifest(definition: CalculationModelDefinition, manifest: CalculationManifest): VerificationResult {
  const reasons: string[] = []
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
  const inputs: Record<string, InputValue> = {}
  for (const i of manifest.inputs) inputs[i.symbol] = { value: i.value, min: i.min, max: i.max, unit: i.unit, source: i.source }
  try {
    const again = evaluateModel(model, inputs, { uncertainty: manifest.uncertainty })
    if (again.manifest.inputDigest !== manifest.inputDigest) reasons.push('The input digest does not match the inputs.')
    if (again.manifest.outputDigest !== manifest.outputDigest) reasons.push('Re-evaluation gives different results: the outputs were not produced by this model and these inputs.')
    if (again.basis !== manifest.basis) reasons.push(`The basis should be ${again.basis}, not ${manifest.basis}.`)
  } catch (e) {
    reasons.push(`Re-evaluation failed: ${(e as Error).message}`)
  }
  return { ok: reasons.length === 0, reasons }
}
