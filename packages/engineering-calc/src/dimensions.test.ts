import { describe, expect, it } from 'vitest'
import { validateModel, type CalculationModelDefinition } from './index'

/**
 * Dimensional-analysis corpus (roadmap R3: ≥ 50 relations, valid and invalid). Each row declares the units of
 * the symbols it uses and the unit of the output `y`; the engine must accept the valid rows and refuse the
 * invalid ones with a unit-error.
 */
const UNITS: Record<string, string> = {
  F: 'N', m: 'kg', a: 'm/s^2', v: 'm/s', t: 's', L: 'm', d: 'mm', A: 'mm^2', p: 'MPa', E: 'GPa', I: 'mm^4', T: 'N*m', w: 'rad/s',
  n: 'rpm', P: 'W', V: 'V', i: 'A', R: 'ohm', rho: 'kg/m^3', g: 'm/s^2', k: 'N/mm', x: 'mm', Q: 'L/min', th: 'deg', eta: '-', mu: '-', K: 'K', c: 'J/(kg*K)',
}

// Dimensional analysis cannot catch a missing dimensionless factor: T * n is a power although P = 2π T n.
const VALID: [string, string][] = [
  ['T * n', 'W'], ['rho * A', 'kg/m'],
  ['F / A', 'MPa'], ['m * a', 'N'], ['F * L', 'N*m'], ['T * w', 'W'], ['T * 2 * pi * n', 'W'], ['P / w', 'N*m'], ['v * t', 'm'], ['L / t', 'm/s'],
  ['v / t', 'm/s^2'], ['0.5 * m * v^2', 'J'], ['m * g * L', 'J'], ['F / k', 'mm'], ['k * x', 'N'], ['E * I / L^2', 'N'], ['pi^2 * E * I / L^2', 'kN'],
  ['p * A', 'N'], ['F * L * d / I', 'MPa'], ['sqrt(F / (rho * A))', 'm/s'], ['V / R', 'A'], ['V * i', 'W'], ['i^2 * R', 'W'], ['rho * Q', 'kg/s'],
  ['m * c * K', 'J'], ['sin(th) * F', 'N'], ['cos(th)^2 + sin(th)^2', '-'], ['mu * F', 'N'], ['eta * P', 'W'], ['F * v', 'W'], ['abs(F - m * g)', 'N'],
  ['min(F, m * a)', 'N'], ['max(L, d)', 'm'], ['exp(-t / t)', '-'], ['log(L / d)', '-'], ['atan2(x, d)', 'rad'], ['sqrt(A)', 'mm'],
  ['A^0.5 * d', 'mm^2'], ['(F / A) / E', '-'], ['T / (F * d)', '-'], ['2 * pi * n * t', '-'], ['L^3 / (E * I) * F', 'mm'], ['rho * g * L', 'Pa'],
]

const INVALID: [string, string, RegExp][] = [
  ['F + m', 'N', /add mass to force/],
  ['F - L', 'N', /subtract length from force/],
  ['L + t', 'm', /add time to length/],
  ['F * L', 'N', /gives energy or torque.*declared/],
  ['F / A', 'N', /gives pressure or stress/],
  ['m * a', 'J', /gives force/],
  ['sin(L)', '-', /dimensionless argument/],
  ['exp(t)', '-', /dimensionless argument/],
  ['log(F)', '-', /dimensionless argument/],
  ['cos(d)', '-', /dimensionless argument/],
  ['sqrt(L)', 'm', /fractional dimensions/],
  ['L^0.5', 'm', /fractional dimensions/],
  ['L^F', 'm', /constant number/],
  ['2^t', '-', /constant number/],
  ['min(F, L)', 'N', /same dimension/],
  ['max(t, v)', 's', /same dimension/],
  ['atan2(F, L)', 'rad', /same dimension/],
  ['T * L', 'W', /declared/],
  ['V * R', 'W', /declared/],
  ['p * E', 'MPa', /declared/],
  ['F / k', 'N', /gives length/],
  ['v * v', 'm/s', /declared/],
  ['abs(F) + L', 'N', /add length to force/],
  ['rho * L', 'kg/m', /declared/],
  ['m * c', 'J', /declared/],
]

function modelFor(expression: string, unit: string): CalculationModelDefinition {
  const used = [...new Set(expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])].filter((s) => UNITS[s] && !['pi', 'e', 'sin', 'cos', 'sqrt', 'exp', 'log', 'abs', 'min', 'max', 'atan2'].includes(s))
  return {
    id: 'corpus', revision: 1, name: 'corpus', grammar: 'ews-expr/1', basis: 'user-assertion', validationStatus: 'validated',
    parameters: [...used.map((s) => ({ symbol: s, name: s, role: 'input' as const, unit: UNITS[s] })), { symbol: 'y', name: 'y', role: 'output' as const, unit }],
    relations: [{ id: 'r', kind: 'assignment', expression: `y = ${expression}` }],
  }
}

describe('dimensional analysis corpus', () => {
  it('has at least 50 relations', () => {
    expect(VALID.length + INVALID.length).toBeGreaterThanOrEqual(50)
  })

  it.each(VALID)('accepts y = %s [%s]', (expression, unit) => {
    expect(validateModel(modelFor(expression, unit))).toEqual([])
  })

  it.each(INVALID)('refuses y = %s [%s]', (expression, unit, message) => {
    const problems = validateModel(modelFor(expression, unit))
    expect(problems).toHaveLength(1)
    expect(problems[0].code).toBe('unit-error')
    expect(problems[0].message).toMatch(message)
  })
})
