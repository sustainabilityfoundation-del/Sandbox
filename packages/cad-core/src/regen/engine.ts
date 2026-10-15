import { CadError, toErrorInfo, type CadErrorInfo } from '../errors'
import { evaluateIn, evaluateParameters, type EvaluatedParameter, type ParameterScope } from '../expr/parameters'
import { toModel, v3, type FaceProbe, type GeometryKernel, type KernelPlane, type ShapeAnalysis, type ShapeHandle, type Vec3 } from '../kernel'
import { isDimensional, SKETCH_X_AXIS, SKETCH_Y_AXIS, type CadDocument, type ExtrudeFeature, type Feature, type Part, type RevolveFeature, type SketchFeature } from '../model/types'
import { extractProfile, type Profile } from '../sketch/profile'
import { solveSketch, type SketchSolution } from '../sketch/solver'
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
  /** Releases kernel shapes not used recently. */
  async evict(kernel: GeometryKernel, current: number): Promise<number> {
    const old = (m: Map<string, { lastUsed: number }>) => [...m].filter(([, e]) => current - e.lastUsed > this.retainGenerations).map(([k]) => k)
    const shapeKeys = old(this.shapes)
    const handles = shapeKeys.map((k) => this.shapes.get(k)!.shape)
    shapeKeys.forEach((k) => this.shapes.delete(k))
    old(this.sketches).forEach((k) => this.sketches.delete(k))
    old(this.analyses).forEach((k) => this.analyses.delete(k))
    if (handles.length) await kernel.release(handles)
    return handles.length
  }
  async clear(kernel: GeometryKernel): Promise<void> {
    const handles = [...this.shapes.values()].map((e) => e.shape)
    this.shapes.clear()
    this.sketches.clear()
    this.analyses.clear()
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

/** Evaluated plane, sketch values and solution for one sketch feature (no kernel needed). */
export function solveSketchFeature(sketch: SketchFeature, scope: ParameterScope): { result?: SketchResult; key: string; error?: CadErrorInfo } {
  const values: Record<string, number> = {}
  let plane: KernelPlane
  try {
    plane = planeOf(sketch.plane, scope)
    for (const c of sketch.constraints) if (isDimensional(c.type) && c.driving !== false && c.value !== undefined) values[c.id] = evaluateIn(scope, c.value)
  } catch (e) {
    return { key: '', error: toErrorInfo(e) }
  }
  const key = hashOf({ entities: sketch.entities, constraints: sketch.constraints.map((c) => ({ ...c, value: values[c.id] ?? null, name: undefined })), plane })
  const solution = solveSketch(sketch, { values })
  const profile = extractProfile(sketch.entities, sketch.constraints, solution)
  const lines: SketchResult['lines'] = {}
  for (const e of sketch.entities) if (e.type === 'line') lines[e.id] = { start: e.start, end: e.end, construction: !!e.construction }
  return { key, result: { plane, solution, profile, values, lines } }
}

async function regeneratePart(part: Part, kernel: GeometryKernel, cache: RegenerationCache, gen: number): Promise<PartResult> {
  const scope = evaluateParameters(part)
  const results: FeatureResult[] = []
  const sketches = new Map<string, FeatureResult>()
  const bodies = new Map<string, BodyState>()
  let latestBody: string | undefined

  for (const feature of part.features) {
    const t0 = now()
    const base = { featureId: feature.id, type: feature.type, name: feature.name, warnings: [] as CadErrorInfo[], rebuilt: false, key: '' }
    if (feature.suppressed) {
      const r: FeatureResult = { ...base, status: 'suppressed', durationMs: 0 }
      results.push(r)
      if (feature.type === 'sketch') sketches.set(feature.id, r)
      continue
    }
    if (feature.type === 'sketch') {
      const solved = solveSketchFeature(feature, scope)
      let r: FeatureResult
      if (!solved.result) {
        r = { ...base, status: 'failed', error: solved.error, durationMs: now() - t0 }
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
          durationMs: now() - t0,
        }
      }
      results.push(r)
      sketches.set(feature.id, r)
      continue
    }

    // ---- solid features ---------------------------------------------------------------------
    const r: FeatureResult = { ...base, status: 'ok', durationMs: 0 }
    try {
      const sketch = sketches.get(feature.sketch)
      if (!sketch) throw new CadError('not-found', `Sketch ${feature.sketch} does not exist before ${feature.id}.`, { reason: 'missing-sketch' })
      if (sketch.status === 'suppressed') {
        r.status = 'blocked'
        r.error = { code: 'precondition-failed', message: `Sketch ${feature.sketch} is suppressed.`, details: { reason: 'upstream-suppressed', upstream: feature.sketch } }
      } else if (sketch.status !== 'ok' || !sketch.sketch) {
        r.status = 'blocked'
        r.error = { code: 'precondition-failed', message: `Sketch ${feature.sketch} failed to regenerate.`, details: { reason: 'upstream-failed', upstream: feature.sketch } }
      } else {
        const profile = sketch.sketch.profile
        if (!profile.regions.length || profile.issues.length) {
          throw new CadError('regeneration-failed', profile.issues.length ? profile.issues.map((i) => i.message).join(' ') : 'The sketch has no closed profile.', { reason: 'invalid-profile', issues: profile.issues })
        }
        const built = await buildSolid(feature, sketch.sketch, sketch.key, scope, kernel, cache, gen)
        const targetId = feature.operation === 'new' ? undefined : (feature.target ?? latestBody)
        const target = targetId ? bodies.get(targetId) : undefined
        if (feature.operation !== 'new' && targetId && !target) throw new CadError('not-found', `Target body ${targetId} does not exist.`, { reason: 'no-target-body' })
        if (feature.operation === 'cut' && !target) throw new CadError('precondition-failed', 'A cut needs an existing body.', { reason: 'no-target-body' })
        r.rebuilt = built.rebuilt
        if (!target) {
          const state: BodyState = { bodyId: feature.id, name: feature.name, key: built.key, shape: built.shape, probes: built.probes, lastFeatureId: feature.id }
          bodies.set(feature.id, state)
          latestBody = feature.id
          r.bodyId = feature.id
          r.key = built.key
        } else {
          const key = hashOf({ op: feature.operation, target: target.key, tool: built.key })
          let shape = cache.getShape(key, gen)
          if (!shape) {
            shape = await kernel.boolean(feature.operation === 'cut' ? 'cut' : 'fuse', target.shape, built.shape)
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
      r.status = 'failed'
      r.error = toErrorInfo(e)
    }
    r.durationMs = now() - t0
    results.push(r)
  }

  // Analysis (mass properties, topology, stable face names) of the final bodies.
  const bodyResults: BodyResult[] = []
  for (const b of bodies.values()) {
    const key = hashOf({ shape: b.key, probes: b.probes })
    let analysis = cache.getAnalysis(key, gen)
    if (!analysis) {
      analysis = await kernel.analyze(b.shape, b.probes)
      cache.putAnalysis(key, analysis, gen)
    }
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

