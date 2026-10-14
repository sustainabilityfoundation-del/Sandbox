import type { ModelIndex } from './modelIndex'
import type { Baseline, ModelSnapshot, OutputRecord, Relationship } from './types'

/**
 * Minimal configuration control and traceability: baselines that pin exact
 * revisions, comparison with the working model, and change impact.
 */

/** Pins the exact current definition of a configuration. */
export function pinBaseline(
  snapshot: ModelSnapshot,
  draft: { id: string; name: string; description: string; configurationId: string; createdAt: string; createdBy: string },
): Baseline {
  return {
    ...draft,
    projectId: snapshot.project.id,
    modelRevision: snapshot.modelRevision,
    objects: snapshot.objects.map((o) => ({ id: o.id, revision: o.revision })),
    scenarios: snapshot.scenarios.map((s) => ({ id: s.id, revision: s.revision })),
    relationships: structuredClone(snapshot.relationships),
  }
}

export interface BaselineComparison {
  /** Objects or scenarios whose revision differs from the pinned one. */
  changed: { id: string; pinned: number; current: number }[]
  added: string[]
  removed: string[]
  relationshipsAdded: Relationship[]
  relationshipsRemoved: Relationship[]
  identical: boolean
}

/** What changed in the working model since the baseline was taken. */
export function compareWithBaseline(baseline: Baseline, model: ModelIndex): BaselineComparison {
  const pinned = new Map([...baseline.objects, ...baseline.scenarios].map((p) => [p.id, p.revision]))
  const currentIds = [...model.objects.map((o) => o.id), ...model.snapshot.scenarios.map((s) => s.id)]
  const changed = currentIds
    .filter((id) => pinned.has(id) && model.revisionOf(id) !== pinned.get(id))
    .map((id) => ({ id, pinned: pinned.get(id)!, current: model.revisionOf(id)! }))
  const added = currentIds.filter((id) => !pinned.has(id))
  const removed = [...pinned.keys()].filter((id) => model.revisionOf(id) === undefined)
  const baselineRels = new Set(baseline.relationships.map((r) => r.id))
  const currentRels = new Set(model.relationships.map((r) => r.id))
  const relationshipsAdded = model.relationships.filter((r) => !baselineRels.has(r.id))
  const relationshipsRemoved = baseline.relationships.filter((r) => !currentRels.has(r.id))
  return {
    changed,
    added,
    removed,
    relationshipsAdded,
    relationshipsRemoved,
    identical: !changed.length && !added.length && !removed.length && !relationshipsAdded.length && !relationshipsRemoved.length,
  }
}

export interface ChangeImpact {
  /** Linked objects, by relationship (both directions). */
  linked: { id: string; type: Relationship['type']; direction: 'out' | 'in' }[]
  /** Saved artifacts that used the object as an input: they become potentially stale if it changes. */
  dependentArtifacts: OutputRecord[]
  /** Saved artifacts that reference an exact revision of it (e.g. verification records). */
  referencingArtifacts: OutputRecord[]
  /** Baselines that pin it; they keep the pinned revision. */
  baselines: { id: string; name: string; revision: number }[]
}

/** What a change to an object would affect: links, evidence that would go stale, baselines. */
export function changeImpact(model: ModelIndex, artifacts: OutputRecord[], baselines: Baseline[], id: string): ChangeImpact {
  return {
    linked: model.relationshipsOf(id).map((r) => ({ id: r.from === id ? r.to : r.from, type: r.type, direction: r.from === id ? 'out' : 'in' })),
    dependentArtifacts: artifacts.filter((a) => a.inputs.some((i) => i.id === id)),
    referencingArtifacts: artifacts.filter((a) => a.references?.some((r) => r.id === id && r.revision !== undefined)),
    baselines: baselines.flatMap((b) => {
      const pin = b.objects.find((o) => o.id === id) ?? b.scenarios.find((s) => s.id === id)
      return pin ? [{ id: b.id, name: b.name, revision: pin.revision }] : []
    }),
  }
}
