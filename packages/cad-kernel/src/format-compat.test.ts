import { CadEngine, createDocument, failures, parseDocument, type CommandCall } from '@ews/cad-core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'

/**
 * Stored-data compatibility of the probe-first naming rule (ADR-0075; AGENTS.md "Preserve existing
 * workflows and stored data"). The fixture is a format 1.3.0 document written by main 6aaaaef (probe
 * naming only, before ADR-0075): a 60 × 20 × 20 block, one 4 mm slot at x = 10 to 14 cut 12 mm deep from
 * the top, and a 0.5 mm fillet on edge(ext-19/cap-end|ext-19/side:ln-8). On main, ext-19/cap-end is the
 * 46 mm strip (x = 14 to 60, centre x = 37) because the cap probe (the profile centroid) lies on it; the
 * volume with the fillet is 23037.5321 mm³. The document must open here with the fillet on the same strip
 * and the same volume, and a name must never move to another piece.
 */

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, 'fixtures/slotted-block-fillet-1.3.0.ewscad')
const R = 0.5
const BLOCK = 60 * 20 * 20
const SLOT = 4 * 20 * 12
/** A rounded edge removes (1 - π/4) R² per mm of edge; the filleted strip edge is 46 mm long. */
const FILLET_DROP = (1 - Math.PI / 4) * R * R * 46
const MAIN_VOLUME = 23037.5321
const FILLET_EDGE = 'edge(ext-19/cap-end|ext-19/side:ln-8)'

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 60_000)

const analysis = (e: CadEngine) => e.regeneration!.parts[0].bodies[0].analysis
/** Pieces of the top face (z = 20) by name and centre x. */
const topStrips = (e: CadEngine) =>
  analysis(e)
    .faces.filter((f) => f.name.startsWith('ext-19/cap-end') && Math.abs(f.center[2] - 20) < 1e-6)
    .map((f) => `${f.name}@${f.center[0].toFixed(1)}`)
    .sort()
