import { CadError, type CadErrorInfo } from '../errors'
import type { Expr, Parameter, Part } from '../model/types'
import { evaluate, parseExpression, referencedNames } from './expression'

export interface EvaluatedParameter {
  id: string
  name: string
  expression: string
  unit: Parameter['unit']
  value?: number
  error?: CadErrorInfo
  /** Names of parameters this one uses. */
  uses: string[]
}

export interface ParameterScope {
  values: Map<string, number>
  parameters: EvaluatedParameter[]
  /** Resolves a name for expression evaluation; throws a clear error for failed parameters. */
  lookup: (name: string) => number | undefined
}

/**
 * Evaluates the parameters of a part in dependency order. Cycles and failures are reported per
 * parameter; a parameter depending on a failed one fails too (with the cause).
 */
export function evaluateParameters(part: Pick<Part, 'parameters'>): ParameterScope {
  const byName = new Map(part.parameters.map((p) => [p.name, p]))
  const uses = new Map<string, string[]>()
  const parseErrors = new Map<string, CadErrorInfo>()
  for (const p of part.parameters) {
    try {
      uses.set(p.name, [...referencedNames(parseExpression(p.expression))])
    } catch (e) {
      uses.set(p.name, [])
      parseErrors.set(p.name, (e as CadError).toJSON())
    }
  }
  const values = new Map<string, number>()
  const errors = new Map<string, CadErrorInfo>(parseErrors)
  const state = new Map<string, 'visiting' | 'done'>()

  const visit = (name: string, stack: string[]): void => {
    if (state.get(name) === 'done') return
    if (state.get(name) === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(name)), name]
      for (const n of cycle) if (!errors.has(n)) errors.set(n, { code: 'cycle', message: `Circular parameter definition: ${cycle.join(' → ')}.`, details: { cycle } })
      return
    }
    state.set(name, 'visiting')
    const p = byName.get(name)!
    for (const dep of uses.get(name) ?? []) if (byName.has(dep)) visit(dep, [...stack, name])
    state.set(name, 'done')
    if (errors.has(name)) return
    const failedDep = (uses.get(name) ?? []).find((d) => errors.has(d))
    if (failedDep) {
      errors.set(name, { code: 'invalid-expression', message: `Depends on “${failedDep}”, which cannot be evaluated.`, details: { dependsOn: failedDep } })
      return
    }
    try {
      values.set(name, evaluate(p.expression, (n) => values.get(n)))
    } catch (e) {
      errors.set(name, e instanceof CadError ? e.toJSON() : { code: 'invalid-expression', message: String(e) })
    }
  }
  for (const p of part.parameters) visit(p.name, [])

  const parameters = part.parameters.map((p) => ({
    id: p.id,
    name: p.name,
    expression: p.expression,
    unit: p.unit,
    value: values.get(p.name),
    error: errors.get(p.name),
    uses: uses.get(p.name) ?? [],
  }))
  return {
    values,
    parameters,
    lookup: (name) => {
      if (values.has(name)) return values.get(name)
      if (errors.has(name)) throw new CadError('invalid-expression', `Parameter “${name}” cannot be evaluated: ${errors.get(name)!.message}`, { name })
      return undefined
    },
  }
}

/** Evaluates a feature or dimension value within a part's parameter scope. */
export function evaluateIn(scope: ParameterScope, expr: Expr): number {
  return evaluate(expr, scope.lookup)
}

/** Parameter names an Expr refers to (empty for literals or invalid expressions). */
export function namesIn(expr: Expr | undefined): string[] {
  if (typeof expr !== 'string') return []
  try {
    return [...referencedNames(parseExpression(expr))]
  } catch {
    return []
  }
}
