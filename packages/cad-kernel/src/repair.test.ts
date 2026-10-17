import { CadEngine, createDocument, failures, parseDocument, referenceRepairs, type CommandCall } from '@ews/cad-core'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'

/**
 * Repair reference (reference-lost) and actionable failure messages (CAD sprint C1, items 3 and 4)
 * on the real kernel. A row of slots splits the top face into strips named by shape history; reducing
 * the slot count removes the last strips, so edges and faces on them are lost.
 */

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 60_000)

const BLOCK: CommandCall[] = [
  { command: 'create_part', input: { name: 'Block', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'n', expression: '4' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 20, ref: '$base' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
  { command: 'add_rectangle', input: { sketchId: '$h', corner: [10, -1], width: 4, height: 22 } },
  { command: 'extrude_profile', input: { sketchId: '$h', distance: 12, direction: 'reverse', operation: 'cut', ref: '$slot' } },
  { command: 'pattern_linear', input: { features: ['$slot'], direction: 'x', count: 'n', spacing: 10, ref: '$pat' } },
]

async function model(extra: CommandCall[] = []) {
  const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000c4' }) })
  const r = await e.execute({ commands: [...BLOCK, ...extra] })
  if (!r.ok) throw new Error(`${r.error.message} (${r.failedCommand})`)
  return e
}
const setN = (e: CadEngine, n: number) => e.execute({ commands: [{ command: 'set_parameter', input: { partId: e.document.parts[0].id, name: 'n', expression: String(n) } }] })
const result = (e: CadEngine, id: string) => e.regeneration!.parts[0].features.find((f) => f.featureId === id)!

describe('repair_reference: the person picks the replacement', () => {
  it('a lost fillet edge lists candidates; nothing is re-bound until the repair is applied', async () => {
    // n = 4: strips ~2 (x 0-10), ~3 (14-20), ~4 (24-30), ~5 (34-40), ~6 (44-60); the probed name ext-19/cap-end lies on
    // the wall of the third slot (history.test.ts). At n = 2 the strips are ~2, ~3 and ext-19/cap-end (24-60): ~5 is gone.
    const lostEdge = 'edge(ext-19/cap-end~5|ext-19/side:ln-8)'
    const e = await model([{ command: 'fillet_edges', input: { edges: ['edge(ext-19/cap-end~2|ext-19/side:ln-8)', lostEdge], radius: 0.5, ref: '$f' } }])
    const fil = e.document.parts[0].features.find((f) => f.type === 'fillet')!.id
    expect(result(e, fil).status).toBe('ok')
    await setN(e, 2) // strips ~2 and ~3 remain; ~5 is gone
    const lost = result(e, fil)
    expect(lost.status).toBe('failed')
    expect(lost.error?.details).toMatchObject({ reason: 'reference-lost', referenceKind: 'edge', lost: [lostEdge] })
    expect(lost.error?.message).toMatch(/Repair reference/)

    // The query offers candidates, best name match first; it changes nothing.
    const versionBefore = e.document.version
    const repairs = referenceRepairs(e.document, e.regeneration)
    expect(repairs).toHaveLength(1)
    expect(repairs[0]).toMatchObject({ featureId: fil, referenceKind: 'edge', chooseExplicitly: true })
    const candidates = repairs[0].lost[0].candidates
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].similarity).toBeGreaterThanOrEqual(candidates.at(-1)!.similarity)
    expect(candidates.map((c) => c.name)).toContain('edge(ext-19/cap-end~3|ext-19/side:ln-8)')
    expect(e.query('get_reference_repairs')).toEqual(repairs)
    expect(e.document.version).toBe(versionBefore)
    expect(result(e, fil).status).toBe('failed')

    // A dry run previews the repair without committing it.
    const to = 'edge(ext-19/cap-end~3|ext-19/side:ln-8)'
    const dry = await e.dryRun({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: lostEdge, to } }] })
    expect(dry.ok).toBe(true)
    expect(dry.after?.failures).toEqual([])
    expect(e.document.version).toBe(versionBefore)

    // Applying it is an ordinary, undoable transaction.
    const done = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: lostEdge, to } }], label: 'Repair reference', source: 'user' })
    expect(done.ok).toBe(true)
    expect(result(e, fil).status).toBe('ok')
    expect(failures(e.regeneration)).toEqual([])
    const f = e.document.parts[0].features.find((x) => x.id === fil)!
    expect(f.type === 'fillet' && f.edges).toEqual(['edge(ext-19/cap-end~2|ext-19/side:ln-8)', to])
    await e.undo()
    expect(result(e, fil).status).toBe('failed')
  })

  it('refuses a repair that does not match the feature', async () => {
    const e = await model([{ command: 'fillet_edges', input: { edges: ['edge(ext-19/cap-end~2|ext-19/side:ln-8)'], radius: 0.5 } }])
    const fil = e.document.parts[0].features.find((f) => f.type === 'fillet')!.id
    const wrong = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: 'edge(nope|nope)', to: 'edge(ext-19/cap-end~3|ext-19/side:ln-8)' } }] })
    expect(wrong.ok).toBe(false)
    const same = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: 'edge(ext-19/cap-end~2|ext-19/side:ln-8)', to: 'edge(ext-19/cap-end~2|ext-19/side:ln-8)' } }] })
    expect(same.ok).toBe(false)
    const badName = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: 'edge(ext-19/cap-end~2|ext-19/side:ln-8)', to: 'ext-19/cap-end~3' } }] })
    expect(badName.ok).toBe(false)
    // A replacement that does not exist is accepted as an edit but the feature reports it again (checked at regeneration).
    const ghost = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: 'edge(ext-19/cap-end~2|ext-19/side:ln-8)', to: 'edge(ext-19/cap-end~9|ext-19/side:ln-8)' } }] })
    expect(ghost.ok).toBe(true)
    expect(result(e, fil).error?.details?.reason).toBe('reference-lost')
  })

  it('repairs a sketch placed on a lost face; the extrude it blocked recovers', async () => {
    const e = await model([
      { command: 'create_sketch', input: { partId: '$p', face: 'ext-19/cap-end~5', ref: '$fs' } },
      { command: 'add_rectangle', input: { sketchId: '$fs', corner: [40, 5], width: 4, height: 4 } },
      { command: 'extrude_profile', input: { sketchId: '$fs', distance: 3, operation: 'join', ref: '$boss' } },
    ])
    const sk = e.document.parts[0].features.find((f) => f.type === 'sketch' && f.plane.kind === 'face')!
    const boss = e.document.parts[0].features.find((f) => f.type === 'extrude' && f.operation === 'join')!
    expect(result(e, boss.id).status).toBe('ok')
    await setN(e, 2)
    expect(result(e, sk.id).status).toBe('failed')
    expect(result(e, sk.id).error?.details).toMatchObject({ reason: 'reference-lost', referenceKind: 'face', lost: ['ext-19/cap-end~5'] })

    // Item 4: the blocked extrude names the feature that is the cause and says what to do.
    const blocked = result(e, boss.id)
    expect(blocked.status).toBe('blocked')
    expect(blocked.error?.message).toContain(`“${sk.name}” (${sk.id}) failed`)
    expect(blocked.error?.message).toContain('Root cause')
    expect(blocked.error?.message).toContain('no longer exists')
    expect(blocked.error?.details).toMatchObject({ reason: 'upstream-failed', upstream: sk.id, cause: { featureId: sk.id, name: sk.name } })
    expect(failures(e.regeneration).find((f) => f.featureId === boss.id)?.error?.message).toContain(sk.id)

    const repairs = referenceRepairs(e.document, e.regeneration)
    expect(repairs.map((r) => r.featureId)).toEqual([sk.id]) // the blocked extrude is not a repair target
    expect(repairs[0].lost[0].candidates.map((c) => c.name)).toContain('ext-19/cap-end~3')
    const r = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: sk.id, from: 'ext-19/cap-end~5', to: 'ext-19/cap-end~3' } }], source: 'user' })
    expect(r.ok).toBe(true)
    expect(result(e, sk.id).status).toBe('ok')
    // The strip ~3 (x 14 to 20) exists at n = 2; the sketch moved with it and the boss joins the body.
    expect(result(e, boss.id).status).toBe('ok')
  })

  it('the browser-flow fixture (tests/e2e/fixtures/cad/slotted-block.ewscad) regenerates, loses its fillet edge at n = 2 and is repaired by a chosen candidate', async () => {
    const text = readFileSync(join(repo, 'tests/e2e/fixtures/cad/slotted-block.ewscad'), 'utf8')
    const e = new CadEngine({ kernel, document: parseDocument(text) })
    await e.regenerate()
    expect(failures(e.regeneration)).toEqual([])
    const part = e.document.parts[0]
    const fil = part.features.find((f) => f.type === 'fillet')!.id
    await setN(e, 2)
    const repairs = referenceRepairs(e.document, e.regeneration)
    expect(repairs).toHaveLength(1)
    expect(repairs[0].lost.map((l) => l.name)).toEqual(['edge(ext-19/cap-end~5|ext-19/side:ln-8)'])
    expect(repairs[0].lost[0].candidates.map((c) => c.name)).toContain('edge(ext-19/cap-end~3|ext-19/side:ln-8)')
    const r = await e.execute({ commands: [{ command: 'repair_reference', input: { featureId: fil, from: repairs[0].lost[0].name, to: 'edge(ext-19/cap-end~3|ext-19/side:ln-8)' } }] })
    expect(r.ok).toBe(true)
    expect(failures(e.regeneration)).toEqual([])
  })

  it('chains keep naming the root cause', async () => {
    const e = await model([
      { command: 'create_sketch', input: { partId: '$p', face: 'ext-19/cap-end~5', ref: '$fs' } },
      { command: 'add_rectangle', input: { sketchId: '$fs', corner: [40, 5], width: 4, height: 4 } },
      { command: 'extrude_profile', input: { sketchId: '$fs', distance: 3, operation: 'join', ref: '$boss' } },
      { command: 'pattern_linear', input: { features: ['$boss'], direction: 'y', count: 2, spacing: 8, ref: '$pat2' } },
    ])
    const sk = e.document.parts[0].features.find((f) => f.type === 'sketch' && f.plane.kind === 'face')!
    const pat2 = e.document.parts[0].features.filter((f) => f.type === 'pattern-linear').at(-1)!
    await setN(e, 2)
    const blocked = result(e, pat2.id)
    expect(blocked.status).toBe('blocked')
    expect(blocked.error?.details?.cause).toMatchObject({ featureId: sk.id })
    expect(blocked.error?.message).toContain(`Root cause in “${sk.name}” (${sk.id})`)
  })
})
