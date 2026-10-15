/**
 * Worker thread entry of the isolated evaluator (Node only). Receives evaluation requests and answers
 * with results or serialized CalcErrors. It holds no state between requests except the compiled-model
 * cache, which is keyed by model digest and bounded.
 */
import { parentPort } from 'node:worker_threads'
import { asCalcError } from '../errors'
import { evaluateModel, type EvaluateOptions, type InputValue } from '../evaluate'
import { compileModel, type CalculationModelDefinition, type CompiledModel } from '../model'

export interface WorkerRequest {
  id: number
  definition: CalculationModelDefinition
  inputs: Record<string, InputValue>
  options: Omit<EvaluateOptions, 'now'> & { nowIso?: string }
}

const cache = new Map<string, CompiledModel>()
const CACHE_SIZE = 64

function compiled(definition: CalculationModelDefinition): CompiledModel {
  const key = JSON.stringify([definition.id, definition.revision, definition.parameters, definition.relations, definition.validity])
  let m = cache.get(key)
  if (!m) {
    m = compileModel(definition)
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
    cache.set(key, m)
  }
  return m
}

parentPort!.on('message', (req: WorkerRequest) => {
  try {
    const { nowIso, ...options } = req.options
    const result = evaluateModel(compiled(req.definition), req.inputs, { ...options, now: nowIso ? () => new Date(nowIso) : undefined })
    parentPort!.postMessage({ id: req.id, ok: true, result })
  } catch (e) {
    parentPort!.postMessage({ id: req.id, ok: false, error: asCalcError(e).toJSON() })
  }
})

parentPort!.postMessage({ ready: true })
