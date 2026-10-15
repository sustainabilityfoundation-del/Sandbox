import { CadEngine, applyTransaction, createDocument, type CommandCall, type RegenerationResult } from '@ews/cad-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'

/**
 * Sprint 2 features on the real kernel: fillet and chamfer on stable edge names (with failure
 * reporting), datum planes and sketches on datum planes and planar faces. Numeric and topological
 * checks; stability of references when upstream dimensions change.
 */

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 30_000)

const BOX: CommandCall[] = [
  { command: 'create_part', input: { name: 'Block', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: '80' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'thickness', expression: '10' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 40, ref: '$r' } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 'thickness', ref: '$e' } },
]

async function box(): Promise<CadEngine> {
  const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000f1' }) })
  const r = await e.execute({ commands: BOX })
  if (!r.ok) throw new Error(r.error.message)
  return e
}
const body = (r: RegenerationResult | undefined) => r!.parts[0].bodies[0].analysis
const feature = (e: CadEngine, id: string) => e.regeneration!.parts[0].features.find((f) => f.featureId === id)!
const ext = (e: CadEngine) => e.document.parts[0].features[1].id
const lines = (e: CadEngine) => {
  const sk = e.document.parts[0].features[0]
  return sk.type === 'sketch' ? sk.entities.filter((x) => x.type === 'line').map((x) => x.id) : []
}

describe('fillet and chamfer on stable edge names', () => {
  it('fillets the four vertical edges: exact volume, named blend faces, stable when the width changes', async () => {
    const e = await box()
    const E = ext(e)
    const vertical = body(e.regeneration).edges.filter((x) => x.faces.length === 2 && x.faces.every((f) => f.startsWith(`${E}/side:`))).map((x) => x.name)
    expect(vertical).toHaveLength(4)
    const r = await e.execute({ commands: [{ command: 'fillet_edges', input: { edges: vertical, radius: 5, ref: '$f' } }] })
    expect(r.ok).toBe(true)
    const fid = e.document.parts[0].features.at(-1)!.id
    expect(feature(e, fid).status).toBe('ok')
    const removed = 4 * (25 - (Math.PI * 25) / 4) * 10
    expect(body(e.regeneration).volume).toBeCloseTo(32000 - removed, 6)
    expect(body(e.regeneration).counts.faces).toBe(10)
    expect(body(e.regeneration).valid).toBe(true)
    const blends = body(e.regeneration).faces.filter((f) => f.name.startsWith(`${fid}/blend:`))
    expect(blends).toHaveLength(4)
    expect(blends.every((f) => f.surfaceType === 'CYLINDRE')).toBe(true)
    // The cap keeps its name although its outline changed.
    expect(body(e.regeneration).faces.find((f) => f.name === `${E}/cap-end`)?.area).toBeCloseTo(3200 - removed / 10, 6)

    await e.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '100' } }] })
    expect(feature(e, fid).status).toBe('ok')
    expect(body(e.regeneration).volume).toBeCloseTo(40000 - removed, 6)
    expect(body(e.regeneration).faces.filter((f) => f.name.startsWith(`${fid}/blend:`)).map((f) => f.name).sort()).toEqual(blends.map((f) => f.name).sort())
    // Radius driven by a parameter, edited through edit_feature.
    await e.execute({ commands: [{ command: 'create_parameter', input: { partId: 'part-1', name: 'r', expression: '3' } }, { command: 'edit_feature', input: { featureId: fid, radius: 'r' } }] })
    expect(body(e.regeneration).volume).toBeCloseTo(40000 - 4 * (9 - (Math.PI * 9) / 4) * 10, 6)
  })

  it('chamfers one edge with an exact volume and reports lost or invalid references', async () => {
    const e = await box()
    const E = ext(e)
    const [bottom] = lines(e)
    const top = `edge(${E}/cap-end|${E}/side:${bottom})`
    expect(body(e.regeneration).edges.map((x) => x.name)).toContain(top)
    await e.execute({ commands: [{ command: 'chamfer_edges', input: { edges: [top], distance: 2 } }] })
    const cid = e.document.parts[0].features.at(-1)!.id
    expect(feature(e, cid).status).toBe('ok')
    expect(body(e.regeneration).volume).toBeCloseTo(32000 - (2 * 2) / 2 * 80, 6)
    expect(body(e.regeneration).faces.some((f) => f.name === `${cid}/blend:${top}` && f.surfaceType === 'PLANE')).toBe(true)

    await e.execute({ commands: [{ command: 'fillet_edges', input: { edges: ['edge(nope|nada)'], radius: 1 } }] })
    const lost = feature(e, e.document.parts[0].features.at(-1)!.id)
    expect(lost.status).toBe('failed')
    expect(lost.error?.details?.reason).toBe('reference-lost')
    expect(lost.error?.message).toMatch(/Available: edge\(/)
    // The rest of the model is unaffected by the failed feature.
    expect(body(e.regeneration).volume).toBeCloseTo(32000 - 160, 6)
    await e.undo()

    const bad = await e.execute({ commands: [{ command: 'fillet_edges', input: { edges: [top], radius: -1 } }] })
    expect(bad.ok).toBe(false)
    await e.execute({ commands: [{ command: 'create_parameter', input: { partId: 'part-1', name: 'zero', expression: '0' } }, { command: 'chamfer_edges', input: { edges: [top], distance: 'zero' } }] })
    expect(feature(e, e.document.parts[0].features.at(-1)!.id).error?.details?.reason).toBe('invalid-value')
  })
})

