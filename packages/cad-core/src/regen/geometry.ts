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

export function planeOf(ref: PlaneRef, scope: ParameterScope): KernelPlane {
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
export function regionSample(region: ProfileRegion): Point2 {
  const outer = polygon(region.outer.segments)
  const holes = region.holes.map((h) => polygon(h.segments))
  const candidates: Point2[] = [interiorSample(outer)]
  // Try points near the middle of each outer edge as fallbacks.
  for (let i = 0; i < outer.length; i += Math.max(1, Math.floor(outer.length / 16))) {
    const rotated = [...outer.slice(i), ...outer.slice(0, i)]
    candidates.push(interiorSample(rotated))
  }
  return candidates.find((p) => pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h))) ?? candidates[0]
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
