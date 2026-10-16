import { CadError, toErrorInfo, type CadErrorInfo } from '../errors'
import { evaluateIn, evaluateParameters, type EvaluatedParameter, type ParameterScope } from '../expr/parameters'
import { KernelError, toModel, v3, type FaceProbe, type GeometryKernel, type KernelPlane, type ShapeAnalysis, type ShapeHandle, type Vec3 } from '../kernel'
import { isDimensional, SKETCH_X_AXIS, SKETCH_Y_AXIS, type CadDocument, type ExtrudeFeature, type Feature, type Part, type PlaneRef, type RevolveFeature, type SketchFeature } from '../model/types'
import { extractProfile, type Profile } from '../sketch/profile'
import type { SketchSolution } from '../sketch/solver'
import { builtInSketchSolver, type SketchSolver } from '../sketch/solverPort'
import { hashOf, now } from '../util'
import { crossesAxis, extrudeProbes, planeOf, revolveProbes, toKernelRegions } from './geometry'

/**
 * Regeneration (brief §4.1): evaluates parameters, solves sketches and rebuilds solid features in
 * history order through the kernel. Every node has a content key (its evaluated inputs plus the keys
 * of what it depends on); unchanged keys reuse cached results, so editing one dimension rebuilds only
 * the features downstream of it. Failures are reported per feature and never abort the rest.
 */

export type FeatureStatus = 'ok' | 'failed' | 'blocked' | 'suppressed'

export interface SketchResult {
  plane: KernelPlane
  solution: SketchSolution
  profile: Profile
  /** Evaluated dimension values (driving), by constraint ID. */
  values: Record<string, number>
  /** Lines of the sketch by ID (start/end point IDs), for axis lookups. */
  lines: Record<string, { start: string; end: string; construction: boolean }>
}

/** The feature whose own failure blocks others (named in blocked features' messages, shown in Diagnostics). */
export interface FailureCause {
  featureId: string
  name: string
  status: string
  message: string
  reason?: string
}

export interface FeatureResult {
  featureId: string
  type: Feature['type']
  name: string
  status: FeatureStatus
  error?: CadErrorInfo
  warnings: CadErrorInfo[]
  /** False when the result came from the cache (incremental regeneration). */
  rebuilt: boolean
  durationMs: number
  key: string
  sketch?: SketchResult
  /** Solid features: the body this feature created or modified. */
  bodyId?: string
  /** Linear patterns: evaluated count and spacing, and the measured gap between neighbouring occurrences (mm; null when not measurable). */
  pattern?: { count: number; spacing: number; direction: Vec3; gap: number | null; occurrenceWidth?: number | null; occurrenceWidthFlats?: boolean | null }
  /** Sketches and datum planes: the resolved plane. */
  plane?: KernelPlane
}

export interface BodyResult {
  bodyId: string
  name: string
  /** Feature that last modified the body. */
  lastFeatureId: string
  shape: ShapeHandle
  analysis: ShapeAnalysis
  key: string
}

export interface PartResult {
  partId: string
  parameters: EvaluatedParameter[]
  features: FeatureResult[]
  bodies: BodyResult[]
  rebuilt: string[]
  reused: string[]
}

export interface RegenerationResult {
  documentId: string
  documentVersion: number
  parts: PartResult[]
  durationMs: number
  /** True when every feature is ok or suppressed. */
  ok: boolean
  kernel: GeometryKernel['info']
  /** Where this regeneration ran (set by the regenerator). */
  location?: 'in-process' | 'worker'
}

interface CachedShape {
  shape: ShapeHandle
  lastUsed: number
}

/**
 * Content-addressed cache of sketch solutions, kernel shapes and analyses. Entries unused for more
 * than `retainGenerations` committed regenerations are released from the kernel.
 */
export class RegenerationCache {
  private readonly sketches = new Map<string, { result: SketchResult; lastUsed: number }>()
  private readonly shapes = new Map<string, CachedShape>()
  private readonly analyses = new Map<string, { analysis: ShapeAnalysis; lastUsed: number }>()
  private readonly meta = new Map<string, { value: unknown; lastUsed: number }>()
  private generation = 0
  constructor(readonly retainGenerations = 2) {}

