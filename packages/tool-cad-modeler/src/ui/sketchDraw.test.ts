import { applyTransaction, createDocument, evaluateParameters, solveSketchFeature, type CadDocument, type SketchFeature } from '@ews/cad-core'
import { describe, expect, it } from 'vitest'
import { commandsFor, DEFAULT_DRAW_OPTIONS, gridStep, hint, snap, type DrawOptions, type DrawTool, type SnapTarget } from './sketchDraw'

/** Click-to-draw (CAD sprint C1.1): snapping and the mapping from clicks to the typed sketch commands. */

const grid = (x: number, y: number): SnapTarget => ({ point: [x, y], kind: 'grid' })
const at = (id: string, x: number, y: number): SnapTarget => ({ point: [x, y], kind: 'point', id })
const ORIGIN: SnapTarget = { point: [0, 0], kind: 'origin', id: 'origin' }

function start() {
  const r = applyTransaction(createDocument(), {
    commands: [
      { command: 'create_part', input: { name: 'P', ref: '$p' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY' } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}
const sketchOf = (doc: CadDocument) => doc.parts[0].features[0] as SketchFeature

/** Applies the commands for one gesture; returns the new document and the results. */
function draw(doc: CadDocument, tool: DrawTool, a: SnapTarget, b: SnapTarget, options: Partial<DrawOptions> = {}, step = 2) {
  const out = commandsFor(tool, sketchOf(doc).id, a, b, { ...DEFAULT_DRAW_OPTIONS, ...options }, step)
  if ('error' in out) throw new Error(out.error)
  const r = applyTransaction(doc, { commands: out.commands })
  if (!r.ok) throw new Error(`${r.error.message} (${r.failedCommand})`)
  return { doc: r.doc, results: r.results, label: out.label }
}
const solve = (doc: CadDocument) => solveSketchFeature(sketchOf(doc), evaluateParameters(doc.parts[0])).result!

describe('snapping', () => {
  it('prefers an existing point or the origin within the tolerance, else the grid', () => {
    const points = [{ id: 'origin', p: [0, 0] as [number, number] }, { id: 'pt-3', p: [10, 6] as [number, number] }]
    expect(snap([10.4, 6.3], points, 2, 1)).toEqual({ point: [10, 6], kind: 'point', id: 'pt-3' })
    expect(snap([0.3, -0.2], points, 2, 1)).toEqual({ point: [0, 0], kind: 'origin', id: 'origin' })
    expect(snap([13.2, 8.9], points, 2, 1)).toEqual({ point: [14, 8], kind: 'grid' })
    // The nearest of two candidates wins.
    expect(snap([5, 5], [{ id: 'a', p: [4.5, 5] }, { id: 'b', p: [5.2, 5] }], 2, 1)).toMatchObject({ id: 'b' })
  })
  it('chooses a readable grid step (1, 2 or 5 times a power of ten)', () => {
    expect(gridStep(60)).toBe(2)
    expect(gridStep(10)).toBe(0.5)
    expect(gridStep(300)).toBe(10)
    expect(gridStep(1000)).toBe(50)
  })
  it('says what the next click does', () => {
    expect(hint('line', 0)).toMatch(/start/)
    expect(hint('line', 1, true)).toMatch(/close the shape/)
    expect(hint('rectangle', 1)).toMatch(/opposite corner/)
  })
})

describe('clicks become typed sketch commands', () => {
  it('rectangle: two corners give one closed profile with its dimensions; DOF is reported', () => {
    const { doc, label } = draw(start(), 'rectangle', grid(10, 4), grid(50, 24))
    expect(label).toBe('Draw rectangle')
    const s = solve(doc)
    expect(s.profile.issues).toEqual([])
    expect(s.profile.regions).toHaveLength(1)
    expect(s.profile.regions[0].area).toBeCloseTo(40 * 20, 9)
    // Width and height are dimensioned, the position is free: 2 degrees of freedom.
    expect(s.solution.dof).toBe(2)
    // Corners given in any order give the same rectangle.
    const flipped = solve(draw(start(), 'rectangle', grid(50, 24), grid(10, 4)).doc)
    expect(flipped.profile.regions[0].area).toBeCloseTo(800, 9)
  })

  it('rectangle at the origin is fixed; without dimensions the size stays free', () => {
    expect(solve(draw(start(), 'rectangle', ORIGIN, grid(40, 20)).doc).solution.dof).toBe(0)
    expect(solve(draw(start(), 'rectangle', ORIGIN, grid(40, 20), { dimensions: false }).doc).solution.dof).toBe(2)
  })

  it('rectangle: the first corner joins the point it was clicked on (coincident, no silent re-binding of anything else)', () => {
    const first = draw(start(), 'rectangle', ORIGIN, grid(40, 20))
    const pts = Object.fromEntries(sketchOf(first.doc).entities.filter((e) => e.type === 'point').map((e) => [e.id, e])) as Record<string, { x: number; y: number }>
    const corner = Object.entries(pts).find(([, p]) => p.x === 40 && p.y === 20)![0]
    const second = draw(first.doc, 'rectangle', at(corner, 40, 20), grid(60, 30))
    const sk = sketchOf(second.doc)
    expect(sk.constraints.some((c) => c.type === 'coincident' && c.entities.includes(corner))).toBe(true)
    const s = solve(second.doc)
    expect(s.solution.status).not.toBe('conflicting')
    // The second rectangle hangs on the first one's corner: only its own size is set, so it is fully constrained.
    expect(s.solution.dof).toBe(0)
  })

  it('line chain: segments share their end points, and closing on the first point gives a closed triangle', () => {
    let d = start()
    const a = draw(d, 'line', grid(0, 0), grid(30, 0))
    d = a.doc
    const p0 = a.results[0].result.start as string
    const p1 = a.results[0].result.end as string
    const b = draw(d, 'line', at(p1, 30, 0), grid(15, 20))
    d = b.doc
    const p2 = b.results[0].result.end as string
    expect(b.results[0].result.start).toBe(p1) // no new point at a shared corner
    const c = draw(d, 'line', at(p2, 15, 20), at(p0, 0, 0)) // click the first point: closes the loop
    d = c.doc
    const s = solve(d)
    expect(s.profile.issues).toEqual([])
    expect(s.profile.regions).toHaveLength(1)
    expect(s.profile.regions[0].area).toBeCloseTo(0.5 * 30 * 20, 9)
    // The first segment was drawn horizontally on the grid and made exactly horizontal; the sketch is not fully constrained.
    expect(sketchOf(d).constraints.filter((x) => x.type === 'horizontal')).toHaveLength(1)
    expect(s.solution.dof).toBeGreaterThan(0)
  })

  it('line: inference can be switched off, and only aligned lines get a constraint (also between existing points)', () => {
    const off = draw(start(), 'line', grid(0, 0), grid(30, 0), { infer: false })
    expect(sketchOf(off.doc).constraints).toHaveLength(0)
    const first = draw(start(), 'line', grid(0, 0), grid(30, 5))
    expect(sketchOf(first.doc).constraints).toHaveLength(0) // not aligned: keeps its shape
    const [p0, p1] = [first.results[0].result.start as string, first.results[0].result.end as string]
    const second = draw(first.doc, 'line', at(p1, 30, 5), at(p0, 0, 0))
    expect(sketchOf(second.doc).constraints).toHaveLength(0)
    const third = draw(second.doc, 'line', at(p1, 30, 5), grid(30, 25))
    expect(sketchOf(third.doc).constraints.map((c) => c.type)).toEqual(['vertical'])
  })

  it('circle: the radius is a multiple of the grid step, the diameter is dimensioned; an origin centre is made coincident', () => {
    const c = draw(start(), 'circle', grid(20, 10), grid(26, 10), {}, 2)
    const circle = sketchOf(c.doc).entities.find((e) => e.type === 'circle') as { radius: number }
    expect(circle.radius).toBe(6)
    expect(sketchOf(c.doc).constraints.find((k) => k.type === 'diameter')?.value).toBe(12)
    const o = draw(start(), 'circle', ORIGIN, grid(0, 8))
    expect(sketchOf(o.doc).constraints.some((k) => k.type === 'coincident' && k.entities.includes('origin'))).toBe(true)
    expect(solve(o.doc).solution.dof).toBe(0)
  })

  it('polygon: centre, corner and sides give a fully constrained regular polygon; the corner sets the rotation', () => {
    const p = draw(start(), 'polygon', grid(20, 20), grid(30, 20), { sides: 6 }, 2)
    const s = solve(p.doc)
    expect(s.solution.dof).toBe(0)
    expect(s.profile.regions[0].area).toBeCloseTo((3 * Math.sqrt(3) / 2) * 100, 6) // circumradius 10
    expect(p.label).toBe('Draw 6-sided polygon')
    const square = solve(draw(start(), 'polygon', grid(0, 0), grid(10, 10), { sides: 4 }, 2).doc)
    expect(square.profile.regions[0].area).toBeCloseTo(2 * 14 ** 2, 6) // circumradius 14.14 snaps to 14 (grid step 2): area 2R²
  })

  it('refuses gestures that make no shape, before anything is sent', () => {
    const sk = 'sk-1'
    const opts = DEFAULT_DRAW_OPTIONS
    expect(commandsFor('line', sk, grid(4, 4), grid(4, 4), opts, 2)).toHaveProperty('error')
    expect(commandsFor('rectangle', sk, grid(4, 4), grid(10, 4), opts, 2)).toHaveProperty('error')
    expect(commandsFor('circle', sk, grid(4, 4), grid(4.2, 4), opts, 2)).toHaveProperty('error') // radius rounds to zero grid steps
    expect(commandsFor('polygon', sk, grid(4, 4), grid(4, 4), opts, 2)).toHaveProperty('error')
    expect(commandsFor('polygon', sk, grid(4, 4), grid(10, 4), { ...opts, sides: 2 }, 2)).toHaveProperty('error')
  })
})
