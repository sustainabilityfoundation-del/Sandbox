import { afterEach, describe, expect, it } from 'vitest'
import { CalcError, evaluateModel, libraryModel, type CalculationModelDefinition } from '../index'
import { createIsolatedEvaluator, type IsolatedEvaluator } from './isolated'

const model = libraryModel('lib.column.euler-round')
const inputs = { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } }

/** A legitimate but expensive model: many non-monotonic relations over 10 ranged inputs (enclosure path). */
function heavyModel(relations = 60): { definition: CalculationModelDefinition; inputs: Record<string, { value: number; min: number; max: number; unit: string }> } {
  const names = Array.from({ length: 10 }, (_, i) => `a${i}`)
  const body = Array.from({ length: 40 }, (_, k) => `${names[k % 10]} * ${names[(k + 3) % 10]}`).join(' + ')
  return {
    definition: {
      id: 'heavy', revision: 1, name: 'heavy', grammar: 'ews-expr/1', basis: 'user-assertion', validationStatus: 'validated',
      parameters: [...names.map((s) => ({ symbol: s, name: s, role: 'input' as const, unit: '-' })), ...Array.from({ length: relations }, (_, i) => ({ symbol: `y${i}`, name: `y${i}`, role: 'output' as const, unit: '-' }))],
      relations: Array.from({ length: relations }, (_, i) => ({ id: `r${i}`, kind: 'assignment' as const, expression: `y${i} = sin(${body} + ${i})` })),
    },
    inputs: Object.fromEntries(names.map((s) => [s, { value: 0.5, min: 0, max: 1, unit: '-' }])),
  }
}

let evaluator: IsolatedEvaluator | undefined
afterEach(async () => {
  await evaluator?.close()
  evaluator = undefined
})

describe('isolated evaluation (worker thread)', () => {
  it('returns the same result as in-process evaluation', async () => {
    evaluator = createIsolatedEvaluator()
    const fixed = '2026-10-15T00:00:00.000Z'
    const isolated = await evaluator.evaluate(model, inputs, { nowIso: fixed })
    const local = evaluateModel(model, inputs, { now: () => new Date(fixed) })
    expect(isolated.manifest.outputDigest).toBe(local.manifest.outputDigest)
    expect(isolated.outputs.P_cr.value).toBe(local.outputs.P_cr.value)
    expect(isolated.manifest.evaluatedAt).toBe(fixed)
  }, 30_000)

  it('transports engine errors with their taxonomy code and details', async () => {
    evaluator = createIsolatedEvaluator()
    const err = await evaluator.evaluate(model, { ...inputs, d: { value: 25, unit: 'kN' } }).catch((e) => e)
    expect(err).toBeInstanceOf(CalcError)
    expect(err).toMatchObject({ code: 'unit-error', details: { symbol: 'd' } })
    expect(err.retryable).toBe(false)
  }, 30_000)

  it('stops an expensive evaluation at the cooperative deadline and keeps the worker', async () => {
    evaluator = createIsolatedEvaluator({ timeoutMs: 10_000 })
    const heavy = heavyModel()
    const err = await evaluator.evaluate(heavy.definition, heavy.inputs, { uncertainty: 'interval', timeoutMs: 20 }).catch((e) => e)
    expect(err).toMatchObject({ code: 'timeout' })
    expect(err.retryable).toBe(true)
    await evaluator.evaluate(model, inputs)
    expect(evaluator.starts).toBe(1)
  }, 30_000)

  it('stops at the operation budget with resource-limit', async () => {
    evaluator = createIsolatedEvaluator()
    const heavy = heavyModel(5)
    await expect(evaluator.evaluate(heavy.definition, heavy.inputs, { uncertainty: 'interval', maxOperations: 10_000 })).rejects.toMatchObject({ code: 'resource-limit' })
  }, 30_000)

  it('terminates a worker that does not answer (hard timeout) and starts a new one', async () => {
    evaluator = createIsolatedEvaluator({ timeoutMs: 300, workerUrl: new URL('./__fixtures__/busyWorker.ts', import.meta.url) })
    await expect(evaluator.evaluate(model, inputs)).rejects.toMatchObject({ code: 'timeout', message: /terminated/ })
    await expect(evaluator.evaluate(model, inputs)).rejects.toMatchObject({ code: 'timeout' })
    expect(evaluator.starts).toBe(2)
  }, 30_000)

  it('fails requests when a worker does not start in time, without counting start-up as evaluation time', async () => {
    evaluator = createIsolatedEvaluator({ startupTimeoutMs: 500, workerUrl: new URL('./__fixtures__/silentWorker.ts', import.meta.url) })
    await expect(evaluator.evaluate(model, inputs)).rejects.toMatchObject({ code: 'internal', message: /did not start/ })
  }, 30_000)

  it('maps a worker that exceeds its memory limit to resource-limit', async () => {
    evaluator = createIsolatedEvaluator({ timeoutMs: 20_000, maxOldGenerationSizeMb: 32, workerUrl: new URL('./__fixtures__/memoryWorker.ts', import.meta.url) })
    await expect(evaluator.evaluate(model, inputs)).rejects.toMatchObject({ code: 'resource-limit' })
  }, 30_000)
})