  begin(): number {
    return ++this.generation
  }
  getSketch(key: string, gen: number) {
    const e = this.sketches.get(key)
    if (e) e.lastUsed = gen
    return e?.result
  }
  putSketch(key: string, result: SketchResult, gen: number) {
    this.sketches.set(key, { result, lastUsed: gen })
  }
  getShape(key: string, gen: number) {
    const e = this.shapes.get(key)
    if (e) e.lastUsed = gen
    return e?.shape
  }
  putShape(key: string, shape: ShapeHandle, gen: number) {
    this.shapes.set(key, { shape, lastUsed: gen })
  }
  getAnalysis(key: string, gen: number) {
    const e = this.analyses.get(key)
    if (e) e.lastUsed = gen
    return e?.analysis
  }
  putAnalysis(key: string, analysis: ShapeAnalysis, gen: number) {
    this.analyses.set(key, { analysis, lastUsed: gen })
  }
  getMeta<T>(key: string, gen: number): T | undefined {
    const e = this.meta.get(key)
    if (e) e.lastUsed = gen
    return e?.value as T | undefined
  }
  putMeta(key: string, value: unknown, gen: number) {
    this.meta.set(key, { value, lastUsed: gen })
  }
  /** Releases kernel shapes not used recently. */
  async evict(kernel: GeometryKernel, current: number): Promise<number> {
    const old = (m: Map<string, { lastUsed: number }>) => [...m].filter(([, e]) => current - e.lastUsed > this.retainGenerations).map(([k]) => k)
    const shapeKeys = old(this.shapes)
    const handles = shapeKeys.map((k) => this.shapes.get(k)!.shape)
    shapeKeys.forEach((k) => this.shapes.delete(k))
    old(this.sketches).forEach((k) => this.sketches.delete(k))
    old(this.analyses).forEach((k) => this.analyses.delete(k))
    old(this.meta).forEach((k) => this.meta.delete(k))
    if (handles.length) await kernel.release(handles)
    return handles.length
  }
  async clear(kernel: GeometryKernel): Promise<void> {
    const handles = [...this.shapes.values()].map((e) => e.shape)
    this.shapes.clear()
    this.sketches.clear()
    this.analyses.clear()
    this.meta.clear()
    if (handles.length) await kernel.release(handles)
  }
  stats() {
    return { sketches: this.sketches.size, shapes: this.shapes.size, analyses: this.analyses.size, generation: this.generation }
  }
}

export interface RegenerateOptions {
  /** Release unused cached shapes afterwards (committed states only; not for dry runs). */
  evict?: boolean
}

export async function regenerate(doc: CadDocument, kernel: GeometryKernel, cache: RegenerationCache, options: RegenerateOptions = {}): Promise<RegenerationResult> {
  const started = now()
  const gen = cache.begin()
  const parts: PartResult[] = []
  for (const part of doc.parts) parts.push(await regeneratePart(part, kernel, cache, gen))
  if (options.evict) await cache.evict(kernel, gen)
  return {
    documentId: doc.documentId,
    documentVersion: doc.version,
    parts,
    durationMs: now() - started,
    ok: parts.every((p) => p.features.every((f) => f.status === 'ok' || f.status === 'suppressed')),
    kernel: kernel.info,
  }
}

interface BodyState {
  bodyId: string
  name: string
  key: string
  shape: ShapeHandle
  probes: FaceProbe[]
  lastFeatureId: string
}

