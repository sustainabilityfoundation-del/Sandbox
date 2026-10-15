import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { RELATIONSHIP_RULES, RELATIONSHIP_TYPES, wouldCreateCycle, type RelationshipType } from '../domain/rules'
import type { DecompositionDto, RelationshipCreateDto, RelationshipDto } from '../http/schemas'
import { ASSISTANT_BASES, audit, emit, isUuid, isoRequired, iso, prov, type Ctx, type Queryable } from './context'

interface RelRow {
  id: string
  type: RelationshipType
  from_id: string
  to_id: string
  decomposition_id: string | null
  note: string
  interface: RelationshipDto['interface']
  basis: RelationshipDto['basis']
  revision: number
  removed: boolean
  created_at: Date
  created_by: string
  removed_at: Date | null
  removed_by: string | null
  source_kind: RelationshipDto['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}

export const toRelationship = (r: RelRow): RelationshipDto => ({
  id: r.id,
  type: r.type,
  fromId: r.from_id,
  toId: r.to_id,
  decompositionId: r.decomposition_id,
  note: r.note,
  interface: r.interface,
  basis: r.basis,
  revision: r.revision,
  removed: r.removed,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  removedAt: iso(r.removed_at),
  removedBy: r.removed_by,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
})

export async function getRelationship(db: Queryable, projectId: string, id: string): Promise<RelationshipDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<RelRow>('SELECT * FROM conceptualize.relationships WHERE id = $1 AND project_id = $2', [id, projectId])
  return rows[0] ? toRelationship(rows[0]) : undefined
}

export async function listRelationships(db: Queryable, projectId: string, filter: { conceptId?: string; type?: string; includeRemoved?: boolean } = {}): Promise<RelationshipDto[]> {
  const params: unknown[] = [projectId]
  const where = ['project_id = $1']
  if (!filter.includeRemoved) where.push('NOT removed')
  if (filter.conceptId) {
    if (!isUuid(filter.conceptId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
    params.push(filter.conceptId)
    where.push(`(from_id = $${params.length} OR to_id = $${params.length})`)
  }
  if (filter.type) {
    const types = filter.type.split(',').map((t) => t.trim()).filter(Boolean)
    if (types.some((t) => !RELATIONSHIP_TYPES.includes(t as RelationshipType))) throw invalid('Unknown relationship type.', { type: RELATIONSHIP_TYPES.join(', ') }, 400)
    params.push(types)
    where.push(`type = ANY($${params.length})`)
  }
  const { rows } = await db.query<RelRow>(`SELECT * FROM conceptualize.relationships WHERE ${where.join(' AND ')} ORDER BY created_at, id`, params)
  return rows.map(toRelationship)
}

/**
 * Creates a typed relationship after validating its semantics: both Concepts exist in the project,
 * no self links, no duplicates (in either direction for symmetric types), no cycles for acyclic types
 * (containment cycles are checked over all decompositions together), interface definitions only on
 * interfaces-with, decompositions only on contains links from their parent.
 */
export async function createRelationship(ctx: Ctx, input: RelationshipCreateDto, options: { skipConceptEvents?: boolean } = {}): Promise<RelationshipDto> {
  const rule = RELATIONSHIP_RULES[input.type]
  if (!rule) throw invalid('Unknown relationship type.', { type: RELATIONSHIP_TYPES.join(', ') })
  if (input.fromId === input.toId) throw invalid('A Concept cannot be related to itself.', { toId: 'same as fromId' })
  const { rows: ends } = await ctx.db.query<{ id: string; key: string; maturity: string }>('SELECT id, key, maturity FROM conceptualize.concepts WHERE project_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE', [ctx.projectId, [input.fromId, input.toId]])
  const from = ends.find((e) => e.id === input.fromId)
  const to = ends.find((e) => e.id === input.toId)
  if (!from || !to) throw invalid('Both Concepts must exist in this project.', { [!from ? 'fromId' : 'toId']: 'not found' })
  if (input.interface && input.type !== 'interfaces-with') throw invalid('An interface definition belongs on an interfaces-with relationship.', { interface: 'only for interfaces-with' })
  if (input.decompositionId) {
    if (input.type !== 'contains') throw invalid('Only contains relationships belong to a decomposition.', { decompositionId: 'only for contains' })
    const { rows } = await ctx.db.query<{ parent_id: string }>('SELECT parent_id FROM conceptualize.decompositions WHERE id = $1 AND project_id = $2', [input.decompositionId, ctx.projectId])
    if (!rows[0]) throw invalid('The decomposition does not exist.', { decompositionId: 'not found' })
    if (rows[0].parent_id !== input.fromId) throw invalid('A decomposition groups the children of its own parent Concept.', { decompositionId: 'belongs to another parent' })
  }
  const basis = input.basis ?? (ctx.provenance.sourceKind === 'assistant' ? 'ai-hypothesis' : 'user-assertion')
  if (ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(basis)) throw invalid('The assistant may only record relationships as ai-hypothesis, assumption or estimate.', { basis: 'not allowed for the assistant' })
  if (basis === 'evidence' || basis === 'decision') throw invalid('Relationships are user assertions, AI hypotheses, assumptions or estimates; evidence and decisions are their own records.', { basis: 'not allowed' })

  // Serialize structure changes per project so concurrent cycle checks cannot both pass.
  await ctx.db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`conceptualize-structure:${ctx.projectId}`])
  const { rows: existing } = await ctx.db.query<{ id: string; from_id: string; to_id: string; decomposition_id: string | null }>(
    'SELECT id, from_id, to_id, decomposition_id FROM conceptualize.relationships WHERE project_id = $1 AND type = $2 AND NOT removed',
    [ctx.projectId, input.type],
  )
  const dup = existing.find(
    (e) =>
      ((e.from_id === input.fromId && e.to_id === input.toId) || (rule.symmetric && e.from_id === input.toId && e.to_id === input.fromId)) &&
      (input.type !== 'contains' || (e.decomposition_id ?? null) === (input.decompositionId ?? null)),
  )
  if (dup) throw conflict(`${from.key} and ${to.key} already have a ${input.type} relationship${rule.symmetric ? ' (in either direction)' : ''}.`, undefined, { relationshipId: dup.id })
  if (rule.acyclic) {
    const cycle = wouldCreateCycle(existing.map((e) => ({ from: e.from_id, to: e.to_id })), input.fromId, input.toId)
    if (cycle) {
      const { rows: keys } = await ctx.db.query<{ id: string; key: string }>('SELECT id, key FROM conceptualize.concepts WHERE id = ANY($1::uuid[])', [cycle])
      const k = new Map(keys.map((r) => [r.id, r.key]))
      throw invalid(`This ${input.type} relationship would create a cycle: ${cycle.map((c) => k.get(c) ?? c).join(' → ')}.`, { toId: 'cycle' })
    }
  }
  const id = randomUUID()
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.relationships (id, project_id, type, from_id, to_id, decomposition_id, note, interface, basis, created_at, created_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, ctx.projectId, input.type, input.fromId, input.toId, input.decompositionId ?? null, (input.note ?? '').trim(), input.interface ? JSON.stringify(input.interface) : null, basis, ctx.now, ctx.actor, sourceKind, conversationId, proposalId],
  )
  await audit(ctx, { entityType: 'relationship', entityId: id, conceptIds: [input.fromId, input.toId], action: 'created', revision: 1, reason: input.reason ?? '', details: { type: input.type, fromKey: from.key, toKey: to.key, decompositionId: input.decompositionId ?? null } })
  await emit(ctx, 'concept.relationships-changed', input.fromId, 1)
  if (!options.skipConceptEvents) await emit(ctx, 'concept.relationships-changed', input.toId, 1)
  return (await getRelationship(ctx.db, ctx.projectId, id))!
}

