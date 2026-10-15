import type { Dims, ParsedUnit } from '@ews/platform-sdk'
import { GRAMMAR, parseRelation, symbolsOf, type ComparisonOp, type Expr } from './ast'
import type { Basis } from './basis'
import { digestOf } from './digest'
import { dimensionsOf } from './dimensions'
import { CalcError } from './errors'
import { calcUnit, describeDims, sameDims } from './units'

/**
 * Calculation model definition (CR-C8; docs/modules/design-reasoning/mathematics.md §2). The record is
 * Conceptualize data; this package validates and evaluates it. References to design records and
 * artifacts are opaque to the engine (`defaultBinding` is resolved by the caller).
 */
export interface CalculationParameter {
  symbol: string
  name: string
  role: 'input' | 'output' | 'constant' | 'design-variable'
  /** Platform unit grammar; '-' for dimensionless. */
  unit: string
  value?: number
  min?: number
  max?: number
  description?: string
}

export interface CalculationRelation {
  id: string
  kind: 'assignment' | 'constraint' | 'objective'
  expression: string
  direction?: 'minimize' | 'maximize'
  description?: string
}

export interface CalculationModelDefinition {
  id: string
  key?: string
  revision: number
  name: string
  description?: string
  grammar: typeof GRAMMAR
  parameters: CalculationParameter[]
  relations: CalculationRelation[]
  /** Conditions (comparisons) under which the model is valid, e.g. Euler buckling slenderness. */
  validity?: { text: string; conditions: string[] }
  basis: Basis
  validationStatus: 'unvalidated' | 'validated' | 'deprecated'
}

export interface CompiledRelation {
  id: string
  kind: CalculationRelation['kind']
  text: string
  target?: string
  expr?: Expr
  lhs?: Expr
  op?: ComparisonOp
  rhs?: Expr
  direction?: 'minimize' | 'maximize'
  dims: Dims
}

export interface CompiledModel {
  definition: CalculationModelDefinition
  /** Digest of the canonical form (ASTs, parameters, validity): independent of formatting. */
  digest: string
  units: Map<string, ParsedUnit>
  dims: Map<string, Dims>
  /** Assignments in evaluation order. */
  assignments: CompiledRelation[]
  constraints: CompiledRelation[]
  objectives: CompiledRelation[]
  validity: CompiledRelation[]
}

export interface ModelProblem {
  where: string
  code: CalcError['code']
  message: string
}

const SYMBOL = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

/** Validates a model definition; returns every problem found (empty when the model is consistent). */
export function validateModel(definition: CalculationModelDefinition): ModelProblem[] {
  try {
    compileModel(definition)
    return []
  } catch (e) {
    if (e instanceof CalcError && Array.isArray(e.details?.problems)) return e.details.problems as ModelProblem[]
    if (e instanceof CalcError) return [{ where: 'model', code: e.code, message: e.message }]
    throw e
  }
}

