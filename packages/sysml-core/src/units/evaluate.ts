import { isKindOf } from '../metamodel/metaclasses'
import { refId, type Model } from '../model/model'
import { semanticsOf, type Semantics } from '../semantics/semantics'
import { DIMENSIONLESS, QUANTITY_DIMENSIONS, UNITS, multiply, power, sameDimension, type Dimension } from './units'

/**
 * Expression evaluation (subset, SYS-FR-PAR-01): literals, arithmetic, comparison, boolean logic,
 * conditionals, quantity values with units (`12 [kg]`, `3 [m/s]`) and references to features whose
 * value is given by a feature value. Results of quantities are in SI base units with a dimension.
 * Anything else evaluates to `unknown` with a reason; evaluation never throws.
 */

export type Value =
  | { kind: 'number'; value: number; dimension?: Dimension; unitLabel?: string; /** value in the written unit */ display?: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'unit'; dimension: Dimension; factor: number; offset?: number; label: string }
  | { kind: 'unknown'; reason: string }

export function evaluate(model: Model, exprId: string, depth = 0): Value {
  return new Evaluator(semanticsOf(model)).eval(exprId, depth)
}

/** Value of a feature: its own feature value, or (through redefinition/subsetting) an inherited one. */
export function featureValue(model: Model, featureId: string): Value {
  return new Evaluator(semanticsOf(model)).feature(featureId, 0)
}

/** Dimension of a quantity type (an ISQ value type or a specialization of one). */
export function quantityDimension(sem: Semantics, typeId: string): Dimension | undefined {
  for (const t of [typeId, ...sem.allGenerals(typeId)]) {
    const q = sem.qualifiedName(t)
    if (q && QUANTITY_DIMENSIONS[q]) return QUANTITY_DIMENSIONS[q]
  }
  return undefined
}

class Evaluator {
  constructor(private readonly s: Semantics) {}

  feature(featureId: string, depth: number): Value {
    if (depth > 30) return { kind: 'unknown', reason: 'reference cycle' }
    const fv = this.s.ownedRelationships(featureId).find((r) => r['@type'] === 'FeatureValue')
    if (fv) {
      const e = refId(fv, 'ownedRelatedElement')
      return e ? this.eval(e, depth + 1) : { kind: 'unknown', reason: 'empty value' }
    }
    // SI unit features evaluate to units.
    const q = this.s.qualifiedName(featureId)
    if (q && UNITS[q]) {
      const u = UNITS[q]
      return { kind: 'unit', ...u, label: this.s.shortName(featureId) ?? this.s.name(featureId) ?? q }
    }
    for (const g of this.s.generals(featureId)) {
      const gEl = this.s.get(g)
      if (gEl && isKindOf(gEl['@type'], 'Feature')) {
        const v = this.feature(g, depth + 1)
        if (v.kind !== 'unknown') return v
      }
    }
    return { kind: 'unknown', reason: `${this.s.label(featureId)} has no value` }
  }

  eval(id: string, depth: number): Value {
    if (depth > 60) return { kind: 'unknown', reason: 'expression too deep' }
    const e = this.s.get(id)
    if (!e) return { kind: 'unknown', reason: 'missing expression' }
    switch (e['@type']) {
      case 'LiteralInteger':
      case 'LiteralRational':
        return { kind: 'number', value: Number(e.value) }
      case 'LiteralBoolean':
        return { kind: 'boolean', value: !!e.value }
      case 'LiteralString':
        return { kind: 'string', value: String(e.value ?? '') }
      case 'FeatureReferenceExpression': {
        const mem = this.s.memberships(id)[0]
        const target = mem && this.s.memberElement(mem)
        if (!target) return { kind: 'unknown', reason: 'unresolved reference' }
        if (isKindOf(mem['@type'], 'OwningMembership')) {
          const links = this.s.ownedRelationships(target['@id']).filter((r) => r['@type'] === 'FeatureChaining')
          const last = links.length ? refId(links[links.length - 1], 'chainingFeature') : undefined
          return last ? this.feature(last, depth + 1) : { kind: 'unknown', reason: 'empty feature chain' }
        }
        return this.feature(target['@id'], depth + 1)
      }
      case 'OperatorExpression':
        return this.operator(String(e.operator), this.s.ownedMembers(id).map((a) => a['@id']), depth)
      default:
        return { kind: 'unknown', reason: `${e['@type']} is not evaluated` }
    }
  }

