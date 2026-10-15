import { CadError } from '../errors'
import { evaluateIn, type ParameterScope } from '../expr/parameters'
import { rotateAbout, toModel, v3, type FaceProbe, type KernelPlane, type KernelRegion, type KernelSegment, type Point2, type Vec3 } from '../kernel'
import type { PlaneRef, StandardPlane } from '../model/types'
import { interiorSample, pointInPolygon, polygon, segmentPoints, type ProfileRegion, type ProfileSegment } from '../sketch/profile'

/** Standard planes: origin, x direction and normal (y = normal × x). */
export const STANDARD_PLANES: Record<StandardPlane, KernelPlane> = {
  XY: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] },
  XZ: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0] },
  YZ: { origin: [0, 0, 0], xDir: [0, 1, 0], normal: [1, 0, 0] },
}

export function planeOf(ref: Extract<PlaneRef, { kind: 'standard' }>, scope: ParameterScope): KernelPlane {
  const base = STANDARD_PLANES[ref.plane]
  if (!base) throw new CadError('invalid-input', `Unknown plane “${ref.plane}”.`)
  const offset = ref.offset === undefined ? 0 : evaluateIn(scope, ref.offset)
  return { ...base, origin: v3.scale(base.normal, offset) }
}

export function toKernelSegment(s: ProfileSegment): KernelSegment {
  if (s.kind === 'line') return { kind: 'line', start: s.start, end: s.end }
  if (s.kind === 'arc') return { kind: 'arc', start: s.start, end: s.end, mid: s.mid }
  return { kind: 'circle', center: s.center, radius: s.radius }
}

export function toKernelRegions(regions: ProfileRegion[]): KernelRegion[] {
  return regions.map((r) => ({ outer: r.outer.segments.map(toKernelSegment), holes: r.holes.map((h) => h.segments.map(toKernelSegment)) }))
}

/** A point inside the region (inside the outer loop, outside every hole). */
/**
 * A point inside the region (inside the outer loop, outside every hole), as far from the boundary as
 * the candidates allow, so that later edge treatments (fillets, chamfers) near the boundary do not
 * move the probe onto another face. Deterministic for a given region.
 */
export function regionSample(region: ProfileRegion): Point2 {
  const outer = polygon(region.outer.segments)
  const holes = region.holes.map((h) => polygon(h.segments))
  const loops = [outer, ...holes]
  const inside = (p: Point2) => pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h))
  const clearance = (p: Point2) => Math.min(...loops.map((l) => distanceToPolygon(p, l)))
  const size = Math.sqrt(Math.abs(signedAreaOf(outer))) || 1
  const candidates: Point2[] = [centroid(outer)]
  const step = Math.max(1, Math.floor(outer.length / 24))
  const ccw = signedAreaOf(outer) >= 0 ? 1 : -1
  for (let i = 0; i < outer.length; i += step) {
    const a = outer[i]
    const b = outer[(i + 1) % outer.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-9) continue
    const n: Point2 = [(-(b[1] - a[1]) / len) * ccw, ((b[0] - a[0]) / len) * ccw]
    const m: Point2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    for (const f of [0.05, 0.15, 0.3, 0.45]) candidates.push([m[0] + n[0] * f * size, m[1] + n[1] * f * size])
  }
  let best: Point2 | undefined
  let bestClear = -1
  for (const p of candidates) {
    if (!inside(p)) continue
    const c = clearance(p)
    if (c > bestClear + 1e-12) {
      best = p
      bestClear = c
    }
  }
  return best ?? interiorSample(outer)
}

function signedAreaOf(poly: Point2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

function centroid(poly: Point2[]): Point2 {
  const a = signedAreaOf(poly)
  if (Math.abs(a) < 1e-12) return poly[0]
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    const k = x1 * y2 - x2 * y1
    cx += (x1 + x2) * k
    cy += (y1 + y2) * k
  }
  return [cx / (6 * a), cy / (6 * a)]
}

function distanceToPolygon(p: Point2, poly: Point2[]): number {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const vx = b[0] - a[0]
    const vy = b[1] - a[1]
    const l2 = vx * vx + vy * vy || 1e-300
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2))
    d = Math.min(d, Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)))
  }
  return d
}

const FRACTIONS = [0.5, 0.25, 0.75, 0.1, 0.9]

const suffix = (i: number, n: number) => (n > 1 ? `#${i + 1}` : '')

/** Naming probes for an extrusion (ADR-0024). */
export function extrudeProbes(featureId: string, plane: KernelPlane, regions: ProfileRegion[], vector: Vec3, startOffset: Vec3): FaceProbe[] {
  const probes: FaceProbe[] = []
  regions.forEach((region, ri) => {
    for (const loop of [region.outer, ...region.holes]) {
      for (const seg of loop.segments) {
        const base = segmentPoints(seg, [0.5])[0]
        const p0 = v3.add(toModel(plane, base), startOffset)
        probes.push({ name: `${featureId}/side:${seg.entityId}`, points: FRACTIONS.map((f) => v3.add(p0, v3.scale(vector, f))) })
      }
    }
    const inside = v3.add(toModel(plane, regionSample(region)), startOffset)
    probes.push({ name: `${featureId}/cap-start${suffix(ri, regions.length)}`, points: [inside] })
    probes.push({ name: `${featureId}/cap-end${suffix(ri, regions.length)}`, points: [v3.add(inside, vector)] })
  })
  return probes
}

/** Naming probes for a revolution (ADR-0024). Segments on the axis generate no face and are skipped. */
export function revolveProbes(featureId: string, plane: KernelPlane, regions: ProfileRegion[], axisOrigin: Vec3, axisDirection: Vec3, angle: number): FaceProbe[] {
  const probes: FaceProbe[] = []
  const onAxis = (p: Vec3) => v3.length(v3.cross(v3.sub(p, axisOrigin), v3.normalize(axisDirection))) < 1e-7
  regions.forEach((region, ri) => {
    for (const loop of [region.outer, ...region.holes]) {
      for (const seg of loop.segments) {
        const samples = segmentPoints(seg, [0, 0.5, 1]).map((p) => toModel(plane, p))
        if (samples.every(onAxis)) continue
        const mid = samples[1]
        probes.push({ name: `${featureId}/side:${seg.entityId}`, points: FRACTIONS.map((f) => rotateAbout(mid, axisOrigin, axisDirection, angle * f)) })
      }
    }
    if (angle < 360 - 1e-9) {
      const inside = toModel(plane, regionSample(region))
      probes.push({ name: `${featureId}/start${suffix(ri, regions.length)}`, points: [inside] })
      probes.push({ name: `${featureId}/end${suffix(ri, regions.length)}`, points: [rotateAbout(inside, axisOrigin, axisDirection, angle)] })
    }
  })
  return probes
}

/** True when the profile has points strictly on both sides of the axis line (in the sketch plane). */
export function crossesAxis(regions: ProfileRegion[], a: Point2, b: Point2): boolean {
  const d: Point2 = [b[0] - a[0], b[1] - a[1]]
  const len = Math.hypot(d[0], d[1]) || 1
  let pos = false
  let neg = false
  for (const r of regions)
    for (const loop of [r.outer, ...r.holes]) {
      for (const p of polygon(loop.segments)) {
        const s = (d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / len
        if (s > 1e-7) pos = true
        if (s < -1e-7) neg = true
      }
    }
  return pos && neg
}
