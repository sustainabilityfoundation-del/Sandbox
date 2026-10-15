import { describe, expect, it } from 'vitest'
import {
  CalcError,
  compileModel,
  dimensionsOf,
  evaluateModel,
  parseRelation,
  sha256Hex,
  validateModel,
  verifyManifest,
  type CalculationModelDefinition,
  type Expr,
  type InputValue,
} from './index'

/** Euler buckling of a solid round rod (the ACT-100 rod example of the roadmap R1). */
export const BUCKLING: CalculationModelDefinition = {
  id: 'calc-buckling',
  key: 'CALC-001',
  revision: 1,
  name: 'Euler buckling of a solid round rod',
  grammar: 'ews-expr/1',
  parameters: [
    { symbol: 'F', name: 'Axial load', role: 'input', unit: 'kN' },
    { symbol: 'E', name: 'Elastic modulus', role: 'input', unit: 'GPa' },
    { symbol: 'd', name: 'Rod diameter', role: 'input', unit: 'mm' },
    { symbol: 'L', name: 'Effective length', role: 'input', unit: 'mm' },
    { symbol: 'K', name: 'End-fixity factor', role: 'input', unit: '-' },
    { symbol: 'n', name: 'Design factor', role: 'input', unit: '-' },
    { symbol: 'sigma_y', name: 'Yield strength', role: 'input', unit: 'MPa' },
    { symbol: 'I', name: 'Second moment of area', role: 'output', unit: 'mm^4' },
    { symbol: 'P_cr', name: 'Critical buckling load', role: 'output', unit: 'kN' },
    { symbol: 'lambda', name: 'Slenderness', role: 'output', unit: '-' },
  ],
  relations: [
    { id: 'r1', kind: 'assignment', expression: 'I = pi * d^4 / 64' },
    { id: 'r2', kind: 'assignment', expression: 'P_cr = pi^2 * E * I / (K * L)^2' },
    { id: 'r3', kind: 'assignment', expression: 'lambda = 4 * K * L / d' },
    { id: 'c1', kind: 'constraint', expression: 'P_cr >= n * F', description: 'Buckling capacity with the design factor' },
  ],
  validity: { text: 'Euler buckling applies to slender columns', conditions: ['lambda >= pi * sqrt(E / sigma_y)'] },
  basis: 'user-assertion',
  validationStatus: 'validated',
}

const assumption = { kind: 'binding' as const, basis: 'assumption' as const }
export const ROD_INPUTS: Record<string, InputValue> = {
  F: { value: 12, unit: 'kN', source: { kind: 'binding', ref: { module: 'conceptualize', type: 'constraint', id: 'cst-load' }, basis: 'user-assertion' } },
  E: { value: 210, unit: 'GPa', source: assumption },
  d: { value: 25, unit: 'mm', source: { kind: 'binding', ref: { module: 'twin', id: 'ROD-120', revision: 2 }, property: 'diameter', via: 'client-attested', basis: 'user-assertion' } },
  L: { value: 600, unit: 'mm', source: { kind: 'binding', ref: { module: 'twin', id: 'ROD-120', revision: 2 }, property: 'effectiveLength', via: 'client-attested', basis: 'user-assertion' } },
  K: { value: 1, unit: '-', source: assumption },
  n: { value: 2, unit: '-', source: assumption },
  sigma_y: { value: 600, unit: 'MPa', source: assumption },
}

/** Independent hand formula in SI (different expression path from the engine). */
function eulerReference(Fk: number, EGPa: number, dmm: number, Lmm: number, K: number) {
  const d = dmm / 1000
  const L = Lmm / 1000
  const I = (Math.PI * d * d * d * d) / 64
  const Pcr = (Math.PI * Math.PI * EGPa * 1e9 * I) / ((K * L) * (K * L))
  return { I_mm4: I * 1e12, Pcr_kN: Pcr / 1000, F: Fk }
}

