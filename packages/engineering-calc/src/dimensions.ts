import type { Dims } from '@ews/platform-sdk'
import type { Expr } from './ast'
import { CalcError } from './errors'
import { addDims, describeDims, DIMENSIONLESS, sameDims, scaleDims } from './units'

/**
 * Dimensional analysis over the canonical AST (mathematics.md §4). Returns the dimensions of the
 * expression or throws a `unit-error` naming the offending operation.
 */
export function dimensionsOf(expr: Expr, symbolDims: (name: string) => Dims | undefined): Dims {
  const walk = (e: Expr): Dims => {
    switch (e.k) {
      case 'num':
      case 'const':
        return DIMENSIONLESS
      case 'sym': {
        const d = symbolDims(e.n)
        if (!d) throw new CalcError('model', `“${e.n}” is not a declared parameter.`)
        return d
      }
      case 'neg':
        return walk(e.a)
      case 'op': {
        const a = walk(e.a)
        if (e.op === '^') {
          const exponent = constantValue(e.b)
          if (exponent === undefined) throw new CalcError('unit-error', 'An exponent must be a constant number (no parameters).')
          const result = scaleDims(a, exponent)
          if (result.some((d) => !Number.isInteger(d))) throw new CalcError('unit-error', `Raising ${describeDims(a)} to ${exponent} gives fractional dimensions.`)
          return result
        }
        const b = walk(e.b)
        if (e.op === '+' || e.op === '-') {
          if (!sameDims(a, b)) throw new CalcError('unit-error', `Cannot ${e.op === '+' ? 'add' : 'subtract'} ${describeDims(b)} ${e.op === '+' ? 'to' : 'from'} ${describeDims(a)}.`)
          return a
        }
        return addDims(a, b, e.op === '*' ? 1 : -1)
      }
      case 'fn': {
        const args = e.args.map(walk)
        switch (e.f) {
          case 'sqrt': {
            const r = scaleDims(args[0], 0.5)
            if (r.some((d) => !Number.isInteger(d))) throw new CalcError('unit-error', `sqrt of ${describeDims(args[0])} gives fractional dimensions.`)
            return r
          }
          case 'abs':
            return args[0]
          case 'min':
          case 'max':
            if (!args.every((d) => sameDims(d, args[0]))) throw new CalcError('unit-error', `${e.f} needs arguments of the same dimension.`)
            return args[0]
          case 'atan2':
            if (!sameDims(args[0], args[1])) throw new CalcError('unit-error', 'atan2 needs two arguments of the same dimension.')
            return DIMENSIONLESS
          default:
            if (!sameDims(args[0], DIMENSIONLESS)) throw new CalcError('unit-error', `${e.f} needs a dimensionless argument, not ${describeDims(args[0])}.`)
            return DIMENSIONLESS
        }
      }
    }
  }
  return walk(expr)
}

/** Value of an expression made only of numbers and constants (for exponents); undefined otherwise. */
export function constantValue(expr: Expr): number | undefined {
  switch (expr.k) {
    case 'num':
      return expr.v
    case 'const':
      return expr.n === 'pi' ? Math.PI : Math.E
    case 'neg': {
      const v = constantValue(expr.a)
      return v === undefined ? undefined : -v
    }
    case 'op': {
      const a = constantValue(expr.a)
      const b = constantValue(expr.b)
      if (a === undefined || b === undefined) return undefined
      return expr.op === '+' ? a + b : expr.op === '-' ? a - b : expr.op === '*' ? a * b : expr.op === '/' ? a / b : a ** b
    }
    default:
      return undefined
  }
}
