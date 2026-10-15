import type { GeometryKernel } from '../kernel'
import type { CadDocument } from '../model/types'
import { regenerate, RegenerationCache, type RegenerateOptions, type RegenerationResult } from './engine'

/**
 * Where regeneration runs (parameters, sketch solving, features, analysis). The engine only sees this
 * interface: in Node it runs in-process; in browsers the kernel worker runs it (cad-kernel worker
 * client), so neither sketch solving nor geometry touches the UI thread. Results are plain data
 * (structured-clone safe); shape handles refer to shapes kept where the regeneration ran.
 */
export interface Regenerator {
  readonly location: 'in-process' | 'worker'
  regenerate: (doc: CadDocument, options?: RegenerateOptions) => Promise<RegenerationResult>
  /** Releases every cached shape and solution (full regeneration, closing a document). */
  clear: () => Promise<void>
}

export function localRegenerator(kernel: GeometryKernel, cache = new RegenerationCache()): Regenerator {
  return {
    location: 'in-process',
    regenerate: async (doc, options) => ({ ...(await regenerate(doc, kernel, cache, options)), location: 'in-process' }),
    clear: () => cache.clear(kernel),
  }
}
