import { CadError, type CadErrorInfo } from '../errors'
import { evaluateParameters } from '../expr/parameters'
import { featureNames, findPart, findSketch } from '../model/document'
import { isDimensional, type CadDocument, type Feature, type Part } from '../model/types'
import type { BodyResult, FeatureResult, PartResult, RegenerationResult } from '../regen/engine'

/**
 * Structured observability (brief §9.2): what people see in the feature tree, sketcher, inspector
 * and diagnostics, as plain data for the assistant and scripts. All functions are reads.
 */

function partResult(regen: RegenerationResult | undefined, partId: string): PartResult | undefined {
  return regen?.parts.find((p) => p.partId === partId)
}

export interface FeatureTreeNode {
  id: string
  type: Feature['type']
  name: string
  suppressed: boolean
  status: FeatureResult['status'] | 'not-regenerated'
  error?: CadErrorInfo
  warnings: CadErrorInfo[]
  /** IDs this feature depends on (sketch, target body feature, parameters by name). */
  dependsOn: string[]
  details: Record<string, unknown>
}

export function featureTree(doc: CadDocument, regen?: RegenerationResult) {
  return {
    documentId: doc.documentId,
    version: doc.version,
    regeneratedVersion: regen?.documentVersion ?? null,
    stale: regen ? regen.documentVersion !== doc.version : true,
    parts: doc.parts.map((part) => {
      const pr = partResult(regen, part.id)
      const graph = dependencyGraph(doc, part.id)
      return {
        id: part.id,
        name: part.name,
        material: part.material ?? null,
        bodies: (pr?.bodies ?? []).map((b) => b.bodyId),
        features: part.features.map((f): FeatureTreeNode => {
          const r = pr?.features.find((x) => x.featureId === f.id)
          return {
            id: f.id,
            type: f.type,
            name: f.name,
            suppressed: !!f.suppressed,
            status: r?.status ?? 'not-regenerated',
            error: r?.error,
            warnings: r?.warnings ?? [],
            dependsOn: graph.edges.filter((e) => e.to === f.id).map((e) => e.from),
            details: featureDetails(f, r),
          }
        }),
      }
    }),
  }
}

function featureDetails(f: Feature, r?: FeatureResult): Record<string, unknown> {
  if (f.type === 'sketch') {
    const s = r?.sketch?.solution
    return {
      plane: f.plane.kind === 'standard' ? f.plane.plane : f.plane.kind === 'datum' ? f.plane.datum : f.plane.face,
      planeKind: f.plane.kind,
      offset: f.plane.offset ?? 0,
      resolvedPlane: r?.sketch?.plane ?? null,
      entities: f.entities.length,
      constraints: f.constraints.length,
      constraintStatus: s?.status ?? null,
      dof: s?.dof ?? null,
      profileRegions: r?.sketch?.profile.regions.length ?? null,
      profileIssues: r?.sketch?.profile.issues ?? [],
    }
  }
  if (f.type === 'extrude') return { sketch: f.sketch, distance: f.extent.distance, direction: f.extent.direction, operation: f.operation, target: f.target ?? null, body: r?.bodyId ?? null }
  if (f.type === 'revolve') return { sketch: f.sketch, axis: f.axis, angle: f.angle, operation: f.operation, target: f.target ?? null, body: r?.bodyId ?? null }
  if (f.type === 'fillet') return { edges: f.edges, radius: f.radius, target: f.target ?? null, body: r?.bodyId ?? null }
  if (f.type === 'chamfer') return { edges: f.edges, distance: f.distance, target: f.target ?? null, body: r?.bodyId ?? null }
  if (f.type === 'pattern-linear') return { features: f.features, direction: f.direction, count: f.count, spacing: f.spacing, body: r?.bodyId ?? null, pattern: r?.pattern ?? null }
  return { planeKind: f.plane.kind, plane: f.plane.kind === 'standard' ? f.plane.plane : f.plane.kind === 'datum' ? f.plane.datum : f.plane.face, offset: f.plane.offset ?? 0, resolvedPlane: r?.plane ?? null }
}

