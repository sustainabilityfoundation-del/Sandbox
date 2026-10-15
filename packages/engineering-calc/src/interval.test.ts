import { describe, expect, it } from 'vitest'
import { CalcError, differentiate, evalInterval, evaluateModel, libraryModel, monotonicity, parseRelation, type CalculationModelDefinition, type Expr, type ResultRange } from './index'

const expr = (text: string): Expr => {
  const p = parseRelation(text)
  if (p.form !== 'expression') throw new Error('expression expected')
  return p.expr
}
const box = (o: Record<string, [number, number]>) => new Map(Object.entries(o).map(([k, [lo, hi]]) => [k, { lo, hi }]))
const evalAt = (e: Expr, env: Record<string, number>): number => {
  // independent reference: JavaScript evaluation of the same text
  const f = new Function(...Object.keys(env), 'const {sqrt,sin,cos,tan,exp,log,abs,min,max,atan,asin,acos,atan2,PI:pi,E:e}=Math;return ' + text(e))
  return f(...Object.values(env))
}
function text(e: Expr): string {
  switch (e.k) {
    case 'num':
      return `(${e.v})`
    case 'sym':
    case 'const':
      return e.n
    case 'neg':
      return `(-${text(e.a)})`
    case 'op':
      return e.op === '^' ? `(${text(e.a)}**${text(e.b)})` : `(${text(e.a)}${e.op}${text(e.b)})`
    case 'fn':
      return `${e.f}(${e.args.map(text).join(',')})`
  }
}

describe('interval arithmetic (enclosures)', () => {
  it.each([
    ['x + y', { x: [1, 2], y: [3, 5] }, [4, 7]],
    ['x - y', { x: [1, 2], y: [3, 5] }, [-4, -1]],
    ['x * y', { x: [-1, 2], y: [3, 5] }, [-5, 10]],
    ['x / y', { x: [1, 2], y: [4, 8] }, [0.125, 0.5]],
    ['x ^ 2', { x: [-3, 2] }, [0, 9]],
    ['x ^ 3', { x: [-3, 2] }, [-27, 8]],
    ['sqrt(x)', { x: [4, 9] }, [2, 3]],
    ['abs(x)', { x: [-3, 2] }, [0, 3]],
    ['sin(x)', { x: [0, Math.PI] }, [0, 1]],
    ['cos(x)', { x: [0, Math.PI] }, [-1, 1]],
    ['max(x, y)', { x: [1, 4], y: [2, 3] }, [2, 4]],
  ] as const)('%s over %j', (t, b, [lo, hi]) => {
    const r = evalInterval(expr(t), box(b as unknown as Record<string, [number, number]>))
    expect(r.lo).toBeCloseTo(lo, 12)
    expect(r.hi).toBeCloseTo(hi, 12)
  })

  it('returns an unbounded enclosure when a divisor range contains zero, and refuses domain violations', () => {
    expect(evalInterval(expr('1 / x'), box({ x: [-1, 1] }))).toEqual({ lo: -Infinity, hi: Infinity })
    expect(() => evalInterval(expr('sqrt(x)'), box({ x: [-1, 1] }))).toThrow(/negative/)
    expect(() => evalInterval(expr('log(x)'), box({ x: [0, 1] }))).toThrow(/zero or negative/)
  })

  it('encloses the true range even with repeated variables (dependency problem)', () => {
    const r = evalInterval(expr('x * (1 - x)'), box({ x: [0, 1] }))
    expect(r.lo).toBeLessThanOrEqual(0)
    expect(r.hi).toBeGreaterThanOrEqual(0.25) // true range [0, 0.25]; the enclosure [0, 1] is wider
  })
})

describe('symbolic derivatives and monotonicity', () => {
  it.each(['x^3 + 2*x', 'sin(x) * x', 'sqrt(x) / (1 + x^2)', 'exp(-x) * log(x)', 'atan(x) - x^2', 'pi * x^4 / 64'])('d/dx %s agrees with a central difference', (t) => {
    const e = expr(t)
    const d = differentiate(e, 'x')
    for (const x of [0.3, 1.1, 2.7]) {
      const h = 1e-6
      const numeric = (evalAt(e, { x: x + h }) - evalAt(e, { x: x - h })) / (2 * h)
      expect(evalAt(d, { x })).toBeCloseTo(numeric, 5)
    }
  })

  it('proves monotonicity from the derivative’s sign, including repeated variables', () => {
    expect(monotonicity(expr('x + x^3'), 'x', box({ x: [-2, 2] }), 1000)).toBe('increasing')
    expect(monotonicity(expr('1 / x'), 'x', box({ x: [1, 2] }), 1000)).toBe('decreasing')
    expect(monotonicity(expr('(x - 1)^2'), 'x', box({ x: [0, 3] }), 1000)).toBe('unknown')
    expect(monotonicity(expr('abs(x)'), 'x', box({ x: [1, 2] }), 1000)).toBe('unknown') // piecewise: not differentiated
    expect(monotonicity(expr('y * 2'), 'x', box({ x: [1, 2], y: [1, 1] }), 1000)).toBe('constant')
  })
})

