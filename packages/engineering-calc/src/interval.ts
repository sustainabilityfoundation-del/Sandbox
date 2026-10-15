import type { Expr } from './ast'
import { constantValue } from './dimensions'
import { CalcError } from './errors'

/**
 * Bounds of expressions over boxes of input ranges (mathematics.md §5).
 *
 * - `evalInterval`: natural interval extension. The result ENCLOSES every value the expression takes on
 *   the box (it may be wider, because the same variable appearing twice is treated independently).
 * - `differentiate`: symbolic partial derivatives over the canonical AST.
 * - `monotonicity`: the sign of a partial derivative over the whole box, from its interval enclosure.
 *   When an expression is monotonic in every ranged input, its exact range is attained at two corners.
 *
 * Floating-point rounding is not directed: bounds are exact up to floating-point accuracy, not
 * rigorous to the last bit.
 */
export interface Interval {
  lo: number
  hi: number
}

const iv = (lo: number, hi: number): Interval => ({ lo, hi })
const point = (v: number): Interval => ({ lo: v, hi: v })
const UNBOUNDED: Interval = { lo: -Infinity, hi: Infinity }
const TWO_PI = 2 * Math.PI

function mul(a: Interval, b: Interval): Interval {
  const p = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi].map((x) => (Number.isNaN(x) ? 0 : x)) // 0·∞ → 0
  return iv(Math.min(...p), Math.max(...p))
}

function div(a: Interval, b: Interval): Interval {
  if (b.lo === 0 && b.hi === 0) throw new CalcError('domain-error', 'Division by an interval that is exactly zero.')
  if (b.lo <= 0 && b.hi >= 0) return UNBOUNDED
  return mul(a, iv(1 / b.hi, 1 / b.lo))
}

function pow(a: Interval, c: number): Interval {
  if (c === 0) return point(1)
  if (Number.isInteger(c)) {
    if (c < 0) return div(point(1), pow(a, -c))
    const lo = a.lo ** c
    const hi = a.hi ** c
    if (c % 2 === 1) return iv(lo, hi)
    if (a.lo >= 0) return iv(lo, hi)
    if (a.hi <= 0) return iv(hi, lo)
    return iv(0, Math.max(lo, hi))
  }
  if (a.lo < 0) throw new CalcError('domain-error', `A range including negative values cannot be raised to the non-integer power ${c}.`)
  if (c < 0 && a.lo === 0) return iv(a.hi ** c, Infinity)
  return c > 0 ? iv(a.lo ** c, a.hi ** c) : iv(a.hi ** c, a.lo ** c)
}

/** Range of sin over [lo, hi], exact (endpoints and contained extrema). */
function sinRange(a: Interval): Interval {
  if (!Number.isFinite(a.lo) || !Number.isFinite(a.hi) || a.hi - a.lo >= TWO_PI) return iv(-1, 1)
  let lo = Math.min(Math.sin(a.lo), Math.sin(a.hi))
  let hi = Math.max(Math.sin(a.lo), Math.sin(a.hi))
  // Maxima at π/2 + 2kπ, minima at −π/2 + 2kπ.
  const contains = (phase: number) => Math.ceil((a.lo - phase) / TWO_PI) <= Math.floor((a.hi - phase) / TWO_PI)
  if (contains(Math.PI / 2)) hi = 1
  if (contains(-Math.PI / 2)) lo = -1
  return iv(lo, hi)
}

function monotone(f: (x: number) => number, a: Interval, increasing: boolean): Interval {
  return increasing ? iv(f(a.lo), f(a.hi)) : iv(f(a.hi), f(a.lo))
}

