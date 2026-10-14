/**
 * The shared digital twin, as the Requirements service sees it: a directory to validate allocation
 * targets. Components, SysML elements and CAD representations are never copied into the
 * `requirements` schema (contracts §2); only their twin IDs are stored as relationship endpoints.
 *
 * Today the twin lives in the browser demo repository, so the host supplies a directory. The
 * development host uses the sample actuator's component IDs; production needs a platform endpoint
 * (integration need recorded in the progress file).
 */
export interface TwinObjectInfo {
  id: string
  type: string
  name: string
}

export interface TwinDirectory {
  /** Looks up twin objects; missing IDs are absent from the result. */
  lookup(projectId: string, ids: string[]): Promise<Map<string, TwinObjectInfo>>
  /** Short description of where the data comes from, shown in errors and docs. */
  readonly description: string
}

/** Twin object types an allocation may point at (RELATIONSHIP_RULES in model-service: assembly or part). */
export const ALLOCATABLE_TYPES = ['assembly', 'part']

export function staticTwinDirectory(objects: Record<string, TwinObjectInfo[]>, description: string): TwinDirectory {
  return {
    description,
    async lookup(projectId, ids) {
      const known = new Map((objects[projectId] ?? []).map((o) => [o.id, o]))
      return new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id)!]))
    },
  }
}