  private operator(op: string, args: string[], depth: number): Value {
    const v = args.map((a) => this.eval(a, depth + 1))
    const unknown = v.find((x) => x.kind === 'unknown')
    if (op === 'if') {
      if (v[0].kind !== 'boolean') return unknown ?? { kind: 'unknown', reason: 'condition is not boolean' }
      return v[0].value ? v[1] : v[2]
    }
    if (unknown) return unknown
    if (op === '[') {
      const [n, u] = v
      if (n.kind !== 'number' || u.kind !== 'unit') return { kind: 'unknown', reason: 'a quantity needs a number and a unit' }
      return { kind: 'number', value: n.value * u.factor + (u.offset ?? 0), dimension: u.dimension, unitLabel: u.label, display: n.value }
    }
    if (v.length === 1) {
      const [a] = v
      if (op === 'not' && a.kind === 'boolean') return { kind: 'boolean', value: !a.value }
      if ((op === '-' || op === '+') && a.kind === 'number') return { ...a, value: op === '-' ? -a.value : a.value, display: a.display === undefined ? undefined : op === '-' ? -a.display : a.display }
      return { kind: 'unknown', reason: `operator ${op} not applicable` }
    }
    const [a, b] = v
    if (a.kind === 'unit' && b.kind === 'unit' && (op === '*' || op === '/')) {
      return { kind: 'unit', dimension: multiply(a.dimension, b.dimension, op === '*' ? 1 : -1), factor: op === '*' ? a.factor * b.factor : a.factor / b.factor, label: `${a.label}${op}${b.label}` }
    }
    if (a.kind === 'unit' && b.kind === 'number' && (op === '^' || op === '**')) {
      return { kind: 'unit', dimension: power(a.dimension, b.value), factor: a.factor ** b.value, label: `${a.label}^${b.value}` }
    }
    if (a.kind === 'boolean' && b.kind === 'boolean') {
      if (op === 'and' || op === '&') return { kind: 'boolean', value: a.value && b.value }
      if (op === 'or' || op === '|') return { kind: 'boolean', value: a.value || b.value }
      if (op === 'xor') return { kind: 'boolean', value: a.value !== b.value }
      if (op === 'implies') return { kind: 'boolean', value: !a.value || b.value }
      if (op === '==') return { kind: 'boolean', value: a.value === b.value }
      if (op === '!=') return { kind: 'boolean', value: a.value !== b.value }
    }
    if (a.kind === 'string' && b.kind === 'string') {
      if (op === '+') return { kind: 'string', value: a.value + b.value }
      if (op === '==') return { kind: 'boolean', value: a.value === b.value }
      if (op === '!=') return { kind: 'boolean', value: a.value !== b.value }
    }
    if (a.kind === 'number' && b.kind === 'number') {
      const da = a.dimension ?? DIMENSIONLESS
      const db = b.dimension ?? DIMENSIONLESS
      const same = sameDimension(da, db)
      switch (op) {
        case '+':
        case '-':
          if (!same) return { kind: 'unknown', reason: 'adding quantities of different dimensions' }
          return { kind: 'number', value: op === '+' ? a.value + b.value : a.value - b.value, dimension: a.dimension ?? b.dimension }
        case '*':
          return { kind: 'number', value: a.value * b.value, dimension: multiply(da, db) }
        case '/':
          if (b.value === 0) return { kind: 'unknown', reason: 'division by zero' }
          return { kind: 'number', value: a.value / b.value, dimension: multiply(da, db, -1) }
        case '%':
          return { kind: 'number', value: a.value % b.value, dimension: a.dimension }
        case '^':
        case '**':
          return { kind: 'number', value: a.value ** b.value, dimension: power(da, b.value) }
        case '<':
        case '>':
        case '<=':
        case '>=':
        case '==':
        case '!=': {
          if (!same) return { kind: 'unknown', reason: 'comparing quantities of different dimensions' }
          const r = op === '<' ? a.value < b.value : op === '>' ? a.value > b.value : op === '<=' ? a.value <= b.value : op === '>=' ? a.value >= b.value : op === '==' ? a.value === b.value : a.value !== b.value
          return { kind: 'boolean', value: r }
        }
      }
    }
    return { kind: 'unknown', reason: `operator ${op} not applicable to these values` }
  }
}

/** Short text for a value (for the inspector and the assistant). */
export function formatValue(v: Value): string {
  switch (v.kind) {
    case 'number':
      return v.unitLabel && v.display !== undefined ? `${v.display} [${v.unitLabel}]` : String(Number(v.value.toPrecision(12)))
    case 'boolean':
      return String(v.value)
    case 'string':
      return JSON.stringify(v.value)
    case 'unit':
      return `[${v.label}]`
    default:
      return `unknown (${v.reason})`
  }
}