/** One-input model with an optional constraint, for the C11 model-level tests. */
function model(expression: string, constraint?: string): CalculationModelDefinition {
  return {
    id: 'm', revision: 1, name: expression, grammar: 'ews-expr/1', basis: 'user-assertion', validationStatus: 'validated',
    parameters: [
      { symbol: 'x', name: 'x', role: 'input', unit: '-' },
      { symbol: 'y', name: 'y', role: 'output', unit: '-' },
    ],
    relations: [{ id: 'r1', kind: 'assignment', expression: `y = ${expression}` }, ...(constraint ? [{ id: 'c1', kind: 'constraint' as const, expression: constraint }] : [])],
  }
}
const bounds = (r: ResultRange) => {
  if (r.kind !== 'bounds') throw new Error(`bounds expected, got ${r.kind}`)
  return r
}

describe('C11: result kinds', () => {
  it('labels point evaluations as points', () => {
    const r = evaluateModel(model('x * (1 - x)', 'y <= 0.2'), { x: { value: 0.2, unit: '-' } })
    expect(r.outputs.y.range).toEqual({ kind: 'point' })
    expect(r.checks[0]).toMatchObject({ status: 'satisfied', statusBasis: 'point', nominalSatisfied: true, marginRange: { kind: 'point' } })
    expect(r.validity.over).toBe('point')
    expect(r.manifest).toMatchObject({ manifestVersion: 3, limits: { establishesModelValidity: false, establishesRequirementSatisfaction: false } })
  })

  it('y = x(1 − x) over [0, 1]: the interior maximum 0.25 is not missed, even where vertex sampling misses it', () => {
    // Nominal 0.2: the samples are x = 0, 1 (y = 0) and x = 0.2 (y = 0.16); the true maximum 0.25 is at x = 0.5.
    const r = evaluateModel(model('x * (1 - x)', 'y <= 0.2'), { x: { value: 0.2, min: 0, max: 1, unit: '-' } }, { uncertainty: 'interval' })
    const b = bounds(r.outputs.y.range)
    expect(b.quality).toBe('enclosure')
    expect(b.max).toBeGreaterThanOrEqual(0.25) // the bound covers the interior maximum
    expect(b.min).toBeLessThanOrEqual(0)
    // The sampled values are typed separately, never as bounds, and here they miss the maximum.
    expect(b.sampled).toMatchObject({ kind: 'sampled-range', method: 'vertices-and-nominal', samples: 3 })
    expect(b.sampled!.max).toBeCloseTo(0.16, 12)
    expect(b.sampled!.max).toBeLessThan(0.25)
    // y ≤ 0.2 is false in truth for x near 0.5; it holds at the nominal point and at every sample.
    expect(r.checks[0].nominalSatisfied).toBe(true)
    expect(['violated', 'uncertain']).toContain(r.checks[0].status)
    expect(r.checks[0].status).not.toBe('satisfied')
    expect(r.checks[0].statusBasis).toBe('enclosure')
    expect(r.checks[0].marginRange).toMatchObject({ kind: 'bounds', quality: 'enclosure' })
  })

  it('a constraint that holds in truth but cannot be proven with an enclosure stays uncertain, never satisfied', () => {
    const r = evaluateModel(model('x * (1 - x)', 'y <= 0.3'), { x: { value: 0.5, min: 0, max: 1, unit: '-' } }, { uncertainty: 'interval' })
    expect(r.checks[0].status).toBe('uncertain')
  })

  it('a constraint proven over the whole range with exact bounds is satisfied, and violated when it fails everywhere', () => {
    const ok = evaluateModel(model('x^3 + x', 'y <= 3'), { x: { value: 0.5, min: 0, max: 1, unit: '-' } }, { uncertainty: 'interval' })
    expect(bounds(ok.outputs.y.range)).toMatchObject({ quality: 'exact', min: 0, max: 2 })
    expect(bounds(ok.outputs.y.range).sampled).toBeUndefined()
    expect(ok.checks[0]).toMatchObject({ status: 'satisfied', statusBasis: 'exact-bounds' })
    const bad = evaluateModel(model('x^3 + x', 'y >= 5'), { x: { value: 0.5, min: 0, max: 1, unit: '-' } }, { uncertainty: 'interval' })
    expect(bad.checks[0]).toMatchObject({ status: 'violated', statusBasis: 'exact-bounds' })
  })

  it('a singularity in the range (1/(x − 0.5) over [0, 1]) is a domain error, not a finite bound', () => {
    let err: unknown
    try {
      evaluateModel(model('1 / (x - 0.5)'), { x: { value: 0.2, min: 0, max: 1, unit: '-' } }, { uncertainty: 'interval' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CalcError)
    expect(err).toMatchObject({ code: 'domain-error', details: { reason: 'singularity', symbol: 'y' } })
    // At a point away from the singularity the value is fine; at the singular point it is refused.
    expect(evaluateModel(model('1 / (x - 0.5)'), { x: { value: 0.2, unit: '-' } }).outputs.y.value).toBeCloseTo(-1 / 0.3, 12)
    expect(() => evaluateModel(model('1 / (x - 0.5)'), { x: { value: 0.5, unit: '-' } })).toThrow(/not a finite number/)
    // A range that stays clear of the singularity has finite bounds (monotonic: exact).
    expect(bounds(evaluateModel(model('1 / (x - 0.5)'), { x: { value: 0.8, min: 0.6, max: 1, unit: '-' } }, { uncertainty: 'interval' }).outputs.y.range).quality).toBe('exact')
  })

  it('an invalid domain (sqrt of a range reaching negative values, log at zero) is a domain error', () => {
    expect(() => evaluateModel(model('sqrt(x - 2)'), { x: { value: 2.5, min: 0, max: 3, unit: '-' } }, { uncertainty: 'interval' })).toThrow(expect.objectContaining({ code: 'domain-error' }))
    expect(() => evaluateModel(model('sqrt(x - 2)'), { x: { value: 1, unit: '-' } })).toThrow(expect.objectContaining({ code: 'domain-error' }))
    expect(() => evaluateModel(model('log(x)'), { x: { value: 0.5, min: 0, max: 1, unit: '-' } }, { uncertainty: 'interval' })).toThrow(expect.objectContaining({ code: 'domain-error' }))
  })

  it('no longer offers vertex sampling as an evaluation mode', () => {
    expect(() => evaluateModel(model('x'), { x: { value: 1, min: 0, max: 2, unit: '-' } }, { uncertainty: 'interval-vertices' as never })).toThrow(/no longer offered/)
  })
})

describe('interval mode on a library model', () => {
  const buckling = libraryModel('lib.column.euler-round')
  const nominal = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }
  const euler = (dmm: number, Lmm: number, K: number, EGPa: number) => (Math.PI ** 2 * EGPa * 1e9 * ((Math.PI * (dmm / 1000) ** 4) / 64)) / (K * Lmm / 1000) ** 2 / 1000

  it('gives exact bounds for relations proven monotonic in every ranged input', () => {
    const r = evaluateModel(buckling, { ...nominal, d: { value: 25, min: 24, max: 26, unit: 'mm' }, K: { value: 1, min: 0.7, max: 1.5, unit: '-' }, E: { value: 210, min: 200, max: 220, unit: 'GPa' } }, { uncertainty: 'interval' })
    const b = bounds(r.outputs.P_cr.range)
    expect(b.quality).toBe('exact')
    expect(Math.abs(b.min - euler(24, 600, 1.5, 200)) / b.min).toBeLessThan(1e-12)
    expect(Math.abs(b.max - euler(26, 600, 0.7, 220)) / b.max).toBeLessThan(1e-12)
    expect(r.checks[0]).toMatchObject({ status: 'satisfied', statusBasis: 'exact-bounds', marginRange: { kind: 'bounds', quality: 'exact' } })
    expect(r.manifest).toMatchObject({ manifestVersion: 3, uncertainty: 'interval', digestSpec: 'ews-digest/1' })
  })

  it('classifies a constraint as uncertain when the margin range straddles zero, and violated when it is negative everywhere', () => {
    const r = evaluateModel(buckling, { ...nominal, F: { value: 50, min: 40, max: 60, unit: 'kN' } }, { uncertainty: 'interval' })
    expect(r.checks[0].status).toBe('uncertain')
    const m = bounds(r.checks[0].marginRange)
    expect(m.min).toBeLessThan(0)
    expect(m.max).toBeGreaterThan(0)
    const v = evaluateModel(buckling, { ...nominal, F: { value: 100, min: 90, max: 120, unit: 'kN' } }, { uncertainty: 'interval' })
    expect(v.checks[0].status).toBe('violated')
  })

  it('reports validity as not established when it is not shown for the whole range', () => {
    const r = evaluateModel(buckling, { ...nominal, L: { value: 600, min: 300, max: 600, unit: 'mm' } }, { uncertainty: 'interval' })
    expect(r.validity).toMatchObject({ satisfied: false, over: 'range' })
    expect([...r.validity.violated, ...r.validity.uncertain]).toContain('lambda >= lambda_1')
  })
})
