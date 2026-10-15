import { describe, expect, it } from 'vitest'
import { compileModel, evaluateModel, libraryModel, verifyManifest } from './index'

/**
 * Performance tests (R3). Thresholds are generous (several times the measured values on the development
 * machine) so that they catch regressions of an order of magnitude, not normal variation. Measured
 * values are printed for the checkpoint record.
 */
const model = libraryModel('lib.column.euler-round')
const inputs = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }
const ranged = { ...inputs, d: { value: 25, min: 24, max: 26, unit: 'mm' }, K: { value: 1, min: 0.7, max: 1.5, unit: '-' }, E: { value: 210, min: 200, max: 220, unit: 'GPa' }, L: { value: 600, min: 580, max: 620, unit: 'mm' }, F: { value: 12, min: 10, max: 14, unit: 'kN' } }

/** Median per-call time over 5 batches after a warm-up batch (robust to JIT warm-up and parallel test load). */
function time(fn: () => void, n: number): number {
  for (let i = 0; i < Math.min(n, 20); i++) fn()
  const batches: number[] = []
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now()
    for (let i = 0; i < n; i++) fn()
    batches.push((performance.now() - t0) / n)
  }
  return batches.sort((x, y) => x - y)[2]
}

describe('performance', () => {
  it('compiles a model in well under 20 ms', () => {
    const ms = time(() => compileModel(model), 50)
    console.log(`compile: ${ms.toFixed(3)} ms`)
    expect(ms).toBeLessThan(20)
  })

  it('evaluates a compiled model at points in well under 2 ms', () => {
    const compiled = compileModel(model)
    const ms = time(() => evaluateModel(compiled, inputs), 400)
    console.log(`point evaluation: ${ms.toFixed(4)} ms`)
    expect(ms).toBeLessThan(2)
  })

  it('evaluates exact interval bounds over 5 ranged inputs in well under 20 ms', () => {
    const compiled = compileModel(model)
    const ms = time(() => evaluateModel(compiled, ranged, { uncertainty: 'interval' }), 200)
    console.log(`interval evaluation (5 ranged inputs): ${ms.toFixed(3)} ms`)
    expect(ms).toBeLessThan(20)
  })

  it('verifies a manifest in well under 20 ms', () => {
    const m = evaluateModel(model, ranged, { uncertainty: 'interval' }).manifest
    const ms = time(() => verifyManifest(model, m), 100)
    console.log(`verification: ${ms.toFixed(3)} ms`)
    expect(ms).toBeLessThan(20)
  })

  it('handles the worst case inside the static limits (500-node expression, 10 ranged inputs, not monotonic) within the default budget', () => {
    const names = Array.from({ length: 10 }, (_, i) => `a${i}`)
    const terms = Array.from({ length: 120 }, (_, k) => `${names[k % 10]} * ${names[(k + 7) % 10]}`).join(' + ')
    const worst = {
      id: 'worst', revision: 1, name: 'worst', grammar: 'ews-expr/1' as const, basis: 'user-assertion' as const, validationStatus: 'validated' as const,
      parameters: [...names.map((s) => ({ symbol: s, name: s, role: 'input' as const, unit: '-' })), { symbol: 'y', name: 'y', role: 'output' as const, unit: '-' }],
      relations: [{ id: 'r', kind: 'assignment' as const, expression: `y = sin(${terms})` }],
    }
    const t0 = performance.now()
    const r = evaluateModel(worst, Object.fromEntries(names.map((s) => [s, { value: 0.5, min: 0, max: 1, unit: '-' }])), { uncertainty: 'interval' })
    const ms = performance.now() - t0
    console.log(`worst case: ${ms.toFixed(1)} ms, ${r.manifest.operations} operations, bounds ${r.outputs.y.bounds!.quality}`)
    expect(r.outputs.y.bounds!.quality).toBe('enclosure')
    expect(ms).toBeLessThan(2000)
  })
})