/** Natural interval extension of an expression over a box of SI-valued intervals. */
export function evalInterval(e: Expr, box: Map<string, Interval>): Interval {
  switch (e.k) {
    case 'num':
      return point(e.v)
    case 'const':
      return point(e.n === 'pi' ? Math.PI : Math.E)
    case 'sym': {
      const v = box.get(e.n)
      if (!v) throw new CalcError('input', `No range for “${e.n}”.`)
      return v
    }
    case 'neg': {
      const a = evalInterval(e.a, box)
      return iv(-a.hi, -a.lo)
    }
    case 'op': {
      if (e.op === '^') {
        const c = constantValue(e.b)
        if (c === undefined) throw new CalcError('model', 'An exponent must be a constant number.')
        return pow(evalInterval(e.a, box), c)
      }
      const a = evalInterval(e.a, box)
      const b = evalInterval(e.b, box)
      if (e.op === '+') return iv(a.lo + b.lo, a.hi + b.hi)
      if (e.op === '-') return iv(a.lo - b.hi, a.hi - b.lo)
      if (e.op === '*') return mul(a, b)
      return div(a, b)
    }
    case 'fn': {
      const args = e.args.map((x) => evalInterval(x, box))
      const a = args[0]
      switch (e.f) {
        case 'sqrt':
          if (a.hi < 0) throw new CalcError('domain-error', 'sqrt of a range that is entirely negative.')
          if (a.lo < 0) throw new CalcError('domain-error', 'sqrt of a range that includes negative values.')
          return monotone(Math.sqrt, a, true)
        case 'abs':
          return a.lo >= 0 ? a : a.hi <= 0 ? iv(-a.hi, -a.lo) : iv(0, Math.max(-a.lo, a.hi))
        case 'min':
          return iv(Math.min(...args.map((x) => x.lo)), Math.min(...args.map((x) => x.hi)))
        case 'max':
          return iv(Math.max(...args.map((x) => x.lo)), Math.max(...args.map((x) => x.hi)))
        case 'exp':
          return monotone(Math.exp, a, true)
        case 'log':
        case 'log10':
          if (a.lo <= 0) throw new CalcError('domain-error', `${e.f} of a range that includes zero or negative values.`)
          return monotone(e.f === 'log' ? Math.log : Math.log10, a, true)
        case 'sin':
          return sinRange(a)
        case 'cos':
          return sinRange(iv(a.lo + Math.PI / 2, a.hi + Math.PI / 2))
        case 'tan': {
          // Poles at π/2 + kπ.
          const k = Math.ceil((a.lo - Math.PI / 2) / Math.PI)
          if (Math.PI / 2 + k * Math.PI <= a.hi) return UNBOUNDED
          return monotone(Math.tan, a, true)
        }
        case 'asin':
        case 'acos':
          if (a.lo < -1 || a.hi > 1) throw new CalcError('domain-error', `${e.f} of a range outside [−1, 1].`)
          return monotone(e.f === 'asin' ? Math.asin : Math.acos, a, e.f === 'asin')
        case 'atan':
          return monotone(Math.atan, a, true)
        case 'atan2':
          // atan2(y, x) for x > 0 equals atan(y/x); otherwise only the full range is claimed.
          if (args[1].lo > 0) {
            const q = div(args[0], args[1])
            return monotone(Math.atan, q, true)
          }
          return iv(-Math.PI, Math.PI)
      }
    }
  }
}

// ---- symbolic differentiation ---------------------------------------------------------------------------

const num = (v: number): Expr => ({ k: 'num', v })
const isNum = (e: Expr, v?: number) => e.k === 'num' && (v === undefined || e.v === v)

function add(a: Expr, b: Expr): Expr {
  if (isNum(a, 0)) return b
  if (isNum(b, 0)) return a
  if (a.k === 'num' && b.k === 'num') return num(a.v + b.v)
  return { k: 'op', op: '+', a, b }
}
function sub(a: Expr, b: Expr): Expr {
  if (isNum(b, 0)) return a
  if (isNum(a, 0)) return neg(b)
  if (a.k === 'num' && b.k === 'num') return num(a.v - b.v)
  return { k: 'op', op: '-', a, b }
}
function times(a: Expr, b: Expr): Expr {
  if (isNum(a, 0) || isNum(b, 0)) return num(0)
  if (isNum(a, 1)) return b
  if (isNum(b, 1)) return a
  if (a.k === 'num' && b.k === 'num') return num(a.v * b.v)
  return { k: 'op', op: '*', a, b }
}
function over(a: Expr, b: Expr): Expr {
  if (isNum(a, 0)) return num(0)
  if (isNum(b, 1)) return a
  return { k: 'op', op: '/', a, b }
}
function neg(a: Expr): Expr {
  if (a.k === 'num') return num(-a.v)
  if (a.k === 'neg') return a.a
  return { k: 'neg', a }
}
const power = (a: Expr, c: number): Expr => (c === 1 ? a : c === 0 ? num(1) : { k: 'op', op: '^', a, b: num(c) })
const fn = (f: Extract<Expr, { k: 'fn' }>['f'], ...args: Expr[]): Expr => ({ k: 'fn', f, args })