export function parameterTable(doc: CadDocument, partId: string) {
  const part = findPart(doc, partId)
  const scope = evaluateParameters(part)
  return scope.parameters.map((p) => {
    const own = part.parameters.find((x) => x.id === p.id)
    return { ...p, description: own?.description, binding: own?.binding ?? null, usedBy: usersOf(part, p.name) }
  })
}

function usersOf(part: Part, name: string): string[] {
  return [...part.parameters.filter((p) => evaluateParameters({ parameters: [p] }).parameters[0].uses.includes(name)).map((p) => p.name), ...part.features.filter((f) => featureNames(f).includes(name)).map((f) => f.id)]
}

export function sketchDetails(doc: CadDocument, sketchId: string, regen?: RegenerationResult) {
  const { part, sketch } = findSketch(doc, sketchId)
  const r = partResult(regen, part.id)?.features.find((f) => f.featureId === sketchId)
  const s = r?.sketch
  const sol = s?.solution
  return {
    sketchId,
    partId: part.id,
    name: sketch.name,
    plane: sketch.plane,
    status: sol?.status ?? 'not-regenerated',
    regenerationStatus: r?.status ?? 'not-regenerated',
    dof: sol?.dof ?? null,
    freePoints: sol?.freePoints ?? [],
    freeCircles: sol?.freeCircles ?? [],
    redundant: sol?.redundant ?? [],
    conflicting: sol?.conflicting ?? [],
    issues: sol?.issues ?? [],
    entities: sketch.entities.map((e) => ({
      ...e,
      solved: e.type === 'point' ? (sol?.points[e.id] ?? null) : e.type === 'circle' || e.type === 'arc' ? { radius: sol?.radii[e.id] ?? null } : null,
      free: e.type === 'point' ? !!sol?.freePoints.includes(e.id) : e.type === 'circle' ? !!sol?.freeCircles.includes(e.id) : undefined,
    })),
    constraints: sketch.constraints.map((c) => ({
      ...c,
      dimensional: isDimensional(c.type),
      driving: isDimensional(c.type) ? c.driving !== false : undefined,
      evaluated: s?.values[c.id] ?? sol?.driven[c.id] ?? null,
      redundant: !!sol?.redundant.includes(c.id),
      conflicting: !!sol?.conflicting.includes(c.id),
    })),
    profile: s ? { regions: s.profile.regions.map((g) => ({ area: g.area, outer: g.outer.segments.map((x) => x.entityId), holes: g.holes.map((h) => h.segments.map((x) => x.entityId)) })), issues: s.profile.issues } : null,
  }
}

export interface MassProperties {
  bodyId: string
  volume: number
  surfaceArea: number
  centerOfMass: [number, number, number]
  boundingBox: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] }
  /** kg; only with a material. */
  mass: number | null
  material: { name: string; density: number } | null
  valid: boolean
  units: { length: 'mm'; volume: 'mm³'; area: 'mm²'; mass: 'kg' }
}

export function massProperties(doc: CadDocument, regen: RegenerationResult | undefined, partId: string): MassProperties[] {
  const part = findPart(doc, partId)
  const pr = partResult(regen, partId)
  if (!pr) throw new CadError('regeneration-failed', 'The model has not been regenerated yet.')
  return pr.bodies.map((b) => bodyMass(b, part))
}

function bodyMass(b: BodyResult, part: Part): MassProperties {
  const a = b.analysis
  const size = [0, 1, 2].map((k) => a.boundingBox.max[k] - a.boundingBox.min[k]) as [number, number, number]
  return {
    bodyId: b.bodyId,
    volume: a.volume,
    surfaceArea: a.area,
    centerOfMass: a.centerOfMass,
    boundingBox: { ...a.boundingBox, size },
    mass: part.material ? (a.volume * 1e-9) * part.material.density : null,
    material: part.material ?? null,
    valid: a.valid,
    units: { length: 'mm', volume: 'mm³', area: 'mm²', mass: 'kg' },
  }
}

