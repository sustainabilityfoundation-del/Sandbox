import { GcsWrapper, init_planegcs_module } from '@salusoft89/planegcs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SketchConstraint, SketchEntity } from '../model/types'
import { isDimensional } from '../model/types'
import type { SketchSolution } from './solver'
import { builtInSketchSolver, type SketchSolver } from './solverPort'

/**
 * planegcs as an independent oracle (OSS-11, ADR-0076). planegcs is FreeCAD's 2D constraint solver
 * (LGPL-2.0-or-later, WebAssembly). It is a development dependency of @ews/cad-core used only here: it
 * is never imported by shipped code. Each case is solved by the built-in solver and by planegcs from the
 * same seed geometry; the status, the remaining degrees of freedom and, for fully constrained sketches,
 * every point and radius must agree.
 */

type Prim = Record<string, unknown> & { id: string; type: string }
let gcs: GcsWrapper | undefined
let destroy: (() => void) | undefined

beforeAll(async () => {
  const mod = await init_planegcs_module()
  gcs = new GcsWrapper(new mod.GcsSystem())
  destroy = () => gcs!.destroy_gcs_module()
}, 30_000)
afterAll(() => destroy?.())

/** The sketch as planegcs primitives (points first: lines and circles need lower-id points). */
function toPlanegcs(entities: SketchEntity[], constraints: SketchConstraint[], values: Record<string, number>): Prim[] {
  const out: Prim[] = [
    { id: 'origin', type: 'point', x: 0, y: 0, fixed: true },
    { id: 'xaxis-end', type: 'point', x: 1, y: 0, fixed: true },
    { id: 'yaxis-end', type: 'point', x: 0, y: 1, fixed: true },
  ]
  const fixed = new Set(constraints.filter((c) => c.type === 'fixed').map((c) => c.entities[0]))
  for (const e of entities) if (e.type === 'point') out.push({ id: e.id, type: 'point', x: e.x, y: e.y, fixed: fixed.has(e.id) })
  out.push({ id: 'x-axis', type: 'line', p1_id: 'origin', p2_id: 'xaxis-end' }, { id: 'y-axis', type: 'line', p1_id: 'origin', p2_id: 'yaxis-end' })
  for (const e of entities) {
    if (e.type === 'line') out.push({ id: e.id, type: 'line', p1_id: e.start, p2_id: e.end })
    else if (e.type === 'circle') out.push({ id: e.id, type: 'circle', c_id: e.center, radius: e.radius })
    else if (e.type === 'arc') throw new Error('arcs are not part of the oracle suite')
  }
  const byId = new Map(entities.map((e) => [e.id, e]))
  const endpoints = (id: string): [string, string] => {
    if (id === 'x-axis') return ['origin', 'xaxis-end']
    if (id === 'y-axis') return ['origin', 'yaxis-end']
    const l = byId.get(id)
    if (l?.type !== 'line') throw new Error(`${id} is not a line`)
    return [l.start, l.end]
  }
  const centreOf = (id: string) => {
    const c = byId.get(id)
    if (c?.type !== 'circle') throw new Error(`${id} is not a circle`)
    return c.center
  }
  for (const c of constraints) {
    const [a, b] = c.entities
    const kind = (id: string) => (id === 'origin' ? 'point' : id === 'x-axis' || id === 'y-axis' ? 'line' : byId.get(id)!.type)
    const v = values[c.id]
    const id = `c:${c.id}`
    switch (c.type) {
      case 'coincident': out.push({ id, type: 'p2p_coincident', p1_id: a, p2_id: b }); break
      case 'horizontal': out.push(kind(a) === 'line' ? { id, type: 'horizontal_l', l_id: a } : { id, type: 'horizontal_pp', p1_id: a, p2_id: b }); break
      case 'vertical': out.push(kind(a) === 'line' ? { id, type: 'vertical_l', l_id: a } : { id, type: 'vertical_pp', p1_id: a, p2_id: b }); break
      case 'parallel': out.push({ id, type: 'parallel', l1_id: a, l2_id: b }); break
      case 'perpendicular': out.push({ id, type: 'perpendicular_ll', l1_id: a, l2_id: b }); break
      case 'equal': out.push(kind(a) === 'line' ? { id, type: 'equal_length', l1_id: a, l2_id: b } : { id, type: 'equal_radius_cc', c1_id: a, c2_id: b }); break
      case 'fixed': break // point flag above
      case 'point-on-line': out.push({ id, type: 'point_on_line_pl', p_id: a, l_id: b }); break
      case 'point-on-circle': out.push({ id, type: 'point_on_circle', p_id: a, c_id: b }); break
      case 'midpoint': out.push({ id: `${id}:on`, type: 'point_on_line_pl', p_id: a, l_id: b }, { id: `${id}:bisect`, type: 'point_on_perp_bisector_pl', p_id: a, l_id: b }); break
      case 'tangent': out.push(kind(a) === 'line' ? { id, type: 'tangent_lc', l_id: a, c_id: b } : { id, type: 'tangent_cc', c1_id: a, c2_id: b }); break
      case 'concentric': out.push({ id, type: 'p2p_coincident', p1_id: centreOf(a), p2_id: centreOf(b) }); break
      case 'distance': out.push(kind(b) === 'line' ? { id, type: 'p2l_distance', p_id: a, l_id: b, distance: v } : { id, type: 'p2p_distance', p1_id: a, p2_id: b, distance: v }); break
      case 'distance-x': out.push({ id, type: 'difference', param1: { o_id: a, prop: 'x' }, param2: { o_id: b, prop: 'x' }, difference: v }); break
      case 'distance-y': out.push({ id, type: 'difference', param1: { o_id: a, prop: 'y' }, param2: { o_id: b, prop: 'y' }, difference: v }); break
      case 'length': { const [p, q] = endpoints(a); out.push({ id, type: 'p2p_distance', p1_id: p, p2_id: q, distance: v }); break }
      case 'radius': out.push({ id, type: 'circle_radius', c_id: a, radius: v }); break
      case 'diameter': out.push({ id, type: 'circle_diameter', c_id: a, diameter: v }); break
      case 'angle': out.push({ id, type: 'l2l_angle_ll', l1_id: a, l2_id: b, angle: (v * Math.PI) / 180 }); break
    }
  }
  return out
}