/** Parses, checks and orders a model. Throws CalcError('model', …) with all problems in `details.problems`. */
export function compileModel(definition: CalculationModelDefinition): CompiledModel {
  const problems: ModelProblem[] = []
  const fail = (where: string, e: unknown) => {
    if (e instanceof CalcError) problems.push({ where, code: e.code, message: e.message })
    else throw e
  }
  if (definition.grammar !== GRAMMAR) problems.push({ where: 'model', code: 'model', message: `Unsupported grammar “${definition.grammar}”; expected ${GRAMMAR}.` })

  const units = new Map<string, ParsedUnit>()
  const dims = new Map<string, Dims>()
  const roles = new Map<string, CalculationParameter['role']>()
  for (const p of definition.parameters) {
    const where = `parameter ${p.symbol}`
    if (!SYMBOL.test(p.symbol) || p.symbol === 'pi' || p.symbol === 'e') {
      problems.push({ where, code: 'model', message: `“${p.symbol}” is not a valid parameter symbol.` })
      continue
    }
    if (roles.has(p.symbol)) {
      problems.push({ where, code: 'model', message: `“${p.symbol}” is declared twice.` })
      continue
    }
    roles.set(p.symbol, p.role)
    try {
      const u = calcUnit(p.unit, where)
      units.set(p.symbol, u)
      dims.set(p.symbol, u.dims)
    } catch (e) {
      fail(where, e)
    }
    if (p.role === 'constant' && (typeof p.value !== 'number' || !Number.isFinite(p.value))) problems.push({ where, code: 'model', message: 'A constant needs a finite value.' })
  }

  const assignments: CompiledRelation[] = []
  const constraints: CompiledRelation[] = []
  const objectives: CompiledRelation[] = []
  const assigned = new Set<string>()
  const relationIds = new Set<string>()
  const symbolDims = (n: string) => dims.get(n)

  for (const r of definition.relations) {
    const where = `relation ${r.id}`
    if (relationIds.has(r.id)) problems.push({ where, code: 'model', message: 'Duplicate relation ID.' })
    relationIds.add(r.id)
    try {
      const parsed = parseRelation(r.expression)
      if (r.kind === 'assignment') {
        if (parsed.form !== 'assignment') throw new CalcError('model', 'An assignment relation must have the form “output = expression”.')
        if (roles.get(parsed.target) !== 'output') throw new CalcError('model', `“${parsed.target}” must be declared as an output parameter.`)
        if (assigned.has(parsed.target)) throw new CalcError('model', `“${parsed.target}” is assigned more than once.`)
        assigned.add(parsed.target)
        const d = dimensionsOf(parsed.expr, symbolDims)
        const declared = dims.get(parsed.target)
        if (declared && !sameDims(d, declared)) throw new CalcError('unit-error', `The expression gives ${describeDims(d)}, but ${parsed.target} is declared in ${definition.parameters.find((p) => p.symbol === parsed.target)?.unit} (${describeDims(declared)}).`)
        assignments.push({ id: r.id, kind: r.kind, text: r.expression, target: parsed.target, expr: parsed.expr, dims: d })
      } else if (r.kind === 'constraint') {
        if (parsed.form !== 'comparison') throw new CalcError('model', 'A constraint must be a comparison (<=, <, ==, >=, >).')
        const a = dimensionsOf(parsed.lhs, symbolDims)
        const b = dimensionsOf(parsed.rhs, symbolDims)
        if (!sameDims(a, b)) throw new CalcError('unit-error', `The two sides of the constraint differ in dimension: ${describeDims(a)} vs ${describeDims(b)}.`)
        constraints.push({ id: r.id, kind: r.kind, text: r.expression, lhs: parsed.lhs, op: parsed.op, rhs: parsed.rhs, dims: a })
      } else {
        if (parsed.form !== 'expression') throw new CalcError('model', 'An objective is a plain expression to minimize or maximize.')
        if (!r.direction) throw new CalcError('model', 'An objective needs a direction (minimize or maximize).')
        objectives.push({ id: r.id, kind: r.kind, text: r.expression, expr: parsed.expr, direction: r.direction, dims: dimensionsOf(parsed.expr, symbolDims) })
      }
    } catch (e) {
      fail(where, e)
    }
  }
  for (const [symbol, role] of roles) {
    if (role === 'output' && !assigned.has(symbol)) problems.push({ where: `parameter ${symbol}`, code: 'model', message: `Output “${symbol}” has no assignment.` })
  }

  const validity: CompiledRelation[] = []
  ;(definition.validity?.conditions ?? []).forEach((text, i) => {
    const where = `validity condition ${i + 1}`
    try {
      const parsed = parseRelation(text)
      if (parsed.form !== 'comparison') throw new CalcError('model', 'A validity condition must be a comparison.')
      const a = dimensionsOf(parsed.lhs, symbolDims)
      const b = dimensionsOf(parsed.rhs, symbolDims)
      if (!sameDims(a, b)) throw new CalcError('unit-error', `The two sides differ in dimension: ${describeDims(a)} vs ${describeDims(b)}.`)
      validity.push({ id: `validity-${i + 1}`, kind: 'constraint', text, lhs: parsed.lhs, op: parsed.op, rhs: parsed.rhs, dims: a })
    } catch (e) {
      fail(where, e)
    }
  })

  let ordered: CompiledRelation[] = []
  if (!problems.length) {
    try {
      ordered = orderAssignments(assignments)
    } catch (e) {
      fail('model', e)
    }
  }
  if (problems.length) throw new CalcError(problems.every((p) => p.code === problems[0].code) ? problems[0].code : 'model', `The calculation model has ${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems[0].message}`, { problems })

  const digest = digestOf({
    grammar: definition.grammar,
    parameters: [...definition.parameters].sort((a, b) => (a.symbol < b.symbol ? -1 : 1)).map((p) => ({ symbol: p.symbol, role: p.role, unit: p.unit, value: p.value, min: p.min, max: p.max })),
    relations: [...definition.relations].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => ({ id: r.id, kind: r.kind, direction: r.direction, ast: parseRelation(r.expression) })),
    validity: validity.map((v) => ({ lhs: v.lhs, op: v.op, rhs: v.rhs })),
  })
  return { definition, digest, units, dims, assignments: ordered, constraints, objectives, validity }
}

/** Topological order of assignments; refuses cycles. */
function orderAssignments(assignments: CompiledRelation[]): CompiledRelation[] {
  const byTarget = new Map(assignments.map((a) => [a.target!, a]))
  const done = new Set<string>()
  const visiting = new Set<string>()
  const out: CompiledRelation[] = []
  const visit = (a: CompiledRelation, path: string[]) => {
    if (done.has(a.target!)) return
    if (visiting.has(a.target!)) throw new CalcError('model', `The assignments are cyclic: ${[...path, a.target].join(' → ')}.`)
    visiting.add(a.target!)
    for (const s of symbolsOf(a.expr!)) {
      const dep = byTarget.get(s)
      if (dep) visit(dep, [...path, a.target!])
    }
    visiting.delete(a.target!)
    done.add(a.target!)
    out.push(a)
  }
  for (const a of assignments) visit(a, [])
  return out
}
