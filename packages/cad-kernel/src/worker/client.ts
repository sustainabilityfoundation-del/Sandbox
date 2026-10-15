import { KernelError, type GeometryKernel, type KernelInfo } from '@ews/cad-core'
import type { KernelMethod, KernelRequest, KernelResponse } from './protocol'

export interface WorkerKernel extends GeometryKernel {
  /** Resolves when OCCT has loaded in the worker (with the load time). */
  ready: Promise<{ info: KernelInfo; loadMs: number }>
  terminate: () => void
}

/**
 * A GeometryKernel whose every call runs in a dedicated Web Worker. Shapes stay in the worker;
 * meshes come back as transferred typed arrays.
 */
export function createWorkerKernel(): WorkerKernel {
  const worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module', name: 'cad-kernel' })
  let next = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
  let readyResolve!: (v: { info: KernelInfo; loadMs: number }) => void
  let readyReject!: (e: unknown) => void
  const ready = new Promise<{ info: KernelInfo; loadMs: number }>((res, rej) => {
    readyResolve = res
    readyReject = rej
  })
  const info: KernelInfo = { name: 'Open CASCADE Technology (replicad-opencascadejs)', version: 'loading', licence: 'LGPL-2.1-only (OCCT) + MIT (replicad)', execution: 'worker' }

  worker.onmessage = (event: MessageEvent<KernelResponse>) => {
    const msg = event.data
    if ('ready' in msg) {
      Object.assign(info, msg.info, { execution: 'worker' })
      readyResolve({ info, loadMs: msg.loadMs })
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new KernelError(msg.error.code, msg.error.message))
  }
  worker.onerror = (event) => {
    const error = new KernelError('kernel-failure', `The geometry kernel worker failed: ${event.message || 'unknown error'}`)
    readyReject(error)
    for (const p of pending.values()) p.reject(error)
    pending.clear()
  }

  const call = (method: KernelMethod) => (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = next++
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, method, args } satisfies KernelRequest)
    })

  return {
    info,
    ready,
    makeSolid: call('makeSolid') as GeometryKernel['makeSolid'],
    boolean: call('boolean') as GeometryKernel['boolean'],
    blendEdges: call('blendEdges') as GeometryKernel['blendEdges'],
    analyze: call('analyze') as GeometryKernel['analyze'],
    mesh: call('mesh') as GeometryKernel['mesh'],
    exportStep: call('exportStep') as GeometryKernel['exportStep'],
    importStep: call('importStep') as GeometryKernel['importStep'],
    release: call('release') as GeometryKernel['release'],
    dispose: call('dispose') as GeometryKernel['dispose'],
    terminate: () => worker.terminate(),
  }
}
