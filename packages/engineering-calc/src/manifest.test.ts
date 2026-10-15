import { describe, expect, it } from 'vitest'
import v1 from './__fixtures__/manifest-v1.json'
import { CalcError, canonicalJson, canonicalNumber, ERROR_TAXONOMY, evaluateModel, libraryModel, verifyManifest, type CalculationManifest, type CalculationModelDefinition } from './index'

/** The R1 buckling model exactly as stored with the v1 fixture (generated with the R1 engine, commit b217a3e). */
const R1_MODEL: CalculationModelDefinition = {
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

describe('manifest versioning', () => {
  it('verifies stored v1 manifests (point and vertex mode) written by the R1 engine', () => {
    for (const m of [v1.point, v1.vertices] as unknown as CalculationManifest[]) {
      expect(m.manifestVersion).toBeUndefined()
      expect(m.engine.version).toBe('0.1.0')
      const r = verifyManifest(R1_MODEL, m)
      expect(r.reasons).toEqual([])
      expect(r.ok).toBe(true)
    }
  })

  it('refuses a tampered v1 manifest', () => {
    const m = structuredClone(v1.point) as unknown as CalculationManifest
    m.outputs = m.outputs.map((o) => (o.symbol === 'P_cr' ? { ...o, value: o.value * 1.01 } : o))
    expect(verifyManifest(R1_MODEL, m).ok).toBe(false)
  })

  it('writes v2 manifests and refuses unknown versions', () => {
    const m = evaluateModel(R1_MODEL, Object.fromEntries((v1.point.inputs as CalculationManifest['inputs']).map((i) => [i.symbol, i]))).manifest
    expect(m).toMatchObject({ manifestVersion: 2, digestSpec: 'ews-digest/1', engine: { version: '0.2.0' } })
    expect(verifyManifest(R1_MODEL, { ...m, manifestVersion: 3 as unknown as 2 })).toMatchObject({ ok: false, reasons: [expect.stringMatching(/version 3 is not supported/)] })
  })

  it('verifies across platforms with a relative tolerance: last-digit differences pass, real differences fail', () => {
    const model = libraryModel('lib.column.euler-round')
    const inputs = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }
    const m = evaluateModel(model, inputs).manifest
    // Simulates another JavaScript engine whose Math functions differ in the last bits.
    const otherRuntime = { ...m, outputs: m.outputs.map((o) => ({ ...o, value: o.value * (1 + 4e-16) })), outputDigest: 'sha256:other-runtime' }
    const r = verifyManifest(model, otherRuntime)
    expect(r.ok).toBe(true)
    expect(r.exactDigestMatch).toBe(false)
    const fabricated = { ...m, outputs: m.outputs.map((o) => ({ ...o, value: o.value * (1 + 1e-6) })) }
    expect(verifyManifest(model, fabricated).ok).toBe(false)
  })

  it('canonical digests: sorted keys, -0 normalized, 12 significant digits for computed numbers', () => {
    expect(canonicalJson({ b: 1, a: [-0, 2] })).toBe('{"a":[0,2],"b":1}')
    expect(canonicalNumber(0.1 + 0.2)).toBe(0.3)
    expect(canonicalNumber(-1e-30 * 0)).toBe(0)
    expect(() => canonicalJson({ x: Number.NaN })).toThrow(/non-finite/)
  })
})

describe('error taxonomy', () => {
  it('classifies every code with retryability, who fixes it and the tool error code', () => {
    for (const [code, cls] of Object.entries(ERROR_TAXONOMY)) {
      expect(cls.meaning.length).toBeGreaterThan(5)
      expect(new CalcError(code as CalcError['code'], 'x').retryable).toBe(cls.retryable)
    }
    expect(ERROR_TAXONOMY.timeout.retryable).toBe(true)
    expect(ERROR_TAXONOMY['unit-error'].toolCode).toBe('unit-error')
  })

  it.each([
    ['grammar', () => evaluateModel({ ...R1_MODEL, validity: { text: 'v', conditions: ['lambda >= 2 d'] } }, {})],
    ['model', () => evaluateModel({ ...R1_MODEL, relations: R1_MODEL.relations.slice(1) }, {})],
    ['input', () => evaluateModel(R1_MODEL, {})],
    ['unit-error', () => evaluateModel(R1_MODEL, { ...inputsFrom(), d: { value: 1, unit: 'kN' } })],
    ['domain-error', () => evaluateModel(R1_MODEL, { ...inputsFrom(), d: { value: 0, unit: 'mm' } })],
    ['resource-limit', () => evaluateModel(R1_MODEL, inputsFrom(), { maxOperations: 5 })],
  ] as const)('%s', (code, run) => {
    try {
      run()
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      expect((e as CalcError).code).toBe(code)
      expect((e as CalcError).toJSON()).toMatchObject({ code, retryable: ERROR_TAXONOMY[code].retryable })
    }
  })

  it('refuses unknown inputs and values outside their own range', () => {
    expect(() => evaluateModel(R1_MODEL, { ...inputsFrom(), q: { value: 1, unit: '-' } })).toThrow(/not a parameter/)
    expect(() => evaluateModel(R1_MODEL, { ...inputsFrom(), d: { value: 30, min: 24, max: 26, unit: 'mm' } })).toThrow(/outside its range/)
  })
})

function inputsFrom() {
  return Object.fromEntries((v1.point.inputs as CalculationManifest['inputs']).map((i) => [i.symbol, { value: i.value, unit: i.unit }]))
}
