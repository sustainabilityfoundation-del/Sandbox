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

/**
 * Object types an allocation may point at: twin components (RELATIONSHIP_RULES in model-service:
 * assembly or part) and product elements from the Project Management product registry
 * (CR-PM-REQ-2; the host supplies them through its TwinDirectory, CR-PM-API-3).
 */
export const ALLOCATABLE_TYPES = ['assembly', 'part', 'product-element']

/**
 * Combines directories (for example the static sample twin and the product registry): an ID is
 * answered by the first directory that knows it.
 */
export function composeTwinDirectory(...directories: TwinDirectory[]): TwinDirectory {
  return {
    description: directories.map((d) => d.description).join(' + '),
    async lookup(projectId, ids) {
      const found = new Map<string, TwinObjectInfo>()
      for (const directory of directories) {
        const missing = ids.filter((id) => !found.has(id))
        if (!missing.length) break
        for (const [id, info] of await directory.lookup(projectId, missing)) if (!found.has(id)) found.set(id, info)
      }
      return found
    },
  }
}

/** A SysML Modeler element the host found: `id` is `<sysmlProjectId>/<elementId>`. */
export interface SysmlElementInfo {
  id: string
  name: string
  metaclass?: string
  /** Commit number of the element at the default-branch head. */
  revision: number
}

/**
 * Validates allocation targets in the SysML Modeler (D1, requirements.allocate). Supplied by the host,
 * which may read the SysML service in process; without it, SysML allocations are refused.
 */
export interface SysmlElementDirectory {
  lookup(projectId: string, ids: string[]): Promise<Map<string, SysmlElementInfo>>
  readonly description: string
}

export function staticTwinDirectory(objects: Record<string, TwinObjectInfo[]>, description: string): TwinDirectory {
  return {
    description,
    async lookup(projectId, ids) {
      const known = new Map((objects[projectId] ?? []).map((o) => [o.id, o]))
      return new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id)!]))
    },
  }
}
