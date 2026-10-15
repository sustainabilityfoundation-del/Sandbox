import { CadEngine, createDocument, parameterTable, validateDocument, type CommandCall, type RegenerationResult } from '@ews/cad-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'

/**
 * Regular polygons, linear patterns and parameter bindings (format 1.2) on the real OCCT kernel.
 * Fixture: a block with a row of hexagonal pockets (generic values; not product data).
 */

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 60_000)

const AF = 7 // across flats
const DEPTH = 12
const hexArea = (af: number) => (Math.sqrt(3) / 2) * af * af

const BLOCK: CommandCall[] = [
  { command: 'create_part', input: { name: 'Block', ref: '$p' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'af', expression: String(AF) } },
  { command: 'create_parameter', input: { partId: '$p', name: 'pitch', expression: '12' } },
  { command: 'create_parameter', input: { partId: '$p', name: 'n', expression: '4' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
  { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
  { command: 'extrude_profile', input: { sketchId: '$s', distance: 20, ref: '$base' } },
  { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
  { command: 'add_regular_polygon', input: { sketchId: '$h', center: [12, 10], sides: 6, size: { acrossFlats: 'af' }, rotation: 30, ref: '$hex' } },
  { command: 'extrude_profile', input: { sketchId: '$h', distance: DEPTH, direction: 'reverse', operation: 'cut', ref: '$pocket' } },
  { command: 'pattern_linear', input: { features: ['$pocket'], direction: 'x', count: 'n', spacing: 'pitch', ref: '$pat' } },
]

async function block(): Promise<CadEngine> {
  const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000d1' }) })
  const r = await e.execute({ commands: BLOCK })
  if (!r.ok) throw new Error(`${r.error.message} (${r.failedCommand})`)
  return e
}
const body = (r: RegenerationResult | undefined) => r!.parts[0].bodies[0].analysis
const feature = (e: CadEngine, type: string) => e.regeneration!.parts[0].features.find((f) => f.type === type)!
const setParam = (e: CadEngine, name: string, expression: string) => e.execute({ commands: [{ command: 'set_parameter', input: { partId: e.document.parts[0].id, name, expression } }] })

describe('regular polygon (add_regular_polygon)', () => {
  it('is fully constrained editable geometry whose size follows its parameter', async () => {
    const e = await block()
    const sk = e.regeneration!.parts[0].features.filter((f) => f.type === 'sketch')[1]
    expect(sk.status).toBe('ok')
    expect(sk.sketch!.solution.status).toBe('fully-constrained')
    expect(sk.sketch!.solution.dof).toBe(0)
    expect(sk.sketch!.profile.regions[0].area).toBeCloseTo(hexArea(AF), 6)
    await setParam(e, 'af', '9')
    const again = e.regeneration!.parts[0].features.filter((f) => f.type === 'sketch')[1]
    expect(again.sketch!.solution.status).toBe('fully-constrained')
    expect(again.sketch!.profile.regions[0].area).toBeCloseTo(hexArea(9), 6)
  })

  it('supports a circumradius size and other side counts; refuses invalid input', async () => {
    const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000d2' }) })
    const r = await e.execute({
      commands: [
        { command: 'create_part', input: { name: 'P', ref: '$p' } },
        { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
        { command: 'add_regular_polygon', input: { sketchId: '$s', sides: 5, size: { circumradius: 10 }, rotation: 18 } },
      ],
    })
    expect(r.ok).toBe(true)
    const s = e.regeneration!.parts[0].features[0].sketch!
    expect(s.solution.status).toBe('fully-constrained')
    // Pentagon area = (5/2) R² sin(72°)
    expect(s.profile.regions[0].area).toBeCloseTo(2.5 * 100 * Math.sin((72 * Math.PI) / 180), 6)
    const sid = e.document.parts[0].features[0].id
    const bad = await e.execute({ commands: [{ command: 'add_regular_polygon', input: { sketchId: sid, sides: 6, size: { acrossFlats: 5, circumradius: 3 } } }] })
    expect(bad.ok === false && bad.error.message).toMatch(/exactly one size/)
    const two = await e.execute({ commands: [{ command: 'add_regular_polygon', input: { sketchId: sid, sides: 2, size: { circumradius: 3 } } }] })
    expect(two.ok).toBe(false)
  })
})

describe('linear pattern (pattern_linear)', () => {
  it('repeats the pocket: exact volume, stable instance face names, measured gap', async () => {
    const e = await block()
    const pat = feature(e, 'pattern-linear')
    expect(pat.status).toBe('ok')
    expect(pat.pattern).toMatchObject({ count: 4, spacing: 12, direction: [1, 0, 0] })
    // Rotation 30°: flats are perpendicular to x, so the gap between pockets is pitch − across flats.
    expect(pat.pattern!.gap).toBeCloseTo(12 - AF, 6)
    const a = body(e.regeneration)
    expect(a.valid).toBe(true)
    expect(a.volume).toBeCloseTo(60 * 20 * 20 - 4 * hexArea(AF) * DEPTH, 4)
    const pid = pat.featureId
    const names = a.faces.map((f) => f.name)
    for (const k of [2, 3, 4]) expect(names.filter((n) => n.startsWith(`${pid}/i${k}-`)).length).toBe(7) // 6 sides + bottom
    const before = names.filter((n) => n.startsWith(`${pid}/`)).sort()
    // Deterministic: the same names after a spacing change and after a fresh regeneration.
    await setParam(e, 'pitch', '13')
    expect(feature(e, 'pattern-linear').pattern!.gap).toBeCloseTo(13 - AF, 6)
    expect(body(e.regeneration).faces.map((f) => f.name).filter((n) => n.startsWith(`${pid}/`)).sort()).toEqual(before)
    const fresh = new CadEngine({ kernel, document: e.document })
    await fresh.regenerate({ full: true })
    expect(body(fresh.regeneration).volume).toBeCloseTo(body(e.regeneration).volume, 9)
  })

  it('follows the count parameter and reports invalid values as a feature failure', async () => {
    const e = await block()
    await setParam(e, 'n', '3')
    expect(body(e.regeneration).volume).toBeCloseTo(60 * 20 * 20 - 3 * hexArea(AF) * DEPTH, 4)
    await setParam(e, 'n', '1')
    const pat = feature(e, 'pattern-linear')
    expect(pat.status).toBe('failed')
    expect(pat.error?.details).toMatchObject({ reason: 'invalid-value', field: 'count' })
  })
})

describe('parameter bindings (format 1.2)', () => {
  it('bind_parameter stores a revision-pinned reference; the parameter table and schema show it', async () => {
    const e = await block()
    const partId = e.document.parts[0].id
    const ref = { module: 'conceptualize', kind: 'constraint', id: '7b1e0c1e-0000-4000-8000-000000000001', revision: 2 }
    const r = await e.execute({ commands: [{ command: 'bind_parameter', input: { partId, name: 'af', ref, quantity: 'pocket across flats' } }] })
    expect(r.ok).toBe(true)
    expect(parameterTable(e.document, partId).find((p) => p.name === 'af')!.binding).toEqual({ ref, quantity: 'pocket across flats' })
    // Values are never copied: the parameter keeps its own expression.
    expect(e.document.parts[0].parameters.find((p) => p.name === 'af')!.expression).toBe(String(AF))
    expect(validateDocument(e.document)).toEqual([])
    expect(e.document.formatVersion).toBe('1.2.0')
    const un = await e.execute({ commands: [{ command: 'unbind_parameter', input: { partId, name: 'af' } }] })
    expect(un.ok).toBe(true)
    expect(e.document.parts[0].parameters.find((p) => p.name === 'af')!.binding).toBeUndefined()
  })
})
