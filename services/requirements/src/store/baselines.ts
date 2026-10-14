import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { audit, emit, isUuid, isoRequired, type Ctx, type Queryable } from './context'
import { compareRequirements, getRequirement } from './requirements'

/**
 * Requirements baselines: immutable records pinning requirement revisions, relationship revisions
 * and collection structure. Separate from platform (twin) baselines (contracts §8).
 */

export interface BaselineDto {
  id: string
  projectId: string
  name: string
  description: string
  configurationId: string | null
  scopeCollectionIds: string[] | null
  requirementCount: number
  relationshipCount: number
  createdAt: string
  createdBy: string
}

const SELECT = `SELECT b.*, (SELECT count(*) FROM requirements.baseline_requirements x WHERE x.baseline_id = b.id) AS requirement_count,
  (SELECT count(*) FROM requirements.baseline_relationships x WHERE x.baseline_id = b.id) AS relationship_count FROM requirements.baselines b`

type Row = { id: string; project_id: string; name: string; description: string; configuration_id: string | null; scope_collection_ids: string[] | null; created_at: Date; created_by: string; requirement_count: string; relationship_count: string }
const toDto = (r: Row): BaselineDto => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  description: r.description,
  configurationId: r.configuration_id,
  scopeCollectionIds: r.scope_collection_ids,
  requirementCount: Number(r.requirement_count),
  relationshipCount: Number(r.relationship_count),
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
})

export async function listBaselines(db: Queryable, projectId: string): Promise<BaselineDto[]> {
  const { rows } = await db.query<Row>(`${SELECT} WHERE b.project_id = $1 ORDER BY b.created_at DESC`, [projectId])
  return rows.map(toDto)
}

