import {
  KernelError,
  type BooleanHint,
  type EdgeBlendRequest,
  type EdgeBlendResult,
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
  /** Face names recorded from shape history (ADR-0024 amendment), aligned to `shape.faces`; '' = none. */
  private readonly lineage = new Map<string, string[]>()
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

  async distance(a: ShapeHandle, b: ShapeHandle): Promise<number> {
    try {
      return r.measureDistanceBetween(this.get(a), this.get(b))
    } catch (e) {
      throw new KernelError('kernel-failure', `Distance measurement failed: ${message(e)}`)
    }
  }

  async boolean(kind: 'fuse' | 'cut', target: ShapeHandle, tool: ShapeHandle, hint?: BooleanHint): Promise<ShapeHandle> {
    const a = this.get(target)
    const b = this.get(tool)
    const oc = this.oc
    let out: Shape3D
    let history: string[] | undefined
    // Names of the arguments before the operation (history overlay, then probes).
    const namesA = hint ? this.stableNames(target, hint.targetProbes) : undefined
    const namesB = hint ? this.stableNames(tool, hint.toolProbes) : undefined
    try {
      // Clones keep cached inputs intact. No "sameFace" optimisation: with coplanar caps it
      // produced a solid with an internal void instead of a through hole (regression test).
      const ca = a.clone()
      const cb = b.clone()
      const builder = kind === 'fuse' ? new oc.BRepAlgoAPI_Fuse(ca.wrapped, cb.wrapped) : new oc.BRepAlgoAPI_Cut(ca.wrapped, cb.wrapped)
      try {
        builder.Build()
        if (builder.HasErrors()) throw new Error('the Boolean algorithm reported errors')
        // Merges coplanar faces and collinear edges; the builder's history includes this step.
        builder.SimplifyResult(true, true, 0.001)
        out = r.cast(builder.Shape()) as Shape3D
        if (hint && out && out.faces.length > 0 && sameOrder(a, ca) && sameOrder(b, cb)) {
          history = inheritNames(oc, builder, [{ source: ca.faces, names: namesA! }, { source: cb.faces, names: namesB! }], out.faces)
        }
      } finally {
        builder.delete()
      }
    } catch (e) {
      throw new KernelError('boolean-failed', `The ${kind === 'fuse' ? 'join' : 'cut'} failed in the kernel: ${message(e)}`)
    }
    if (!out || out.faces.length === 0) throw new KernelError('empty-result', kind === 'cut' ? 'The cut removed the whole body.' : 'The join produced no geometry.')
    const handle = this.store(out)
    if (history) this.lineage.set(handle.id, history)
    return handle
  }

  /** Stable face names of a stored shape (history names first, then probes); '' for unnamed faces. */
  private stableNames(handle: ShapeHandle, probes: FaceProbe[]): string[] {
    const shape = this.get(handle)
    const naming = topologyNames(shape.faces, shape.edges, probes, this.lineage.get(handle.id))
    return naming.faceNames.map((n, i) => (naming.faceStable[i] ? n : ''))
  }

  async blendEdges(req: EdgeBlendRequest): Promise<EdgeBlendResult> {
    const shape = this.get(req.target)
    if (!(req.size > 0)) throw new KernelError('invalid-value', `The ${req.kind} size must be greater than zero.`)
    const edges = shape.edges
    const naming = topologyNames(shape.faces, edges, req.probes, this.lineage.get(req.target.id))
    const selected: Edge[] = []
    const missing: string[] = []
    for (const name of req.edges) {
      const i = naming.edgeNames.indexOf(name)
      if (i < 0) missing.push(name)
      else selected.push(edges[i])
    }
    if (missing.length) {
      const available = naming.edgeNames.filter((n) => !n.includes('face#')).slice(0, 16)
      throw new KernelError('reference-lost', `Edge${missing.length > 1 ? 's' : ''} ${missing.join(', ')} no longer exist${missing.length > 1 ? '' : 's'} on the body. Choose edges again. Available: ${available.join(', ')}${naming.edgeNames.length > 16 ? ' …' : ''}`)
    }
    const midpoints = selected.map((e) => {
      const p = e.pointAt(0.5)
      const out: Vec3 = [p.x, p.y, p.z]
      p.delete()
      return out
    })
    let out: Shape3D
    let history: string[] | undefined
    const names = this.stableNames(req.target, req.probes)
    try {
      const oc = this.oc
      const clone = shape.clone()
      const builder = req.kind === 'fillet' ? new oc.BRepFilletAPI_MakeFillet(clone.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational) : new oc.BRepFilletAPI_MakeChamfer(clone.wrapped)
      try {
        // Edges come from the clone, by the index they have on the original (same order, checked below).
        const cloneEdges = clone.edges
        for (const e of selected) builder.Add(req.size, cloneEdges[edges.findIndex((x) => x.isSame(e))].wrapped)
        builder.Build()
        if (!builder.IsDone()) throw new Error('the algorithm did not finish')
        out = r.cast(builder.Shape()) as Shape3D
        if (out && out.faces.length > 0 && sameOrder(shape, clone)) history = inheritNames(oc, builder, [{ source: clone.faces, names }], out.faces)
      } finally {
        builder.delete()
      }
    } catch (e) {
      throw new KernelError('blend-failed', `The ${req.kind} of ${req.size} mm failed in the kernel (${message(e)}). Typical causes: the size is larger than an adjacent face allows, or edges meet at a vertex the ${req.kind} cannot resolve.`)
    }
    if (!out || out.faces.length === 0) throw new KernelError('empty-result', `The ${req.kind} produced no geometry.`)
    // Name each generated face after the edge it replaces: project the old edge midpoint onto the
    // nearest face that no existing probe names, and use that surface point as the probe.
    const after = topologyNames(out.faces, out.edges, req.probes, history)
    const probes: FaceProbe[] = []
    req.edges.forEach((name, k) => {
      const m = midpoints[k]
      const vtx = r.makeVertex(m)
      let best = -1
      let bestD = Infinity
      out.faces.forEach((f, i) => {
        if (after.faceStable[i]) return
        const d = r.measureDistanceBetween(f, vtx)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      vtx.delete()
      if (best < 0 || bestD > req.size * 1.5 + 1e-6) return
      const f = out.faces[best]
      try {
        // uvCoordinates returns surface parameters; pointOnSurface takes them normalised to the face's UV bounds.
        const [u, v] = f.uvCoordinates(m)
        const b = f.UVBounds
        const p = f.pointOnSurface((u - b.uMin) / (b.uMax - b.uMin || 1), (v - b.vMin) / (b.vMax - b.vMin || 1))
        probes.push({ name: `${req.featureId}/blend:${name}`, points: [[p.x, p.y, p.z]] })
        p.delete()
      } catch {
        /* the face keeps a fallback name */
      }
    })
    const handle = this.store(out)
    if (history) this.lineage.set(handle.id, history)
    return { shape: handle, probes }
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

    // Probe-based naming (ADR-0024), shared with blendEdges so both see the same names.
    const naming = topologyNames(faces, edges, probes, this.lineage.get(handle.id))

    const faceInfos: FaceInfo[] = faces.map((f, index) => {
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
        name: naming.faceNames[index],
        aliases: naming.faceAliases[index],
        stable: naming.faceStable[index],
        surfaceType: String(f.geomType),
        area: r.measureArea(f),
        center: [center.x, center.y, center.z].map(clean) as Vec3,
        normal,
      }
      center.delete()
      return info
    })
    const edgeInfos: EdgeInfo[] = edges.map((e, index) => ({ index, name: naming.edgeNames[index], curveType: String(e.geomType), length: e.length, faces: naming.edgeFaces[index] }))

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
      this.lineage.delete(h.id)
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

type Face = Shape3D['faces'][number]
type Edge = Shape3D['edges'][number]

/**
 * Stable names of faces (first probe whose point lies on the face; later ones are aliases; unmatched
 * faces get flagged fallback names) and of edges (sorted adjacent face names, `#n` for repeats).
 */
function topologyNames(faces: Face[], edges: Edge[], probes: FaceProbe[], inherited?: string[]) {
  const names: string[][] = faces.map(() => [])
  // Names recorded by the shape history win; a probe may not take a name that history gave to a face.
  const claimed = new Set<string>()
  inherited?.forEach((n, i) => {
    if (!n || i >= faces.length) return
    names[i].push(n)
    claimed.add(n)
  })
  const vertexCache = new Map<string, r.Vertex>()
  const faceBoxes = faces.map((f) => f.boundingBox.bounds as [Vec3, Vec3])
  for (const probe of probes) {
    if (claimed.has(probe.name)) continue
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
  const faceNames = names.map((own, i) => own[0] ?? `face#${i + 1}`)
  const edgeFaceIdx = new Map<number, number[]>()
  faces.forEach((f, fi) => {
    for (const e of f.edges) {
      const idx = edges.findIndex((x) => x.isSame(e))
      if (idx >= 0) edgeFaceIdx.set(idx, [...(edgeFaceIdx.get(idx) ?? []), fi])
    }
  })
  const edgeFaces = edges.map((_, i) => [...new Set(edgeFaceIdx.get(i) ?? [])].map((fi) => faceNames[fi]).sort())
  const bases = edgeFaces.map((adj) => `edge(${adj.join('|')})`)
  const total = new Map<string, number>()
  bases.forEach((b) => total.set(b, (total.get(b) ?? 0) + 1))
  const seen = new Map<string, number>()
  const edgeNames = bases.map((b) => {
    if ((total.get(b) ?? 0) < 2) return b
    const n = (seen.get(b) ?? 0) + 1
    seen.set(b, n)
    return `${b}#${n}`
  })
  return { faceNames, faceAliases: names.map((own) => own.slice(1)), faceStable: names.map((own) => own.length > 0), edgeNames, edgeFaces }
}

/** True when two shapes list faces and edges in the same order (a clone keeps it); history is used only then. */
type Vec = { x: number; y: number; z: number; delete: () => void }
function sameOrder(a: Shape3D, b: Shape3D): boolean {
  const close = (p: Vec, q: Vec) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    p.delete()
    q.delete()
    return d < 1e-7
  }
  const fa = a.faces
  const fb = b.faces
  const ea = a.edges
  const eb = b.edges
  if (fa.length !== fb.length || ea.length !== eb.length) return false
  return fa.every((f, i) => close(f.center, fb[i].center)) && ea.every((e, i) => close(e.pointAt(0.5), eb[i].pointAt(0.5)))
}

/** The part of the builder's history this module needs (BRepBuilderAPI_MakeShape). */
interface ShapeHistory {
  Modified(s: never): unknown
  IsDeleted(s: never): boolean
}

/** Indices (in `outFaces`) of the faces a source face became: its modified pieces, itself when unchanged, none when deleted. */
function descendants(oc: OpenCascadeInstance, builder: ShapeHistory, face: Face, outFaces: Face[]): number[] {
  if (builder.IsDeleted(face.wrapped as never)) return []
  const pieces: number[] = []
  // Copy the builder's list (a reference into the builder) and consume the copy.
  const list = new oc.NCollection_List_TopoDS_Shape(builder.Modified(face.wrapped as never) as never)
  try {
    while (!list.IsEmpty()) {
      const first = list.First()
      const j = outFaces.findIndex((f) => f.wrapped.IsSame(first))
      if (j >= 0 && !pieces.includes(j)) pieces.push(j)
      list.RemoveFirst()
    }
  } finally {
    list.delete()
  }
  if (!pieces.length) {
    const j = outFaces.findIndex((f) => f.wrapped.IsSame(face.wrapped))
    if (j >= 0) pieces.push(j)
  }
  return pieces
}

/**
 * Shape history as a naming signal (ADR-0024 amendment). Every named face of the arguments passes its
 * name to the faces it became. When a face is split, the piece with the smallest centre (x, then y,
 * then z) keeps the name and the other pieces are numbered \`<name>~2\`, \`~3\`, … in that order, continuing
 * the numbers already used for that name, so earlier pieces keep their names when later operations add
 * pieces. Returns names aligned to \`outFaces\` ('' = no history name; probes decide).
 */
function inheritNames(oc: OpenCascadeInstance, builder: ShapeHistory, sources: { source: Face[]; names: string[] }[], outFaces: Face[]): string[] {
  const out = outFaces.map(() => '')
  const known = new Set(sources.flatMap((s) => s.names).filter(Boolean))
  const centre = (j: number) => {
    const c = outFaces[j].center
    const v = [c.x, c.y, c.z].map((x) => Math.round(x * 1e6) / 1e6)
    c.delete?.()
    return v
  }
  const next = (root: string) => {
    let max = 1
    for (const n of known) if (n.startsWith(`${root}~`)) max = Math.max(max, Number.parseInt(n.slice(root.length + 1), 10) || 1)
    return max + 1
  }
  for (const src of sources) {
    src.source.forEach((face, i) => {
      const name = src.names[i]
      if (!name) return
      const pieces = descendants(oc, builder, face, outFaces).filter((j) => !out[j])
      if (!pieces.length) return
      const cs = new Map(pieces.map((j) => [j, centre(j)]))
      pieces.sort((p, q) => {
        const a = cs.get(p)!
        const b = cs.get(q)!
        return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
      })
      pieces.forEach((j, k) => {
        let n = name
        if (k > 0 || out.includes(name)) {
          n = `${name.split('~')[0]}~${next(name.split('~')[0])}`
        }
        out[j] = n
        known.add(n)
      })
    })
  }
  return out
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
