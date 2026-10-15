import { describe, expect, it } from 'vitest'
import v1 from './__fixtures__/manifest-v1.json'
import v2 from './__fixtures__/manifest-v2.json'
import { CalcError, canonicalJson, canonicalNumber, ERROR_TAXONOMY, evaluateModel, libraryModel, qualifyManifest, verifyManifest, type CalculationManifest, type CalculationModelDefinition } from './index'

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

  it('verifies stored v2 manifests (interval and point) written by the R3 engine', () => {
    const model = v2.model as unknown as CalculationModelDefinition
    for (const m of [v2.interval, v2.point] as unknown as CalculationManifest[]) {
      expect(m.manifestVersion).toBe(2)
      const r = verifyManifest(model, m)
      expect(r.reasons).toEqual([])
      expect(r.exactDigestMatch).toBeUndefined() // digests are compared only within one manifest version
    }
    const tampered = structuredClone(v2.interval) as unknown as { outputs: { symbol: string; bounds?: { max: number } }[] }
    tampered.outputs.find((o) => o.symbol === 'P_cr')!.bounds!.max *= 1.001
    expect(verifyManifest(model, tampered as unknown as CalculationManifest).ok).toBe(false)
  })

  it('refuses a tampered v1 manifest', () => {
    const m = structuredClone(v1.point) as unknown as CalculationManifest
    m.outputs = m.outputs.map((o) => (o.symbol === 'P_cr' ? { ...o, value: o.value * 1.01 } : o))
    expect(verifyManifest(R1_MODEL, m).ok).toBe(false)
  })

  it('writes v3 manifests and refuses unknown versions', () => {
    const m = evaluateModel(R1_MODEL, Object.fromEntries((v1.point.inputs as CalculationManifest['inputs']).map((i) => [i.symbol, i]))).manifest
    expect(m).toMatchObject({ manifestVersion: 3, digestSpec: 'ews-digest/1', engine: { version: '0.3.0' }, limits: { establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'validated' } })
    expect(verifyManifest(R1_MODEL, { ...m, manifestVersion: 4 as unknown as 3 })).toMatchObject({ ok: false, reasons: [expect.stringMatching(/version 4 is not supported/)] })
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

describe('C11 qualifications of stored manifests', () => {
  it('maps v1 vertex results to sampled ranges and downgrades sampled statuses to uncertain', () => {
    const q = qualifyManifest(v1.vertices as unknown as CalculationManifest)
    expect(q.manifestVersion).toBe(1)
    expect(q.outputs.find((o) => o.symbol === 'P_cr')!.range).toMatchObject({ kind: 'sampled-range', method: 'vertices' })
    expect((v1.vertices as unknown as { checks: { status: string }[] }).checks[0].status).toBe('satisfied') // as stored in v1
    expect(q.checks[0]).toMatchObject({ status: 'uncertain', statusBasis: 'sampled', nominalSatisfied: true })
    expect(q.validity.satisfied).toBe(false)
    expect(q.limits).toMatchObject({ establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'not-recorded' })
    const point = qualifyManifest(v1.point as unknown as CalculationManifest)
    expect(point.outputs[0].range).toEqual({ kind: 'point' })
    expect(point.checks[0]).toMatchObject({ status: 'satisfied', statusBasis: 'point' })
  })

  it('maps v2 bounds to bounds and the v2 inner range to a typed sampled range', () => {
    const q = qualifyManifest(v2.interval as unknown as CalculationManifest)
    expect(q.outputs.find((o) => o.symbol === 'P_cr')!.range).toMatchObject({ kind: 'bounds', quality: 'exact' })
    expect(q.checks[0]).toMatchObject({ status: 'satisfied', statusBasis: 'exact-bounds' })
  })

  it('passes v3 qualifications through unchanged and records what a manifest does not establish', () => {
    const m = evaluateModel(libraryModel('lib.column.euler-round'), Object.fromEntries((v1.point.inputs as CalculationManifest['inputs']).filter((i) => i.symbol !== 'sigma_y').map((i) => [i.symbol, { value: i.value, unit: i.unit }]).concat([['Sy', { value: 600, unit: 'MPa' }]])), { uncertainty: 'interval' }).manifest
    const q = qualifyManifest(m)
    expect(q.outputs).toEqual(m.outputs.map((o) => ({ symbol: o.symbol, unit: o.unit, value: o.value, range: o.range })))
    expect(q.limits).toEqual({ establishesModelValidity: false, establishesRequirementSatisfaction: false, modelValidationStatus: 'unvalidated', modelBasis: 'ai-hypothesis' })
  })

  it('refuses a v3 manifest whose result kind was changed', () => {
    const model = libraryModel('lib.column.euler-round')
    const inputs = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, min: 24, max: 26, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }
    const m = evaluateModel(model, inputs, { uncertainty: 'interval' }).manifest
    const relabelled = { ...m, outputs: m.outputs.map((o) => (o.range.kind === 'bounds' ? { ...o, range: { ...o.range, quality: 'enclosure' as const } } : o)) }
    expect(verifyManifest(model, relabelled).reasons.join()).toMatch(/result kind/)
  })
})
