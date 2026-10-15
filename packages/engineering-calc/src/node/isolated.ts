/**
 * @ews/engineering-calc/node: evaluation in an isolated worker thread (Node only; mathematics.md §7).
 *
 * The main entry is pure and runs anywhere with a cooperative operation budget and deadline. This entry
 * adds hard isolation for services: a separate V8 isolate with memory limits (`resourceLimits`) and a
 * wall-clock timeout after which the worker is terminated. A crashed or terminated worker is replaced
 * on the next request. Errors keep the engine's taxonomy (timeout, resource-limit, …).
 *
 * The worker announces `{ ready: true }` once loaded; requests wait for it, and their timeouts start
 * only when they are sent, so slow start-up (TypeScript loader, mathjs) never counts as evaluation time.
 */
import { Worker } from 'node:worker_threads'
import { CalcError } from '../errors'
import type { CalculationResult, EvaluateOptions, InputValue } from '../evaluate'
import type { CalculationModelDefinition } from '../model'
import type { WorkerRequest } from './worker'

export interface IsolationOptions {
  /** Hard wall-clock limit per evaluation, from the moment it is sent to a ready worker (default 5000 ms). */
  timeoutMs?: number
  /** Limit for a worker to load (TypeScript loader, mathjs), not counted in evaluations (default 30 000 ms). */
  startupTimeoutMs?: number
  /** V8 old-generation heap limit of the worker (default 64 MB). */
  maxOldGenerationSizeMb?: number
  /** V8 young-generation limit (default 16 MB). */
  maxYoungGenerationSizeMb?: number
  /** Thread stack size (default 4 MB). */
  stackSizeMb?: number
  /**
   * Node arguments for the worker. From TypeScript sources (development, tests) the worker needs a TS
   * loader; the default adds `--import tsx` when this file is a .ts file. A bundled service passes [].
   */
  execArgv?: string[]
  /** Worker script URL; defaults to the sibling worker module. */
  workerUrl?: URL
}

export interface IsolatedEvaluator {
  evaluate(definition: CalculationModelDefinition, inputs: Record<string, InputValue>, options?: Omit<EvaluateOptions, 'now'> & { nowIso?: string }): Promise<CalculationResult>
  /** Terminates the worker; later calls start a new one. */
  close(): Promise<void>
  /** Number of workers started so far (restarts after timeouts or crashes count). */
  readonly starts: number
}

interface Pending {
  resolve: (r: CalculationResult) => void
  reject: (e: CalcError) => void
  timer?: ReturnType<typeof setTimeout>
  worker: Worker
  request: WorkerRequest
}

interface WorkerState {
  worker: Worker
  ready: boolean
  /** Requests waiting for the worker to finish loading. */
  queue: number[]
  startupTimer: ReturnType<typeof setTimeout>
}

type WorkerMessage = { ready?: true; id?: number; ok?: boolean; result?: CalculationResult; error?: { code: CalcError['code']; message: string; details?: CalcError['details'] } }

export function createIsolatedEvaluator(options: IsolationOptions = {}): IsolatedEvaluator {
  const timeoutMs = options.timeoutMs ?? 5000
  const startupTimeoutMs = options.startupTimeoutMs ?? 30_000
  const isTs = import.meta.url.endsWith('.ts')
  const execArgv = options.execArgv ?? (isTs ? ['--import', 'tsx'] : [])
  const workerUrl = options.workerUrl ?? new URL(isTs ? './worker.ts' : './worker.js', import.meta.url)
  let current: WorkerState | undefined
  let starts = 0
  let nextId = 1
  const pending = new Map<number, Pending>()

  /** Fails the pending requests of one worker (or of all workers). */
  const failAll = (error: CalcError, of?: Worker) => {
    for (const [id, p] of pending) {
      if (of && p.worker !== of) continue
      if (p.timer) clearTimeout(p.timer)
      p.reject(error)
      pending.delete(id)
    }
  }

  const retire = (state: WorkerState) => {
    clearTimeout(state.startupTimer)
    if (current === state) current = undefined
    void state.worker.terminate()
  }

  /** Sends a request and starts its hard timeout. */
  const send = (state: WorkerState, id: number) => {
    const p = pending.get(id)
    if (!p) return
    p.timer = setTimeout(() => {
      pending.delete(id)
      p.reject(new CalcError('timeout', `The evaluation did not finish within ${timeoutMs} ms; the worker was terminated.`, { limit: timeoutMs }))
      // Terminating discards the other requests of this worker; they fail as internal and can be retried.
      retire(state)
    }, timeoutMs)
    state.worker.postMessage(p.request)
  }

  const start = (): WorkerState => {
    starts++
    const w = new Worker(workerUrl, {
      execArgv,
      resourceLimits: {
        maxOldGenerationSizeMb: options.maxOldGenerationSizeMb ?? 64,
        maxYoungGenerationSizeMb: options.maxYoungGenerationSizeMb ?? 16,
        stackSizeMb: options.stackSizeMb ?? 4,
      },
    })
    const state: WorkerState = {
      worker: w,
      ready: false,
      queue: [],
      startupTimer: setTimeout(() => {
        failAll(new CalcError('internal', `The calculation worker did not start within ${startupTimeoutMs} ms.`), w)
        retire(state)
      }, startupTimeoutMs),
    }
    w.on('message', (msg: WorkerMessage) => {
      if (msg.ready) {
        clearTimeout(state.startupTimer)
        state.ready = true
        for (const id of state.queue.splice(0)) send(state, id)
        return
      }
      const p = pending.get(msg.id!)
      if (!p) return
      if (p.timer) clearTimeout(p.timer)
      pending.delete(msg.id!)
      if (msg.ok) p.resolve(msg.result!)
      else p.reject(CalcError.fromJSON(msg.error!))
    })
    w.on('error', (err: Error & { code?: string }) => {
      const memory = err.code === 'ERR_WORKER_OUT_OF_MEMORY' || /out of memory|heap/i.test(err.message)
      failAll(memory ? new CalcError('resource-limit', `The evaluation exceeded the worker memory limit: ${err.message}`) : new CalcError('internal', `The calculation worker failed: ${err.message}`), w)
      retire(state)
    })
    w.on('exit', () => {
      clearTimeout(state.startupTimer)
      if (current === state) current = undefined
      failAll(new CalcError('internal', 'The calculation worker stopped unexpectedly.'), w)
    })
    return state
  }

  return {
    get starts() {
      return starts
    },
    evaluate(definition, inputs, evalOptions = {}) {
      if (!current) current = start()
      const state = current
      const id = nextId++
      return new Promise<CalculationResult>((resolve, reject) => {
        // The worker's cooperative deadline fires first (a clean `timeout` error, worker kept); the hard
        // timeout is the backstop for anything the cooperative check cannot interrupt.
        const request: WorkerRequest = { id, definition, inputs, options: { ...evalOptions, timeoutMs: evalOptions.timeoutMs ?? Math.max(1, Math.floor(timeoutMs * 0.8)) } }
        pending.set(id, { resolve, reject, worker: state.worker, request })
        if (state.ready) send(state, id)
        else state.queue.push(id)
      })
    },
    async close() {
      const state = current
      current = undefined
      failAll(new CalcError('internal', 'The evaluator was closed.'))
      if (state) {
        clearTimeout(state.startupTimer)
        await state.worker.terminate()
      }
    },
  }
}
