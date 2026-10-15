import type { SketchConstraint, SketchEntity } from '../model/types'
import type { SketchSolution, Vec2 } from './solver'

/**
 * Closed profiles from solved sketch geometry. Non-construction lines, arcs and circles are joined
 * through shared points (and points made coincident by constraints or within tolerance) into loops;
 * nesting decides outer boundaries and holes (even/odd depth).
 */

export type ProfileSegment =
  | { kind: 'line'; entityId: string; start: Vec2; end: Vec2 }
  | { kind: 'arc'; entityId: string; start: Vec2; end: Vec2; mid: Vec2; center: Vec2; radius: number }
  | { kind: 'circle'; entityId: string; center: Vec2; radius: number }

export interface ProfileLoop {
  segments: ProfileSegment[]
  /** Signed area of the loop in traversal order (positive = counter-clockwise). */
  signedArea: number
}

export interface ProfileRegion {
  outer: ProfileLoop
  holes: ProfileLoop[]
  /** Area of the region (outer minus holes), mm². */
  area: number
}

export interface ProfileIssue {
  code: 'open-profile' | 'branching-profile' | 'self-intersecting' | 'empty-profile'
  message: string
  entityIds: string[]
}

export interface Profile {
  regions: ProfileRegion[]
  issues: ProfileIssue[]
}

const TOL = 1e-6

export function extractProfile(entities: SketchEntity[], constraints: SketchConstraint[], solution: Pick<SketchSolution, 'points' | 'radii'>): Profile {
  const issues: ProfileIssue[] = []
  const pts = solution.points
  // Union-find over points: coincident constraints and positional coincidence.
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    let r = a
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!
    parent.set(a, r)
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  const pointIds = Object.keys(pts)
  for (const id of pointIds) parent.set(id, id)
  for (const c of constraints) if (c.type === 'coincident' && pts[c.entities[0]] && pts[c.entities[1]]) union(c.entities[0], c.entities[1])
  for (let i = 0; i < pointIds.length; i++)
    for (let j = i + 1; j < pointIds.length; j++) {
      const a = pts[pointIds[i]]
      const b = pts[pointIds[j]]
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < TOL) union(pointIds[i], pointIds[j])
    }

  type Edge = { id: string; a: string; b: string; seg: (from: string) => ProfileSegment }
  const edges: Edge[] = []
  const loops: ProfileLoop[] = []
  for (const e of entities) {
    if (e.construction) continue
    if (e.type === 'line') {
      const s = pts[e.start]
      const t = pts[e.end]
      if (!s || !t) continue
      if (Math.hypot(t[0] - s[0], t[1] - s[1]) < TOL) continue
      edges.push({
        id: e.id,
        a: find(e.start),
        b: find(e.end),
        seg: (from) => (from === find(e.start) ? { kind: 'line', entityId: e.id, start: s, end: t } : { kind: 'line', entityId: e.id, start: t, end: s }),
      })
    } else if (e.type === 'arc') {
      const c = pts[e.center]
      const s = pts[e.start]
      const t = pts[e.end]
      const r = solution.radii[e.id]
      if (!c || !s || !t || !(r > 0)) continue
      const a0 = Math.atan2(s[1] - c[1], s[0] - c[0])
      let a1 = Math.atan2(t[1] - c[1], t[0] - c[0])
      if (a1 <= a0 + 1e-12) a1 += 2 * Math.PI
      const am = (a0 + a1) / 2
      const mid: Vec2 = [c[0] + r * Math.cos(am), c[1] + r * Math.sin(am)]
      edges.push({
        id: e.id,
        a: find(e.start),
        b: find(e.end),
        seg: (from) =>
          from === find(e.start)
            ? { kind: 'arc', entityId: e.id, start: s, end: t, mid, center: c, radius: r }
            : { kind: 'arc', entityId: e.id, start: t, end: s, mid, center: c, radius: r },
      })
    } else if (e.type === 'circle') {
      const c = pts[e.center]
      const r = solution.radii[e.id]
      if (!c || !(r > 0)) continue
      const seg: ProfileSegment = { kind: 'circle', entityId: e.id, center: c, radius: r }
      loops.push({ segments: [seg], signedArea: Math.PI * r * r })
    }
  }

  const byNode = new Map<string, Edge[]>()
  for (const e of edges) {
    byNode.set(e.a, [...(byNode.get(e.a) ?? []), e])
    byNode.set(e.b, [...(byNode.get(e.b) ?? []), e])
  }
  const bad = new Set<string>()
  for (const [node, list] of byNode) {
    if (list.length === 1) {
      issues.push({ code: 'open-profile', message: `The profile is open at point ${node} (${list[0].id} has a free end).`, entityIds: [list[0].id, node] })
      bad.add(list[0].id)
    } else if (list.length > 2) {
      issues.push({ code: 'branching-profile', message: `More than two profile edges meet at point ${node} (${list.map((e) => e.id).join(', ')}).`, entityIds: [...list.map((e) => e.id), node] })
      list.forEach((e) => bad.add(e.id))
    }
  }

  const used = new Set<string>()
  for (const start of edges) {
    if (used.has(start.id) || bad.has(start.id)) continue
    const segments: ProfileSegment[] = []
    let edge: Edge | undefined = start
    let node = start.a
    let closed = false
    while (edge && !used.has(edge.id)) {
      used.add(edge.id)
      segments.push(edge.seg(node))
      node = edge.a === node ? edge.b : edge.a
      if (node === start.a) {
        closed = true
        break
      }
      edge = (byNode.get(node) ?? []).find((e) => !used.has(e.id) && !bad.has(e.id))
    }
    if (!closed) {
      if (!segments.some((s) => bad.has(s.entityId))) issues.push({ code: 'open-profile', message: `The edges ${segments.map((s) => s.entityId).join(', ')} do not form a closed loop.`, entityIds: segments.map((s) => s.entityId) })
      continue
    }
    loops.push({ segments, signedArea: signedArea(polygon(segments)) })
  }

  // Self-intersection check (line segments only; arcs are approximated by their chords' polygon).
  const polys = loops.map((l) => polygon(l.segments))
  for (let i = 0; i < loops.length; i++) {
    for (let j = i; j < loops.length; j++) {
      const hit = loopsIntersect(polys[i], polys[j], i === j)
      if (hit) issues.push({ code: 'self-intersecting', message: i === j ? 'A profile loop crosses itself.' : 'Two profile loops cross each other.', entityIds: [...loops[i].segments, ...loops[j].segments].map((s) => s.entityId) })
    }
  }

  // Nesting: depth = number of loops containing a loop.
  const depth = loops.map((_, i) => loops.filter((_, k) => k !== i && Math.abs(loops[k].signedArea) > Math.abs(loops[i].signedArea) && pointInPolygon(interiorSample(polys[i]), polys[k])).length)
  const parentOf = loops.map((_, i) => {
    let best = -1
    loops.forEach((_, k) => {
      if (k === i || depth[k] !== depth[i] - 1) return
      if (Math.abs(loops[k].signedArea) > Math.abs(loops[i].signedArea) && pointInPolygon(interiorSample(polys[i]), polys[k])) best = k
    })
    return best
  })
  const regions: ProfileRegion[] = []
  loops.forEach((outer, i) => {
    if (depth[i] % 2 !== 0) return
    const holes = loops.filter((_, k) => parentOf[k] === i && depth[k] === depth[i] + 1)
    regions.push({ outer, holes, area: Math.abs(outer.signedArea) - holes.reduce((s, h) => s + Math.abs(h.signedArea), 0) })
  })
  if (!regions.length && !issues.length) issues.push({ code: 'empty-profile', message: 'The sketch has no closed profile (construction geometry is ignored).', entityIds: [] })
  return { regions, issues }
}