describe('cap names survive features at the deepest point', () => {
  it('keeps cap-start and cap-end named with a centred through hole and a centred boss', async () => {
    const e = await box()
    const E = ext(e)
    await e.execute({
      commands: [
        { command: 'create_sketch', input: { partId: 'part-1', plane: 'XY', ref: '$h' } },
        { command: 'add_circle', input: { sketchId: '$h', center: [40, 20], radius: 6 } },
        { command: 'extrude_profile', input: { sketchId: '$h', distance: 'thickness', operation: 'cut' } },
      ],
    })
    let names = body(e.regeneration).faces.map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining([`${E}/cap-start`, `${E}/cap-end`]))
    expect(names.some((n) => n.startsWith('face#'))).toBe(false)
    await e.undo()
    await e.execute({
      commands: [
        { command: 'create_sketch', input: { partId: 'part-1', face: `${E}/cap-end`, ref: '$t' } },
        { command: 'add_circle', input: { sketchId: '$t', center: [40, 20], radius: 6 } },
        { command: 'extrude_profile', input: { sketchId: '$t', distance: 4, operation: 'join' } },
      ],
    })
    names = body(e.regeneration).faces.map((f) => f.name)
    expect(names).toContain(`${E}/cap-end`)
    expect(names.some((n) => n.startsWith('face#'))).toBe(false)
  })
})