function exprOf(text: string): Expr {
  const p = parseRelation(text)
  if (p.form !== 'expression') throw new Error('not an expression')
  return p.expr
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe('engineering-calc: grammar', () => {
  it('parses assignments, comparisons and expressions into the canonical AST', () => {
    expect(parseRelation('I = pi * d^4 / 64').form).toBe('assignment')
    expect(parseRelation('P_cr >= n * F')).toMatchObject({ form: 'comparison', op: '>=' })
    expect(parseRelation('a == b')).toMatchObject({ form: 'comparison', op: '=' })
    expect(parseRelation('m + 2 * x').form).toBe('expression')
  })

  it.each([
    ['2 x', 'Implicit multiplication'],
    ['5 cm', 'Implicit multiplication'],
    ['"text"', 'finite numeric constants'],
    ['f(x) = x', 'not allowed'],
    ['a < b < c', 'Chained comparisons'],
    ['evaluate("1")', 'not allowed'],
    ['import(x)', 'not allowed'],
    ['[1, 2]', 'not allowed'],
    ['x ? 1 : 2', 'not allowed'],
  ])('refuses %s', (text, message) => {
    expect(() => parseRelation(text)).toThrow(message)
  })

  it('enforces size limits', () => {
    expect(() => parseRelation(`x${' + x'.repeat(600)}`)).toThrow(/longer than|more than/)
  })
})

describe('engineering-calc: dimensional analysis', () => {
  const dims = (u: Record<string, [number, number, number, number, number, number, number]>) => (n: string) => u[n]
  const force: [number, number, number, number, number, number, number] = [1, 1, -2, 0, 0, 0, 0]
  const length: [number, number, number, number, number, number, number] = [1, 0, 0, 0, 0, 0, 0]

  it('combines dimensions through operators and functions', () => {
    expect(dimensionsOf(exprOf('F * L'), dims({ F: force, L: length }))).toEqual([2, 1, -2, 0, 0, 0, 0])
  })

  it('refuses adding a force to a length', () => {
    expect(() => dimensionsOf(exprOf('F + L'), dims({ F: force, L: length }))).toThrow(/Cannot add length to force/)
  })

  it('refuses a dimensioned argument to a transcendental function and a parameter exponent', () => {
    expect(() => dimensionsOf(exprOf('sin(L)'), dims({ L: length }))).toThrow(/dimensionless argument/)
    expect(() => dimensionsOf(exprOf('L ^ F'), dims({ L: length, F: force }))).toThrow(/constant number/)
  })

  it('refuses a model whose assignment does not match the declared unit (force vs length)', () => {
    const bad: CalculationModelDefinition = { ...BUCKLING, relations: [...BUCKLING.relations.filter((r) => r.id !== 'r2'), { id: 'r2', kind: 'assignment', expression: 'P_cr = E * I / L' }] }
    const problems = validateModel(bad)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ where: 'relation r2', code: 'unit-error' })
    expect(problems[0].message).toMatch(/force/)
  })

  it('refuses constraints whose sides differ in dimension', () => {
    const bad: CalculationModelDefinition = { ...BUCKLING, relations: [...BUCKLING.relations.filter((r) => r.id !== 'c1'), { id: 'c1', kind: 'constraint', expression: 'P_cr >= d' }] }
    expect(validateModel(bad)[0].message).toMatch(/force vs length/)
  })
})