/** planegcs behind the SketchSolver interface (synchronous once the module is loaded). */
const planegcsSolver: SketchSolver = {
  id: 'planegcs-oracle',
  solve(sketch, options) {
    const g = gcs!
    g.clear_data()
    const driving = sketch.constraints.filter((c) => !isDimensional(c.type) || c.driving !== false)
    g.push_primitives_and_params(toPlanegcs(sketch.entities, driving, options.values) as unknown as Parameters<GcsWrapper["push_primitives_and_params"]>[0])
    g.solve()
    g.apply_solution()
    const prims = g.sketch_index.get_primitives() as unknown as Prim[]
    const points: SketchSolution['points'] = {}
    const radii: SketchSolution['radii'] = {}
    for (const p of prims) {
      if (p.type === 'point' && sketch.entities.some((e) => e.id === p.id)) points[p.id] = [p.x as number, p.y as number]
      if (p.type === 'circle') radii[p.id] = p.radius as number
    }
    const dof = g.gcs.dof()
    const conflicting = g.has_gcs_conflicting_constraints()
    const redundant = g.has_gcs_redundant_constraints()
    const names = (ids: string[]) => ids.map((i) => i.replace(/^c:/, '').replace(/:(on|bisect)$/, ''))
    return {
      status: conflicting ? 'conflicting' : redundant ? 'over-constrained' : dof === 0 ? 'fully-constrained' : 'under-constrained',
      converged: !conflicting,
      dof,
      iterations: 0,
      maxResidual: 0,
      points,
      radii,
      freePoints: [],
      freeCircles: [],
      redundant: names(g.get_gcs_redundant_constraints()),
      conflicting: names(g.get_gcs_conflicting_constraints()),
      driven: {},
      issues: [],
    }
  },
}

// ---- builders -------------------------------------------------------------------------------------

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, type: 'point', x, y })
const ln = (id: string, start: string, end: string): SketchEntity => ({ id, type: 'line', start, end })
const circ = (id: string, center: string, radius: number): SketchEntity => ({ id, type: 'circle', center, radius })
let cn = 0
const k = (type: SketchConstraint['type'], entities: string[], value?: number, extra: Partial<SketchConstraint> = {}): SketchConstraint & { v?: number } => ({ id: `k${++cn}`, type, entities, ...(value !== undefined ? { value } : {}), ...extra })

interface Case {
  name: string
  entities: SketchEntity[]
  constraints: (SketchConstraint & { v?: number })[]
  /** Expected status from both solvers. */
  status: SketchSolution['status']
  dof: number
}

/** A rectangle given by its corners, with drawn seed positions slightly off. */
const rect = (x: number, y: number, w: number, h: number): SketchEntity[] => [pt('p1', x + 0.3, y - 0.2), pt('p2', x + w + 0.4, y + 0.3), pt('p3', x + w - 0.2, y + h + 0.5), pt('p4', x + 0.1, y + h - 0.4), ln('l1', 'p1', 'p2'), ln('l2', 'p2', 'p3'), ln('l3', 'p3', 'p4'), ln('l4', 'p4', 'p1')]
const rectShape = [k('horizontal', ['l1']), k('vertical', ['l2']), k('horizontal', ['l3']), k('vertical', ['l4'])]