export async function removeRelationship(ctx: Ctx, id: string, expectedRevision: number, reason = ''): Promise<RelationshipDto> {
  if (!isUuid(id)) throw notFound(`Relationship ${id} not found.`)
  const { rows } = await ctx.db.query<RelRow>('SELECT * FROM conceptualize.relationships WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  const r = rows[0]
  if (!r) throw notFound(`Relationship ${id} not found.`)
  if (r.revision !== expectedRevision) throw conflict(`The relationship changed since revision ${expectedRevision} (now ${r.revision}).`, r.revision)
  if (r.removed) throw conflict('The relationship is already removed.', r.revision)
  await ctx.db.query('UPDATE conceptualize.relationships SET removed = true, revision = revision + 1, removed_at = $2, removed_by = $3 WHERE id = $1', [id, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'relationship', entityId: id, conceptIds: [r.from_id, r.to_id], action: 'removed', revision: r.revision + 1, reason, details: { type: r.type } })
  await emit(ctx, 'concept.relationships-changed', r.from_id, r.revision + 1)
  await emit(ctx, 'concept.relationships-changed', r.to_id, r.revision + 1)
  return (await getRelationship(ctx.db, ctx.projectId, id))!
}

// ---- decompositions ---------------------------------------------------------------------------------------

interface DecRow {
  id: string
  parent_id: string | null
  parent_function_id: string | null
  name: string
  description: string
  status: DecompositionDto['status']
  record_version: number
  created_at: Date
  created_by: string
  updated_at: Date
}
const toDecomposition = (r: DecRow): DecompositionDto => ({
  id: r.id,
  parentId: r.parent_id ?? r.parent_function_id!,
  name: r.name,
  description: r.description,
  status: r.status,
  recordVersion: r.record_version,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  updatedAt: isoRequired(r.updated_at),
})

export async function listDecompositions(db: Queryable, projectId: string, parentId?: string): Promise<DecompositionDto[]> {
  const { rows } = await db.query<DecRow>(
    `SELECT * FROM conceptualize.decompositions WHERE project_id = $1 ${parentId ? 'AND parent_id = $2' : ''} ORDER BY created_at, name, id`,
    parentId ? [projectId, parentId] : [projectId],
  )
  return rows.map(toDecomposition)
}

export async function createDecomposition(ctx: Ctx, input: { parentId: string; name: string; description?: string }): Promise<DecompositionDto> {
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.concepts WHERE id = $1 AND project_id = $2', [input.parentId, ctx.projectId])
  if (!rowCount) throw invalid('The parent Concept does not exist.', { parentId: 'not found' })
  const id = randomUUID()
  await ctx.db.query(
    `INSERT INTO conceptualize.decompositions (id, project_id, parent_id, name, description, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7)`,
    [id, ctx.projectId, input.parentId, input.name.trim(), (input.description ?? '').trim(), ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'decomposition', entityId: id, conceptIds: [input.parentId], action: 'created', details: { name: input.name } })
  await emit(ctx, 'concept.relationships-changed', input.parentId, 1)
  const { rows } = await ctx.db.query<DecRow>('SELECT * FROM conceptualize.decompositions WHERE id = $1', [id])
  return toDecomposition(rows[0])
}

export async function updateDecomposition(ctx: Ctx, id: string, patch: { name?: string; description?: string; status?: DecompositionDto['status']; reason?: string }, expected: number): Promise<DecompositionDto> {
  if (!isUuid(id)) throw notFound(`Decomposition ${id} not found.`)
  const { rows } = await ctx.db.query<DecRow>('SELECT * FROM conceptualize.decompositions WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  const d = rows[0]
  if (!d) throw notFound(`Decomposition ${id} not found.`)
  if (d.record_version !== expected) throw conflict(`The decomposition changed since version ${expected} (now ${d.record_version}).`, d.record_version)
  await ctx.db.query(
    'UPDATE conceptualize.decompositions SET name = $2, description = $3, status = $4, record_version = record_version + 1, updated_at = $5, updated_by = $6 WHERE id = $1',
    [id, patch.name?.trim() ?? d.name, patch.description?.trim() ?? d.description, patch.status ?? d.status, ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'decomposition', entityId: id, conceptIds: d.parent_id ? [d.parent_id] : [], action: 'updated', reason: patch.reason ?? '', details: { status: patch.status ?? d.status, functionId: d.parent_function_id } })
  if (d.parent_id) await emit(ctx, 'concept.relationships-changed', d.parent_id, d.record_version + 1)
  else await emit(ctx, 'function.revised', d.parent_function_id!, d.record_version + 1)
  const { rows: after } = await ctx.db.query<DecRow>('SELECT * FROM conceptualize.decompositions WHERE id = $1', [id])
  return toDecomposition(after[0])
}

/** Named (alternative) decomposition of a Function (CR-C1); children are decomposes-into links with this decomposition. */
export async function createFunctionDecomposition(ctx: Ctx, functionId: string, input: { name: string; description?: string }): Promise<DecompositionDto> {
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.functions WHERE id = $1 AND project_id = $2', [functionId, ctx.projectId])
  if (!rowCount) throw notFound(`Function ${functionId} not found.`)
  const id = randomUUID()
  await ctx.db.query(
    `INSERT INTO conceptualize.decompositions (id, project_id, parent_id, parent_function_id, name, description, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$6,$7)`,
    [id, ctx.projectId, functionId, input.name.trim(), (input.description ?? '').trim(), ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'decomposition', entityId: id, action: 'created', details: { functionId, name: input.name } })
  await emit(ctx, 'function.revised', functionId, 1)
  const { rows } = await ctx.db.query<DecRow>('SELECT * FROM conceptualize.decompositions WHERE id = $1', [id])
  return toDecomposition(rows[0])
}
