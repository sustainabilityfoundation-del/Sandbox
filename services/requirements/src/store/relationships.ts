import { randomUUID } from 'node:crypto'
import type { RelationshipDto } from '../http/schemas'
import { conflict, invalid, notFound } from '../errors'
import { RELATIONSHIP_RULES, RELATIONSHIP_TYPES, type RelationshipType } from '../domain/rules'
import { ALLOCATABLE_TYPES, type TwinDirectory } from '../twin'
import { audit, emit, isUuid, isoRequired, type Ctx, type Queryable } from './context'

interface Row {
  id: string
  project_id: string
  type: RelationshipType
  from_requirement_id: string
  to_requirement_id: string | null
  to_twin_id: string | null
  current_revision: number
  deleted: boolean
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  rationale: string
  from_requirement_revision: number
  to_requirement_revision: number | null
  revision: number
}

const SELECT = `SELECT r.id, r.project_id, r.type, r.from_requirement_id, r.to_requirement_id, r.to_twin_id, r.current_revision, rr.deleted, r.created_at, r.created_by,
    r.updated_at, r.updated_by, rr.rationale, rr.from_requirement_revision, rr.to_requirement_revision, rr.revision
  FROM requirements.relationships r JOIN requirements.relationship_revisions rr ON rr.relationship_id = r.id`

const toDto = (r: Row): RelationshipDto => ({
  id: r.id,
  projectId: r.project_id,
  type: r.type,
  fromId: r.from_requirement_id,
  toRequirementId: r.to_requirement_id,
  toTwinId: r.to_twin_id,
  revision: r.revision,
  deleted: r.deleted,
  rationale: r.rationale,
  fromRequirementRevision: r.from_requirement_revision,
  toRequirementRevision: r.to_requirement_revision,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  updatedAt: isoRequired(r.updated_at),
  updatedBy: r.updated_by,
})

