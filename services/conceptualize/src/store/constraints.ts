import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { KEY_PREFIX, roleAllows, type Basis } from '../domain/rules'
import { quantityProblem } from '../domain/units'
import type { BoundDto, ConstraintCreateDto, ConstraintOut, ConstraintPatchDto, ConstraintSourceDto, DesignRefDto } from '../http/designSchemas'
import { requireConcept } from './concepts'
import { ASSISTANT_BASES, audit, emit, isUuid, isoRequired, nextKey, type Ctx, type Queryable } from './context'
import { createDesignLink } from './designLinks'
import { artifactProblem } from './implementations'
import { requireRefs } from './refs'

/**
 * Design constraints (CR-C2). A constraint either formalizes exactly one pinned requirement revision
 * (source requirement, `formalizes` link) without copying its text, or is a conceptual constraint (stated
 * or derived) that may later be proposed as a draft requirement. Subjects are `constrains` links.
 * `suspect` (pinned requirement revision superseded) is derived by clients through the Requirements
 * service in v1 (contracts §9).
 */

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  status: ConstraintOut['status']
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  kind: ConstraintOut['kind']
  statement: string
  bound: ConstraintOut['bound']
  expression: ConstraintOut['expression']
  strength: ConstraintOut['strength']
  source: ConstraintSourceDto
  basis: Basis
  origin: ConstraintOut['origin']
  change_reason: string
  source_kind: ConstraintOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  rev_created_at: Date
  rev_created_by: string
}

const SELECT = `SELECT c.id, c.project_id, c.key, c.current_revision, c.status, c.created_at, c.created_by, c.updated_at, c.updated_by,
  v.revision, v.kind, v.statement, v.bound, v.expression, v.strength, v.source, v.basis, v.origin, v.change_reason, v.source_kind,
  v.conversation_id, v.proposal_id, v.message_id, v.created_at AS rev_created_at, v.created_by AS rev_created_by
  FROM conceptualize.design_constraints c JOIN conceptualize.constraint_revisions v ON v.constraint_id = c.id`

async function subjectsOf(db: Queryable, ids: string[]): Promise<Map<string, DesignRefDto[]>> {
  const map = new Map<string, DesignRefDto[]>()
  if (!ids.length) return map
  const { rows } = await db.query<{ from_id: string; to_type: DesignRefDto['type']; to_id: string }>(
    `SELECT from_id::text, to_type, to_id FROM conceptualize.design_links WHERE type = 'constrains' AND NOT removed AND from_id = ANY($1::uuid[]) ORDER BY created_at`,
    [ids],
  )
  for (const r of rows) map.set(r.from_id, [...(map.get(r.from_id) ?? []), { module: 'conceptualize', type: r.to_type, id: r.to_id }])
  return map
}

function toDto(r: Row, subjects: DesignRefDto[]): ConstraintOut {
  const historical = r.revision !== r.current_revision
  return {
    id: r.id,
    key: r.key,
    projectId: r.project_id,
    revision: r.revision,
    kind: r.kind,
    statement: r.statement,
    bound: r.bound,
    expression: r.expression,
    strength: r.strength,
    source: r.source.kind === 'stated' ? { kind: 'stated', basis: r.basis } : r.source,
    basis: r.basis,
    origin: r.origin,
    status: r.status,
    subjects,
    changeReason: r.change_reason,
    provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id },
    revisionCreatedAt: isoRequired(r.rev_created_at),
    revisionCreatedBy: r.rev_created_by,
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(historical ? r.rev_created_at : r.updated_at),
    updatedBy: historical ? r.rev_created_by : r.updated_by,
  }
}