/** Polygonal approximation of a loop (arcs and circles sampled). */
export function polygon(segments: ProfileSegment[]): Vec2[] {
  const out: Vec2[] = []
  for (const s of segments) {
    if (s.kind === 'line') out.push(s.start)
    else if (s.kind === 'circle') {
      for (let k = 0; k < 64; k++) out.push([s.center[0] + s.radius * Math.cos((2 * Math.PI * k) / 64), s.center[1] + s.radius * Math.sin((2 * Math.PI * k) / 64)])
    } else {
      const a0 = Math.atan2(s.start[1] - s.center[1], s.start[0] - s.center[0])
      const am = Math.atan2(s.mid[1] - s.center[1], s.mid[0] - s.center[0])
      const a1 = Math.atan2(s.end[1] - s.center[1], s.end[0] - s.center[0])
      // Sweep from start through mid to end.
      const ccw = normalize(am - a0) < normalize(a1 - a0)
      const sweep = ccw ? normalize(a1 - a0) : -normalize(a0 - a1)
      for (let k = 0; k < 16; k++) {
        const a = a0 + (sweep * k) / 16
        out.push([s.center[0] + s.radius * Math.cos(a), s.center[1] + s.radius * Math.sin(a)])
      }
    }
  }
  return out
}

const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

export function signedArea(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A point strictly inside a simple polygon (near the middle of its first edge, on the inner side). */
export function interiorSample(poly: Vec2[]): Vec2 {
  const area = signedArea(poly)
  const size = Math.sqrt(Math.abs(area)) || 1
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-9) continue
    const sign = area >= 0 ? 1 : -1
    const nx = (-(b[1] - a[1]) / len) * sign
    const ny = ((b[0] - a[0]) / len) * sign
    for (const eps of [1e-3 * size, 1e-2 * size, 0.1 * size]) {
      const p: Vec2 = [(a[0] + b[0]) / 2 + nx * eps, (a[1] + b[1]) / 2 + ny * eps]
      if (pointInPolygon(p, poly)) return p
    }
  }
  return poly[0]
}

function segmentsCross(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
}

function loopsIntersect(a: Vec2[], b: Vec2[], same: boolean): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = same ? i + 2 : 0; j < b.length; j++) {
      if (same && i === 0 && j === b.length - 1) continue
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return false
}

/** The point on a segment halfway along it (used for naming probes). */
export function segmentMidpoint(s: ProfileSegment): Vec2 {
  if (s.kind === 'line') return [(s.start[0] + s.end[0]) / 2, (s.start[1] + s.end[1]) / 2]
  if (s.kind === 'arc') return s.mid
  return [s.center[0] + s.radius, s.center[1]]
}

/** Points along a segment at the given fractions (for probes). */
export function segmentPoints(s: ProfileSegment, fractions: number[]): Vec2[] {
  if (s.kind === 'line') return fractions.map((f) => [s.start[0] + (s.end[0] - s.start[0]) * f, s.start[1] + (s.end[1] - s.start[1]) * f])
  if (s.kind === 'circle') return fractions.map((f) => [s.center[0] + s.radius * Math.cos(2 * Math.PI * f), s.center[1] + s.radius * Math.sin(2 * Math.PI * f)])
  const poly = polygon([s])
  const last = s.end
  const all = [...poly, last]
  return fractions.map((f) => all[Math.min(all.length - 1, Math.round(f * (all.length - 1)))])
}