export async function getRelationship(db: Queryable, projectId: string, id: string): Promise<RelationshipDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} AND rr.revision = r.current_revision WHERE r.id = $1 AND r.project_id = $2`, [id, projectId])
  return rows[0] && toDto(rows[0])
}

/** Relationships touching a requirement (both directions), working state or as pinned by a baseline. */
export async function relationshipsOf(db: Queryable, projectId: string, requirementId: string, opts: { baselineId?: string; includeDeleted?: boolean } = {}): Promise<RelationshipDto[]> {
  if (opts.baselineId) {
    const { rows } = await db.query<Row>(
      `${SELECT} JOIN requirements.baseline_relationships b ON b.relationship_id = r.id AND b.revision = rr.revision
       WHERE b.baseline_id = $1 AND r.project_id = $2 AND (r.from_requirement_id = $3 OR r.to_requirement_id = $3) AND NOT rr.deleted ORDER BY r.type, r.created_at`,
      [opts.baselineId, projectId, requirementId],
    )
    return rows.map(toDto)
  }
  const { rows } = await db.query<Row>(
    `${SELECT} AND rr.revision = r.current_revision WHERE r.project_id = $1 AND (r.from_requirement_id = $2 OR r.to_requirement_id = $2) ${opts.includeDeleted ? '' : 'AND NOT r.deleted'} ORDER BY r.type, r.created_at`,
    [projectId, requirementId],
  )
  return rows.map(toDto)
}

export async function listRelationships(db: Queryable, projectId: string, q: { type?: string; toTwinId?: string; requirementIds?: string[]; baselineId?: string; limit?: number }): Promise<RelationshipDto[]> {
  const params: unknown[] = [projectId]
  const where = ['r.project_id = $1']
  let join = 'AND rr.revision = r.current_revision'
  let deleted = 'AND NOT r.deleted'
  if (q.baselineId) {
    params.push(q.baselineId)
    join = `JOIN requirements.baseline_relationships b ON b.relationship_id = r.id AND b.revision = rr.revision AND b.baseline_id = $${params.length}`
    deleted = 'AND NOT rr.deleted'
  }
  if (q.type) {
    params.push(q.type)
    where.push(`r.type = $${params.length}`)
  }
  if (q.toTwinId) {
    params.push(q.toTwinId)
    where.push(`r.to_twin_id = $${params.length}`)
  }
  if (q.requirementIds) {
    params.push(q.requirementIds)
    where.push(`(r.from_requirement_id = ANY($${params.length}::uuid[]) OR r.to_requirement_id = ANY($${params.length}::uuid[]))`)
  }
  params.push(Math.min(q.limit ?? 5000, 20000))
  const { rows } = await db.query<Row>(`${SELECT} ${join} WHERE ${where.join(' AND ')} ${deleted} ORDER BY r.created_at, r.id LIMIT $${params.length}`, params)
  return rows.map(toDto)
}

async function currentRevision(ctx: Ctx, id: string): Promise<{ revision: number; key: string; archived: boolean } | undefined> {
  const { rows } = await ctx.db.query<{ current_revision: number; key: string; archived: boolean }>('SELECT current_revision, key, archived FROM requirements.requirements WHERE id = $1 AND project_id = $2', [id, ctx.projectId])
  return rows[0] && { revision: rows[0].current_revision, key: rows[0].key, archived: rows[0].archived }
}

export interface RelationshipInput {
  type: RelationshipType
  fromId: string
  toRequirementId?: string
  toTwinId?: string
  rationale?: string
  reason?: string
}

/** Validates type, endpoints, duplicates and cycles, then creates the relationship (revision 1). */
export async function createRelationship(ctx: Ctx, twin: TwinDirectory, input: RelationshipInput, opts: { silent?: boolean; id?: string } = {}): Promise<RelationshipDto> {
  if (!RELATIONSHIP_TYPES.includes(input.type)) throw invalid(`Unknown relationship type “${input.type}”.`, { type: RELATIONSHIP_TYPES.join(', ') })
  const rule = RELATIONSHIP_RULES[input.type]
  if (!isUuid(input.fromId)) throw invalid('fromId must be a requirement ID.', { fromId: 'uuid' })
  await ctx.db.query('SELECT 1 FROM requirements.requirements WHERE id = $1 AND project_id = $2 FOR UPDATE', [input.fromId, ctx.projectId])
  const from = await currentRevision(ctx, input.fromId)
  if (!from) throw invalid('The from requirement does not exist in this project.', { fromId: 'unknown' })
  if (from.archived) throw invalid(`${from.key} is archived; restore it before adding relationships.`)
  let toRevision: number | null = null
  if (rule.to === 'requirement') {
    if (!input.toRequirementId || input.toTwinId) throw invalid(`A “${input.type}” relationship goes from a requirement to a requirement.`, { toRequirementId: 'required', toTwinId: 'not allowed' })
    if (input.toRequirementId === input.fromId) throw invalid('A requirement cannot be related to itself.', { toRequirementId: 'same as fromId' })
    if (!isUuid(input.toRequirementId)) throw invalid('toRequirementId must be a requirement ID.', { toRequirementId: 'uuid' })
    const to = await currentRevision(ctx, input.toRequirementId)
    if (!to) throw invalid('The to requirement does not exist in this project.', { toRequirementId: 'unknown' })
    toRevision = to.revision
    if (rule.acyclic) {
      // Would `to` reach `from` along the same type? Then the new link closes a cycle.
      const { rows } = await ctx.db.query(
        `WITH RECURSIVE reach(id) AS (SELECT $1::uuid UNION SELECT r.to_requirement_id FROM requirements.relationships r JOIN reach ON r.from_requirement_id = reach.id
           WHERE r.type = $3 AND NOT r.deleted AND r.to_requirement_id IS NOT NULL)
         SELECT 1 FROM reach WHERE id = $2`,
        [input.toRequirementId, input.fromId, input.type],
      )
      if (rows.length) throw invalid(`This “${input.type}” link would create a cycle (${to.key} already leads back to ${from.key}).`, { toRequirementId: 'cycle' })
    }
  } else {
    if (!input.toTwinId || input.toRequirementId) throw invalid('An allocation goes from a requirement to a twin component (assembly or part).', { toTwinId: 'required', toRequirementId: 'not allowed' })
    const found = (await twin.lookup(ctx.projectId, [input.toTwinId])).get(input.toTwinId)
    if (!found) throw invalid(`${input.toTwinId} is not a known component in the shared twin (${twin.description}).`, { toTwinId: 'unknown twin object' })
    if (!ALLOCATABLE_TYPES.includes(found.type)) throw invalid(`${input.toTwinId} is a ${found.type}; requirements are allocated to components (assembly or part).`, { toTwinId: `type ${found.type}` })
  }
  const existing = await ctx.db.query<{ id: string }>(
    `SELECT id FROM requirements.relationships WHERE type = $1 AND from_requirement_id = $2 AND coalesce(to_requirement_id::text, to_twin_id) = $3 AND NOT deleted`,
    [input.type, input.fromId, input.toRequirementId ?? input.toTwinId],
  )
  if (existing.rowCount) throw conflict('This relationship already exists.', undefined, { existingId: existing.rows[0].id })
  const id = opts.id ?? randomUUID()
  await ctx.db.query(
    `INSERT INTO requirements.relationships (id, project_id, type, from_requirement_id, to_requirement_id, to_twin_id, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8)`,
    [id, ctx.projectId, input.type, input.fromId, input.toRequirementId ?? null, input.toTwinId ?? null, ctx.now, ctx.actor],
  )
  await ctx.db.query(
    `INSERT INTO requirements.relationship_revisions (relationship_id, revision, deleted, rationale, from_requirement_revision, to_requirement_revision, change_reason, created_at, created_by) VALUES ($1,1,false,$2,$3,$4,$5,$6,$7)`,
    [id, input.rationale ?? '', from.revision, toRevision, input.reason ?? '', ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'relationship', entityId: id, action: 'created', revision: 1, reason: input.reason, details: { type: input.type, fromId: input.fromId, toRequirementId: input.toRequirementId, toTwinId: input.toTwinId } })
  if (!opts.silent) await emitRelationshipEvents(ctx, input.fromId, input.toRequirementId ?? null)
  return (await getRelationship(ctx.db, ctx.projectId, id))!
}

export async function emitRelationshipEvents(ctx: Ctx, fromId: string, toId: string | null) {
  for (const id of [fromId, toId].filter((x): x is string => !!x)) {
    const r = await currentRevision(ctx, id)
    if (r) await emit(ctx, 'requirement.relationships-changed', id, r.revision)
  }
}

/** Marks a relationship deleted by adding a revision (history and baselines keep the earlier ones). */
export async function deleteRelationship(ctx: Ctx, id: string, expectedRevision: number, reason = ''): Promise<RelationshipDto> {
  if (!isUuid(id)) throw notFound('Relationship not found.')
  const { rows } = await ctx.db.query<{ current_revision: number; deleted: boolean; from_requirement_id: string; to_requirement_id: string | null }>(
    'SELECT current_revision, deleted, from_requirement_id, to_requirement_id FROM requirements.relationships WHERE id = $1 AND project_id = $2 FOR UPDATE',
    [id, ctx.projectId],
  )
  const rel = rows[0]
  if (!rel) throw notFound('Relationship not found.')
  if (rel.current_revision !== expectedRevision) throw conflict(`The relationship changed since revision ${expectedRevision} (now ${rel.current_revision}).`, rel.current_revision)
  if (rel.deleted) throw conflict('The relationship is already deleted.', rel.current_revision)
  const prev = await ctx.db.query<{ rationale: string }>('SELECT rationale FROM requirements.relationship_revisions WHERE relationship_id = $1 AND revision = $2', [id, rel.current_revision])
  const from = await currentRevision(ctx, rel.from_requirement_id)
  const to = rel.to_requirement_id ? await currentRevision(ctx, rel.to_requirement_id) : undefined
  const revision = rel.current_revision + 1
  await ctx.db.query(
    `INSERT INTO requirements.relationship_revisions (relationship_id, revision, deleted, rationale, from_requirement_revision, to_requirement_revision, change_reason, created_at, created_by) VALUES ($1,$2,true,$3,$4,$5,$6,$7,$8)`,
    [id, revision, prev.rows[0]?.rationale ?? '', from?.revision ?? 1, to?.revision ?? null, reason, ctx.now, ctx.actor],
  )
  await ctx.db.query('UPDATE requirements.relationships SET current_revision = $2, deleted = true, updated_at = $3, updated_by = $4 WHERE id = $1', [id, revision, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'relationship', entityId: id, action: 'deleted', revision, reason, details: { fromId: rel.from_requirement_id, toRequirementId: rel.to_requirement_id } })
  await emitRelationshipEvents(ctx, rel.from_requirement_id, rel.to_requirement_id)
  return (await getRelationship(ctx.db, ctx.projectId, id))!
}

export { RELATIONSHIP_RULES }