/** Faces and edges of a part's bodies with stable names (ADR-0024). */
export function geometricEntities(regen: RegenerationResult | undefined, partId: string, options: { bodyId?: string; kind?: 'faces' | 'edges' | 'all' } = {}) {
  const pr = partResult(regen, partId)
  if (!pr) throw new CadError('regeneration-failed', 'The model has not been regenerated yet.')
  return pr.bodies
    .filter((b) => !options.bodyId || b.bodyId === options.bodyId)
    .map((b) => ({
      bodyId: b.bodyId,
      counts: b.analysis.counts,
      faces: options.kind === 'edges' ? undefined : b.analysis.faces,
      edges: options.kind === 'faces' ? undefined : b.analysis.edges,
    }))
}

export interface DependencyEdge {
  from: string
  to: string
  kind: 'parameter' | 'sketch' | 'body' | 'reference'
}

/** Explicit dependency graph of a part: parameters → parameters/features, sketch → feature, body chain. */
export function dependencyGraph(doc: CadDocument, partId: string) {
  const part = findPart(doc, partId)
  const scope = evaluateParameters(part)
  const edges: DependencyEdge[] = []
  for (const p of scope.parameters) for (const u of p.uses) edges.push({ from: `param:${u}`, to: `param:${p.name}`, kind: 'parameter' })
  let latest: string | undefined
  const lastOnBody = new Map<string, string>()
  const bodyOf = new Map<string, string>()
  for (const f of part.features) {
    for (const n of featureNames(f)) edges.push({ from: `param:${n}`, to: f.id, kind: 'parameter' })
    if (f.type === 'sketch' || f.type === 'datum-plane') {
      // Planes on datums or faces depend on that datum or on the body state that has the face.
      if (f.plane.kind === 'datum') edges.push({ from: f.plane.datum, to: f.id, kind: 'reference' })
      if (f.plane.kind === 'face') {
        const owner = f.plane.face.split('/')[0]
        const body = bodyOf.get(owner)
        edges.push({ from: (body && lastOnBody.get(body)) ?? owner, to: f.id, kind: 'reference' })
      }
      continue
    }
    if (f.type === 'pattern-linear') {
      for (const src of f.features) edges.push({ from: src, to: f.id, kind: 'reference' })
      const body = bodyOf.get(f.features[0]) ?? latest
      if (body && lastOnBody.has(body)) {
        edges.push({ from: lastOnBody.get(body)!, to: f.id, kind: 'body' })
        lastOnBody.set(body, f.id)
        bodyOf.set(f.id, body)
        latest = body
      }
      continue
    }
    if (f.type === 'fillet' || f.type === 'chamfer') {
      const body = f.target ?? latest
      if (body && lastOnBody.has(body)) {
        edges.push({ from: lastOnBody.get(body)!, to: f.id, kind: 'body' })
        lastOnBody.set(body, f.id)
        bodyOf.set(f.id, body)
        latest = body
      }
      continue
    }
    edges.push({ from: f.sketch, to: f.id, kind: 'sketch' })
    if (f.operation === 'new') {
      bodyOf.set(f.id, f.id)
      latest = f.id
      lastOnBody.set(f.id, f.id)
    } else {
      const body = f.target ?? latest
      if (body && lastOnBody.has(body)) {
        edges.push({ from: lastOnBody.get(body)!, to: f.id, kind: 'body' })
        lastOnBody.set(body, f.id)
        bodyOf.set(f.id, body)
        latest = body
      } else if (f.operation === 'join') {
        bodyOf.set(f.id, f.id)
        latest = f.id
        lastOnBody.set(f.id, f.id)
      }
    }
  }
  const nodes = [...scope.parameters.map((p) => ({ id: `param:${p.name}`, kind: 'parameter' as const, label: p.name })), ...part.features.map((f) => ({ id: f.id, kind: f.type, label: f.name }))]
  return { partId, nodes, edges }
}

/** Everything downstream of a node (what regenerates when it changes). */
export function downstreamOf(doc: CadDocument, partId: string, nodeId: string): string[] {
  const { edges } = dependencyGraph(doc, partId)
  const out = new Set<string>()
  const stack = [nodeId]
  while (stack.length) {
    const n = stack.pop()!
    for (const e of edges) if (e.from === n && !out.has(e.to)) (out.add(e.to), stack.push(e.to))
  }
  return [...out]
}