/** Evaluated sketch values and solution on a resolved plane (no kernel needed). */
export function solveSketchFeature(sketch: SketchFeature, scope: ParameterScope, resolvedPlane?: KernelPlane, solver: SketchSolver = builtInSketchSolver): { result?: SketchResult; key: string; error?: CadErrorInfo } {
  const values: Record<string, number> = {}
  let plane: KernelPlane
  try {
    if (resolvedPlane) plane = resolvedPlane
    else if (sketch.plane.kind === 'standard') plane = planeOf(sketch.plane, scope)
    else throw new CadError('precondition-failed', `Sketch ${sketch.id} lies on a ${sketch.plane.kind}; its plane is resolved during regeneration.`)
    for (const c of sketch.constraints) if (isDimensional(c.type) && c.driving !== false && c.value !== undefined) values[c.id] = evaluateIn(scope, c.value)
  } catch (e) {
    return { key: '', error: toErrorInfo(e) }
  }
  const key = hashOf({ entities: sketch.entities, constraints: sketch.constraints.map((c) => ({ ...c, value: values[c.id] ?? null, name: undefined })), plane })
  const solution = solver.solve(sketch, { values })
  const profile = extractProfile(sketch.entities, sketch.constraints, solution)
  const lines: SketchResult['lines'] = {}
  for (const e of sketch.entities) if (e.type === 'line') lines[e.id] = { start: e.start, end: e.end, construction: !!e.construction }
  return { key, result: { plane, solution, profile, values, lines } }
}

/**
 * The sketch frame on a planar face: normal = outward face normal; origin = projection of the model
 * origin onto the face plane; x = horizontal direction (Z × n), or the model x axis for faces whose
 * normal is (anti)parallel to Z. Deterministic, so sketches on faces regenerate identically.
 */
export function faceFrame(center: Vec3, normal: Vec3): KernelPlane {
  const n = v3.normalize(normal)
  const origin = v3.scale(n, v3.dot(center, n))
  const xDir: Vec3 = Math.abs(n[2]) > 0.99 ? v3.normalize(v3.sub([1, 0, 0], v3.scale(n, n[0]))) : v3.normalize(v3.cross([0, 0, 1], n))
  const clean = (v: Vec3): Vec3 => v.map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12)) as Vec3
  return { origin: clean(origin), xDir: clean(xDir), normal: clean(n) }
}

const offsetPlane = (p: KernelPlane, offset: number): KernelPlane => (offset ? { ...p, origin: v3.add(p.origin, v3.scale(p.normal, offset)) } : p)

/** Errors whose cause is an upstream feature make the feature "blocked" rather than "failed". */
const blockedReason = (e: CadErrorInfo | undefined) => typeof e?.details?.reason === 'string' && (e.details.reason as string).startsWith('upstream-')

async function analysisOf(b: BodyState, kernel: GeometryKernel, cache: RegenerationCache, gen: number): Promise<ShapeAnalysis> {
  const key = hashOf({ shape: b.key, probes: b.probes })
  let analysis = cache.getAnalysis(key, gen)
  if (!analysis) {
    analysis = await kernel.analyze(b.shape, b.probes)
    cache.putAnalysis(key, analysis, gen)
  }
  return analysis
}

