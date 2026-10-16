import type { EngineeringObject, ModelSnapshot, Relationship } from './types'

/**
 * Objects owned by an external service, projected into the shared twin's read model
 * (docs/specifications/requirements-contracts.md §3 and §10).
 *
 * Today only requirements are projected: the Requirements API is authoritative for their
 * identity, text and allocation. The twin keeps everything else. Stored twin data is never
 * rewritten (ADR-0009); legacy IDs are mapped to canonical IDs when the model is read.
 */
export interface ExternalProjection {
  /** Canonical objects from the owning service (id = canonical ID). */
  objects: EngineeringObject[]
  /** Legacy twin ID → canonical ID. The legacy twin objects are replaced by the canonical ones. */
  aliases: ReadonlyMap<string, string>
  /** Relationships owned by the external service (today `allocated-to` from requirements). */
  relationships: Relationship[]
  /** Relationship types whose `from` end the external service owns for its projected objects. */
  ownedRelationshipTypes: Relationship['type'][]
}

/**
 * Several external projections as one (requirements from the Requirements service, product elements from the
 * product registry, CR-PM-MS-2). Pure. Objects, aliases, relationships and owned relationship types are combined;
 * a later projection's object with the same ID replaces an earlier one.
 */
export function mergeProjections(...projections: (ExternalProjection | null | undefined)[]): ExternalProjection | null {
  const present = projections.filter((p): p is ExternalProjection => !!p)
  if (!present.length) return null
  if (present.length === 1) return present[0]
  const objects = new Map<string, EngineeringObject>()
  for (const p of present) for (const o of p.objects) objects.set(o.id, o)
  return {
    objects: [...objects.values()],
    aliases: new Map(present.flatMap((p) => [...p.aliases])),
    relationships: present.flatMap((p) => p.relationships),
    ownedRelationshipTypes: [...new Set(present.flatMap((p) => p.ownedRelationshipTypes))],
  }
}

/** The twin snapshot with external objects and relationships composed in. Pure; the inputs are unchanged. */
export function composeSnapshot(twin: ModelSnapshot, projection: ExternalProjection | null): ModelSnapshot {
  if (!projection) return twin
  const { aliases } = projection
  const projectedIds = new Set(projection.objects.map((o) => o.id))
  const canonical = (id: string) => aliases.get(id) ?? id
  // Relationships owned by the service come only from the service, never from the old twin copy.
  const ownedByService = (r: Relationship) => projection.ownedRelationshipTypes.includes(r.type) && projectedIds.has(canonical(r.from))
  const relationships = [
    ...twin.relationships.filter((r) => !ownedByService(r)).map((r) => (aliases.has(r.from) || aliases.has(r.to) ? { ...r, from: canonical(r.from), to: canonical(r.to) } : r)),
    ...projection.relationships,
  ]
  return {
    ...twin,
    objects: [...twin.objects.filter((o) => !aliases.has(o.id) && !projectedIds.has(o.id)), ...projection.objects],
    relationships,
  }
}
