import {
  KernelError,
  type EdgeInfo,
  type FaceInfo,
  type FaceProbe,
  type GeometryKernel,
  type KernelInfo,
  type KernelRegion,
  type KernelSegment,
  type MeshData,
  type ShapeAnalysis,
  type ShapeHandle,
  type SolidRequest,
  type StepExportBody,
  type StepExportOptions,
  type Vec3,
} from '@ews/cad-core'
import * as r from 'replicad'
import type { OpenCascadeInstance } from 'replicad-opencascadejs'
import { OCCT_KERNEL_INFO } from './info'

type Shape3D = ReturnType<r.Sketch['extrude']>
type Drawing = r.Drawing

/** Tolerance (mm) for a probe point to count as lying on a face. */
const PROBE_TOLERANCE = 1e-4


/**
 * GeometryKernel on Open CASCADE through replicad, running in the current thread. Browsers run it
 * inside the kernel worker (worker/kernel.worker.ts); Node runs it in-process (node.ts).
 */
export class OcctKernel implements GeometryKernel {
  readonly info: KernelInfo
  private readonly shapes = new Map<string, Shape3D>()
  private counter = 0

  constructor(
    private readonly oc: OpenCascadeInstance,
    execution: KernelInfo['execution'] = 'in-process',
  ) {
    r.setOC(oc)
    this.info = { ...OCCT_KERNEL_INFO, execution }
  }

  private store(shape: Shape3D): ShapeHandle {
    const id = `shape-${++this.counter}`
    this.shapes.set(id, shape)
    return { id }
  }

  private get(handle: ShapeHandle): Shape3D {
    const s = this.shapes.get(handle.id)
    if (!s) throw new KernelError('not-found', `Shape ${handle.id} is not in the kernel (released or never created).`)
    return s
  }

  async makeSolid(req: SolidRequest): Promise<ShapeHandle> {
    if (!req.regions.length) throw new KernelError('invalid-profile', 'The profile has no region.')
    let drawing: Drawing | undefined
    try {
      for (const region of req.regions) {
        let face = loopDrawing(region.outer)
        for (const hole of region.holes) face = face.cut(loopDrawing(hole))
        drawing = drawing ? drawing.fuse(face) : face
      }
    } catch (e) {
      throw new KernelError('invalid-profile', `The kernel could not build a face from the profile: ${message(e)}`)
    }
    let solid: Shape3D
    try {
      if (req.sweep.kind === 'extrude') {
        const { vector, startOffset } = req.sweep
        const length = Math.hypot(...vector)
        if (!(length > 0)) throw new KernelError('invalid-profile', 'Extrusion length is zero.')
        const origin = add(req.plane.origin, startOffset)
        const plane = new r.Plane(origin, req.plane.xDir, req.plane.normal)
        const sketch = drawing!.sketchOnPlane(plane) as r.Sketch
        solid = sketch.extrude(length, { extrusionDirection: vector.map((v) => v / length) as Vec3 }) as Shape3D
      } else {
        const { axisOrigin, axisDirection, angle } = req.sweep
        const plane = new r.Plane(req.plane.origin, req.plane.xDir, req.plane.normal)
        const sketch = drawing!.sketchOnPlane(plane) as r.Sketch
        solid = sketch.revolve(axisDirection, { origin: axisOrigin, angle }) as Shape3D
      }
    } catch (e) {
      if (e instanceof KernelError) throw e
      throw new KernelError('kernel-failure', `The kernel could not build the solid: ${message(e)}`)
    }
    if (!solid || solid.faces.length === 0) throw new KernelError('empty-result', 'The operation produced no geometry.')
    return this.store(solid)
  }

  async boolean(kind: 'fuse' | 'cut', target: ShapeHandle, tool: ShapeHandle): Promise<ShapeHandle> {
    const a = this.get(target)
    const b = this.get(tool)
    let out: Shape3D
    try {
      // Clones keep cached inputs intact. No "sameFace" optimisation: with coplanar caps it
      // produced a solid with an internal void instead of a through hole (regression test).
      out = (kind === 'fuse' ? a.clone().fuse(b.clone()) : a.clone().cut(b.clone())) as Shape3D
      out = out.simplify() as Shape3D
    } catch (e) {
      throw new KernelError('boolean-failed', `The ${kind === 'fuse' ? 'join' : 'cut'} failed in the kernel: ${message(e)}`)
    }
    if (!out || out.faces.length === 0) throw new KernelError('empty-result', kind === 'cut' ? 'The cut removed the whole body.' : 'The join produced no geometry.')
    return this.store(out)
  }