export async function getBaseline(db: Queryable, projectId: string, id: string): Promise<BaselineDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} WHERE b.project_id = $1 AND b.id = $2`, [projectId, id])
  return rows[0] && toDto(rows[0])
}

export async function createBaseline(ctx: Ctx, input: { name: string; description?: string; configurationId?: string; collectionIds?: string[]; includeArchived?: boolean }): Promise<BaselineDto> {
  const name = input.name.trim()
  if (!name) throw invalid('A baseline needs a name.', { name: 'required' })
  const taken = await ctx.db.query('SELECT 1 FROM requirements.baselines WHERE project_id = $1 AND name = $2', [ctx.projectId, name])
  if (taken.rowCount) throw conflict(`A baseline named “${name}” already exists.`)
  const scope = input.collectionIds?.length ? input.collectionIds : null
  if (scope) {
    if (scope.some((c) => !isUuid(c))) throw invalid('collectionIds must be collection IDs.', { collectionIds: 'uuid' })
    const { rows } = await ctx.db.query<{ n: string }>('SELECT count(*) AS n FROM requirements.collections WHERE project_id = $1 AND id = ANY($2::uuid[])', [ctx.projectId, scope])
    if (Number(rows[0].n) !== new Set(scope).size) throw invalid('Some collections do not exist.', { collectionIds: 'unknown' })
  }
  // Lock the project's requirements against concurrent edits while pinning (consistent snapshot).
  await ctx.db.query('SELECT id FROM requirements.requirements WHERE project_id = $1 FOR SHARE', [ctx.projectId])
  const id = randomUUID()
  await ctx.db.query(
    'INSERT INTO requirements.baselines (id, project_id, name, description, configuration_id, scope_collection_ids, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, ctx.projectId, name, input.description ?? '', input.configurationId ?? null, scope, ctx.now, ctx.actor],
  )
  const params: unknown[] = [id, ctx.projectId]
  const conditions = ['r.project_id = $2']
  if (!input.includeArchived) conditions.push('NOT r.archived')
  if (scope) {
    params.push(scope)
    conditions.push(`EXISTS (SELECT 1 FROM requirements.collection_nodes n WHERE n.requirement_id = r.id AND n.collection_id = ANY($${params.length}::uuid[]))`)
  }
  if (input.configurationId) {
    params.push(input.configurationId)
    conditions.push(`EXISTS (SELECT 1 FROM requirements.requirement_revisions v WHERE v.requirement_id = r.id AND v.revision = r.current_revision AND (cardinality(v.applicability) = 0 OR $${params.length} = ANY(v.applicability)))`)
  }
  await ctx.db.query(
    `INSERT INTO requirements.baseline_requirements (baseline_id, requirement_id, revision, key, status, archived)
     SELECT $1, r.id, r.current_revision, r.key, r.status, r.archived FROM requirements.requirements r WHERE ${conditions.join(' AND ')}`,
    params,
  )
  // Relationships whose from end is pinned (allocation) and, for requirement links, whose to end is pinned too.
  await ctx.db.query(
    `INSERT INTO requirements.baseline_relationships (baseline_id, relationship_id, revision)
     SELECT $1, rel.id, rel.current_revision FROM requirements.relationships rel
     WHERE NOT rel.deleted AND EXISTS (SELECT 1 FROM requirements.baseline_requirements b WHERE b.baseline_id = $1 AND b.requirement_id = rel.from_requirement_id)
       AND (rel.to_requirement_id IS NULL OR EXISTS (SELECT 1 FROM requirements.baseline_requirements b WHERE b.baseline_id = $1 AND b.requirement_id = rel.to_requirement_id))`,
    [id],
  )
  const collections = scope ?? (await ctx.db.query<{ id: string }>('SELECT id FROM requirements.collections WHERE project_id = $1 AND NOT archived', [ctx.projectId])).rows.map((r) => r.id)
  for (const cid of collections) {
    await ctx.db.query('SELECT 1 FROM requirements.collections WHERE id = $1 FOR SHARE', [cid])
    await ctx.db.query('INSERT INTO requirements.baseline_collections (baseline_id, collection_id, name, structure_revision) SELECT $1, id, name, structure_revision FROM requirements.collections WHERE id = $2', [id, cid])
    await ctx.db.query(
      `INSERT INTO requirements.baseline_collection_nodes (baseline_id, node_id, collection_id, parent_id, position, kind, heading, requirement_id)
       SELECT $1, n.id, n.collection_id, n.parent_id, n.position, n.kind, n.heading, n.requirement_id FROM requirements.collection_nodes n WHERE n.collection_id = $2`,
      [id, cid],
    )
  }
  await audit(ctx, { entityType: 'baseline', entityId: id, action: 'created', revision: 1, details: { name, configurationId: input.configurationId, collectionIds: scope } })
  await emit(ctx, 'requirements.baseline-created', id, 1)
  return (await getBaseline(ctx.db, ctx.projectId, id))!
}

/** Compares a baseline with another baseline or with the working state ('working'). */
export async function compareBaselines(db: Queryable, projectId: string, fromId: string, toId: string | 'working') {
  const from = await getBaseline(db, projectId, fromId)
  if (!from) throw notFound('Baseline not found.')
  if (toId !== 'working' && !(await getBaseline(db, projectId, toId))) throw notFound('Baseline to compare with not found.')
  type Pin = { requirement_id: string; revision: number; key: string; status: string; archived: boolean }
  const pins = async (b: string | 'working'): Promise<Map<string, Pin>> => {
    const { rows } =
      b === 'working'
        ? await db.query<Pin>('SELECT id AS requirement_id, current_revision AS revision, key, status, archived FROM requirements.requirements WHERE project_id = $1 AND NOT archived', [projectId])
        : await db.query<Pin>('SELECT requirement_id, revision, key, status, archived FROM requirements.baseline_requirements WHERE baseline_id = $1', [b])
    return new Map(rows.map((r) => [r.requirement_id, r]))
  }
  const a = await pins(fromId)
  const b = await pins(toId)
  const requirements: { id: string; key: string; change: 'added' | 'removed' | 'changed' | 'unchanged'; fromRevision: number | null; toRevision: number | null; fields: string[] }[] = []
  for (const [id, pa] of a) {
    const pb = b.get(id)
    if (!pb) requirements.push({ id, key: pa.key, change: 'removed', fromRevision: pa.revision, toRevision: null, fields: [] })
    else if (pa.revision === pb.revision && pa.status === pb.status && pa.key === pb.key) requirements.push({ id, key: pb.key, change: 'unchanged', fromRevision: pa.revision, toRevision: pb.revision, fields: [] })
    else {
      const ra = (await getRequirement(db, projectId, id, { baselineId: fromId }))!
      const rb = toId === 'working' ? (await getRequirement(db, projectId, id))! : (await getRequirement(db, projectId, id, { baselineId: toId }))!
      requirements.push({ id, key: pb.key, change: 'changed', fromRevision: pa.revision, toRevision: pb.revision, fields: compareRequirements(ra, rb).map((c) => c.field) })
    }
  }
  for (const [id, pb] of b) if (!a.has(id)) requirements.push({ id, key: pb.key, change: 'added', fromRevision: null, toRevision: pb.revision, fields: [] })
  requirements.sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true }))

  type RelPin = { relationship_id: string; revision: number; type: string; from_requirement_id: string; to: string; deleted: boolean }
  const rels = async (bid: string | 'working'): Promise<Map<string, RelPin>> => {
    const { rows } =
      bid === 'working'
        ? await db.query<RelPin>(`SELECT id AS relationship_id, current_revision AS revision, type, from_requirement_id, coalesce(to_requirement_id::text, to_twin_id) AS "to", deleted FROM requirements.relationships WHERE project_id = $1 AND NOT deleted`, [projectId])
        : await db.query<RelPin>(
            `SELECT x.relationship_id, x.revision, r.type, r.from_requirement_id, coalesce(r.to_requirement_id::text, r.to_twin_id) AS "to", rr.deleted FROM requirements.baseline_relationships x
             JOIN requirements.relationships r ON r.id = x.relationship_id JOIN requirements.relationship_revisions rr ON rr.relationship_id = x.relationship_id AND rr.revision = x.revision WHERE x.baseline_id = $1`,
            [bid],
          )
    return new Map(rows.filter((r) => !r.deleted).map((r) => [r.relationship_id, r]))
  }
  const ra = await rels(fromId)
  const rb = await rels(toId)
  const relationships: { id: string; change: string; type: string; from: string; to: string }[] = []
  for (const [id, x] of ra) if (!rb.has(id)) relationships.push({ id, change: 'removed', type: x.type, from: x.from_requirement_id, to: x.to })
  for (const [id, x] of rb) if (!ra.has(id)) relationships.push({ id, change: 'added', type: x.type, from: x.from_requirement_id, to: x.to })

  type NodePin = { collection_id: string; node_id: string; parent_id: string | null; position: number; heading: string | null; requirement_id: string | null }
  const nodes = async (bid: string | 'working'): Promise<NodePin[]> =>
    bid === 'working'
      ? (await db.query<NodePin>('SELECT n.collection_id, n.id AS node_id, n.parent_id, n.position, n.heading, n.requirement_id FROM requirements.collection_nodes n JOIN requirements.collections c ON c.id = n.collection_id WHERE c.project_id = $1', [projectId])).rows
      : (await db.query<NodePin>('SELECT collection_id, node_id, parent_id, position, heading, requirement_id FROM requirements.baseline_collection_nodes WHERE baseline_id = $1', [bid])).rows
  const na = new Map((await nodes(fromId)).map((n) => [n.node_id, n]))
  const nb = new Map((await nodes(toId)).map((n) => [n.node_id, n]))
  const fromCollections = new Set([...na.values()].map((n) => n.collection_id))
  const structure: { collectionId: string; change: string; detail: string }[] = []
  for (const [id, n] of na) {
    const m = nb.get(id)
    if (!m) structure.push({ collectionId: n.collection_id, change: 'removed', detail: n.heading ? `heading “${n.heading}”` : `requirement ${a.get(n.requirement_id ?? '')?.key ?? n.requirement_id}` })
    else if (m.parent_id !== n.parent_id || m.position !== n.position) structure.push({ collectionId: n.collection_id, change: 'moved', detail: n.heading ? `heading “${n.heading}”` : `requirement ${a.get(n.requirement_id ?? '')?.key ?? n.requirement_id}` })
    else if (m.heading !== n.heading) structure.push({ collectionId: n.collection_id, change: 'renamed', detail: `“${n.heading}” → “${m.heading}”` })
  }
  for (const [id, n] of nb) if (!na.has(id) && fromCollections.has(n.collection_id)) structure.push({ collectionId: n.collection_id, change: 'added', detail: n.heading ? `heading “${n.heading}”` : `requirement ${b.get(n.requirement_id ?? '')?.key ?? n.requirement_id}` })
  return { from: fromId, to: toId, requirements, relationships, structure }
}
