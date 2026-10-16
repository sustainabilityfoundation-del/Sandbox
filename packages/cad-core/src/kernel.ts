/**
 * The geometric kernel interface (ADR-0021). cad-core never imports a kernel; @ews/cad-kernel
 * implements this on Open CASCADE (in a Web Worker in browsers, in-process in Node). Everything that
 * crosses the interface is structured-clone friendly; shapes stay inside the kernel behind handles.
 */

export type Vec3 = [number, number, number]
export type Point2 = [number, number]

/** A plane for sketch geometry: origin, x direction and normal (y = normal × x). */
export interface KernelPlane {
  origin: Vec3
  xDir: Vec3
  normal: Vec3
}

export type KernelSegment =
  | { kind: 'line'; start: Point2; end: Point2 }
  | { kind: 'arc'; start: Point2; end: Point2; mid: Point2 }
  | { kind: 'circle'; center: Point2; radius: number }

/** One planar region: a closed outer loop and closed holes, segments head to tail. */
export interface KernelRegion {
  outer: KernelSegment[]
  holes: KernelSegment[][]
}

export type KernelSweep =
  /** Linear sweep by `vector` after moving the profile by `startOffset` along it (mm). */
  | { kind: 'extrude'; vector: Vec3; startOffset: Vec3 }
  /** Rotation about an axis (right-hand rule), degrees in (0, 360]. */
  | { kind: 'revolve'; axisOrigin: Vec3; axisDirection: Vec3; angle: number }

export interface SolidRequest {
  plane: KernelPlane
  regions: KernelRegion[]
  sweep: KernelSweep
}

export interface ShapeHandle {
  readonly id: string
}

/** A face name and points that lie on the face that should carry it (first hit wins). */
export interface FaceProbe {
  name: string
  points: Vec3[]
}

export interface FaceInfo {
  index: number
  /** Stable name (primary probe) or an unstable fallback. */
  name: string
  aliases: string[]
  stable: boolean
  surfaceType: string
  area: number
  center: Vec3
  /** Normal at the face centre (outward), when defined. */
  normal?: Vec3
}

export interface EdgeInfo {
  index: number
  name: string
  curveType: string
  length: number
  /** Names of the adjacent faces. */
  faces: string[]
}

export interface ShapeAnalysis {
  /** BRepCheck validity. */
  valid: boolean
  volume: number
  area: number
  centerOfMass: Vec3
  boundingBox: { min: Vec3; max: Vec3 }
  counts: { solids: number; shells: number; faces: number; edges: number; vertices: number }
  faces: FaceInfo[]
  edges: EdgeInfo[]
}

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  /** Triangle ranges per face, by face index (as in ShapeAnalysis.faces). */
  faceRanges: { face: number; start: number; count: number }[]
  /** Line segments (pairs of points) of the B-rep edges. */
  edgePositions: Float32Array
  edgeRanges: { edge: number; start: number; count: number }[]
}

export interface StepExportBody {
  shape: ShapeHandle
  name: string
  /** CSS hex colour, e.g. "#8899aa". */
  color?: string
}

export interface StepExportOptions {
  /** Default 'mm'. */
  unit?: 'mm' | 'm' | 'inch'
}

export interface KernelInfo {
  name: string
  version: string
  licence: string
  /** Where the kernel runs: 'worker' (browser) or 'in-process'. */
  execution: 'worker' | 'in-process'
}

/** Fillet or chamfer of edges selected by stable edge names (ADR-0024). */
export interface EdgeBlendRequest {
  kind: 'fillet' | 'chamfer'
  target: ShapeHandle
  /** Stable edge names (`edge(<faceA>|<faceB>)[#n]`) as computed with `probes`. */
  edges: string[]
  /** Fillet radius or chamfer distance (mm). */
  size: number
  /** Naming probes of the target body (to resolve the edge names). */
  probes: FaceProbe[]
  /** Feature ID, for the names of the generated faces (`<featureId>/blend:<edge name>`). */
  featureId: string
}

export interface EdgeBlendResult {
  shape: ShapeHandle
  /** Probes naming the faces the operation created. */
  probes: FaceProbe[]
}

/**
 * Optional naming context for a boolean (ADR-0024 amendment, kernel history): the probes that name
 * the faces of the target and of the tool. With them a kernel that records shape history can give
 * every piece of a split face a deterministic name; without them names come from probes only.
 */
export interface BooleanHint {
  targetProbes: FaceProbe[]
  toolProbes: FaceProbe[]
}

export interface GeometryKernel {
  readonly info: KernelInfo
  makeSolid: (request: SolidRequest) => Promise<ShapeHandle>
  boolean: (kind: 'fuse' | 'cut', target: ShapeHandle, tool: ShapeHandle, hint?: BooleanHint) => Promise<ShapeHandle>
  /** Fillets or chamfers named edges; fails with code `reference-lost` when a name does not resolve. */
  blendEdges: (request: EdgeBlendRequest) => Promise<EdgeBlendResult>
  analyze: (shape: ShapeHandle, probes: FaceProbe[]) => Promise<ShapeAnalysis>
  mesh: (shape: ShapeHandle, options?: { tolerance?: number; angularTolerance?: number }) => Promise<MeshData>
  exportStep: (bodies: StepExportBody[], options?: StepExportOptions) => Promise<string>
  /** Imports a STEP file; returns the shapes and their analysis (no probes). */
  importStep: (text: string) => Promise<{ shapes: ShapeHandle[]; analyses: ShapeAnalysis[] }>
  release: (shapes: ShapeHandle[]) => Promise<void>
  dispose: () => Promise<void>
  /** Minimum distance between two shapes in mm (0 when they touch or overlap). Optional: kernels without it report no gaps. */
  distance?: (a: ShapeHandle, b: ShapeHandle) => Promise<number>
}

export class KernelError extends Error {
  readonly code: string
  /** Structured facts about the failure (for example the lost names and the names that exist). */
  readonly details?: Record<string, unknown>
  constructor(code: 'kernel-failure' | 'invalid-profile' | 'boolean-failed' | 'empty-result' | 'invalid-shape' | 'not-found' | 'import-failed' | (string & {}), message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'KernelError'
    this.code = code
    this.details = details
  }
}

// ---- small vector helpers shared by naming and regeneration ------------------------------------

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (a: Vec3) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1
    return [a[0] / l, a[1] / l, a[2] / l]
  },
}

/** Maps a sketch point to model coordinates on a plane. */
export function toModel(plane: KernelPlane, p: Point2): Vec3 {
  const y = v3.cross(plane.normal, plane.xDir)
  return v3.add(plane.origin, v3.add(v3.scale(plane.xDir, p[0]), v3.scale(y, p[1])))
}

/** Rotates a point about an axis (Rodrigues), angle in degrees. */
export function rotateAbout(p: Vec3, origin: Vec3, axis: Vec3, angleDeg: number): Vec3 {
  const k = v3.normalize(axis)
  const t = (angleDeg * Math.PI) / 180
  const v = v3.sub(p, origin)
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const term1 = v3.scale(v, cos)
  const term2 = v3.scale(v3.cross(k, v), sin)
  const term3 = v3.scale(k, v3.dot(k, v) * (1 - cos))
  return v3.add(origin, v3.add(term1, v3.add(term2, term3)))
}