  async analyze(handle: ShapeHandle, probes: FaceProbe[]): Promise<ShapeAnalysis> {
    const shape = this.get(handle)
    const faces = shape.faces
    const edges = shape.edges
    const props = r.measureShapeVolumeProperties(shape)
    const volume = props.volume
    const centerOfMass = props.centerOfMass as Vec3
    props.delete?.()
    const bounds = shape.boundingBox.bounds as [Vec3, Vec3]

    // Probe-based naming (ADR-0024).
    const names: string[][] = faces.map(() => [])
    const vertexCache = new Map<string, r.Vertex>()
    const faceBoxes = faces.map((f) => f.boundingBox.bounds as [Vec3, Vec3])
    for (const probe of probes) {
      let assigned = false
      for (const p of probe.points) {
        for (let i = 0; i < faces.length && !assigned; i++) {
          const [mn, mx] = faceBoxes[i]
          if (p.some((v, k) => v < mn[k] - 1e-3 || v > mx[k] + 1e-3)) continue
          const key = p.join(',')
          let vtx = vertexCache.get(key)
          if (!vtx) {
            vtx = r.makeVertex(p)
            vertexCache.set(key, vtx)
          }
          if (r.measureDistanceBetween(faces[i], vtx) < PROBE_TOLERANCE) {
            names[i].push(probe.name)
            assigned = true
          }
        }
        if (assigned) break
      }
    }
    vertexCache.forEach((v) => v.delete())

    const faceInfos: FaceInfo[] = faces.map((f, index) => {
      const own = names[index]
      const center = f.center
      let normal: Vec3 | undefined
      try {
        const n = f.normalAt(center)
        normal = [n.x, n.y, n.z].map(clean) as Vec3
        n.delete()
      } catch {
        normal = undefined
      }
      const info: FaceInfo = {
        index,
        name: own[0] ?? `face#${index + 1}`,
        aliases: own.slice(1),
        stable: own.length > 0,
        surfaceType: String(f.geomType),
        area: r.measureArea(f),
        center: [center.x, center.y, center.z].map(clean) as Vec3,
        normal,
      }
      center.delete()
      return info
    })

    // Edges named by their adjacent faces.
    const edgeFaces = new Map<number, number[]>()
    faces.forEach((f, fi) => {
      for (const e of f.edges) {
        const idx = edges.findIndex((x) => x.isSame(e))
        if (idx >= 0) edgeFaces.set(idx, [...(edgeFaces.get(idx) ?? []), fi])
      }
    })
    const usedEdgeNames = new Map<string, number>()
    const edgeInfos: EdgeInfo[] = edges.map((e, index) => {
      const adjacent = [...new Set(edgeFaces.get(index) ?? [])].map((fi) => faceInfos[fi].name).sort()
      const base = `edge(${adjacent.join('|')})`
      const n = (usedEdgeNames.get(base) ?? 0) + 1
      usedEdgeNames.set(base, n)
      return { index, name: n > 1 ? `${base}#${n}` : base, curveType: String(e.geomType), length: e.length, faces: adjacent }
    })
    // Number duplicates consistently (#1 for the first when a base repeats).
    for (const [base, count] of usedEdgeNames) if (count > 1) edgeInfos.find((x) => x.name === base)!.name = `${base}#1`

    let valid = false
    try {
      const analyzer = new this.oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)
      valid = analyzer.IsValid()
      analyzer.delete()
    } catch {
      valid = false
    }
    const vertices = countSub(this.oc, shape, 'vertex')
    return {
      valid,
      volume,
      area: r.measureArea(shape),
      centerOfMass: centerOfMass.map(clean) as Vec3,
      boundingBox: { min: bounds[0].map(clean) as Vec3, max: bounds[1].map(clean) as Vec3 },
      counts: { solids: shape.solids?.length ?? 0, shells: countSub(this.oc, shape, 'shell'), faces: faces.length, edges: edges.length, vertices },
      faces: faceInfos,
      edges: edgeInfos,
    }
  }

  async mesh(handle: ShapeHandle, options: { tolerance?: number; angularTolerance?: number } = {}): Promise<MeshData> {
    const shape = this.get(handle)
    const m = shape.mesh({ tolerance: options.tolerance ?? 0.05, angularTolerance: options.angularTolerance ?? 0.3 })
    const e = shape.meshEdges({ tolerance: options.tolerance ?? 0.05, angularTolerance: options.angularTolerance ?? 0.3 })
    // Edge polylines → line segment pairs.
    const segs: number[] = []
    const edgeRanges: MeshData['edgeRanges'] = []
    for (const g of e.edgeGroups) {
      const startSeg = segs.length / 6
      for (let k = g.start; k < g.start + g.count - 1; k++) segs.push(e.lines[k * 3], e.lines[k * 3 + 1], e.lines[k * 3 + 2], e.lines[k * 3 + 3], e.lines[k * 3 + 4], e.lines[k * 3 + 5])
      edgeRanges.push({ edge: g.edgeId, start: startSeg, count: segs.length / 6 - startSeg })
    }
    // The mesher reports faces and edges by OCCT hash code; map them to indices of shape.faces/edges
    // (the order ShapeAnalysis uses), falling back to group order.
    const faceIndex = new Map<number, number>()
    shape.faces.forEach((f, i) => faceIndex.set(f.hashCode, i))
    const edgeIndex = new Map<number, number>()
    shape.edges.forEach((x, i) => edgeIndex.set(x.hashCode, i))
    for (const r of edgeRanges) r.edge = edgeIndex.get(r.edge) ?? -1
    return {
      positions: Float32Array.from(m.vertices),
      normals: Float32Array.from(m.normals),
      indices: Uint32Array.from(m.triangles),
      faceRanges: m.faceGroups.map((g, i) => ({ face: faceIndex.get(g.faceId) ?? i, start: g.start, count: g.count })),
      edgePositions: Float32Array.from(segs),
      edgeRanges,
    }
  }

  async exportStep(bodies: StepExportBody[], options: StepExportOptions = {}): Promise<string> {
    if (!bodies.length) throw new KernelError('empty-result', 'Nothing to export.')
    try {
      this.oc.Interface_Static.SetCVal('write.step.schema', 'AP242DIS')
    } catch {
      /* default schema of this build is AP242 already */
    }
    const blob = r.exportSTEP(
      bodies.map((b) => ({ shape: this.get(b.shape), name: b.name, color: b.color })),
      { unit: options.unit ?? 'mm', modelUnit: 'mm' },
    )
    return blob.text()
  }

  async importStep(text: string): Promise<{ shapes: ShapeHandle[]; analyses: ShapeAnalysis[] }> {
    let shape: r.AnyShape
    try {
      shape = await r.importSTEP(new Blob([text]))
    } catch (e) {
      throw new KernelError('import-failed', `The STEP file could not be read: ${message(e)}`)
    }
    const solids = (shape as Shape3D).solids ?? []
    const parts = (solids.length ? solids : [shape]) as Shape3D[]
    const shapes = parts.map((s) => this.store(s))
    const analyses: ShapeAnalysis[] = []
    for (const h of shapes) analyses.push(await this.analyze(h, []))
    return { shapes, analyses }
  }

  async release(handles: ShapeHandle[]): Promise<void> {
    for (const h of handles) {
      const s = this.shapes.get(h.id)
      if (!s) continue
      this.shapes.delete(h.id)
      try {
        s.delete()
      } catch {
        /* already freed */
      }
    }
  }

  async dispose(): Promise<void> {
    await this.release([...this.shapes.keys()].map((id) => ({ id })))
  }

  /** Number of live shapes (for leak tests). */
  get liveShapes(): number {
    return this.shapes.size
  }
}

function loopDrawing(segments: KernelSegment[]): Drawing {
  if (segments.length === 1 && segments[0].kind === 'circle') {
    const c = segments[0]
    return r.drawCircle(c.radius).translate(c.center[0], c.center[1])
  }
  const first = segments[0]
  if (first.kind === 'circle') throw new KernelError('invalid-profile', 'A circle cannot be part of a loop with other edges.')
  let pen = r.draw(first.start)
  for (const s of segments) {
    if (s.kind === 'line') pen = pen.lineTo(s.end)
    else if (s.kind === 'arc') pen = pen.threePointsArcTo(s.end, s.mid)
    else throw new KernelError('invalid-profile', 'A circle cannot be part of a loop with other edges.')
  }
  return pen.close()
}

function countSub(_oc: OpenCascadeInstance, shape: Shape3D, kind: 'shell' | 'vertex'): number {
  let n = 0
  for (const s of r.iterTopo(shape.wrapped, kind)) {
    n++
    s.delete?.()
  }
  return n
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const clean = (v: number) => {
  const x = Math.round(v * 1e9) / 1e9
  return Object.is(x, -0) ? 0 : x
}
const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'number' ? `OCCT exception (${e})` : String(e))

export type { KernelRegion }