const CASES: Case[] = [
  { name: 'dimensioned rectangle pinned at the origin', entities: rect(0, 0, 40, 20), constraints: [...rectShape, k('coincident', ['p1', 'origin']), k('length', ['l1'], 40), k('length', ['l2'], 20)], status: 'fully-constrained', dof: 0 },
  { name: 'rectangle without a height is under-constrained by one', entities: rect(0, 0, 40, 20), constraints: [...rectShape, k('coincident', ['p1', 'origin']), k('length', ['l1'], 40)], status: 'under-constrained', dof: 1 },
  { name: 'free rectangle has four degrees of freedom', entities: rect(5, 5, 30, 10), constraints: rectShape, status: 'under-constrained', dof: 4 },
  { name: 'horizontal and vertical distances place the corner', entities: rect(0, 0, 30, 10), constraints: [...rectShape, k('distance-x', ['origin', 'p1'], 7), k('distance-y', ['origin', 'p1'], 3), k('length', ['l1'], 30), k('length', ['l2'], 10)], status: 'fully-constrained', dof: 0 },
  { name: 'point distance and equal lengths make a square', entities: rect(0, 0, 20, 20), constraints: [...rectShape, k('fixed', ['p1']), k('equal', ['l1', 'l2']), k('length', ['l1'], 25)], status: 'fully-constrained', dof: 0 },
  { name: 'parallel and perpendicular lines with an angle', entities: [pt('a', 0, 0), pt('b', 20, 1), pt('c', 1, 12), pt('d', 18, 14), ln('l1', 'a', 'b'), ln('l2', 'c', 'd')], constraints: [k('fixed', ['a']), k('horizontal', ['l1']), k('length', ['l1'], 20), k('parallel', ['l1', 'l2']), k('fixed', ['c']), k('length', ['l2'], 15)], status: 'fully-constrained', dof: 0 },
  { name: 'angle between a base line and a slanted line', entities: [pt('a', 0, 0), pt('b', 20, 0.5), pt('c', 12, 9), ln('l1', 'a', 'b'), ln('l2', 'a', 'c')], constraints: [k('fixed', ['a']), k('horizontal', ['l1']), k('length', ['l1'], 20), k('length', ['l2'], 15), k('angle', ['l1', 'l2'], 50)], status: 'fully-constrained', dof: 0 },
  { name: 'perpendicular lines on the axes', entities: [pt('a', 3, 1), pt('b', 22, 2), pt('c', 3.5, 14), ln('l1', 'a', 'b'), ln('l2', 'a', 'c')], constraints: [k('perpendicular', ['l1', 'l2']), k('point-on-line', ['a', 'x-axis']), k('distance-x', ['origin', 'a'], 4), k('length', ['l1'], 18), k('length', ['l2'], 9), k('horizontal', ['l1'])], status: 'fully-constrained', dof: 0 },
  { name: 'circle with a diameter dimension, centre pinned', entities: [pt('c', 4, 5), circ('k1', 'c', 3)], constraints: [k('distance-x', ['origin', 'c'], 10), k('distance-y', ['origin', 'c'], 6), k('diameter', ['k1'], 14)], status: 'fully-constrained', dof: 0 },
  { name: 'circle tangent to a fixed line leaves the position along the line free', entities: [pt('a', 0, 0), pt('b', 30, 0), pt('c', 14, 9), ln('l1', 'a', 'b'), circ('k1', 'c', 8)], constraints: [k('fixed', ['a']), k('fixed', ['b']), k('tangent', ['l1', 'k1']), k('radius', ['k1'], 6)], status: 'under-constrained', dof: 1 },
  { name: 'circle tangent to a line and positioned along it', entities: [pt('a', 0, 0), pt('b', 30, 0), pt('c', 14, 9), ln('l1', 'a', 'b'), circ('k1', 'c', 8)], constraints: [k('fixed', ['a']), k('fixed', ['b']), k('tangent', ['l1', 'k1']), k('radius', ['k1'], 6), k('distance-x', ['origin', 'c'], 12)], status: 'fully-constrained', dof: 0 },
  { name: 'concentric circles with equal and given radii', entities: [pt('c1', 5, 5), pt('c2', 5.4, 4.6), circ('k1', 'c1', 4), circ('k2', 'c2', 7)], constraints: [k('fixed', ['c1']), k('concentric', ['k1', 'k2']), k('radius', ['k1'], 4), k('equal', ['k1', 'k2'])], status: 'fully-constrained', dof: 0 },
  { name: 'two tangent circles', entities: [pt('c1', 0, 0), pt('c2', 11, 0.5), circ('k1', 'c1', 4), circ('k2', 'c2', 6)], constraints: [k('fixed', ['c1']), k('radius', ['k1'], 4), k('radius', ['k2'], 6), k('tangent', ['k1', 'k2']), k('horizontal', ['c1', 'c2'])], status: 'fully-constrained', dof: 0 },
  { name: 'point on circle and midpoint of a line', entities: [pt('c', 0, 0), pt('p', 4.5, 3.2), pt('a', 10, 0), pt('b', 14, 6), pt('m', 11.5, 2.5), circ('k1', 'c', 5), ln('l1', 'a', 'b')], constraints: [k('fixed', ['c']), k('radius', ['k1'], 5), k('point-on-circle', ['p', 'k1']), k('distance-x', ['origin', 'p'], 3), k('fixed', ['a']), k('fixed', ['b']), k('midpoint', ['m', 'l1'])], status: 'fully-constrained', dof: 0 },
  { name: 'point to line distance', entities: [pt('a', 0, 0), pt('b', 20, 0), pt('p', 6, 4), ln('l1', 'a', 'b')], constraints: [k('fixed', ['a']), k('fixed', ['b']), k('distance', ['p', 'l1'], 5), k('distance-x', ['origin', 'p'], 8)], status: 'fully-constrained', dof: 0 },
  { name: 'the same length given twice is redundant', entities: [pt('a', 0.2, 0.1), pt('b', 10, 0.3), ln('l1', 'a', 'b')], constraints: [k('coincident', ['a', 'origin']), k('horizontal', ['l1']), k('length', ['l1'], 10), k('length', ['l1'], 10)], status: 'over-constrained', dof: 0 },
  { name: 'conflicting lengths on one line', entities: [pt('a', 0, 0), pt('b', 10, 0), ln('l1', 'a', 'b')], constraints: [k('fixed', ['a']), k('horizontal', ['l1']), k('length', ['l1'], 10), k('length', ['l1'], 12)], status: 'conflicting', dof: 0 },
]

