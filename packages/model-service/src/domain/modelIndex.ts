import type { EngineeringObject, ModelSnapshot, Relationship, RelationshipType, Scenario } from './types'

/** Read-only lookups over a model snapshot. Rebuilt whenever the model changes. */
export interface ModelIndex {
  snapshot: ModelSnapshot
  revision: number
  objects: readonly EngineeringObject[]
  relationships: readonly Relationship[]
  get: (id: string) => EngineeringObject | undefined
  scenario: (id: string | null | undefined) => Scenario | undefined
  /** Current revision of an object or scenario, or undefined if it doesn't exist. */
  revisionOf: (id: string) => number | undefined
  nameOf: (id: string) => string
  childrenOf: (id: string) => EngineeringObject[]
  /** IDs linked from `id` (direction 'out') or to `id` (direction 'in'). */
  linked: (id: string, type: RelationshipType, direction: 'out' | 'in') => string[]
  linkedObjects: (id: string, type: RelationshipType, direction: 'out' | 'in') => EngineeringObject[]
  findRelationship: (type: RelationshipType, from: string, to: string) => Relationship | undefined
  /** Every relationship that starts or ends at `id`. */
  relationshipsOf: (id: string) => Relationship[]
}

export function buildModelIndex(snapshot: ModelSnapshot): ModelIndex {
  const objectsById = new Map(snapshot.objects.map((o) => [o.id, o]))
  const scenariosById = new Map(snapshot.scenarios.map((s) => [s.id, s]))

  const get = (id: string) => objectsById.get(id)
  const linked = (id: string, type: RelationshipType, direction: 'out' | 'in') =>
    snapshot.relationships
      .filter((r) => r.type === type && (direction === 'out' ? r.from === id : r.to === id))
      .map((r) => (direction === 'out' ? r.to : r.from))

  return {
    snapshot,
    revision: snapshot.modelRevision,
    objects: snapshot.objects,
    relationships: snapshot.relationships,
    get,
    scenario: (id) => (id ? scenariosById.get(id) : undefined),
    revisionOf: (id) => objectsById.get(id)?.revision ?? scenariosById.get(id)?.revision,
    nameOf: (id) => objectsById.get(id)?.name ?? scenariosById.get(id)?.name ?? id,
    childrenOf: (id) => snapshot.objects.filter((o) => o.parentId === id),
    linked,
    linkedObjects: (id, type, direction) =>
      linked(id, type, direction)
        .map(get)
        .filter((o): o is EngineeringObject => o !== undefined),
    findRelationship: (type, from, to) =>
      snapshot.relationships.find((r) => r.type === type && r.from === from && r.to === to),
    relationshipsOf: (id) => snapshot.relationships.filter((r) => r.from === id || r.to === id),
  }
}

