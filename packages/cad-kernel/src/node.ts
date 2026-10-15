/**
 * Node entry point: the OCCT kernel in-process, for tests, scripts and server-side jobs.
 * The WASM binary is read from the installed replicad-opencascadejs package at run time
 * (or from `wasmPath`, so users can supply their own build of the LGPL library).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import opencascade from 'replicad-opencascadejs'
import { OcctKernel } from './occt/OcctKernel'

let shared: Promise<OcctKernel> | undefined

export async function createNodeKernel(options: { wasmPath?: string; quiet?: boolean } = {}): Promise<OcctKernel> {
  const require = createRequire(import.meta.url)
  const path = options.wasmPath ?? require.resolve('replicad-opencascadejs/wasm')
  const quiet = options.quiet ?? true
  const oc = await (opencascade as unknown as (o: Record<string, unknown>) => Promise<never>)({
    wasmBinary: readFileSync(path),
    ...(quiet ? { print: () => undefined, printErr: () => undefined } : {}),
  })
  return new OcctKernel(oc, 'in-process')
}

/** One kernel per process (loading OCCT takes a few hundred milliseconds). */
export function sharedNodeKernel(): Promise<OcctKernel> {
  shared ??= createNodeKernel()
  return shared
}

export { OcctKernel }