async function regeneratePart(part: Part, kernel: GeometryKernel, cache: RegenerationCache, gen: number): Promise<PartResult> {
  const scope = evaluateParameters(part)
  const results: FeatureResult[] = []
  const byId = new Map<string, FeatureResult>()
  const bodies = new Map<string, BodyState>()
  let latestBody: string | undefined
  // Solid features as built, so linear patterns can rebuild them on shifted planes.
  const profiles = new Map<string, { feature: ExtrudeFeature | RevolveFeature; sketch: SketchResult; sketchKey: string; shape: ShapeHandle }>()

  const upstream = (id: string, what: string): never => {
    const r = byId.get(id)
    if (!r) throw new CadError('not-found', `${what} ${id} does not exist earlier in the history.`, { reason: 'missing-reference', reference: id })
    if (r.status === 'suppressed') {
      throw new CadError('precondition-failed', `${what} “${r.name}” (${id}) is suppressed, so this feature cannot be built. Unsuppress it, or edit this feature to use something else.`, { reason: 'upstream-suppressed', upstream: id, cause: { featureId: id, name: r.name, status: r.status, message: 'The feature is suppressed.' } })
    }
    // Name the root cause: the first feature in the chain that failed on its own.
    const inherited = r.error?.details?.cause as FailureCause | undefined
    const cause: FailureCause = inherited ?? { featureId: id, name: r.name, status: r.status, message: r.error?.message ?? 'The feature failed to regenerate.', ...(typeof r.error?.details?.reason === 'string' ? { reason: r.error.details.reason } : {}) }
    throw new CadError(
      'precondition-failed',
      `${what} “${r.name}” (${id}) ${r.status === 'blocked' ? 'is blocked' : 'failed'}, so this feature cannot be built. Root cause in “${cause.name}” (${cause.featureId}): ${cause.message} Fix that feature first.`,
      { reason: 'upstream-failed', upstream: id, cause },
    )
  }

  /** Resolves a plane reference at this point of the history (datums and faces of the current bodies). */
  async function resolvePlane(ref: PlaneRef): Promise<KernelPlane> {
    const offset = ref.offset === undefined ? 0 : evaluateIn(scope, ref.offset)
    if (ref.kind === 'standard') return planeOf(ref, scope)
    if (ref.kind === 'datum') {
      const d = byId.get(ref.datum)
      if (!d || d.status !== 'ok' || !d.plane) return upstream(ref.datum, 'Datum plane')
      return offsetPlane(d.plane, offset)
    }
    const owner = ref.face.split('/')[0]
    const ownerResult = byId.get(owner)
    if (ownerResult && ownerResult.status !== 'ok') return upstream(owner, 'Feature')
    const planar: string[] = []
    for (const b of bodies.values()) {
      const a = await analysisOf(b, kernel, cache, gen)
      const face = a.faces.find((f) => f.name === ref.face || f.aliases.includes(ref.face))
      for (const f of a.faces) if (f.surfaceType === 'PLANE' && f.stable) planar.push(f.name)
      if (!face) continue
      if (face.surfaceType !== 'PLANE' || !face.normal) throw new CadError('regeneration-failed', `Face ${ref.face} is not planar (${face.surfaceType}); sketches need a planar face.`, { reason: 'face-not-planar', face: ref.face })
      return offsetPlane(faceFrame(face.center, face.normal), offset)
    }
    throw new CadError('regeneration-failed', `Face ${ref.face} no longer exists at this point of the history. Use Repair reference in Diagnostics (or the repair_reference command) to choose another face. Planar faces: ${planar.slice(0, 12).join(', ') || 'none'}.`, { reason: 'reference-lost', referenceKind: 'face', face: ref.face, lost: [ref.face], available: planar.slice(0, 300) })
  }

  for (const feature of part.features) {
    const t0 = now()
    const base = { featureId: feature.id, type: feature.type, name: feature.name, warnings: [] as CadErrorInfo[], rebuilt: false, key: '' }
    const finish = (r: FeatureResult) => {
      r.durationMs = now() - t0
      results.push(r)
      byId.set(feature.id, r)
    }
    if (feature.suppressed) {
      finish({ ...base, status: 'suppressed', durationMs: 0 })
      continue
    }

    if (feature.type === 'datum-plane') {
      const r: FeatureResult = { ...base, status: 'ok', durationMs: 0 }
      try {
        r.plane = await resolvePlane(feature.plane)
        r.key = hashOf(r.plane)
      } catch (e) {
        r.error = toErrorInfo(e)
        r.status = blockedReason(r.error) ? 'blocked' : 'failed'
      }
      finish(r)
      continue
    }

    if (feature.type === 'sketch') {
      let plane: KernelPlane | undefined
      let planeError: CadErrorInfo | undefined
      if (feature.plane.kind !== 'standard') {
        try {
          plane = await resolvePlane(feature.plane)
        } catch (e) {
          planeError = toErrorInfo(e)
        }
      }
      const solved = planeError ? { key: '', error: planeError } : solveSketchFeature(feature, scope, plane)
      let r: FeatureResult
      if (!solved.result) {
        r = { ...base, status: blockedReason(solved.error) ? 'blocked' : 'failed', error: solved.error, durationMs: 0 }
      } else {
        const cached = cache.getSketch(solved.key, gen)
        const result = cached ?? solved.result
        if (!cached) cache.putSketch(solved.key, result, gen)
        const s = result.solution
        const warnings: CadErrorInfo[] = s.status === 'over-constrained' ? [{ code: 'precondition-failed', message: `Redundant constraints: ${s.redundant.join(', ')}.`, details: { redundant: s.redundant } }] : []
        const failed = s.status === 'conflicting' || s.status === 'failed'
        r = {
          ...base,
          key: solved.key,
          rebuilt: !cached,
          status: failed ? 'failed' : 'ok',
          error: failed
            ? s.status === 'conflicting'
              ? { code: 'regeneration-failed', message: `The sketch constraints conflict${s.conflicting.length ? ` (check ${s.conflicting.join(', ')})` : ''}.`, details: { reason: 'sketch-conflicting', conflicting: s.conflicting } }
              : { code: 'regeneration-failed', message: s.issues.map((i) => i.message).join(' '), details: { reason: 'sketch-failed', issues: s.issues } }
            : undefined,
          warnings,
          sketch: result,
          plane: result.plane,
          durationMs: 0,
        }
      }
      finish(r)
      continue
    }

    const r: FeatureResult = { ...base, status: 'ok', durationMs: 0 }
    try {
      if (feature.type === 'fillet' || feature.type === 'chamfer') {
        // ---- edge treatments on an existing body --------------------------------------------
        const targetId = feature.target ?? latestBody
        const target = targetId ? bodies.get(targetId) : undefined
        if (!target) throw new CadError('precondition-failed', `A ${feature.type} needs an existing body${feature.target ? ` (${feature.target} does not exist at this point)` : ''}.`, { reason: 'no-target-body' })
        const size = evaluateIn(scope, feature.type === 'fillet' ? feature.radius : feature.distance)
        if (!(size > 0)) throw new CadError('invalid-input', `The ${feature.type === 'fillet' ? 'radius' : 'distance'} must be greater than zero (got ${size}).`, { reason: 'invalid-value', field: feature.type === 'fillet' ? 'radius' : 'distance' })
        const unstable = feature.edges.filter((e) => e.includes('face#'))
        if (unstable.length) r.warnings.push({ code: 'precondition-failed', message: `Edge names ${unstable.join(', ')} refer to faces without stable names; they may not survive changes upstream.`, details: { reason: 'unstable-reference', edges: unstable } })
        const key = hashOf({ op: feature.type, target: target.key, probes: hashOf(target.probes), edges: feature.edges, size, id: feature.id })
        let shape = cache.getShape(key, gen)
        let probes = cache.getMeta<FaceProbe[]>(key, gen)
        if (!shape || !probes) {
          const out = await kernel.blendEdges({ kind: feature.type, target: target.shape, edges: feature.edges, size, probes: target.probes, featureId: feature.id })
          shape = out.shape
          probes = out.probes
          cache.putShape(key, shape, gen)
          cache.putMeta(key, probes, gen)
          r.rebuilt = true
        }
        bodies.set(target.bodyId, { ...target, key, shape, probes: [...target.probes, ...probes], lastFeatureId: feature.id })
        latestBody = target.bodyId
        r.bodyId = target.bodyId
        r.key = key
      } else if (feature.type === 'pattern-linear') {
        // ---- linear pattern: occurrences 2…count of the source features ----------------------
        const count = evaluateIn(scope, feature.count)
        if (!(Number.isInteger(count) && count >= 2)) throw new CadError('invalid-input', `The pattern count must be an integer of at least 2 (got ${count}).`, { reason: 'invalid-value', field: 'count' })
        if (count > 500) throw new CadError('invalid-input', `The pattern count ${count} is larger than 500.`, { reason: 'invalid-value', field: 'count' })
        const spacing = evaluateIn(scope, feature.spacing)
        if (!(spacing > 0)) throw new CadError('invalid-input', `The pattern spacing must be greater than zero (got ${spacing}).`, { reason: 'invalid-value', field: 'spacing' })
        const direction = v3.normalize(feature.direction)
        const sources = feature.features.map((id) => {
          const res = byId.get(id)
          if (!res || res.status !== 'ok') return upstream(id, 'Feature')
          const info = profiles.get(id)
          if (!info) throw new CadError('invalid-input', `${id} is not a solid feature that can be patterned.`, { reason: 'invalid-value', field: 'features' })
          return { id, res, info }
        })
        const bodyId = sources[0].res.bodyId
        let target = bodyId ? bodies.get(bodyId) : undefined
        if (!target) throw new CadError('precondition-failed', 'The pattern has no body to modify.', { reason: 'no-target-body' })
        const tools: ShapeHandle[][] = [sources.map((s) => s.info.shape)]
        let rebuilt = false
        for (let k = 1; k < count; k++) {
          const shift = v3.scale(direction, k * spacing)
          const row: ShapeHandle[] = []
          for (const s of sources) {
            const plane = { ...s.info.sketch.plane, origin: v3.add(s.info.sketch.plane.origin, shift) }
            const built = await buildSolid(s.info.feature, { ...s.info.sketch, plane }, s.info.sketchKey, scope, kernel, cache, gen)
            const prefix = `${s.id}/`
            const probes = built.probes.map((p) => ({ ...p, name: p.name.startsWith(prefix) ? `${feature.id}/i${k + 1}-${s.id}-${p.name.slice(prefix.length)}` : p.name }))
            const op = s.info.feature.operation === 'cut' ? 'cut' : 'fuse'
            const key = hashOf({ op, target: target.key, tool: built.key, pattern: feature.id })
            let shape = cache.getShape(key, gen)
            if (!shape) {
              shape = await kernel.boolean(op, target.shape, built.shape, { targetProbes: target.probes, toolProbes: probes })
              cache.putShape(key, shape, gen)
              rebuilt = true
            }
            rebuilt ||= built.rebuilt
            target = { ...target, key, shape, probes: [...target.probes, ...probes], lastFeatureId: feature.id }
            row.push(built.shape)
          }
          tools.push(row)
        }
        bodies.set(target.bodyId, target)
        latestBody = target.bodyId
        // Gap between occurrence 1 and 2 (the smallest distance between their tool solids).
        let gap: number | null = null
        if (kernel.distance) {
          const gapKey = hashOf({ gap: tools[0].map((t) => t.id), next: tools[1].map((t) => t.id) })
          const cachedGap = cache.getMeta<number>(gapKey, gen)
          if (cachedGap !== undefined) gap = cachedGap
          else {
            let best = Infinity
            for (const a of tools[0]) for (const b of tools[1]) best = Math.min(best, await kernel.distance(a, b))
            gap = Number.isFinite(best) ? best : null
            if (gap !== null) cache.putMeta(gapKey, gap, gen)
          }
        }
        // Width of occurrence 1 along the pattern direction: the kernel bounding box of its tool solids
        // (only when the direction is a coordinate axis, where the box extent is the exact extent).
        // The extent is the distance between two flat faces (across flats for a hexagon) only when the tool has a planar
        // face at each end whose normal is the pattern direction; otherwise corners or curved faces bound it.
        let occurrenceWidth: number | null = null
        let occurrenceWidthFlats: boolean | null = null
        const axis = direction.findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-9)
        if (axis >= 0 && direction.every((c, k) => k === axis || Math.abs(c) < 1e-9)) {
          const widthKey = hashOf({ width: tools[0].map((t) => t.id), axis })
          const cachedWidth = cache.getMeta<{ width: number; flats: boolean }>(widthKey, gen)
          if (cachedWidth !== undefined) ({ width: occurrenceWidth, flats: occurrenceWidthFlats } = cachedWidth)
          else {
            const analyses = await Promise.all(tools[0].map((t) => kernel.analyze(t, [])))
            const lo = Math.min(...analyses.map((a) => a.boundingBox.min[axis]))
            const hi = Math.max(...analyses.map((a) => a.boundingBox.max[axis]))
            occurrenceWidth = Math.round((hi - lo) * 1e9) / 1e9
            const flatAt = (at: number) => analyses.some((a) => a.faces.some((f) => f.surfaceType === 'PLANE' && f.normal && Math.abs(Math.abs(f.normal[axis]) - 1) < 1e-6 && Math.abs(f.center[axis] - at) < 1e-6))
            occurrenceWidthFlats = flatAt(lo) && flatAt(hi)
            cache.putMeta(widthKey, { width: occurrenceWidth, flats: occurrenceWidthFlats }, gen)
          }
        }
        r.pattern = { count, spacing, direction, gap, occurrenceWidth, occurrenceWidthFlats }
        r.rebuilt = rebuilt
        r.bodyId = target.bodyId
        r.key = target.key
      } else {
        // ---- profile features (extrude, revolve) ---------------------------------------------
        const sketch = byId.get(feature.sketch)
        if (!sketch || sketch.type !== 'sketch') throw new CadError('not-found', `Sketch ${feature.sketch} does not exist before ${feature.id}.`, { reason: 'missing-sketch' })
        if (sketch.status !== 'ok' || !sketch.sketch) upstream(feature.sketch, 'Sketch')
        const profile = sketch.sketch!.profile
        if (!profile.regions.length || profile.issues.length) {
          throw new CadError('regeneration-failed', profile.issues.length ? profile.issues.map((i) => i.message).join(' ') : 'The sketch has no closed profile.', { reason: 'invalid-profile', issues: profile.issues })
        }
        const built = await buildSolid(feature, sketch.sketch!, sketch.key, scope, kernel, cache, gen)
        profiles.set(feature.id, { feature, sketch: sketch.sketch!, sketchKey: sketch.key, shape: built.shape })
        const targetId = feature.operation === 'new' ? undefined : (feature.target ?? latestBody)
        const target = targetId ? bodies.get(targetId) : undefined
        if (feature.operation !== 'new' && targetId && !target) throw new CadError('not-found', `Target body ${targetId} does not exist.`, { reason: 'no-target-body' })
        if (feature.operation === 'cut' && !target) throw new CadError('precondition-failed', 'A cut needs an existing body.', { reason: 'no-target-body' })
        r.rebuilt = built.rebuilt
        if (!target) {
          bodies.set(feature.id, { bodyId: feature.id, name: feature.name, key: built.key, shape: built.shape, probes: built.probes, lastFeatureId: feature.id })
          latestBody = feature.id
          r.bodyId = feature.id
          r.key = built.key
        } else {
          const key = hashOf({ op: feature.operation, target: target.key, tool: built.key })
          let shape = cache.getShape(key, gen)
          if (!shape) {
            shape = await kernel.boolean(feature.operation === 'cut' ? 'cut' : 'fuse', target.shape, built.shape, { targetProbes: target.probes, toolProbes: built.probes })
            cache.putShape(key, shape, gen)
            r.rebuilt = true
          }
          bodies.set(target.bodyId, { ...target, key, shape, probes: [...target.probes, ...built.probes], lastFeatureId: feature.id })
          latestBody = target.bodyId
          r.bodyId = target.bodyId
          r.key = key
        }
      }
    } catch (e) {
      r.error = e instanceof KernelError ? { code: 'regeneration-failed', message: e.message, details: { reason: e.code, ...e.details } } : toErrorInfo(e)
      r.status = blockedReason(r.error) ? 'blocked' : 'failed'
    }
    finish(r)
  }

  // Analysis (mass properties, topology, stable face names) of the final bodies.
  const bodyResults: BodyResult[] = []
  for (const b of bodies.values()) {
    const analysis = await analysisOf(b, kernel, cache, gen)
    if (!analysis.valid) {
      const last = results.find((f) => f.featureId === b.lastFeatureId)
      last?.warnings.push({ code: 'kernel-failure', message: `The body ${b.bodyId} is not a valid solid (B-rep check failed).`, details: { reason: 'invalid-shape' } })
    }
    bodyResults.push({ bodyId: b.bodyId, name: b.name, lastFeatureId: b.lastFeatureId, shape: b.shape, analysis, key: b.key })
  }

  return {
    partId: part.id,
    parameters: scope.parameters,
    features: results,
    bodies: bodyResults,
    rebuilt: results.filter((f) => f.rebuilt).map((f) => f.featureId),
    reused: results.filter((f) => !f.rebuilt && (f.status === 'ok' || f.status === 'failed') && f.key).map((f) => f.featureId),
  }
}

