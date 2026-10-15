import { CadEngine, createDocument, parseDocument, serializeDocument, type CommandCall, type RegenerationResult } from '@ews/cad-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { detectFormat } from './detect'
import { sharedNodeKernel, type OcctKernel } from './node'
import { inspectStep } from './step'

/**
 * Phase 1 acceptance tests on the real kernel (brief §12): parametric regeneration, incremental
 * rebuilds, failure reporting, topological naming stability, native round trip and STEP export,
 * validated numerically (volume, bounding box, centre of mass) and topologically (counts, names,
 * validity, re-import).
 */

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 30_000)

const DOC_ID = '00000000-0000-4000-8000-0000000000aa'
const PLATE: CommandCall[] = [
  { command: 'create_part', input: { name: 'Bracket plate', ref: '$p', material: { name: 'Aluminium 6061', density: 2700 } } },
  { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: '80' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'depth', expression: '40' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'thickness', expression: '10' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'hole_d', expression: '12' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', name: 'Base sketch', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 'depth', ref: '$r' } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 'thickness', name: 'Plate', ref: '$e' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', name: 'Hole sketch', ref: '$h' } },
  { command: 'add_circle', input: { sketchId: '$h', center: [20, 20], radius: 5, ref: '$c' } },
  { command: 'apply_constraint', input: { sketchId: '$h', type: 'diameter', entities: ['$c'], value: 'hole_d' } },
  { command: 'apply_constraint', input: { sketchId: '$h', type: 'distance-x', entities: ['origin', '$c.center'], value: 'width / 4' } },
  { command: 'apply_constraint', input: { sketchId: '$h', type: 'distance-y', entities: ['origin', '$c.center'], value: 'depth / 2' } },
  { command: 'extrude_profile', input: { sketchId: '$h', distance: 'thickness', operation: 'cut', name: 'Hole', ref: '$x' } },
]

async function plate(): Promise<CadEngine> {
  const engine = new CadEngine({ kernel, document: createDocument({ documentId: DOC_ID, title: 'Bracket' }), clock: () => '2026-10-14T00:00:00Z' })
  const r = await engine.execute({ commands: PLATE, label: 'Create bracket plate' })
  if (!r.ok) throw new Error(`${r.failedCommand}: ${r.error.message}`)
  return engine
}

const body = (regen: RegenerationResult | undefined) => regen!.parts[0].bodies[0]
const face = (regen: RegenerationResult | undefined, name: string) => body(regen).analysis.faces.find((f) => f.name === name)
const ids = (e: CadEngine) => {
  const p = e.document.parts[0]
  return { part: p.id, base: p.features[0].id, plate: p.features[1].id, holeSketch: p.features[2].id, hole: p.features[3].id }
}

