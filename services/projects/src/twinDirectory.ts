import type { Pool } from 'pg'

/**
 * Twin directory backed by the product registry (CR-PM-API-3, integration milestone 1 C2). Structurally the
 * Requirements service's `TwinDirectory` (services/requirements/src/twin.ts), which this package may not import.
 * Requirements validates allocation targets through it: product element UUIDs and twin aliases (ACT-100, ROD-120 …)
 * of the same project only. Assemblies and parts report their twin types; other kinds report 'product-element'
 * (Requirements accepts those once CR-PM-REQ-2 lands).
 */
export interface TwinObjectInfo {
  id: string
  type: string
  name: string
}

export interface TwinDirectoryLike {
  lookup(projectId: string, ids: string[]): Promise<Map<string, TwinObjectInfo>>
  readonly description: string
}

const typeOf = (kind: string) => (kind === 'assembly' || kind === 'part' ? kind : 'product-element')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function productTwinDirectory(pool: Pool): TwinDirectoryLike {
  return {
    description: 'product registry (Project Management)',
    async lookup(projectId, ids) {
      const found = new Map<string, TwinObjectInfo>()
      if (!ids.length) return found
      const uuids = ids.filter((id) => UUID.test(id))
      const { rows } = await pool.query<{ requested: string; name: string; element_kind: string }>(
        `SELECT e.id::text AS requested, e.name, e.element_kind FROM projects.product_elements e WHERE e.project_id = $1 AND e.id = ANY($2::uuid[]) AND e.lifecycle <> 'retired'
         UNION ALL
         SELECT a.alias AS requested, e.name, e.element_kind FROM projects.product_element_aliases a JOIN projects.product_elements e ON e.id = a.element_id
         WHERE a.project_id = $1 AND a.alias = ANY($3) AND e.lifecycle <> 'retired'`,
        [projectId, uuids, ids],
      )
      for (const r of rows) found.set(r.requested, { id: r.requested, type: typeOf(r.element_kind), name: r.name })
      return found
    },
  }
}

/** The first directory that knows an ID wins (the product registry before the static development directory). */
export function composeTwinDirectories(...directories: TwinDirectoryLike[]): TwinDirectoryLike {
  return {
    description: directories.map((d) => d.description).join(', then '),
    async lookup(projectId, ids) {
      const result = new Map<string, TwinObjectInfo>()
      let missing = ids
      for (const d of directories) {
        if (!missing.length) break
        const part = await d.lookup(projectId, missing)
        for (const [k, v] of part) result.set(k, v)
        missing = missing.filter((id) => !result.has(id))
      }
      return result
    },
  }
}