/** Thrown when an expression is not differentiable in closed form (abs, min, max, atan2). */
export class NotDifferentiable extends Error {}

/** ∂e/∂v. Throws NotDifferentiable for piecewise functions. */
export function differentiate(e: Expr, v: string): Expr {
  const d = (x: Expr) => differentiate(x, v)
  switch (e.k) {
    case 'num':
    case 'const':
      return num(0)
    case 'sym':
      return num(e.n === v ? 1 : 0)
    case 'neg':
      return neg(d(e.a))
    case 'op': {
      switch (e.op) {
        case '+':
          return add(d(e.a), d(e.b))
        case '-':
          return sub(d(e.a), d(e.b))
        case '*':
          return add(times(d(e.a), e.b), times(e.a, d(e.b)))
        case '/':
          return over(sub(times(d(e.a), e.b), times(e.a, d(e.b))), power(e.b, 2))
        case '^': {
          const c = constantValue(e.b)
          if (c === undefined) throw new NotDifferentiable('non-constant exponent')
          return times(times(num(c), power(e.a, c - 1)), d(e.a))
        }
      }
      break
    }
    case 'fn': {
      const a = e.args[0]
      const da = d(a)
      if (isNum(da, 0) && e.args.every((x) => isNum(d(x), 0))) return num(0)
      switch (e.f) {
        case 'sqrt':
          return over(da, times(num(2), fn('sqrt', a)))
        case 'exp':
          return times(fn('exp', a), da)
        case 'log':
          return over(da, a)
        case 'log10':
          return over(da, times(a, num(Math.LN10)))
        case 'sin':
          return times(fn('cos', a), da)
        case 'cos':
          return neg(times(fn('sin', a), da))
        case 'tan':
          return over(da, power(fn('cos', a), 2))
        case 'asin':
          return over(da, fn('sqrt', sub(num(1), power(a, 2))))
        case 'acos':
          return neg(over(da, fn('sqrt', sub(num(1), power(a, 2)))))
        case 'atan':
          return over(da, add(num(1), power(a, 2)))
        default:
          throw new NotDifferentiable(`${e.f} is piecewise`)
      }
    }
  }
  throw new NotDifferentiable('unknown node')
}

/** Replaces symbols by expressions (inlining assignments) and constants by numbers. */
export function substitute(e: Expr, values: Map<string, Expr>): Expr {
  switch (e.k) {
    case 'sym':
      return values.get(e.n) ?? e
    case 'neg':
      return { k: 'neg', a: substitute(e.a, values) }
    case 'op':
      return { k: 'op', op: e.op, a: substitute(e.a, values), b: substitute(e.b, values) }
    case 'fn':
      return { k: 'fn', f: e.f, args: e.args.map((x) => substitute(x, values)) }
    default:
      return e
  }
}

export function nodeCount(e: Expr): number {
  switch (e.k) {
    case 'neg':
      return 1 + nodeCount(e.a)
    case 'op':
      return 1 + nodeCount(e.a) + nodeCount(e.b)
    case 'fn':
      return 1 + e.args.reduce((s, x) => s + nodeCount(x), 0)
    default:
      return 1
  }
}

export type Monotonicity = 'increasing' | 'decreasing' | 'constant' | 'unknown'

/** Sign of ∂e/∂v over the box, from the enclosure of the derivative. */
export function monotonicity(e: Expr, v: string, box: Map<string, Interval>, maxNodes: number): Monotonicity {
  let d: Expr
  try {
    d = differentiate(e, v)
  } catch (err) {
    if (err instanceof NotDifferentiable) return 'unknown'
    throw err
  }
  if (isNum(d, 0)) return 'constant'
  if (nodeCount(d) > maxNodes) return 'unknown'
  let r: Interval
  try {
    r = evalInterval(d, box)
  } catch (err) {
    if (err instanceof CalcError && err.code === 'domain-error') return 'unknown'
    throw err
  }
  if (r.lo >= 0 && r.hi === 0 && r.lo === 0) return 'constant'
  if (r.lo >= 0) return 'increasing'
  if (r.hi <= 0) return 'decreasing'
  return 'unknown'
}
