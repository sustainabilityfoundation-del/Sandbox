import { describe, expect, it } from 'vitest'
import { differentiate, evalInterval, evaluateModel, libraryModel, monotonicity, parseRelation, type CalculationModelDefinition, type Expr } from './index'

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

const quadratic: CalculationModelDefinition = {
  id: 'quad', revision: 1, name: 'non-monotonic', grammar: 'ews-expr/1', basis: 'user-assertion', validationStatus: 'validated',
  parameters: [
    { symbol: 'x', name: 'x', role: 'input', unit: '-' },
    { symbol: 'limit', name: 'limit', role: 'input', unit: '-' },
    { symbol: 'y', name: 'y', role: 'output', unit: '-' },
  ],
  relations: [
    { id: 'r1', kind: 'assignment', expression: 'y = x * (1 - x)' },
    { id: 'c1', kind: 'constraint', expression: 'y <= limit' },
  ],
}

describe('interval mode of evaluateModel', () => {
  const buckling = libraryModel('lib.column.euler-round')
  const nominal = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }
  const euler = (dmm: number, Lmm: number, K: number, EGPa: number) => (Math.PI ** 2 * EGPa * 1e9 * ((Math.PI * (dmm / 1000) ** 4) / 64)) / (K * Lmm / 1000) ** 2 / 1000

  it('gives exact bounds for relations proven monotonic in every ranged input', () => {
    const r = evaluateModel(buckling, { ...nominal, d: { value: 25, min: 24, max: 26, unit: 'mm' }, K: { value: 1, min: 0.7, max: 1.5, unit: '-' }, E: { value: 210, min: 200, max: 220, unit: 'GPa' } }, { uncertainty: 'interval' })
    const b = r.outputs.P_cr.bounds!
    expect(b.quality).toBe('exact')
    expect(Math.abs(b.min - euler(24, 600, 1.5, 200)) / b.min).toBeLessThan(1e-12)
    expect(Math.abs(b.max - euler(26, 600, 0.7, 220)) / b.max).toBeLessThan(1e-12)
    expect(r.checks[0]).toMatchObject({ status: 'satisfied', marginBounds: { quality: 'exact' } })
    expect(r.manifest).toMatchObject({ manifestVersion: 2, uncertainty: 'interval', digestSpec: 'ews-digest/1' })
  })

  it('classifies a constraint as uncertain when the margin range straddles zero, and violated when it is negative everywhere', () => {
    const r = evaluateModel(buckling, { ...nominal, F: { value: 50, min: 40, max: 60, unit: 'kN' } }, { uncertainty: 'interval' })
    expect(r.checks[0].status).toBe('uncertain')
    expect(r.checks[0].marginBounds!.min).toBeLessThan(0)
    expect(r.checks[0].marginBounds!.max).toBeGreaterThan(0)
    const v = evaluateModel(buckling, { ...nominal, F: { value: 100, min: 90, max: 120, unit: 'kN' } }, { uncertainty: 'interval' })
    expect(v.checks[0].status).toBe('violated')
  })

  it('states honestly when a relation is not proven monotonic: an enclosure with an inner bound', () => {
    const r = evaluateModel(quadratic, { x: { value: 0.5, min: 0, max: 1, unit: '-' }, limit: { value: 0.3, unit: '-' } }, { uncertainty: 'interval' })
    const b = r.outputs.y.bounds!
    expect(b.quality).toBe('enclosure')
    // True range [0, 0.25]: the enclosure contains it, the inner bound lies inside it.
    expect(b.min).toBeLessThanOrEqual(0)
    expect(b.max).toBeGreaterThanOrEqual(0.25)
    expect(b.inner!.min).toBeGreaterThanOrEqual(0)
    expect(b.inner!.max).toBeLessThanOrEqual(0.25 + 1e-15)
    expect(b.note).toMatch(/Not proven monotonic in x/)
    expect(r.warnings.join()).toMatch(/enclosure/)
    // y ≤ 0.3 holds everywhere in truth (max y = 0.25), but the margin enclosure 0.3 − [0, 1] cannot prove it:
    // the engine reports "uncertain", never "satisfied" without proof.
    expect(r.checks[0].status).toBe('uncertain')
    expect(r.checks[0].marginBounds!.quality).toBe('enclosure')
  })

  it('reports validity as uncertain when it is not shown for the whole range', () => {
    const r = evaluateModel(buckling, { ...nominal, L: { value: 600, min: 300, max: 600, unit: 'mm' } }, { uncertainty: 'interval' })
    expect(r.validity.satisfied).toBe(false)
    expect([...r.validity.violated, ...(r.validity.uncertain ?? [])]).toContain('lambda >= lambda_1')
  })
})