describe('datum planes and sketches on planes and faces', () => {
  it('sketches on a planar face; the sketch follows the face when the thickness changes', async () => {
    const e = await box()
    const E = ext(e)
    const r = await e.execute({
      commands: [
        { command: 'create_sketch', input: { partId: 'part-1', face: `${E}/cap-end`, ref: '$t' } },
        { command: 'add_circle', input: { sketchId: '$t', center: [20, 20], radius: 5, ref: '$c' } },
        { command: 'apply_constraint', input: { sketchId: '$t', type: 'radius', entities: ['$c'], value: 5 } },
        { command: 'extrude_profile', input: { sketchId: '$t', distance: 5, operation: 'join', ref: '$b' } },
      ],
    })
    expect(r.ok).toBe(true)
    const sk = e.document.parts[0].features[2].id
    expect(feature(e, sk).plane).toEqual({ origin: [0, 0, 10], xDir: [1, 0, 0], normal: [0, 0, 1] })
    expect(body(e.regeneration).volume).toBeCloseTo(32000 + Math.PI * 25 * 5, 6)
    expect(body(e.regeneration).boundingBox.max[2]).toBeCloseTo(15, 9)
    await e.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'thickness', expression: '20' } }] })
    expect(body(e.regeneration).boundingBox.max[2]).toBeCloseTo(25, 9)
    expect(body(e.regeneration).volume).toBeCloseTo(64000 + Math.PI * 25 * 5, 6)

    // Deleting the feature that owns the face is refused; suppressing it blocks the sketch.
    const del = await e.execute({ commands: [{ command: 'delete_feature', input: { featureId: E } }] })
    expect(del.ok).toBe(false)
    await e.execute({ commands: [{ command: 'set_suppressed', input: { featureId: E, suppressed: true } }] })
    expect(feature(e, sk).status).toBe('blocked')
    expect(feature(e, sk).error?.details?.reason).toBe('upstream-suppressed')
  })

  it('sketches on a side face with a derived frame', async () => {
    const e = await box()
    const E = ext(e)
    const [bottom] = lines(e)
    await e.execute({
      commands: [
        { command: 'create_sketch', input: { partId: 'part-1', face: `${E}/side:${bottom}`, ref: '$t' } },
        { command: 'add_rectangle', input: { sketchId: '$t', corner: [10, 2], width: 10, height: 4, dimensions: false } },
        { command: 'extrude_profile', input: { sketchId: '$t', distance: 3, operation: 'cut' } },
      ],
    })
    const sk = e.document.parts[0].features[2].id
    // Side face y = 0, outward normal −Y; x = Z × n = +X; y = n × x = +Z.
    expect(feature(e, sk).plane).toEqual({ origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0] })
    // A cut along the outward normal leaves the body untouched (it extrudes away from it): use reverse.
    await e.execute({ commands: [{ command: 'edit_feature', input: { featureId: e.document.parts[0].features.at(-1)!.id, direction: 'reverse' } }] })
    expect(body(e.regeneration).volume).toBeCloseTo(32000 - 10 * 4 * 3, 6)
  })

  it('creates offset datum planes, sketches on them, and moves dependents with the offset', async () => {
    const e = await box()
    const r = await e.execute({
      commands: [
        { command: 'create_datum_plane', input: { partId: 'part-1', plane: 'XY', offset: 30, ref: '$d' } },
        { command: 'create_datum_plane', input: { partId: 'part-1', datum: '$d', offset: 5, ref: '$d2' } },
        { command: 'create_sketch', input: { partId: 'part-1', datum: '$d2', ref: '$t' } },
        { command: 'add_rectangle', input: { sketchId: '$t', width: 10, height: 10 } },
        { command: 'extrude_profile', input: { sketchId: '$t', distance: 2 } },
      ],
    })
    expect(r.ok).toBe(true)
    const bodies = e.regeneration!.parts[0].bodies
    expect(bodies).toHaveLength(2)
    expect(bodies[1].analysis.boundingBox.min[2]).toBeCloseTo(35, 9)
    const d = e.document.parts[0].features[2].id
    await e.execute({ commands: [{ command: 'edit_feature', input: { featureId: d, offset: 50 } }] })
    expect(e.regeneration!.parts[0].bodies[1].analysis.boundingBox.min[2]).toBeCloseTo(55, 9)
    const tree = e.query('get_dependencies') as { edges: { from: string; to: string; kind: string }[] }
    expect(tree.edges).toContainEqual({ from: d, to: e.document.parts[0].features[3].id, kind: 'reference' })
  })

  it('refuses non-planar faces and lost faces with clear reasons', async () => {
    const e = await box()
    await e.execute({
      commands: [
        { command: 'create_sketch', input: { partId: 'part-1', plane: 'XY', ref: '$h' } },
        { command: 'add_circle', input: { sketchId: '$h', center: [20, 20], radius: 4 } },
        { command: 'extrude_profile', input: { sketchId: '$h', distance: 'thickness', operation: 'cut', ref: '$x' } },
      ],
    })
    const hole = e.document.parts[0].features.at(-1)!.id
    const cyl = body(e.regeneration).faces.find((f) => f.name.startsWith(`${hole}/side:`))!.name
    await e.execute({ commands: [{ command: 'create_sketch', input: { partId: 'part-1', face: cyl } }] })
    expect(feature(e, e.document.parts[0].features.at(-1)!.id).error?.details?.reason).toBe('face-not-planar')
    await e.execute({ commands: [{ command: 'create_sketch', input: { partId: 'part-1', face: `${ext(e)}/side:not-a-line` } }] })
    const lost = feature(e, e.document.parts[0].features.at(-1)!.id)
    expect(lost.error?.details?.reason).toBe('reference-lost')
    expect(lost.error?.message).toMatch(/Planar faces: /)
    // Commands validate references structurally before regeneration.
    const bad = applyTransaction(e.document, { commands: [{ command: 'create_sketch', input: { partId: 'part-1', face: 'nofeature/cap-end' } }] })
    expect(bad.ok).toBe(false)
    const two = applyTransaction(e.document, { commands: [{ command: 'create_sketch', input: { partId: 'part-1', plane: 'XY', datum: 'dp-1' } }] })
    expect(two.ok).toBe(false)
  })
})