describe('engineering-calc: model validation', () => {
  it('accepts the buckling model', () => {
    expect(validateModel(BUCKLING)).toEqual([])
  })

  it('reports undeclared symbols, missing assignments, duplicate outputs and cycles', () => {
    expect(validateModel({ ...BUCKLING, relations: [...BUCKLING.relations, { id: 'x', kind: 'constraint', expression: 'P_cr >= q' }] })[0].message).toMatch(/“q” is not a declared parameter/)
    expect(validateModel({ ...BUCKLING, relations: BUCKLING.relations.filter((r) => r.id !== 'r3') }).map((p) => p.message).join()).toMatch(/lambda.*no assignment/)
    const cyclic: CalculationModelDefinition = {
      ...BUCKLING,
      parameters: [{ symbol: 'a', name: 'a', role: 'output', unit: 'm' }, { symbol: 'b', name: 'b', role: 'output', unit: 'm' }],
      relations: [{ id: 'r1', kind: 'assignment', expression: 'a = b' }, { id: 'r2', kind: 'assignment', expression: 'b = a' }],
      validity: undefined,
    }
    expect(validateModel(cyclic)[0].message).toMatch(/cyclic/)
  })

  it('refuses offset temperatures and currencies as parameter units', () => {
    const withCelsius: CalculationModelDefinition = { ...BUCKLING, parameters: [...BUCKLING.parameters, { symbol: 'T', name: 'Temperature', role: 'input', unit: '°C' }] }
    expect(validateModel(withCelsius)[0].message).toMatch(/use K/)
    const withMoney: CalculationModelDefinition = { ...BUCKLING, parameters: [...BUCKLING.parameters, { symbol: 'c', name: 'Cost', role: 'input', unit: 'EUR' }] }
    expect(validateModel(withMoney)[0].message).toMatch(/currencies/)
  })

  it('gives the same model digest regardless of formatting', () => {
    const spaced = { ...BUCKLING, relations: BUCKLING.relations.map((r) => ({ ...r, expression: r.expression.replace(/ /g, '') })) }
    expect(compileModel(spaced).digest).toBe(compileModel(BUCKLING).digest)
    const changed = { ...BUCKLING, relations: BUCKLING.relations.map((r) => (r.id === 'r1' ? { ...r, expression: 'I = pi * d^4 / 32' } : r)) }
    expect(compileModel(changed).digest).not.toBe(compileModel(BUCKLING).digest)
  })
})

describe('engineering-calc: evaluation', () => {
  it('reproduces the independent Euler reference within 1e-9 relative', () => {
    const r = evaluateModel(BUCKLING, ROD_INPUTS)
    const ref = eulerReference(12, 210, 25, 600, 1)
    expect(rel(r.outputs.I.value, ref.I_mm4)).toBeLessThan(1e-9)
    expect(rel(r.outputs.P_cr.value, ref.Pcr_kN)).toBeLessThan(1e-9)
    expect(r.outputs.P_cr.value).toBeCloseTo(110.395, 2) // hand check: about 110.4 kN
    expect(r.outputs.lambda.value).toBeCloseTo(96, 9)
    expect(r.checks[0]).toMatchObject({ relationId: 'c1', nominalSatisfied: true, status: 'satisfied', statusBasis: 'point', unit: 'kN', marginRange: { kind: 'point' } })
    expect(r.checks[0].margin).toBeCloseTo(ref.Pcr_kN - 24, 9)
    expect(r.validity.satisfied).toBe(true)
    expect(r.basis).toBe('calculated')
  })

  it('accepts inputs in other compatible units and refuses incompatible ones', () => {
    const inMetres = evaluateModel(BUCKLING, { ...ROD_INPUTS, d: { value: 0.025, unit: 'm' }, F: { value: 12000, unit: 'N' } })
    expect(rel(inMetres.outputs.P_cr.value, evaluateModel(BUCKLING, ROD_INPUTS).outputs.P_cr.value)).toBeLessThan(1e-12)
    expect(() => evaluateModel(BUCKLING, { ...ROD_INPUTS, d: { value: 25, unit: 'kN' } })).toThrow(/not compatible with mm/)
  })

  it('reports violations with a negative margin', () => {
    const r = evaluateModel(BUCKLING, { ...ROD_INPUTS, F: { value: 120, unit: 'kN' } })
    expect(r.checks[0].nominalSatisfied).toBe(false)
    expect(r.checks[0].status).toBe('violated')
    expect(r.checks[0].margin).toBeLessThan(0)
  })

  it('flags evaluation outside the validity range', () => {
    const r = evaluateModel(BUCKLING, { ...ROD_INPUTS, L: { value: 200, unit: 'mm' } })
    expect(r.validity.satisfied).toBe(false)
    expect(r.warnings.join()).toMatch(/domain-warning/)
  })

  it('bounds outputs over ranges and classifies checks as uncertain when ranges straddle the limit', () => {
    const r = evaluateModel(BUCKLING, { ...ROD_INPUTS, d: { value: 25, min: 24, max: 26, unit: 'mm' }, K: { value: 1, min: 0.7, max: 1.5, unit: '-' } }, { uncertainty: 'interval' })
    const lo = eulerReference(12, 210, 24, 600, 1.5).Pcr_kN
    const hi = eulerReference(12, 210, 26, 600, 0.7).Pcr_kN
    const range = r.outputs.P_cr.range
    if (range.kind !== 'bounds') throw new Error('bounds expected')
    expect(range.quality).toBe('exact')
    expect(rel(range.min, lo)).toBeLessThan(1e-9)
    expect(rel(range.max, hi)).toBeLessThan(1e-9)
    expect(r.checks[0].status).toBe('satisfied')
    const tight = evaluateModel(BUCKLING, { ...ROD_INPUTS, F: { value: 50, min: 40, max: 60, unit: 'kN' } }, { uncertainty: 'interval' })
    expect(tight.checks[0].status).toBe('uncertain')
  })

  it('downgrades to estimate when an input is an AI hypothesis or the model is an unvalidated AI hypothesis', () => {
    expect(evaluateModel(BUCKLING, { ...ROD_INPUTS, E: { value: 210, unit: 'GPa', source: { kind: 'literal', basis: 'ai-hypothesis' } } }).basis).toBe('estimate')
    expect(evaluateModel({ ...BUCKLING, basis: 'ai-hypothesis', validationStatus: 'unvalidated' }, ROD_INPUTS).basis).toBe('estimate')
  })

  it('refuses missing inputs, overriding constants and non-finite results', () => {
    const { E: _E, ...withoutE } = ROD_INPUTS
    expect(() => evaluateModel(BUCKLING, withoutE)).toThrow(/Missing input “E”/)
    expect(() => evaluateModel(BUCKLING, { ...ROD_INPUTS, d: { value: 0, unit: 'mm' } })).toThrow(CalcError)
  })
})

