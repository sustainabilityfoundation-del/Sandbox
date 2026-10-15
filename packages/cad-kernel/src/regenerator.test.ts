import { CadEngine, RegenerationCache, createDocument, regenerate, type CommandCall, type GeometryKernel, type Regenerator } from '@ews/cad-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'

/**
 * Regeneration behind a message boundary, as in the browser worker: documents and results cross by
 * structured clone, each engine has its own cache in the "worker", and the UI side only applies
 * commands. Same algorithm as worker/kernel.worker.ts (which cannot run under Node).
 */

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 30_000)

/** A worker-like regenerator: clones in and out, per-engine cache, like the kernel worker. */
function clonedRegenerator(k: GeometryKernel, caches: Map<string, RegenerationCache>, id: string): Regenerator {
  return {
    location: 'worker',
    regenerate: async (doc, options) => {
      const cache = caches.get(id) ?? (caches.set(id, new RegenerationCache()), caches.get(id)!)
      return structuredClone({ ...(await regenerate(structuredClone(doc), k, cache, options)), location: 'worker' as const })
    },
    clear: async () => {
      await caches.get(id)?.clear(k)
      caches.delete(id)
    },
  }
}

const PLATE: CommandCall[] = [
  { command: 'create_part', input: { name: 'Plate', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'w', expression: '60' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 'w', height: 30 } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 8, ref: '$e' } },
]

describe('regeneration behind a worker boundary', () => {
  it('gives the same results as in-process regeneration, incrementally, with independent caches', async () => {
    const caches = new Map<string, RegenerationCache>()
    const a = new CadEngine({ kernel, regenerator: clonedRegenerator(kernel, caches, 'a'), document: createDocument({ documentId: 'a' }) })
    const b = new CadEngine({ kernel, regenerator: clonedRegenerator(kernel, caches, 'b'), document: createDocument({ documentId: 'b' }) })
    const local = new CadEngine({ kernel, document: createDocument({ documentId: 'c' }) })
    const commands = PLATE
    for (const e of [a, b, local]) expect((await e.execute({ commands })).ok).toBe(true)
    expect(a.regeneration?.location).toBe('worker')
    expect(local.regeneration?.location).toBe('in-process')
    const va = a.regeneration!.parts[0].bodies[0].analysis
    const vl = local.regeneration!.parts[0].bodies[0].analysis
    expect(va.volume).toBeCloseTo(60 * 30 * 8, 6)
    expect(va.faces.map((f) => f.name)).toEqual(vl.faces.map((f) => f.name))
    expect(a.regeneration!.parts[0].features.map((f) => f.status)).toEqual(['ok', 'ok'])

    await a.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'w', expression: '70' } }] })
    expect(a.regeneration!.parts[0].bodies[0].analysis.volume).toBeCloseTo(70 * 30 * 8, 6)
    // A dry run in the worker does not commit and does not disturb the cache.
    const dry = await a.dryRun({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'w', expression: '90' } }] })
    expect(dry.after?.bodies[0].volume).toBeCloseTo(90 * 30 * 8, 6)
    expect(a.document.parts[0].parameters[0].expression).toBe('70')

    // Closing one document releases only its cache: the other still meshes its body.
    await a.dispose()
    expect(caches.has('a')).toBe(false)
    const mesh = await b.mesh(b.regeneration!.parts[0].bodies[0].bodyId)
    expect(mesh.indices.length).toBeGreaterThan(0)
    await b.dispose()
    await local.dispose()
  })
})
