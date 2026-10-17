/// <reference lib="webworker" />
/**
 * The kernel worker: Open CASCADE runs here, never on the UI thread (contracts §2, brief §8).
 * The LGPL WASM binary is a separate file fetched at run time (replaceable by the user).
 */
import opencascade from 'replicad-opencascadejs'
import wasmUrl from 'replicad-opencascadejs/wasm?url'
import { regenerate, RegenerationCache, type CadDocument, type MeshData, type RegenerateOptions } from '@ews/cad-core'
import { OcctKernel } from '../occt/OcctKernel'
import type { KernelRequest, KernelResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const started = performance.now()
const kernel: Promise<OcctKernel> = (opencascade as unknown as (o: Record<string, unknown>) => Promise<never>)({
  locateFile: () => wasmUrl,
  print: () => undefined,
  printErr: () => undefined,
}).then((oc) => {
  const k = new OcctKernel(oc, 'worker')
  self.postMessage({ id: 0, ok: true, ready: true, info: k.info, loadMs: performance.now() - started } satisfies KernelResponse)
  return k
})

// Regeneration runs here too (sketch solving, features, analysis), with one cache per engine (open
// document), so the UI thread only applies commands. Shape handles in results refer to this worker's shapes.
const caches = new Map<string, RegenerationCache>()
const cacheOf = (id: string) => caches.get(id) ?? (caches.set(id, new RegenerationCache()), caches.get(id)!)

self.onmessage = async (event: MessageEvent<KernelRequest>) => {
  const { id, method, args } = event.data
  try {
    const k = await kernel
    let result: unknown
    if (method === 'regenerate') result = { ...(await regenerate(args[1] as CadDocument, k, cacheOf(args[0] as string), args[2] as RegenerateOptions | undefined)), location: 'worker' }
    else if (method === 'clearRegeneration') {
      await caches.get(args[0] as string)?.clear(k)
      caches.delete(args[0] as string)
    }
    else {
      const fn = k[method] as (...a: unknown[]) => Promise<unknown>
      result = await fn.apply(k, args)
    }
    const transfer: Transferable[] = []
    if (method === 'mesh') {
      const m = result as MeshData
      transfer.push(m.positions.buffer, m.normals.buffer, m.indices.buffer, m.edgePositions.buffer)
    }
    self.postMessage({ id, ok: true, result } satisfies KernelResponse, transfer)
  } catch (e) {
    const err = e as { code?: string; message?: string; details?: Record<string, unknown> }
    // Structured details (lost and available names) travel with the error so Repair reference works in the browser too.
    self.postMessage({ id, ok: false, error: { code: err?.code ?? 'kernel-failure', message: err?.message ?? String(e), ...(err?.details ? { details: err.details } : {}) } } satisfies KernelResponse)
  }
}