describe('parametric part on the OCCT kernel', () => {
  it('regenerates a plate with a through hole: exact volume, bounds, topology and validity', async () => {
    const e = await plate()
    const regen = e.regeneration
    expect(regen?.ok).toBe(true)
    const b = body(regen).analysis
    const expected = 80 * 40 * 10 - Math.PI * 6 * 6 * 10
    expect(b.volume).toBeCloseTo(expected, 6)
    expect(b.boundingBox).toEqual({ min: [0, 0, 0], max: [80, 40, 10] })
    expect(b.counts).toMatchObject({ solids: 1, shells: 1, faces: 7, edges: 15, vertices: 10 })
    expect(b.valid).toBe(true)
    // Centre of mass: plate centre shifted away from the hole at x = 20.
    const comX = (80 * 40 * 10 * 40 - Math.PI * 36 * 10 * 20) / expected
    expect(b.centerOfMass[0]).toBeCloseTo(comX, 6)
    expect(b.centerOfMass[2]).toBeCloseTo(5, 6)
    const mass = e.query('get_mass_properties') as { mass: number }[]
    expect(mass[0].mass).toBeCloseTo(expected * 1e-9 * 2700, 9)
  })

  it('names faces from design intent and keeps the names stable when dimensions change', async () => {
    const e = await plate()
    const { plate: ext, hole } = ids(e)
    const names = body(e.regeneration).analysis.faces.map((f) => f.name).sort()
    expect(names.every((n) => !n.startsWith('face#'))).toBe(true)
    expect(names).toContain(`${ext}/cap-end`)
    expect(names).toContain(`${ext}/cap-start`)
    expect(names.filter((n) => n.startsWith(`${ext}/side:`))).toHaveLength(4)
    expect(names.filter((n) => n.startsWith(`${hole}/side:`))).toHaveLength(1)
    const sides = e.document.parts[0].features[0].type === 'sketch' ? e.document.parts[0].features[0].entities.filter((x) => x.type === 'line').map((x) => x.id) : []
    const right = `${ext}/side:${sides[1]}`
    expect(face(e.regeneration, right)?.normal).toEqual([1, 0, 0])
    expect(face(e.regeneration, right)?.center[0]).toBeCloseTo(80, 9)

    const r = await e.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '120' } }, { command: 'set_parameter', input: { partId: 'part-1', name: 'thickness', expression: '15' } }] })
    expect(r.ok).toBe(true)
    // Same names, same meaning, new geometry.
    expect(face(e.regeneration, right)?.center[0]).toBeCloseTo(120, 9)
    expect(face(e.regeneration, `${ext}/cap-end`)?.center[2]).toBeCloseTo(15, 9)
    expect(face(e.regeneration, `${ext}/cap-end`)?.normal).toEqual([0, 0, 1])
    expect(face(e.regeneration, `${ext}/cap-start`)?.normal).toEqual([0, 0, -1])
    const holeFace = body(e.regeneration).analysis.faces.find((f) => f.name.startsWith(`${hole}/side:`))!
    expect(holeFace.surfaceType).toBe('CYLINDRE')
    expect(holeFace.center[0]).toBeCloseTo(30, 6) // width / 4
    // Edges are named by their adjacent faces.
    const edges = body(e.regeneration).analysis.edges
    expect(edges.filter((x) => x.faces.includes(`${ext}/cap-end`) && x.faces.includes(right))).toHaveLength(1)
  })

  it('regenerates incrementally: only features downstream of a change are rebuilt', async () => {
    const e = await plate()
    const { base, plate: ext, holeSketch, hole } = ids(e)
    expect(e.regeneration?.parts[0].rebuilt.sort()).toEqual([base, ext, holeSketch, hole].sort())
    await e.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'hole_d', expression: '8' } }] })
    expect(e.regeneration?.parts[0].rebuilt.sort()).toEqual([holeSketch, hole].sort())
    expect(e.regeneration?.parts[0].reused.sort()).toEqual([base, ext].sort())
    expect(body(e.regeneration).analysis.volume).toBeCloseTo(32000 - Math.PI * 16 * 10, 6)
    await e.execute({ commands: [{ command: 'rename', input: { id: ext, name: 'Base plate' } }] })
    expect(e.regeneration?.parts[0].rebuilt).toEqual([])
  })

  it('reports regeneration failures per feature and recovers', async () => {
    const e = await plate()
    const { base, plate: ext, holeSketch, hole } = ids(e)
    await e.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '-5' } }] })
    const tree = e.query('get_feature_tree') as { parts: { features: { id: string; status: string; error?: { message: string; details?: { reason?: string } } }[] }[] }
    const byId = Object.fromEntries(tree.parts[0].features.map((f) => [f.id, f]))
    expect(byId[base].status).toBe('failed')
    expect(byId[base].error?.message).toMatch(/greater than zero/)
    expect(byId[ext].status).toBe('blocked')
    expect(byId[ext].error?.details?.reason).toBe('upstream-failed')
    expect(byId[holeSketch].status).toBe('ok')
    expect(byId[hole].status).toBe('failed') // no body to cut
    expect((e.query('get_failures') as unknown[]).length).toBeGreaterThanOrEqual(3)
    await e.undo()
    expect(e.regeneration?.ok).toBe(true)

    // Conflicting constraints are isolated.
    await e.execute({ commands: [{ command: 'apply_constraint', input: { sketchId: base, type: 'distance', entities: ['pt-7', 'pt-8'], value: 50 } }] })
    const sketch = e.query('get_sketch', { sketchId: base }) as { status: string; conflicting: string[] }
    expect(sketch.status).toBe('conflicting')
    expect(sketch.conflicting.length).toBeGreaterThan(0)
  })

  it('creates revolved solids about a sketch axis', async () => {
    const e = new CadEngine({ kernel, document: createDocument({ documentId: DOC_ID }) })
    const r = await e.execute({
      commands: [
        { command: 'create_part', input: { name: 'Bushing', ref: '$p' } },
        { command: 'create_sketch', input: { partId: '$p', plane: 'XZ', ref: '$s' } },
        { command: 'add_rectangle', input: { sketchId: '$s', corner: [5, 0], width: 10, height: 30, ref: '$r' } },
        { command: 'apply_constraint', input: { sketchId: '$s', type: 'distance-x', entities: ['origin', '$r.points.0'], value: 5 } },
        { command: 'apply_constraint', input: { sketchId: '$s', type: 'distance-y', entities: ['origin', '$r.points.0'], value: 0 } },
        { command: 'revolve_profile', input: { sketchId: '$s', axis: 'y-axis', angle: 360, ref: '$v' } },
      ],
    })
    expect(r.ok).toBe(true)
    const a = body(e.regeneration).analysis
    expect(a.volume).toBeCloseTo(Math.PI * (15 * 15 - 5 * 5) * 30, 5)
    expect(a.boundingBox.min[2]).toBeCloseTo(0, 6)
    expect(a.boundingBox.max[2]).toBeCloseTo(30, 6)
    expect(a.boundingBox.max[0]).toBeCloseTo(15, 6)
    expect(a.counts.faces).toBe(4)
    expect(a.faces.every((f) => f.stable)).toBe(true)
    const sk = e.query('get_sketch', { sketchId: 'sk-2' }) as { status: string; dof: number }
    expect(sk).toMatchObject({ status: 'fully-constrained', dof: 0 })

    // A partial revolution gets start and end faces; a profile crossing the axis fails clearly.
    await e.execute({ commands: [{ command: 'edit_feature', input: { featureId: 'rev-19', angle: 90 } }] })
    expect(body(e.regeneration).analysis.volume).toBeCloseTo((Math.PI * (225 - 25) * 30) / 4, 5)
    expect(body(e.regeneration).analysis.faces.map((f) => f.name)).toEqual(expect.arrayContaining(['rev-19/start', 'rev-19/end']))
    await e.execute({ commands: [{ command: 'set_dimension', input: { sketchId: 'sk-2', constraintId: 'cn-17', value: -5 } }] })
    expect(e.regeneration?.parts[0].features.find((f) => f.featureId === 'rev-19')?.error?.details?.reason).toBe('profile-crosses-axis')
  })

  it('round-trips the native format: the reopened model regenerates identically', async () => {
    const e = await plate()
    const text = serializeDocument(e.document)
    const reopened = new CadEngine({ kernel })
    await reopened.open(parseDocument(text))
    const a = body(e.regeneration).analysis
    const b = body(reopened.regeneration).analysis
    expect(b.volume).toBeCloseTo(a.volume, 9)
    expect(b.counts).toEqual(a.counts)
    expect(b.faces.map((f) => f.name).sort()).toEqual(a.faces.map((f) => f.name).sort())
    expect(serializeDocument(reopened.document)).toBe(text)
    expect(detectFormat(text, 'bracket.ewscad').format).toBe('ews-cad')
  })

  it('exports STEP AP242 that is structurally valid and re-imports to the same solid', async () => {
    const e = await plate()
    const { text } = await e.exportStep()
    const s = inspectStep(text)
    expect(s.problems).toEqual([])
    expect(s.applicationProtocol).toBe('AP242')
    expect(s.lengthUnit).toBe('mm')
    expect(s.products).toContain('Bracket plate')
    expect(s.entities.MANIFOLD_SOLID_BREP).toBe(1)
    expect(s.entities.ADVANCED_FACE).toBe(7)
    expect(s.entities.CYLINDRICAL_SURFACE).toBe(1)
    expect(detectFormat(text, 'x.step')).toMatchObject({ format: 'step', support: { export: 'supported' } })

    const imported = await kernel.importStep(text)
    expect(imported.analyses).toHaveLength(1)
    const original = body(e.regeneration).analysis
    expect(imported.analyses[0].volume).toBeCloseTo(original.volume, 6)
    expect(imported.analyses[0].counts.faces).toBe(original.counts.faces)
    expect(imported.analyses[0].counts.edges).toBe(original.counts.edges)
    expect(imported.analyses[0].boundingBox).toEqual(original.boundingBox)
    expect(imported.analyses[0].valid).toBe(true)
    await kernel.release(imported.shapes)
  })

  it('previews a transaction without committing it (dry run)', async () => {
    const e = await plate()
    const version = e.document.version
    const preview = await e.dryRun({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'thickness', expression: '20' } }], expectedVersion: version })
    expect(preview.ok).toBe(true)
    expect(preview.before.bodies[0].volume).toBeCloseTo(32000 - Math.PI * 360, 6)
    expect(preview.after?.bodies[0].volume).toBeCloseTo(64000 - Math.PI * 720, 6)
    expect(e.document.version).toBe(version)
    expect(body(e.regeneration).analysis.volume).toBeCloseTo(32000 - Math.PI * 360, 6)
    const stale = await e.dryRun({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'thickness', expression: '20' } }], expectedVersion: version - 1 })
    expect(stale.error?.code).toBe('version-conflict')
  })

  it('tessellates bodies with face ranges mapped to stable names, and releases kernel memory', async () => {
    const e = await plate()
    const b = body(e.regeneration)
    const mesh = await e.mesh(b.bodyId)
    expect(mesh.indices.length % 3).toBe(0)
    expect(mesh.faceRanges).toHaveLength(b.analysis.counts.faces)
    // Ranges refer to face indices of the analysis (not kernel hash codes), each face exactly once.
    expect(mesh.faceRanges.map((r) => r.face).sort((x, y) => x - y)).toEqual([...Array(b.analysis.counts.faces).keys()])
    expect(mesh.faceRanges.reduce((s, r) => s + r.count, 0)).toBe(mesh.indices.length)
    expect(mesh.edgePositions.length).toBeGreaterThan(0)
    for (let i = 0; i < 12; i++) await e.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: String(80 + i) } }] })
    // Cache keeps a bounded number of shapes (current + recent generations).
    expect(kernel.liveShapes).toBeLessThan(60)
  })
})
