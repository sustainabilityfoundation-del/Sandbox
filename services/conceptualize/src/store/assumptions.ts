import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { KEY_PREFIX, roleAllows, type Basis } from '../domain/rules'
import { quantityProblem } from '../domain/units'
import type { AssumptionCreateDto, AssumptionOut, AssumptionPatchDto } from '../http/designSchemas'
import { getConcepts } from './concepts'
import { audit, emit, isUuid, isoRequired, nextKey, prov, type Ctx, type Queryable } from './context'
import { artifactProblem } from './implementations'
import { requireRefs } from './refs'

/**
 * Assumptions (CR-C3): separately identifiable engineering assumptions with a scope, dependencies and an
 * explicit validation history. Migration 0002 created one per existing assumption statement (origin
 * reference; statements unchanged). Validation needs evidence and a person; invalidating an assumption
 * that a recorded decision depends on needs a reviewer.
 */

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  validation_status: AssumptionOut['validationStatus']
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  statement: string
  quantity: AssumptionOut['quantity']
  scope: { subjects: AssumptionOut['scope']['subjects']; applicability?: string }
  basis: Basis
  depends_on: AssumptionOut['dependsOn']
  origin: AssumptionOut['origin']
  change_reason: string
  source_kind: AssumptionOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  rev_created_at: Date
  rev_created_by: string
}
interface ValRow {
  id: string
  assumption_id: string
  revision: number
  from_status: string
  to_status: string
  evidence_ids: string[]
  reason: string
  actor: string
  occurred_at: Date
  source_kind: AssumptionOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}

const SELECT = `SELECT a.id, a.project_id, a.key, a.current_revision, a.validation_status, a.created_at, a.created_by, a.updated_at, a.updated_by,
  v.revision, v.statement, v.quantity, v.scope, v.basis, v.depends_on, v.origin, v.change_reason, v.source_kind, v.conversation_id, v.proposal_id,
  v.message_id, v.created_at AS rev_created_at, v.created_by AS rev_created_by
  FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id`

async function toDtos(db: Queryable, rows: Row[]): Promise<AssumptionOut[]> {
  const ids = rows.map((r) => r.id)
  const vals = ids.length ? (await db.query<ValRow>('SELECT * FROM conceptualize.assumption_validations WHERE assumption_id = ANY($1::uuid[]) ORDER BY occurred_at, id', [ids])).rows : []
  return rows.map((r) => {
    const historical = r.revision !== r.current_revision
    const v = vals.filter((x) => x.assumption_id === r.id)
    const lastValidated = [...v].reverse().find((x) => x.to_status === 'validated')
    return {
      id: r.id,
      key: r.key,
      projectId: r.project_id,
      revision: r.revision,
      statement: r.statement,
      quantity: r.quantity,
      scope: { subjects: r.scope.subjects ?? [], applicability: r.scope.applicability ?? '' },
      basis: r.basis,
      dependsOn: r.depends_on,
      origin: r.origin,
      validationStatus: r.validation_status,
      validatedBy: r.validation_status === 'validated' && lastValidated ? lastValidated.evidence_ids : [],
      validations: v.map((x) => ({ id: x.id, revision: x.revision, fromStatus: x.from_status, toStatus: x.to_status, evidenceIds: x.evidence_ids, reason: x.reason, actor: x.actor, occurredAt: isoRequired(x.occurred_at), provenance: { sourceKind: x.source_kind, conversationId: x.conversation_id, proposalId: x.proposal_id } })),
      changeReason: r.change_reason,
      provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id },
      revisionCreatedAt: isoRequired(r.rev_created_at),
      revisionCreatedBy: r.rev_created_by,
      createdAt: isoRequired(r.created_at),
      createdBy: r.created_by,
      updatedAt: isoRequired(historical ? r.rev_created_at : r.updated_at),
      updatedBy: historical ? r.rev_created_by : r.updated_by,
    }
  })
}