describe('recorded differences from planegcs', () => {
  it('a dimension between two fixed points: redundant here (fixed is a pair of equations), trivially satisfied in planegcs (fixed is a parameter flag)', () => {
    const sketch = { entities: [pt('a', 0, 0), pt('b', 10, 0), ln('l1', 'a', 'b')], constraints: [k('fixed', ['a']), k('fixed', ['b']), k('length', ['l1'], 10)] }
    const values = { [sketch.constraints[2].id]: 10 }
    const ours = builtInSketchSolver.solve(sketch, { values })
    const theirs = planegcsSolver.solve(sketch, { values })
    expect(ours.status).toBe('over-constrained')
    expect(theirs.status).toBe('fully-constrained')
    expect(ours.dof).toBe(theirs.dof)
  })
})

describe('built-in solver against the planegcs oracle', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const values: Record<string, number> = {}
      for (const x of c.constraints) if (isDimensional(x.type) && x.driving !== false && x.value !== undefined) values[x.id] = x.value as number
      const sketch = { entities: c.entities, constraints: c.constraints.map(({ v: _v, ...rest }) => rest) }
      const ours = builtInSketchSolver.solve(sketch, { values })
      const theirs = planegcsSolver.solve(sketch, { values })

      expect({ solver: 'ours', status: ours.status }).toEqual({ solver: 'ours', status: c.status })
      expect({ solver: 'planegcs', status: theirs.status }).toEqual({ solver: 'planegcs', status: c.status })
      if (c.status !== 'conflicting') expect({ solver: 'ours', dof: ours.dof }).toEqual({ solver: 'ours', dof: c.dof })
      if (c.status !== 'conflicting') expect({ solver: 'planegcs', dof: theirs.dof }).toEqual({ solver: 'planegcs', dof: c.dof })

      if (c.status === 'fully-constrained' || (c.status === 'over-constrained' && c.dof === 0)) {
        for (const [id, p] of Object.entries(theirs.points)) {
          expect(ours.points[id][0], `${id}.x`).toBeCloseTo(p[0], 6)
          expect(ours.points[id][1], `${id}.y`).toBeCloseTo(p[1], 6)
        }
        for (const [id, r] of Object.entries(theirs.radii)) expect(ours.radii[id], `radius ${id}`).toBeCloseTo(r, 6)
      }
      if (c.status === 'conflicting') {
        // Both identify the dimensions in the clash.
        const lengths = c.constraints.filter((x) => x.type === 'length').map((x) => x.id)
        expect(ours.conflicting.some((id) => lengths.includes(id))).toBe(true)
        expect(theirs.conflicting.some((id) => lengths.includes(id))).toBe(true)
      }
    })
  }
})