export function failures(regen: RegenerationResult | undefined) {
  if (!regen) return []
  return regen.parts.flatMap((p) =>
    p.features
      .filter((f) => f.status === 'failed' || f.status === 'blocked' || f.warnings.length)
      .map((f) => ({ partId: p.partId, featureId: f.featureId, name: f.name, status: f.status, error: f.error ?? null, warnings: f.warnings })),
  ).concat(regen.parts.flatMap((p) => p.parameters.filter((x) => x.error).map((x) => ({ partId: p.partId, featureId: `param:${x.name}`, name: x.name, status: 'failed' as const, error: x.error ?? null, warnings: [] }))))
}

export interface ReferenceRepairCandidate {
  name: string
  /** 0..1 name overlap with the lost reference. A suggestion for ordering only; never applied automatically. */
  similarity: number
  /** Parts of the lost name this candidate shares (feature or face names). */
  shares: string[]
}

export interface ReferenceRepair {
  partId: string
  featureId: string
  featureName: string
  featureType: Feature['type']
  referenceKind: 'edge' | 'face'
  /** The message of the failure. */
  message: string
  lost: { name: string; candidates: ReferenceRepairCandidate[] }[]
  /** Number of names that exist on the body (candidates are the best matches, at most 12 per lost name). */
  available: number
  /** Always true: the person (or an approved proposal) picks; repair_reference carries the choice. */
  chooseExplicitly: true
}

const nameParts = (n: string) => n.replace(/^edge\(|\)(#\d+)?$/g, '').split(/[|/:~]/).filter(Boolean)

/**
 * Features whose face or edge reference was lost (reference-lost) with candidate replacements, best
 * name matches first. Candidates are suggestions: repair_reference applies only the replacement a
 * person or an approved proposal names.
 */
export function referenceRepairs(doc: CadDocument, regen: RegenerationResult | undefined): ReferenceRepair[] {
  if (!regen) return []
  const out: ReferenceRepair[] = []
  for (const pr of regen.parts) {
    const part = doc.parts.find((p) => p.id === pr.partId)
    for (const r of pr.features) {
      const d = r.error?.details
      if (r.status !== 'failed' || d?.reason !== 'reference-lost') continue
      const feature = part?.features.find((f) => f.id === r.featureId)
      const kind = d.referenceKind === 'face' ? 'face' : 'edge'
      const lost = Array.isArray(d.lost) ? (d.lost as string[]) : typeof d.face === 'string' ? [d.face] : []
      const available = Array.isArray(d.available) ? (d.available as string[]) : []
      const used = new Set(feature && (feature.type === 'fillet' || feature.type === 'chamfer') ? feature.edges : [])
      out.push({
        partId: pr.partId,
        featureId: r.featureId,
        featureName: r.name,
        featureType: r.type,
        referenceKind: kind,
        message: r.error!.message,
        lost: lost.map((name) => {
          const parts = new Set(nameParts(name))
          const candidates = available
            .filter((c) => c !== name && !used.has(c))
            .map((c) => {
              const cp = new Set(nameParts(c))
              const shares = [...parts].filter((x) => cp.has(x))
              const union = new Set([...parts, ...cp]).size
              return { name: c, similarity: Math.round((shares.length / (union || 1)) * 1000) / 1000, shares }
            })
            .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name))
            .slice(0, 12)
          return { name, candidates }
        }),
        available: available.length,
        chooseExplicitly: true,
      })
    }
  }
  return out
}

/** Summary of the last regeneration: what was rebuilt and what came from the cache. */
export function regenerationSummary(regen: RegenerationResult | undefined) {
  if (!regen) return null
  return {
    documentVersion: regen.documentVersion,
    ok: regen.ok,
    durationMs: Math.round(regen.durationMs * 10) / 10,
    kernel: regen.kernel,
    parts: regen.parts.map((p) => ({ partId: p.partId, rebuilt: p.rebuilt, reused: p.reused, bodies: p.bodies.map((b) => ({ bodyId: b.bodyId, valid: b.analysis.valid, volume: b.analysis.volume, faces: b.analysis.counts.faces })) })),
  }
}