async function buildSolid(
  feature: ExtrudeFeature | RevolveFeature,
  sketch: SketchResult,
  sketchKey: string,
  scope: ParameterScope,
  kernel: GeometryKernel,
  cache: RegenerationCache,
  gen: number,
): Promise<{ shape: ShapeHandle; key: string; probes: FaceProbe[]; rebuilt: boolean }> {
  const plane = sketch.plane
  const regions = sketch.profile.regions
  let request: Parameters<GeometryKernel['makeSolid']>[0]
  let probes: FaceProbe[]
  if (feature.type === 'extrude') {
    const distance = evaluateIn(scope, feature.extent.distance)
    if (!(distance > 0)) throw new CadError('invalid-input', `Extrusion distance must be greater than zero (got ${distance}).`, { reason: 'invalid-value', field: 'distance' })
    const n = plane.normal
    const dir = feature.extent.direction
    const vector: Vec3 = v3.scale(n, dir === 'reverse' ? -distance : distance)
    const startOffset: Vec3 = dir === 'symmetric' ? v3.scale(n, -distance / 2) : [0, 0, 0]
    request = { plane, regions: toKernelRegions(regions), sweep: { kind: 'extrude', vector, startOffset } }
    probes = extrudeProbes(feature.id, plane, regions, vector, startOffset)
  } else {
    const angle = evaluateIn(scope, feature.angle)
    if (!(angle > 0 && angle <= 360)) throw new CadError('invalid-input', `Revolution angle must be in (0, 360] degrees (got ${angle}).`, { reason: 'invalid-value', field: 'angle' })
    let a: [number, number]
    let b: [number, number]
    if (feature.axis === SKETCH_X_AXIS) [a, b] = [[0, 0], [1, 0]]
    else if (feature.axis === SKETCH_Y_AXIS) [a, b] = [[0, 0], [0, 1]]
    else {
      const sk = sketch.solution
      const entity = sketch.lines[feature.axis]
      if (!entity) throw new CadError('not-found', `Axis ${feature.axis} is not a line of the sketch.`, { reason: 'invalid-axis' })
      a = sk.points[entity.start]
      b = sk.points[entity.end]
      if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) throw new CadError('invalid-input', `Axis ${feature.axis} has no length.`, { reason: 'invalid-axis' })
    }
    if (crossesAxis(regions, a, b)) throw new CadError('regeneration-failed', 'The profile crosses the revolution axis; a revolved solid would intersect itself.', { reason: 'profile-crosses-axis' })
    const axisOrigin = toModel(plane, a)
    const axisDirection = v3.normalize(v3.sub(toModel(plane, b), axisOrigin))
    request = { plane, regions: toKernelRegions(regions), sweep: { kind: 'revolve', axisOrigin, axisDirection, angle } }
    probes = revolveProbes(feature.id, plane, regions, axisOrigin, axisDirection, angle)
  }
  const key = hashOf({ type: feature.type, sketch: sketchKey, request })
  const cached = cache.getShape(key, gen)
  if (cached) return { shape: cached, key, probes, rebuilt: false }
  const shape = await kernel.makeSolid(request)
  cache.putShape(key, shape, gen)
  return { shape, key, probes, rebuilt: true }
}