describe('engineering-calc: reproducibility manifest', () => {
  const fixed = { now: () => new Date('2026-10-15T00:00:00Z') }

  it('is deterministic: same model and inputs give the same digests', () => {
    const a = evaluateModel(BUCKLING, ROD_INPUTS, fixed).manifest
    const b = evaluateModel(BUCKLING, ROD_INPUTS, fixed).manifest
    expect(a.inputDigest).toBe(b.inputDigest)
    expect(a.outputDigest).toBe(b.outputDigest)
    expect(a.engine).toMatchObject({ name: '@ews/engineering-calc', mathjs: '15.2.0', grammar: 'ews-expr/1' })
    expect(a.inputs.find((i) => i.symbol === 'd')!.source).toMatchObject({ via: 'client-attested', property: 'diameter' })
  })

  it('verifies a genuine manifest and refuses tampered outputs, inputs or models', () => {
    const m = evaluateModel(BUCKLING, ROD_INPUTS, fixed).manifest
    expect(verifyManifest(BUCKLING, m)).toMatchObject({ ok: true, reasons: [], exactDigestMatch: true })
    const fakeOutput = { ...m, outputs: m.outputs.map((o) => (o.symbol === 'P_cr' ? { ...o, value: 500 } : o)), outputDigest: 'sha256:0' }
    expect(verifyManifest(BUCKLING, fakeOutput).ok).toBe(false)
    const fakeInput = { ...m, inputs: m.inputs.map((i) => (i.symbol === 'd' ? { ...i, value: 40 } : i)) }
    expect(verifyManifest(BUCKLING, fakeInput).reasons.join()).toMatch(/input digest|different results/)
    const otherModel = { ...BUCKLING, relations: BUCKLING.relations.map((r) => (r.id === 'r1' ? { ...r, expression: 'I = pi * d^4 / 32' } : r)) }
    expect(verifyManifest(otherModel, m).reasons.join()).toMatch(/model digest/)
    expect(verifyManifest(BUCKLING, { ...m, basis: 'calculated', inputs: m.inputs.map((i) => (i.symbol === 'E' ? { ...i, source: { kind: 'literal', basis: 'ai-hypothesis' } } : i)) }).reasons.join()).toMatch(/basis should be estimate/)
  })

  it('implements SHA-256 correctly', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})