export async function getAssumption(db: Queryable, projectId: string, id: string, revision?: number): Promise<AssumptionOut | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = ${revision ? '$3' : 'a.current_revision'} WHERE a.id = $1 AND a.project_id = $2`, revision ? [id, projectId, revision] : [id, projectId])
  return (await toDtos(db, rows))[0]
}

export async function requireAssumption(db: Queryable, projectId: string, id: string, revision?: number): Promise<AssumptionOut> {
  const a = await getAssumption(db, projectId, id, revision)
  if (!a) throw notFound(`Assumption ${id} not found.`)
  return a
}

export async function listAssumptions(db: Queryable, projectId: string, q: { subjectId?: string; status?: string; text?: string; statementId?: string } = {}): Promise<AssumptionOut[]> {
  const params: unknown[] = [projectId]
  const where = ['a.project_id = $1']
  if (q.status) {
    params.push(q.status.split(',').map((s) => s.trim()))
    where.push(`a.validation_status = ANY($${params.length})`)
  }
  if (q.subjectId) {
    params.push(q.subjectId)
    where.push(`(v.scope->'subjects' @> jsonb_build_array(jsonb_build_object('id', $${params.length}::text)) OR v.origin->>'conceptId' = $${params.length})`)
  }
  if (q.statementId) {
    params.push(q.statementId)
    where.push(`v.origin->>'statementId' = $${params.length}`)
  }
  if (q.text) {
    params.push(`%${q.text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)
    where.push(`(v.statement ILIKE $${params.length} OR a.key ILIKE $${params.length})`)
  }
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = a.current_revision WHERE ${where.join(' AND ')} ORDER BY lpad(regexp_replace(a.key, '\\D', '', 'g'), 12, '0'), a.id LIMIT 1000`, params)
  return toDtos(db, rows)
}

async function validate(ctx: Ctx, input: { quantity?: AssumptionOut['quantity'] | null; scope?: { subjects: AssumptionOut['scope']['subjects'] }; dependsOn?: AssumptionOut['dependsOn']; basis?: Basis }) {
  const errors: Record<string, string> = {}
  if (input.quantity) {
    const p = quantityProblem(input.quantity)
    if (p) errors.quantity = p
  }
  if (input.basis && !['user-assertion', 'ai-hypothesis', 'assumption'].includes(input.basis)) errors.basis = 'an assumption is a user assertion, an AI hypothesis or an assumption'
  if (ctx.provenance.sourceKind === 'assistant' && input.basis === 'user-assertion') errors.basis = 'the assistant may only record ai-hypothesis or assumption'
  for (const [i, d] of (input.dependsOn ?? []).entries()) {
    if ((d as { module: string }).module !== 'conceptualize') {
      const p = artifactProblem(d as never)
      if (p) errors[`dependsOn.${i}`] = p
    }
  }
  if (Object.keys(errors).length) throw invalid('The assumption is not valid.', errors)
  if (input.scope?.subjects.length) await requireRefs(ctx.db, ctx.projectId, input.scope.subjects, 'scope.subjects')
  const designDeps = (input.dependsOn ?? []).filter((d) => (d as { module: string }).module === 'conceptualize') as unknown as { type: 'concept'; id: string }[]
  if (designDeps.length) await requireRefs(ctx.db, ctx.projectId, designDeps, 'dependsOn')
}

async function insertRevision(ctx: Ctx, id: string, revision: number, c: { statement: string; quantity: unknown; scope: unknown; basis: Basis; dependsOn: unknown; origin: unknown }, reason: string) {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.assumption_revisions (assumption_id, revision, statement, quantity, scope, basis, depends_on, origin, change_reason, source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, revision, c.statement, c.quantity ? JSON.stringify(c.quantity) : null, JSON.stringify(c.scope), c.basis, JSON.stringify(c.dependsOn), c.origin ? JSON.stringify(c.origin) : null, reason, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
}

export async function createAssumption(ctx: Ctx, input: AssumptionCreateDto): Promise<AssumptionOut> {
  const basis: Basis = input.basis ?? (ctx.provenance.sourceKind === 'assistant' ? 'ai-hypothesis' : 'assumption')
  await validate(ctx, { ...input, basis })
  if (input.origin) {
    const [c] = await getConcepts(ctx.db, ctx.projectId, [input.origin.conceptId])
    if (!c?.statements.some((s) => s.id === input.origin!.statementId)) throw invalid('The origin statement is not part of the current revision of that Concept.', { origin: 'not found' })
    const { rows } = await ctx.db.query<{ key: string }>(`SELECT a.key FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id AND v.revision = 1 WHERE a.project_id = $1 AND v.origin->>'statementId' = $2`, [ctx.projectId, input.origin.statementId])
    if (rows[0]) throw conflict(`This statement already has the Assumption ${rows[0].key}.`)
  }
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.assumption, 'assumptions')
  await ctx.db.query(
    `INSERT INTO conceptualize.assumptions (id, project_id, key, current_revision, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,$4,$5,$4,$5)`,
    [id, ctx.projectId, key, ctx.now, ctx.actor],
  )
  const reason = (input.reason ?? '').trim()
  await insertRevision(ctx, id, 1, { statement: input.statement.trim(), quantity: input.quantity ?? null, scope: { subjects: input.scope?.subjects ?? [], applicability: input.scope?.applicability ?? '' }, basis, dependsOn: input.dependsOn ?? [], origin: input.origin ?? null }, reason)
  const conceptIds = (input.scope?.subjects ?? []).filter((s) => s.type === 'concept').map((s) => s.id)
  await audit(ctx, { entityType: 'assumption', entityId: id, conceptIds, action: 'created', revision: 1, reason, details: { key } })
  await emit(ctx, 'assumption.created', id, 1)
  return (await getAssumption(ctx.db, ctx.projectId, id))!
}

/**
 * Assumptions for the assumption statements of Concepts that do not have one yet (the same rule as the
 * CR-C3 migration, for data created after it, e.g. the development seed).
 */
export async function assumptionsFromStatements(ctx: Ctx, conceptIds: string[]): Promise<AssumptionOut[]> {
  const out: AssumptionOut[] = []
  for (const c of await getConcepts(ctx.db, ctx.projectId, conceptIds)) {
    for (const s of c.statements.filter((x) => x.kind === 'assumption' || x.basis === 'assumption')) {
      const { rowCount } = await ctx.db.query(`SELECT 1 FROM conceptualize.assumption_revisions WHERE origin->>'statementId' = $1`, [s.id])
      if (rowCount) continue
      out.push(await createAssumption(ctx, { statement: s.text, quantity: s.quantity, basis: ['user-assertion', 'ai-hypothesis', 'assumption'].includes(s.basis) ? (s.basis as 'assumption') : 'assumption', scope: { subjects: [{ module: 'conceptualize', type: 'concept', id: c.id }] }, origin: { conceptId: c.id, statementId: s.id }, reason: 'From the assumption statement' }))
    }
  }
  return out
}

async function lock(ctx: Ctx, id: string, expected: number): Promise<AssumptionOut> {
  if (!isUuid(id)) throw notFound(`Assumption ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.assumptions WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Assumption ${id} not found.`)
  const a = (await getAssumption(ctx.db, ctx.projectId, id))!
  if (a.revision !== expected) throw conflict(`${a.key} changed since revision ${expected} (now ${a.revision}). Reload; nothing was overwritten.`, a.revision)
  return a
}

export async function updateAssumption(ctx: Ctx, id: string, patch: AssumptionPatchDto, expected: number): Promise<AssumptionOut> {
  const a = await lock(ctx, id, expected)
  if (a.validationStatus === 'retired') throw invalid(`${a.key} is retired.`)
  const basis = patch.basis ?? a.basis
  await validate(ctx, { quantity: patch.quantity, scope: patch.scope, dependsOn: patch.dependsOn, basis: patch.basis })
  const next = { statement: (patch.statement ?? a.statement).trim(), quantity: patch.quantity !== undefined ? patch.quantity : a.quantity, scope: patch.scope ? { subjects: patch.scope.subjects, applicability: patch.scope.applicability ?? '' } : a.scope, basis, dependsOn: patch.dependsOn ?? a.dependsOn, origin: a.origin }
  const changed = (['statement', 'quantity', 'scope', 'basis', 'dependsOn'] as const).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(a[k]))
  if (!changed.length) return a
  const revision = a.revision + 1
  await insertRevision(ctx, id, revision, next, (patch.reason ?? '').trim())
  await ctx.db.query('UPDATE conceptualize.assumptions SET current_revision = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, revision, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'assumption', entityId: id, action: 'revised', revision, reason: patch.reason ?? '', details: { fields: changed } })
  await emit(ctx, 'assumption.revised', id, revision)
  return (await getAssumption(ctx.db, ctx.projectId, id))!
}

/** Explicit validation record. validated needs evidence and a person; invalidating one a recorded decision depends on needs a reviewer. */
export async function changeValidation(ctx: Ctx, id: string, status: AssumptionOut['validationStatus'], evidenceIds: string[], expected: number, reason: string): Promise<AssumptionOut> {
  const a = await lock(ctx, id, expected)
  if (a.validationStatus === status) throw invalid(`${a.key} is already ${status}.`)
  const assistant = ctx.provenance.sourceKind === 'assistant'
  if (assistant && status !== 'under-review') throw forbidden('The assistant can only propose a review of an assumption; a person validates or invalidates it.')
  if (status === 'validated' || status === 'invalidated') {
    if (!evidenceIds.length) throw invalid(`Setting ${status} needs evidence.`, { evidenceIds: 'required' })
    const { rows } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.evidence WHERE project_id = $1 AND id = ANY($2::uuid[])', [ctx.projectId, evidenceIds])
    if (rows.length !== new Set(evidenceIds).size) throw invalid('Every evidence record must exist in this project.', { evidenceIds: 'unknown' })
  }
  if (status === 'invalidated' && !roleAllows(ctx.role, 'decide')) {
    const { rowCount } = await ctx.db.query(`SELECT 1 FROM conceptualize.decisions WHERE project_id = $1 AND status = 'recorded' AND superseded_by_id IS NULL AND assumption_refs @> jsonb_build_array(jsonb_build_object('id', $2::text))`, [ctx.projectId, id])
    if (rowCount) throw forbidden(`${a.key} supports a recorded decision; invalidating it needs a reviewer or administrator.`)
  }
  await ctx.db.query('UPDATE conceptualize.assumptions SET validation_status = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, status, ctx.now, ctx.actor])
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.assumption_validations (id, assumption_id, revision, from_status, to_status, evidence_ids, reason, actor, occurred_at, source_kind, conversation_id, proposal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [randomUUID(), id, a.revision, a.validationStatus, status, evidenceIds, reason, ctx.actor, ctx.now, sourceKind, conversationId, proposalId],
  )
  await audit(ctx, { entityType: 'assumption', entityId: id, action: 'validation-changed', revision: a.revision, reason, details: { from: a.validationStatus, to: status, evidenceIds } })
  await emit(ctx, 'assumption.validation-changed', id, a.revision)
  return (await getAssumption(ctx.db, ctx.projectId, id))!
}

export async function listAssumptionRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; statement: string; change_reason: string; created_at: Date; created_by: string; source_kind: AssumptionOut['provenance']['sourceKind']; conversation_id: string | null; proposal_id: string | null }>(
    `SELECT v.revision, v.statement, v.change_reason, v.created_at, v.created_by, v.source_kind, v.conversation_id, v.proposal_id FROM conceptualize.assumption_revisions v JOIN conceptualize.assumptions a ON a.id = v.assumption_id WHERE a.id = $1 AND a.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({ revision: r.revision, name: r.statement, changeReason: r.change_reason, maturityAtCreation: '', createdAt: isoRequired(r.created_at), createdBy: r.created_by, provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id } }))
}

