import { invalid, notFound } from '../errors'
import { RELATIONSHIP_TYPES, type RelationshipType } from '../domain/rules'
import type { Queryable } from './context'
import { relationshipsOf, listRelationships } from './relationships'
import { getRequirement, listRequirements } from './requirements'

/** SDK `RequirementTraceLink`s owned by Requirements (twin-owned links are merged by the host). */
export async function traceLinks(db: Queryable, projectId: string, id: string, baselineId?: string) {
  const rels = await relationshipsOf(db, projectId, id, { baselineId })
  return rels.map((r) => ({
    id: r.id,
    type: r.type,
    from: r.fromId,
    to: r.toRequirementId ?? r.toTwinId!,
    ownerModule: 'requirements' as const,
    fromRevision: r.fromRequirementRevision,
  }))
}

/**
 * Items potentially affected by a change of a requirement: requirements that derive from,
 * decompose or depend on it (transitively, up to `depth`), requirements it relies on, allocated
 * components, collections that contain it, baselines that pin it and its open review. This is a
 * list to review, not a determination that anything is actually affected.
 */
export async function impact(db: Queryable, projectId: string, id: string, depth = 3) {
  const root = await getRequirement(db, projectId, id)
  if (!root) throw notFound('Requirement not found.')
  const items: { kind: 'requirement' | 'twin-component' | 'baseline' | 'collection' | 'review'; id: string; label: string; via: string; depth: number }[] = []
  const seen = new Set([id])
  let frontier = [id]
  for (let d = 1; d <= depth && frontier.length; d++) {
    const { rows } = await db.query<{ id: string; key: string; title: string; type: string; direction: string; via_key: string }>(
      `SELECT r.id, r.key, v.title, rel.type, 'incoming' AS direction, src.key AS via_key FROM requirements.relationships rel
         JOIN requirements.requirements r ON r.id = rel.from_requirement_id JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision
         JOIN requirements.requirements src ON src.id = rel.to_requirement_id
         WHERE rel.to_requirement_id = ANY($1::uuid[]) AND NOT rel.deleted
       UNION ALL
       SELECT r.id, r.key, v.title, rel.type, 'outgoing', src.key FROM requirements.relationships rel
         JOIN requirements.requirements r ON r.id = rel.to_requirement_id JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision
         JOIN requirements.requirements src ON src.id = rel.from_requirement_id
         WHERE rel.from_requirement_id = ANY($1::uuid[]) AND NOT rel.deleted AND rel.type = 'depends-on' AND $2 = 1`,
      [frontier, d],
    )
    const next: string[] = []
    for (const r of rows) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      next.push(r.id)
      const via = r.direction === 'incoming' ? `${r.key} ${r.type === 'depends-on' ? 'depends on' : r.type === 'derives-from' ? 'derives from' : 'decomposes'} ${r.via_key}` : `${r.via_key} depends on ${r.key}`
      items.push({ kind: 'requirement', id: r.id, label: `${r.key} ${r.title}`, via, depth: d })
    }
    frontier = next
  }
  for (const rel of await relationshipsOf(db, projectId, id)) {
    if (rel.type === 'allocated-to' && rel.toTwinId) items.push({ kind: 'twin-component', id: rel.toTwinId, label: rel.toTwinId, via: `${root.key} is allocated to ${rel.toTwinId}`, depth: 1 })
  }
  const cols = await db.query<{ id: string; name: string }>('SELECT DISTINCT c.id, c.name FROM requirements.collection_nodes n JOIN requirements.collections c ON c.id = n.collection_id WHERE n.requirement_id = $1', [id])
  for (const c of cols.rows) items.push({ kind: 'collection', id: c.id, label: c.name, via: `contains ${root.key}`, depth: 1 })
  const bls = await db.query<{ id: string; name: string; revision: number }>('SELECT b.id, b.name, x.revision FROM requirements.baseline_requirements x JOIN requirements.baselines b ON b.id = x.baseline_id WHERE x.requirement_id = $1 ORDER BY b.created_at DESC', [id])
  for (const b of bls.rows) items.push({ kind: 'baseline', id: b.id, label: b.name, via: `pins ${root.key} rev ${b.revision}${b.revision !== root.revision ? ' (historical; stays unchanged)' : ''}`, depth: 1 })
  if (root.openReviewId) items.push({ kind: 'review', id: root.openReviewId, label: `Open review of rev ${root.revision}`, via: 'an edit supersedes the open review', depth: 1 })
  return {
    requirementId: id,
    revision: root.revision,
    items,
    note: 'Potentially affected items found through recorded relationships, collections, baselines and reviews. SysML references, satisfaction claims and verification records live in the shared twin; the host shows those. Engineering review decides what is actually affected.',
  }
}

/**
 * Traceability matrix: rows are requirements (filtered like the list), columns are the requirements
 * or twin components they are related to by the chosen relationship types.
 */
export async function traceMatrix(db: Queryable, projectId: string, q: { collectionId?: string; types?: string; columns?: 'requirements' | 'components'; baselineId?: string; limit?: number }) {
  const types = (q.types ? q.types.split(',') : RELATIONSHIP_TYPES).filter(Boolean) as RelationshipType[]
  if (types.some((t) => !RELATIONSHIP_TYPES.includes(t))) throw invalid('Unknown relationship type.', { types: RELATIONSHIP_TYPES.join(', ') }, 400)
  const limit = Math.min(q.limit ?? 200, 500)
  const page = await listRequirements(db, projectId, { collectionId: q.collectionId, baselineId: q.baselineId, limit: Math.min(limit, 200) })
  const rows = page.items.map((r) => ({ id: r.id, key: r.key, title: r.title }))
  const rels = (await listRelationships(db, projectId, { requirementIds: rows.map((r) => r.id), baselineId: q.baselineId })).filter((r) => types.includes(r.type))
  const rowIds = new Set(rows.map((r) => r.id))
  const wantComponents = q.columns === 'components'
  const columns = new Map<string, { id: string; label: string; kind: string }>()
  const cells = new Map<string, { row: string; column: string; types: string[] }>()
  const keyOf = new Map(rows.map((r) => [r.id, r.key]))
  const missing = new Set<string>()
  for (const rel of rels) {
    if (!rowIds.has(rel.fromId)) continue
    const target = rel.toTwinId ?? rel.toRequirementId!
    if (wantComponents !== !!rel.toTwinId) continue
    if (!rel.toTwinId && !keyOf.has(target)) missing.add(target)
    columns.set(target, { id: target, label: rel.toTwinId ?? target, kind: rel.toTwinId ? 'twin-component' : 'requirement' })
    const k = `${rel.fromId}|${target}`
    const cell = cells.get(k) ?? { row: rel.fromId, column: target, types: [] }
    cell.types.push(rel.type)
    cells.set(k, cell)
  }
  if (missing.size) {
    const { rows: extra } = await db.query<{ id: string; key: string }>('SELECT id, key FROM requirements.requirements WHERE id = ANY($1::uuid[])', [[...missing]])
    for (const e of extra) keyOf.set(e.id, e.key)
  }
  for (const c of columns.values()) if (c.kind === 'requirement') c.label = keyOf.get(c.id) ?? c.id
  return {
    rows,
    columns: [...columns.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    cells: [...cells.values()],
    truncated: !!page.nextCursor,
  }
}