const blends = (e: CadEngine) => analysis(e).faces.filter((f) => f.name.includes('/blend:'))
const fillet = (e: CadEngine) => {
  const id = e.document.parts[0].features.find((f) => f.type === 'fillet')!.id
  return e.regeneration!.parts[0].features.find((f) => f.featureId === id)!
}
async function openFixture() {
  const doc = parseDocument(readFileSync(FIXTURE, 'utf8'))
  expect(doc.formatVersion).toBe('1.3.0')
  const e = new CadEngine({ kernel, document: doc })
  await e.regenerate({ full: true })
  return e
}
/** The fixture's model as commands (the same IDs: base extrude ext-19, slot ext-35, fillet after `extra`). */
const MODEL = (extra: CommandCall[]): CommandCall[] => [
  { command: 'create_part', input: { name: 'Block', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'n', expression: '3' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 20, ref: '$base' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
  { command: 'add_rectangle', input: { sketchId: '$h', corner: [10, -1], width: 4, height: 22 } },
  { command: 'extrude_profile', input: { sketchId: '$h', distance: 12, direction: 'reverse', operation: 'cut', ref: '$slot' } },
  ...extra,
  { command: 'fillet_edges', input: { edges: [FILLET_EDGE], radius: R, ref: '$f' } },
]
/** A 4 mm slot across the leftmost strip (x = 2 to 6), 12 mm deep from the top. */
const CUT_LEFT: CommandCall[] = [
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$c' } },
  { command: 'add_rectangle', input: { sketchId: '$c', corner: [2, -1], width: 4, height: 22 } },
  { command: 'extrude_profile', input: { sketchId: '$c', distance: 12, direction: 'reverse', operation: 'cut', ref: '$left' } },
]

describe('a 1.3.0 document saved before ADR-0075 keeps its stable names (probe-first rule)', () => {
  it('opens with the fillet on the 46 mm strip (x ≈ 37) and the volume main computed, without migration', async () => {
    const e = await openFixture()
    expect(failures(e.regeneration)).toEqual([])
    expect(e.document.formatVersion).toBe('1.3.0')
    const a = analysis(e)
    expect(a.valid).toBe(true)
    expect(a.volume).toBeCloseTo(23037.53, 2)
    expect(a.volume).toBeCloseTo(MAIN_VOLUME, 3)
    expect(a.volume).toBeCloseTo(BLOCK - SLOT - FILLET_DROP, 3)
    expect(fillet(e).status).toBe('ok')
    expect(e.document.parts[0].features.find((f) => f.type === 'fillet')).toMatchObject({ edges: [FILLET_EDGE] })
    expect(blends(e).map((f) => f.name)).toEqual([`fil-36/blend:${FILLET_EDGE}`])
    expect(blends(e)[0].center[0]).toBeCloseTo(37, 2)
    // The probed name is on the 46 mm strip; the 10 mm strip, which main could not name (face#n), is ~2.
    expect(topStrips(e)).toEqual(['ext-19/cap-end@37.0', 'ext-19/cap-end~2@5.0'])
    expect(a.faces.filter((f) => !f.stable)).toEqual([])
  })

  it('a later cut on the leftmost piece numbers its pieces and leaves ext-19/cap-end on the probed strip', async () => {
    const e = await openFixture()
    const r = await e.execute({ commands: CUT_LEFT.map((c) => ({ ...c, input: { ...c.input, ...('partId' in c.input ? { partId: e.document.parts[0].id } : {}) } })) })
    expect(r.ok).toBe(true)
    expect(failures(e.regeneration)).toEqual([])
    expect(analysis(e).volume).toBeCloseTo(MAIN_VOLUME - SLOT, 3)
    // The probe-less piece ~2 (x 0 to 10) splits: the smaller centre keeps ~2, the other becomes ~3; the probed name stays.
    expect(topStrips(e)).toEqual(['ext-19/cap-end@37.0', 'ext-19/cap-end~2@1.0', 'ext-19/cap-end~3@8.0'])
    expect(blends(e)[0].center[0]).toBeCloseTo(37, 2)
    expect(analysis(e).faces.filter((f) => !f.stable)).toEqual([])
  })

  it('built with the cut on the leftmost piece before the fillet, the fillet lands on the probed strip, not on a sliver', async () => {
    const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000c5' }) })
    const r = await e.execute({ commands: MODEL(CUT_LEFT) })
    expect(r.ok).toBe(true)
    expect(failures(e.regeneration)).toEqual([])
    expect(fillet(e).status).toBe('ok')
    expect(analysis(e).volume).toBeCloseTo(BLOCK - 2 * SLOT - FILLET_DROP, 3)
    expect(blends(e)).toHaveLength(1)
    expect(blends(e)[0].center[0]).toBeCloseTo(37, 2)
    expect(topStrips(e)).toEqual(['ext-19/cap-end@37.0', 'ext-19/cap-end~2@1.0', 'ext-19/cap-end~3@8.0'])
  })

  it('a cut that removes every probe point of a name makes dependent references reference-lost, never re-bound', async () => {
    // A 2 mm deep pocket from x = 15 to 56 across the top, before the fillet in the history; suppressed at first.
    const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000c6' }) })
    const r = await e.execute({
      commands: [
        ...MODEL([
          { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$c' } },
          { command: 'add_rectangle', input: { sketchId: '$c', corner: [15, -1], width: 41, height: 22 } },
          { command: 'extrude_profile', input: { sketchId: '$c', distance: 2, direction: 'reverse', operation: 'cut', ref: '$pocket' } },
        ]),
        { command: 'set_suppressed', input: { featureId: '$pocket', suppressed: true } },
      ],
    })
    expect(r.ok).toBe(true)
    expect(fillet(e).status).toBe('ok')
    expect(topStrips(e)).toEqual(['ext-19/cap-end@37.0', 'ext-19/cap-end~2@5.0'])
    expect(analysis(e).volume).toBeCloseTo(MAIN_VOLUME, 3)
    // The pocket removes every sample point of ext-19/cap-end (all lie between x = 15 and 56 or in the slot).
    // Neither remaining piece of the strip takes the name; the fillet reports the lost edge instead of moving.
    const pocket = e.document.parts[0].features.find((f) => f.type === 'extrude' && f.suppressed)!.id
    const on = await e.execute({ commands: [{ command: 'set_suppressed', input: { featureId: pocket, suppressed: false } }] })
    expect(on.ok).toBe(true)
    expect(topStrips(e)).toEqual(['ext-19/cap-end~2@5.0', 'ext-19/cap-end~3@14.5', 'ext-19/cap-end~4@58.0'])
    const f = fillet(e)
    expect(f.status).toBe('failed')
    expect(f.error?.details).toMatchObject({ reason: 'reference-lost', referenceKind: 'edge', lost: [FILLET_EDGE] })
    expect(blends(e)).toEqual([])
    expect(analysis(e).faces.some((x) => x.name === 'ext-19/cap-end' || x.aliases?.includes('ext-19/cap-end'))).toBe(false)
    expect(analysis(e).volume).toBeCloseTo(BLOCK - SLOT - 41 * 20 * 2, 3)
  })
})
