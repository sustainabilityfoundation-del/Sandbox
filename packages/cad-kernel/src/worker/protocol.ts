import type { GeometryKernel } from '@ews/cad-core'

/** Methods of GeometryKernel callable over the worker boundary. */
export type KernelMethod = Exclude<keyof GeometryKernel, 'info'> | 'regenerate' | 'clearRegeneration'

export interface KernelRequest {
  id: number
  method: KernelMethod
  args: unknown[]
}

export type KernelResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
  | { id: 0; ok: true; ready: true; info: GeometryKernel['info']; loadMs: number }
