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
  /**
   * The canonical ID for `id`: legacy IDs of objects owned elsewhere (e.g. "REQ-001" for a
   * requirement now identified by its UUID) map to the canonical ID; others are returned unchanged.
   */
  canonical: (id: string) => string
}

/**
 * @param aliases legacy ID → canonical ID. Lookups by a legacy ID resolve to the canonical object,
 * so selections, artifacts and links saved before an object moved to its owning service keep working.
 */
export function buildModelIndex(snapshot: ModelSnapshot, aliases: ReadonlyMap<string, string> = new Map()): ModelIndex {
  const objectsById = new Map(snapshot.objects.map((o) => [o.id, o]))
  const scenariosById = new Map(snapshot.scenarios.map((s) => [s.id, s]))
  const canonical = (id: string) => (objectsById.has(id) ? id : (aliases.get(id) ?? id))

  const get = (id: string) => objectsById.get(canonical(id))
  const linked = (rawId: string, type: RelationshipType, direction: 'out' | 'in') => {
    const id = canonical(rawId)
    return snapshot.relationships
      .filter((r) => r.type === type && (direction === 'out' ? r.from === id : r.to === id))
      .map((r) => (direction === 'out' ? r.to : r.from))
  }

  return {
    snapshot,
    revision: snapshot.modelRevision,
    objects: snapshot.objects,
    relationships: snapshot.relationships,
    get,
    scenario: (id) => (id ? scenariosById.get(id) : undefined),
    revisionOf: (id) => get(id)?.revision ?? scenariosById.get(id)?.revision,
    nameOf: (id) => get(id)?.name ?? scenariosById.get(id)?.name ?? id,
    childrenOf: (id) => snapshot.objects.filter((o) => o.parentId === canonical(id)),
    linked,
    linkedObjects: (id, type, direction) =>
      linked(id, type, direction)
        .map(get)
        .filter((o): o is EngineeringObject => o !== undefined),
    findRelationship: (type, from, to) =>
      snapshot.relationships.find((r) => r.type === type && r.from === canonical(from) && r.to === canonical(to)),
    relationshipsOf: (rawId) => {
      const id = canonical(rawId)
      return snapshot.relationships.filter((r) => r.from === id || r.to === id)
    },
    canonical,
  }
}

