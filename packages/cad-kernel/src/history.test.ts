import { CadEngine, createDocument, type CommandCall } from '@ews/cad-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'

/**
 * OCCT shape history as the second naming signal (ADR-0024 amendment, ADR-0075). A row of slots
 * through a block splits the top face into strips. Probe points alone name one strip and give the
 * rest `face#n` names that shift with the slot count; with history every strip keeps its name when
 * slots are added or removed, so fillets on strip edges survive a pocket-count change.
 */

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 60_000)

const R = 0.5
const BLOCK: CommandCall[] = [
  { command: 'create_part', input: { name: 'Block', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'n', expression: '3' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 20, ref: '$base' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
  // A slot 4 mm wide across the whole depth, 12 mm deep; the pattern repeats it every 10 mm along x.
  { command: 'add_rectangle', input: { sketchId: '$h', corner: [10, -1], width: 4, height: 22 } },
  { command: 'extrude_profile', input: { sketchId: '$h', distance: 12, direction: 'reverse', operation: 'cut', ref: '$slot' } },
  { command: 'pattern_linear', input: { features: ['$slot'], direction: 'x', count: 'n', spacing: 10, ref: '$pat' } },
]

async function model() {
  const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000c2' }) })
  const r = await e.execute({ commands: BLOCK })
  if (!r.ok) throw new Error(`${r.error.message} (${r.failedCommand})`)
  return e
}
const analysis = (e: CadEngine) => e.regeneration!.parts[0].bodies[0].analysis
const setN = (e: CadEngine, n: number) => e.execute({ commands: [{ command: 'set_parameter', input: { partId: e.document.parts[0].id, name: 'n', expression: String(n) } }] })
const stripNames = (e: CadEngine) => analysis(e).faces.filter((f) => f.name.startsWith('ext-') && f.name.includes('/cap-end') && f.center[2] === 20).map((f) => `${f.name}@${Math.round(f.center[0])}`).sort()

describe('shape history names the pieces of a split face (ADR-0024 amendment)', () => {
  it('keeps the name of every strip when slots are added or removed; no face#n fallback names', async () => {
    const e = await model()
    // n = 3: strips at x = 5 (0-10), 17 (14-20), 27 (24-30), 47 (34-60), named by lineage in creation order.
    expect(stripNames(e)).toEqual(['ext-19/cap-end@5', 'ext-19/cap-end~2@17', 'ext-19/cap-end~3@27', 'ext-19/cap-end~4@47'])
    expect(analysis(e).faces.filter((f) => !f.stable)).toEqual([])
    await setN(e, 5)
    // The strips that existed keep their names; the old last strip is now narrower; new strips get the next numbers.
    const five = stripNames(e)
    for (const kept of ['ext-19/cap-end@5', 'ext-19/cap-end~2@17', 'ext-19/cap-end~3@27']) expect(five).toContain(kept)
    expect(five).toHaveLength(6)
    expect(analysis(e).faces.filter((f) => !f.stable)).toEqual([])
    await setN(e, 2)
    expect(stripNames(e)).toEqual(['ext-19/cap-end@5', 'ext-19/cap-end~2@17', 'ext-19/cap-end~3@42'])
  })

  it('a fillet on strip edges survives a pocket-count change', async () => {
    const e = await model()
    const edges = ['edge(ext-19/cap-end|ext-19/side:ln-8)', 'edge(ext-19/cap-end~2|ext-19/side:ln-8)']
    expect(analysis(e).edges.map((x) => x.name)).toEqual(expect.arrayContaining(edges))
    const r = await e.execute({ commands: [{ command: 'fillet_edges', input: { edges, radius: R, ref: '$f' } }] })
    expect(r.ok).toBe(true)
    const fil = e.document.parts[0].features.find((f) => f.type === 'fillet')!.id
    const volumeDrop = async () => {
      const filleted = analysis(e).volume
      await e.execute({ commands: [{ command: 'set_suppressed', input: { featureId: fil, suppressed: true } }] })
      const plain = analysis(e).volume
      await e.execute({ commands: [{ command: 'set_suppressed', input: { featureId: fil, suppressed: false } }] })
      return plain - filleted
    }
    // Rounded corner removes (1 - pi/4) R^2 per mm of edge: strip 1 is 10 mm long, strip 2 is 6 mm long.
    const expected = (1 - Math.PI / 4) * R * R * (10 + 6)
    expect(await volumeDrop()).toBeCloseTo(expected, 4)
    for (const n of [4, 5, 2, 6, 3]) {
      await setN(e, n)
      const f = e.regeneration!.parts[0].features.find((x) => x.featureId === fil)!
      expect(f.status, `fillet at n=${n}: ${f.error?.message}`).toBe('ok')
      expect(await volumeDrop(), `n=${n}`).toBeCloseTo(expected, 4)
      expect(analysis(e).faces.some((x) => x.name.startsWith(`${fil}/blend:`))).toBe(true)
      expect(analysis(e).valid).toBe(true)
    }
  })

  it('stays deterministic: a fresh regeneration gives the same names', async () => {
    const e = await model()
    await setN(e, 4)
    const fresh = new CadEngine({ kernel, document: e.document })
    await fresh.regenerate({ full: true })
    expect(analysis(fresh).faces.map((f) => f.name).sort()).toEqual(analysis(e).faces.map((f) => f.name).sort())
  })
})