export async function getConstraint(db: Queryable, projectId: string, id: string, revision?: number): Promise<ConstraintOut | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = ${revision ? '$3' : 'c.current_revision'} WHERE c.id = $1 AND c.project_id = $2`, revision ? [id, projectId, revision] : [id, projectId])
  if (!rows[0]) return undefined
  return toDto(rows[0], (await subjectsOf(db, [id])).get(id) ?? [])
}

export async function requireConstraint(db: Queryable, projectId: string, id: string, revision?: number): Promise<ConstraintOut> {
  const c = await getConstraint(db, projectId, id, revision)
  if (!c) throw notFound(`Constraint ${id} not found.`)
  return c
}

export async function listConstraints(db: Queryable, projectId: string, q: { subjectId?: string; status?: string; text?: string } = {}): Promise<ConstraintOut[]> {
  const params: unknown[] = [projectId]
  const where = ['c.project_id = $1']
  if (q.status) {
    params.push(q.status.split(',').map((s) => s.trim()))
    where.push(`c.status = ANY($${params.length})`)
  }
  if (q.subjectId) {
    params.push(q.subjectId)
    where.push(`(EXISTS (SELECT 1 FROM conceptualize.design_links l WHERE l.type = 'constrains' AND NOT l.removed AND l.from_id = c.id AND l.to_id = $${params.length}) OR v.origin->>'conceptId' = $${params.length})`)
  }
  if (q.text) {
    params.push(`%${q.text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)
    where.push(`(v.statement ILIKE $${params.length} OR c.key ILIKE $${params.length})`)
  }
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = c.current_revision WHERE ${where.join(' AND ')} ORDER BY lpad(regexp_replace(c.key, '\\D', '', 'g'), 12, '0'), c.id LIMIT 1000`, params)
  const subjects = await subjectsOf(db, rows.map((r) => r.id))
  return rows.map((r) => toDto(r, subjects.get(r.id) ?? []))
}

function checkBasis(ctx: Ctx, basis: Basis) {
  if (ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(basis)) throw invalid('The assistant may only record constraints as ai-hypothesis, assumption, assessment or estimate.', { basis: 'not allowed for the assistant' })
  if (['evidence', 'decision', 'calculated'].includes(basis)) throw invalid('A constraint is stated, assumed, assessed or estimated; link evidence and decisions to it instead.', { basis: 'not allowed' })
}

function checkBound(bound: BoundDto | null | undefined) {
  if (!bound) return
  const p = quantityProblem(bound.quantity)
  if (p) throw invalid('The bound is not a valid quantity.', { 'bound.quantity': p })
  if (bound.operator === 'in-range' && (bound.quantity.min == null || bound.quantity.max == null)) throw invalid('An in-range bound needs min and max.', { 'bound.quantity': 'min and max' })
}

async function insertRevision(ctx: Ctx, id: string, revision: number, c: { kind: string; statement: string; bound: unknown; expression: unknown; strength: string; source: unknown; basis: Basis; origin: unknown }, reason: string) {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.constraint_revisions (constraint_id, revision, kind, statement, bound, expression, strength, source, basis, origin, change_reason, source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [id, revision, c.kind, c.statement, c.bound ? JSON.stringify(c.bound) : null, c.expression ? JSON.stringify(c.expression) : null, c.strength, JSON.stringify(c.source), c.basis, c.origin ? JSON.stringify(c.origin) : null, reason, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
}

export async function createConstraint(ctx: Ctx, input: ConstraintCreateDto, options: { origin?: { conceptId: string; statementId: string }; id?: string } = {}): Promise<ConstraintOut> {
  const statedBasis = input.source?.kind === 'stated' ? input.source.basis : undefined
  if (input.basis && statedBasis && input.basis !== statedBasis) throw invalid('basis and source.basis disagree.', { basis: 'differs from source.basis' })
  const basis: Basis = input.basis ?? statedBasis ?? (ctx.provenance.sourceKind === 'assistant' ? 'ai-hypothesis' : 'user-assertion')
  checkBasis(ctx, basis)
  checkBound(input.bound)
  // R1: a stated source carries the basis of the statement.
  const source: ConstraintSourceDto = !input.source || input.source.kind === 'stated' ? { kind: 'stated', basis } : input.source
  if (source.kind === 'requirement') {
    if (source.ref.module !== 'requirements' || !source.ref.revision) throw invalid('A requirement source is a requirement UUID with a pinned revision.', { 'source.ref': 'requirements module and revision' })
    const p = artifactProblem(source.ref)
    if (p) throw invalid('The requirement reference is not valid.', { 'source.ref': p })
  }
  if (source.kind === 'derived') await requireRefs(ctx.db, ctx.projectId, [{ type: source.from.type, id: source.from.id }], 'source.from')
  if (input.subjects?.length) await requireRefs(ctx.db, ctx.projectId, input.subjects, 'subjects')
  const id = (options.id ?? randomUUID())
  const key = await nextKey(ctx, KEY_PREFIX.constraint, 'design_constraints')
  await ctx.db.query(
    `INSERT INTO conceptualize.design_constraints (id, project_id, key, current_revision, status, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,$4,$5,$6,$5,$6)`,
    [id, ctx.projectId, key, input.status ?? 'proposed', ctx.now, ctx.actor],
  )
  const reason = (input.reason ?? '').trim()
  await insertRevision(ctx, id, 1, { kind: input.kind, statement: input.statement.trim(), bound: input.bound ?? null, expression: input.expression ?? null, strength: input.strength ?? 'hard', source, basis, origin: options.origin ?? null }, reason)
  await audit(ctx, { entityType: 'constraint', entityId: id, conceptIds: options.origin ? [options.origin.conceptId] : [], action: 'created', revision: 1, reason, details: { key, source: source.kind } })
  await emit(ctx, 'constraint.created', id, 1)
  const me = { module: 'conceptualize' as const, type: 'constraint' as const, id }
  if (source.kind === 'requirement') await createDesignLink(ctx, { type: 'formalizes', from: me, to: source.ref, basis: basis === 'ai-hypothesis' ? 'ai-hypothesis' : 'user-assertion', note: input.statement.slice(0, 200) })
  if (source.kind === 'derived') await createDesignLink(ctx, { type: 'derived-from', from: me, to: source.from })
  for (const s of input.subjects ?? []) await createDesignLink(ctx, { type: 'constrains', from: me, to: s, basis: basis === 'ai-hypothesis' ? 'ai-hypothesis' : 'user-assertion' })
  return (await getConstraint(ctx.db, ctx.projectId, id))!
}

async function lock(ctx: Ctx, id: string, expected: number): Promise<ConstraintOut> {
  if (!isUuid(id)) throw notFound(`Constraint ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.design_constraints WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Constraint ${id} not found.`)
  const c = (await getConstraint(ctx.db, ctx.projectId, id))!
  if (c.revision !== expected) throw conflict(`${c.key} changed since revision ${expected} (now ${c.revision}). Reload; nothing was overwritten.`, c.revision)
  return c
}

/** reviseConstraint (R1-1): content changes make a new revision; a status in the same body is applied after them with the same rules as changeConstraintStatus. */
export async function updateConstraint(ctx: Ctx, id: string, patch: ConstraintPatchDto, expected: number): Promise<ConstraintOut> {
  const { status, ...content } = patch
  if (status !== undefined && !Object.keys(content).some((k) => k !== 'expectedRevision' && k !== 'reason' && (content as Record<string, unknown>)[k] !== undefined)) {
    if (!patch.reason?.trim()) throw invalid('A status change needs a reason.', { reason: 'required' })
    return changeConstraintStatus(ctx, id, status, expected, patch.reason)
  }
  if (!roleAllows(ctx.role, 'author')) throw forbidden('Editing a constraint needs an editor or administrator.')
  const revised = await reviseContent(ctx, id, content, expected)
  if (status === undefined || status === revised.status) return revised
  if (!patch.reason?.trim()) throw invalid('A status change needs a reason.', { reason: 'required' })
  return changeConstraintStatus(ctx, id, status, revised.revision, patch.reason)
}

async function reviseContent(ctx: Ctx, id: string, patch: Omit<ConstraintPatchDto, 'status'>, expected: number): Promise<ConstraintOut> {
  const c = await lock(ctx, id, expected)
  if (c.status === 'retired') throw invalid(`${c.key} is retired.`)
  const basis = patch.basis ?? c.basis
  checkBasis(ctx, basis)
  const bound = patch.bound !== undefined ? patch.bound : c.bound
  checkBound(bound)
  const next = { kind: patch.kind ?? c.kind, statement: (patch.statement ?? c.statement).trim(), bound, expression: patch.expression !== undefined ? patch.expression : c.expression, strength: patch.strength ?? c.strength, source: c.source, basis, origin: c.origin }
  const changed = (['kind', 'statement', 'bound', 'expression', 'strength', 'basis'] as const).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(c[k]))
  if (!changed.length) return c
  const revision = c.revision + 1
  await insertRevision(ctx, id, revision, next, (patch.reason ?? '').trim())
  await ctx.db.query('UPDATE conceptualize.design_constraints SET current_revision = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, revision, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'constraint', entityId: id, action: 'revised', revision, reason: patch.reason ?? '', details: { fields: changed } })
  await emit(ctx, 'constraint.revised', id, revision)
  return (await getConstraint(ctx.db, ctx.projectId, id))!
}

/** Status changes: relaxing or retiring a hard constraint that formalizes a requirement needs a reviewer. */
export async function changeConstraintStatus(ctx: Ctx, id: string, status: ConstraintOut['status'], expected: number, reason: string): Promise<ConstraintOut> {
  const c = await lock(ctx, id, expected)
  if (!['proposed', 'active', 'relaxed', 'retired'].includes(status)) throw invalid('Unknown constraint status.', { status: 'proposed, active, relaxed, retired' })
  if (c.status === status) throw invalid(`${c.key} is already ${status}.`)
  if ((status === 'relaxed' || status === 'retired') && c.strength === 'hard' && c.source.kind === 'requirement' && !roleAllows(ctx.role, 'decide')) throw forbidden(`${c.key} formalizes a requirement; relaxing or retiring it needs a reviewer or administrator.`)
  if (ctx.provenance.sourceKind === 'assistant' && status !== 'proposed') throw forbidden('The assistant can propose constraints; a person activates, relaxes or retires them.')
  await ctx.db.query('UPDATE conceptualize.design_constraints SET status = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, status, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'constraint', entityId: id, action: 'status-changed', revision: c.revision, reason, details: { from: c.status, to: status } })
  await emit(ctx, 'constraint.status-changed', id, c.revision)
  return (await getConstraint(ctx.db, ctx.projectId, id))!
}

/**
 * User-invoked promotion of a constraint statement with a quantity (CR-C2 migration operation). The
 * statement stays unchanged; the Constraint references it as its origin and constrains the Concept.
 */
export async function promoteStatement(ctx: Ctx, conceptId: string, input: { statementId: string; kind?: ConstraintOut['kind']; strength?: ConstraintOut['strength']; operator?: BoundDto['operator']; reason?: string }): Promise<ConstraintOut> {
  const concept = await requireConcept(ctx.db, ctx.projectId, conceptId)
  const s = concept.statements.find((x) => x.id === input.statementId)
  if (!s) throw invalid('The statement is not part of the current revision of this Concept.', { statementId: 'not found' })
  if (s.kind !== 'constraint' || !s.quantity) throw invalid('Only constraint statements with a quantity can be promoted.', { statementId: `kind ${s.kind}${s.quantity ? '' : ', no quantity'}` })
  const { rows } = await ctx.db.query<{ key: string }>(`SELECT c.key FROM conceptualize.design_constraints c JOIN conceptualize.constraint_revisions v ON v.constraint_id = c.id AND v.revision = 1 WHERE c.project_id = $1 AND v.origin->>'statementId' = $2`, [ctx.projectId, s.id])
  if (rows[0]) throw conflict(`This statement was already promoted to ${rows[0].key}.`)
  const q = s.quantity
  const operator = input.operator ?? (q.min != null && q.max != null ? 'in-range' : q.max != null ? '<=' : q.min != null ? '>=' : '=')
  const quantity = { value: q.value ?? null, unit: q.unit, min: q.min ?? null, max: q.max ?? null }
  const basis: Basis = ['evidence', 'decision', 'calculated'].includes(s.basis) ? 'user-assertion' : s.basis
  return createConstraint(
    ctx,
    {
      kind: input.kind ?? 'dimensional',
      statement: s.text,
      bound: { operator, quantity },
      strength: input.strength ?? 'hard',
      basis: ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(basis) ? 'ai-hypothesis' : basis,
      source: { kind: 'derived', from: { module: 'conceptualize', type: 'concept', id: concept.id, revision: concept.revision } },
      subjects: [{ module: 'conceptualize', type: 'concept', id: concept.id }],
      reason: input.reason ?? `Promoted from ${concept.key} rev ${concept.revision}`,
    },
    { origin: { conceptId: concept.id, statementId: s.id } },
  )
}

export async function listConstraintRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; statement: string; change_reason: string; created_at: Date; created_by: string; source_kind: ConstraintOut['provenance']['sourceKind']; conversation_id: string | null; proposal_id: string | null }>(
    `SELECT v.revision, v.statement, v.change_reason, v.created_at, v.created_by, v.source_kind, v.conversation_id, v.proposal_id FROM conceptualize.constraint_revisions v JOIN conceptualize.design_constraints c ON c.id = v.constraint_id WHERE c.id = $1 AND c.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({ revision: r.revision, name: r.statement, changeReason: r.change_reason, maturityAtCreation: '', createdAt: isoRequired(r.created_at), createdBy: r.created_by, provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id } }))
}
