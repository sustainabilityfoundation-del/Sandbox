import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { GATED_MATURITIES, KEY_PREFIX, roleAllows } from '../domain/rules'
import type { AlternativeSetDto } from '../http/schemas'
import type { DecisionCreateVDto as DecisionCreateDto, DecisionVDto as DecisionDto, DesignRefDto } from '../http/designSchemas'
import { getConcepts, setMaturity } from './concepts'
import { audit, emit, isUuid, iso, isoRequired, nextKey, prov, type Ctx, type Queryable } from './context'

// ---- alternative sets -------------------------------------------------------------------------------------

interface SetRow {
  id: string
  key: string
  parent_id: string
  name: string
  question: string
  record_version: number
  created_at: Date
  created_by: string
  updated_at: Date
}
interface MemberRow {
  set_id: string
  concept_id: string
  status: AlternativeSetDto['members'][number]['status']
  decision_id: string | null
  added_at: Date
  added_by: string
}

async function toSets(db: Queryable, rows: SetRow[]): Promise<AlternativeSetDto[]> {
  if (!rows.length) return []
  const { rows: members } = await db.query<MemberRow>('SELECT * FROM conceptualize.alternative_members WHERE set_id = ANY($1::uuid[]) ORDER BY ordinal, added_at', [rows.map((r) => r.id)])
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    parentId: r.parent_id,
    name: r.name,
    question: r.question,
    members: members.filter((m) => m.set_id === r.id).map((m) => ({ conceptId: m.concept_id, status: m.status, decisionId: m.decision_id, addedAt: isoRequired(m.added_at), addedBy: m.added_by })),
    recordVersion: r.record_version,
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
  }))
}

export async function getSet(db: Queryable, projectId: string, id: string): Promise<AlternativeSetDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<SetRow>('SELECT * FROM conceptualize.alternative_sets WHERE id = $1 AND project_id = $2', [id, projectId])
  return (await toSets(db, rows))[0]
}

export async function requireSet(db: Queryable, projectId: string, id: string): Promise<AlternativeSetDto> {
  const s = await getSet(db, projectId, id)
  if (!s) throw notFound(`Alternative set ${id} not found.`)
  return s
}

export async function listSets(db: Queryable, projectId: string, filter: { conceptId?: string } = {}): Promise<AlternativeSetDto[]> {
  if (filter.conceptId && !isUuid(filter.conceptId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
  const { rows } = await db.query<SetRow>(
    filter.conceptId
      ? `SELECT s.* FROM conceptualize.alternative_sets s WHERE s.project_id = $1 AND (s.parent_id = $2 OR EXISTS (SELECT 1 FROM conceptualize.alternative_members m WHERE m.set_id = s.id AND m.concept_id = $2)) ORDER BY s.created_at`
      : 'SELECT * FROM conceptualize.alternative_sets WHERE project_id = $1 ORDER BY created_at',
    filter.conceptId ? [projectId, filter.conceptId] : [projectId],
  )
  return toSets(db, rows)
}

export async function createSet(ctx: Ctx, input: { parentId: string; name: string; question?: string; memberIds?: string[] }): Promise<AlternativeSetDto> {
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.concepts WHERE id = $1 AND project_id = $2', [input.parentId, ctx.projectId])
  if (!rowCount) throw invalid('The parent Concept does not exist.', { parentId: 'not found' })
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.set, 'alternative_sets')
  await ctx.db.query(
    `INSERT INTO conceptualize.alternative_sets (id, project_id, key, parent_id, name, question, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8)`,
    [id, ctx.projectId, key, input.parentId, input.name.trim(), (input.question ?? '').trim(), ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'alternative-set', entityId: id, conceptIds: [input.parentId], action: 'created', details: { key, name: input.name } })
  for (const m of input.memberIds ?? []) await addMember(ctx, id, m, { silent: true })
  await emit(ctx, 'concept.relationships-changed', input.parentId, 1)
  return (await getSet(ctx.db, ctx.projectId, id))!
}

export async function addMember(ctx: Ctx, setId: string, conceptId: string, options: { silent?: boolean } = {}): Promise<AlternativeSetDto> {
  const set = await requireSet(ctx.db, ctx.projectId, setId)
  if (conceptId === set.parentId) throw invalid('The parent Concept cannot be one of its own alternatives.', { conceptId: 'is the parent' })
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.concepts WHERE id = $1 AND project_id = $2', [conceptId, ctx.projectId])
  if (!rowCount) throw invalid('The Concept does not exist.', { conceptId: 'not found' })
  if (set.members.some((m) => m.conceptId === conceptId)) throw conflict('The Concept is already an alternative in this set.')
  await ctx.db.query('INSERT INTO conceptualize.alternative_members (set_id, concept_id, added_at, added_by, ordinal) VALUES ($1,$2,$3,$4,$5)', [setId, conceptId, ctx.now, ctx.actor, set.members.length])
  await ctx.db.query('UPDATE conceptualize.alternative_sets SET record_version = record_version + 1, updated_at = $2, updated_by = $3 WHERE id = $1', [setId, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'alternative-set', entityId: setId, conceptIds: [set.parentId, conceptId], action: 'member-added', details: { conceptId } })
  if (!options.silent) await emit(ctx, 'concept.relationships-changed', conceptId, 1)
  return (await getSet(ctx.db, ctx.projectId, setId))!
}

/** A candidate may be withdrawn from a set (it stays a Concept); decided members change only through decisions. */
export async function withdrawMember(ctx: Ctx, setId: string, conceptId: string, reason = ''): Promise<AlternativeSetDto> {
  const set = await requireSet(ctx.db, ctx.projectId, setId)
  const m = set.members.find((x) => x.conceptId === conceptId)
  if (!m) throw notFound('The Concept is not an alternative in this set.')
  if (m.status !== 'candidate') throw conflict(`The alternative is ${m.status} by a recorded decision; record a superseding decision instead.`)
  await ctx.db.query(`UPDATE conceptualize.alternative_members SET status = 'withdrawn' WHERE set_id = $1 AND concept_id = $2`, [setId, conceptId])
  await ctx.db.query('UPDATE conceptualize.alternative_sets SET record_version = record_version + 1, updated_at = $2, updated_by = $3 WHERE id = $1', [setId, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'alternative-set', entityId: setId, conceptIds: [set.parentId, conceptId], action: 'member-withdrawn', reason })
  await emit(ctx, 'concept.relationships-changed', conceptId, 1)
  return (await getSet(ctx.db, ctx.projectId, setId))!
}

// ---- decisions ---------------------------------------------------------------------------------------------

interface DecisionRow {
  id: string
  key: string
  title: string
  question: string
  rationale: string
  subject_id: string | null
  set_id: string | null
  trade_study_id: string | null
  outcomes: DecisionDto['outcomes']
  status: DecisionDto['status']
  supersedes_id: string | null
  superseded_by_id: string | null
  proposed_by: string
  proposed_at: Date
  recorded_by: string | null
  recorded_at: Date | null
  record_version: number
  source_kind: DecisionDto['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  support: DecisionDto['support']
  assumption_refs: DecisionDto['assumptionIds']
  constraint_refs: DecisionDto['constraintIds']
  affected: DecisionDto['affected']
  invalidation_conditions: DecisionDto['invalidationConditions']
  validity: DecisionDto['validity']
  review_flags: DecisionDto['reviewFlags']
}
type FlagRecord = DecisionDto['reviewFlags'][number]
/** Flags written before R1 used flaggedBy/flaggedAt, impactReportRef and cleared.reason. */
function normalizeFlag(raw: unknown): FlagRecord {
  const f = raw as Record<string, unknown> & { cleared?: Record<string, string> }
  const cleared = f.cleared ? { at: String(f.cleared.at), by: String(f.cleared.by), note: String(f.cleared.note ?? f.cleared.reason ?? ''), ...(f.cleared.outcome ? { outcome: String(f.cleared.outcome) } : {}) } : undefined
  return {
    at: String(f.at ?? f.flaggedAt),
    by: String(f.by ?? f.flaggedBy),
    reason: String(f.reason ?? ''),
    ...(f.impactReportId ? { impactReportId: String(f.impactReportId) } : {}),
    ...(f.conditionId ? { conditionId: String(f.conditionId) } : {}),
    ...(f.sourceKind ? { sourceKind: String(f.sourceKind) } : {}),
    ...(cleared ? { cleared } : {}),
  }
}
/** R1-7: validity is derived from the stored invalidation, supersession by a recorded decision and uncleared flags. */
function deriveValidity(r: DecisionRow): DecisionDto['validity'] {
  if (r.validity === 'invalidated' || (r.status === 'recorded' && r.superseded_by_id)) return 'invalidated'
  if ((r.review_flags ?? []).some((f) => !(f as { cleared?: unknown }).cleared)) return 'under-review'
  return 'valid'
}

const toDecision = (r: DecisionRow): DecisionDto => ({
  id: r.id,
  key: r.key,
  title: r.title,
  question: r.question,
  rationale: r.rationale,
  subjectId: r.subject_id,
  setId: r.set_id,
  tradeStudyId: r.trade_study_id,
  outcomes: r.outcomes,
  status: r.status,
  supersedesId: r.supersedes_id,
  supersededById: r.superseded_by_id,
  proposedBy: r.proposed_by,
  proposedAt: isoRequired(r.proposed_at),
  recordedBy: r.recorded_by,
  recordedAt: iso(r.recorded_at),
  recordVersion: r.record_version,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
  support: r.support,
  assumptionIds: r.assumption_refs,
  constraintIds: r.constraint_refs,
  affected: r.affected,
  invalidationConditions: r.invalidation_conditions,
  validity: deriveValidity(r),
  reviewFlags: (r.review_flags ?? []).map(normalizeFlag),
})

export async function getDecision(db: Queryable, projectId: string, id: string): Promise<DecisionDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<DecisionRow>('SELECT * FROM conceptualize.decisions WHERE id = $1 AND project_id = $2', [id, projectId])
  return rows[0] ? toDecision(rows[0]) : undefined
}

export async function listDecisions(db: Queryable, projectId: string, filter: { conceptId?: string; setId?: string } = {}): Promise<DecisionDto[]> {
  const params: unknown[] = [projectId]
  const where = ['project_id = $1']
  if (filter.setId) {
    if (!isUuid(filter.setId)) throw invalid('setId must be a UUID.', { setId: 'uuid' }, 400)
    params.push(filter.setId)
    where.push(`set_id = $${params.length}`)
  }
  if (filter.conceptId) {
    if (!isUuid(filter.conceptId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
    params.push(filter.conceptId)
    where.push(`(subject_id = $${params.length} OR outcomes @> jsonb_build_array(jsonb_build_object('conceptId', $${params.length}::text)) OR set_id IN (SELECT set_id FROM conceptualize.alternative_members WHERE concept_id = $${params.length}) OR set_id IN (SELECT id FROM conceptualize.alternative_sets WHERE parent_id = $${params.length}))`)
  }
  const { rows } = await db.query<DecisionRow>(`SELECT * FROM conceptualize.decisions WHERE ${where.join(' AND ')} ORDER BY proposed_at DESC, id`, params)
  return rows.map(toDecision)
}

const needsDecide = (outcomes: DecisionDto['outcomes']) => outcomes.some((o) => o.outcome === 'accepted' || o.outcome === 'rejected')

/**
 * Creates a design decision. Editors (and the assistant) propose; recording accepted or rejected
 * outcomes is the approval gate (recordDecision: reviewer or administrator, never the assistant).
 * Deferred-only decisions may be recorded by editors through recordDecision; record: true is
 * administrator-only.
 */
export async function createDecision(ctx: Ctx, input: DecisionCreateDto): Promise<DecisionDto> {
  // R1-3 (agreed 15 Oct 2026): reviewers do not author; creating and recording in one step would bypass
  // the two-person gate, so record: true is for administrators only.
  if (!roleAllows(ctx.role, 'author')) throw forbidden('Reviewers do not author decisions: propose as an editor, then record.')
  if (input.record && ctx.role !== 'administrator') throw forbidden('Creating and recording a decision in one step needs an administrator: propose as an editor, then record (two-person gate).')
  if (!input.subjectId && !input.setId) throw invalid('A decision is about a Concept (subjectId) or an alternative set (setId).', { subjectId: 'or setId required' })
  const ids = [...new Set(input.outcomes.map((o) => o.conceptId))]
  if (ids.length !== input.outcomes.length) throw invalid('Each Concept may appear once in the outcomes.', { outcomes: 'duplicate Concept' })
  const concepts = await getConcepts(ctx.db, ctx.projectId, ids)
  if (concepts.length !== ids.length) throw invalid('Every outcome must name a Concept of this project.', { outcomes: 'unknown Concept' })
  if (input.setId) {
    const set = await requireSet(ctx.db, ctx.projectId, input.setId).catch(() => {
      throw invalid('The alternative set does not exist.', { setId: 'not found' })
    })
    const members = new Set(set.members.map((m) => m.conceptId))
    if (ids.some((id) => !members.has(id))) throw invalid('Outcomes of a set decision must name alternatives of that set.', { outcomes: 'not a member' })
  }
  if (input.subjectId && !(await getConcepts(ctx.db, ctx.projectId, [input.subjectId])).length) throw invalid('The subject Concept does not exist.', { subjectId: 'not found' })
  if (input.tradeStudyId) {
    const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.trade_studies WHERE id = $1 AND project_id = $2', [input.tradeStudyId, ctx.projectId])
    if (!rowCount) throw invalid('The trade study does not exist.', { tradeStudyId: 'not found' })
  }
  if (input.supersedesId) {
    const old = await getDecision(ctx.db, ctx.projectId, input.supersedesId)
    if (!old) throw invalid('The superseded decision does not exist.', { supersedesId: 'not found' })
    if (old.status !== 'recorded') throw invalid('Only a recorded decision can be superseded.', { supersedesId: old.status })
    if (old.supersededById) throw conflict(`${old.key} is already superseded.`)
  }
  const ext = await validateExtensions(ctx, input)
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.decision, 'decisions')
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.decisions (id, project_id, key, title, question, rationale, subject_id, set_id, trade_study_id, outcomes, status, supersedes_id, proposed_by, proposed_at, source_kind, conversation_id, proposal_id, support, assumption_refs, constraint_refs, affected, invalidation_conditions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'proposed',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [id, ctx.projectId, key, input.title.trim(), (input.question ?? '').trim(), input.rationale.trim(), input.subjectId ?? null, input.setId ?? null, input.tradeStudyId ?? null, JSON.stringify(input.outcomes.map((o) => ({ conceptId: o.conceptId, outcome: o.outcome, rationale: (o.rationale ?? '').trim() }))), input.supersedesId ?? null, ctx.actor, ctx.now, sourceKind, conversationId, proposalId, JSON.stringify(ext.support), JSON.stringify(ext.assumptionIds), JSON.stringify(ext.constraintIds), JSON.stringify(ext.affected), JSON.stringify(ext.invalidationConditions)],
  )
  await audit(ctx, { entityType: 'decision', entityId: id, conceptIds: [...ids, ...(input.subjectId ? [input.subjectId] : [])], action: 'proposed', details: { key, outcomes: input.outcomes } })
  if (input.record) return recordDecision(ctx, id, 1)
  await emit(ctx, 'concept.decision-recorded', id, 1)
  return (await getDecision(ctx.db, ctx.projectId, id))!
}

async function lockDecision(ctx: Ctx, id: string, expected: number): Promise<DecisionDto> {
  if (!isUuid(id)) throw notFound(`Decision ${id} not found.`)
  const { rows } = await ctx.db.query<DecisionRow>('SELECT * FROM conceptualize.decisions WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rows[0]) throw notFound(`Decision ${id} not found.`)
  const d = toDecision(rows[0])
  if (d.recordVersion !== expected) throw conflict(`${d.key} changed since version ${expected} (now ${d.recordVersion}).`, d.recordVersion)
  return d
}

/**
 * Records a proposed decision: applies the outcomes to the alternative set members and the Concepts'
 * maturity (accepted → selected, rejected → archived only if not selected or later), supersedes the
 * previous decision, and keeps the old records unchanged.
 */
export async function recordDecision(ctx: Ctx, id: string, expected: number, reason = ''): Promise<DecisionDto> {
  const d = await lockDecision(ctx, id, expected)
  if (d.status !== 'proposed') throw conflict(`${d.key} is ${d.status}; only proposed decisions can be recorded.`)
  if (ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant can propose decisions but not record them; a person records them.')
  if (needsDecide(d.outcomes) && !roleAllows(ctx.role, 'decide')) throw forbidden('Recording accepted or rejected outcomes is an approval gate: it needs a reviewer or administrator.')
  if (d.supersedesId) {
    const old = await getDecision(ctx.db, ctx.projectId, d.supersedesId)
    if (old?.supersededById) throw conflict(`${old.key} is already superseded.`)
    // R1-7: superseding by a recorded decision invalidates the old one (its record is otherwise unchanged).
    await ctx.db.query("UPDATE conceptualize.decisions SET superseded_by_id = $2, validity = CASE WHEN status = 'recorded' THEN 'invalidated' ELSE validity END, record_version = record_version + 1 WHERE id = $1", [d.supersedesId, id])
    await audit(ctx, { entityType: 'decision', entityId: d.supersedesId, action: 'superseded', details: { by: id } })
    if (old?.status === 'recorded') await emit(ctx, 'decision.invalidated', d.supersedesId, (old.recordVersion ?? 0) + 1)
  }
  await ctx.db.query(`UPDATE conceptualize.decisions SET status = 'recorded', recorded_by = $2, recorded_at = $3, record_version = record_version + 1 WHERE id = $1`, [id, ctx.actor, ctx.now])
  const concepts = await getConcepts(ctx.db, ctx.projectId, d.outcomes.map((o) => o.conceptId))
  for (const o of d.outcomes) {
    if (d.setId) {
      const status = o.outcome === 'accepted' ? 'selected' : o.outcome
      await ctx.db.query('UPDATE conceptualize.alternative_members SET status = $3, decision_id = $4 WHERE set_id = $1 AND concept_id = $2', [d.setId, o.conceptId, status, id])
    }
    const c = concepts.find((x) => x.id === o.conceptId)!
    const note = `${d.key}: ${o.outcome}${o.rationale ? ` (${o.rationale})` : ''}`
    if (o.outcome === 'accepted' && !['selected', ...GATED_MATURITIES].includes(c.maturity)) await setMaturity(ctx, c, 'selected', note)
    // Rejected alternatives are kept (brief §5.9): the set records the rejection. A previously selected
    // Concept that a superseding decision rejects or defers returns to evaluated.
    else if (o.outcome !== 'accepted' && c.maturity === 'selected') await setMaturity(ctx, c, 'evaluated', note)
  }
  if (d.setId) await ctx.db.query('UPDATE conceptualize.alternative_sets SET record_version = record_version + 1, updated_at = $2, updated_by = $3 WHERE id = $1', [d.setId, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'decision', entityId: id, conceptIds: d.outcomes.map((o) => o.conceptId), action: 'recorded', reason, details: { key: d.key, outcomes: d.outcomes } })
  await emit(ctx, 'concept.decision-recorded', id, d.recordVersion + 1)
  return (await getDecision(ctx.db, ctx.projectId, id))!
}

export async function withdrawDecision(ctx: Ctx, id: string, expected: number, reason = ''): Promise<DecisionDto> {
  const d = await lockDecision(ctx, id, expected)
  if (d.status !== 'proposed') throw conflict(`${d.key} is ${d.status}; only proposed decisions can be withdrawn. Supersede recorded decisions with a new one.`)
  await ctx.db.query(`UPDATE conceptualize.decisions SET status = 'withdrawn', record_version = record_version + 1 WHERE id = $1`, [id])
  await audit(ctx, { entityType: 'decision', entityId: id, conceptIds: d.outcomes.map((o) => o.conceptId), action: 'withdrawn', reason })
  await emit(ctx, 'concept.decision-recorded', id, d.recordVersion + 1)
  return (await getDecision(ctx.db, ctx.projectId, id))!
}

// ---- decision extensions (CR-C5) --------------------------------------------------------------------------------

/** Validates support, assumptions, constraints (pinned to their current revision when not given), affected refs and invalidation conditions. */
async function validateExtensions(ctx: Ctx, input: DecisionCreateDto) {
  const { requireRefs, describeRefs } = await import('./refs')
  const { artifactProblem } = await import('./implementations')
  const support = input.support ?? []
  if (support.length) {
    if (support.some((x) => x.ref.type !== 'evidence')) throw invalid('Support references evidence records.', { support: 'evidence refs only' })
    await requireRefs(ctx.db, ctx.projectId, support.map((x) => x.ref), 'support')
  }
  const pin = async (raw: { id: string; type?: string; revision?: number }[], type: 'assumption' | 'constraint', field: string) => {
    if (raw.some((x) => x.type !== undefined && x.type !== type)) throw invalid(`${field} references ${type} records.`, { [field]: `${type} refs only` })
    const found = await requireRefs(ctx.db, ctx.projectId, raw.map((x) => ({ type, id: x.id })), field)
    return raw.map((x, i) => {
      const current = found.find((f) => f.ref.id === x.id)!.revision ?? 1
      if (x.revision !== undefined && x.revision > current) throw invalid(`${field}: revision ${x.revision} of ${type} ${x.id} does not exist (current ${current}).`, { [`${field}.${i}.revision`]: 'not a revision' })
      return { module: 'conceptualize' as const, type, id: x.id, revision: x.revision ?? current }
    })
  }
  const assumptionIds = await pin(input.assumptionIds ?? [], 'assumption', 'assumptionIds')
  const constraintIds = await pin(input.constraintIds ?? [], 'constraint', 'constraintIds')
  const affected = input.affected ?? []
  for (const [i, a] of affected.entries()) {
    if ((a as { module: string }).module === 'conceptualize') await requireRefs(ctx.db, ctx.projectId, [a as DesignRefDto], `affected.${i}`)
    else {
      const p = artifactProblem(a as never)
      if (p) throw invalid('An affected artifact reference is not valid.', { [`affected.${i}`]: p })
    }
  }
  const invalidationConditions = (input.invalidationConditions ?? []).map((c, i) => ({ ...c, id: c.id ?? `IC-${i + 1}` }))
  for (const [i, c] of invalidationConditions.entries()) {
    if ((c.subject as { module: string }).module === 'conceptualize') await requireRefs(ctx.db, ctx.projectId, [c.subject as DesignRefDto], `invalidationConditions.${i}.subject`)
    if (c.kind === 'relation-violated' && !c.relation) throw invalid('A relation-violated condition names the model relation.', { [`invalidationConditions.${i}.relation`]: 'required' })
  }
  void describeRefs
  return { support, assumptionIds, constraintIds, affected, invalidationConditions }
}

/**
 * Flags a recorded decision for review (validity under-review) with a reason and an optional impact report;
 * the decision record itself is not edited. Authors (or the assistant through an applied proposal) may flag.
 */
export async function flagDecision(ctx: Ctx, id: string, input: { reason: string; impactReportId?: string; impactReportRef?: unknown; conditionId?: string }): Promise<DecisionDto> {
  if (!roleAllows(ctx.role, 'author') && !roleAllows(ctx.role, 'decide')) throw forbidden('Flagging a decision needs an editor, reviewer or administrator.')
  if (!input.reason?.trim()) throw invalid('A review flag needs a reason.', { reason: 'required' })
  if (!isUuid(id)) throw notFound(`Decision ${id} not found.`)
  const { rows } = await ctx.db.query<DecisionRow>('SELECT * FROM conceptualize.decisions WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rows[0]) throw notFound(`Decision ${id} not found.`)
  const d = toDecision(rows[0])
  if (d.status !== 'recorded') throw conflict(`${d.key} is ${d.status}; only recorded decisions are flagged for review.`)
  if (d.validity === 'invalidated') throw conflict(`${d.key} is already invalidated.`)
  if (input.conditionId && !d.invalidationConditions.some((c) => c.id === input.conditionId)) throw invalid('Unknown invalidation condition.', { conditionId: 'not a condition of this decision' })
  const flag = { at: ctx.now.toISOString(), by: ctx.actor, reason: input.reason.trim(), ...(input.impactReportId ? { impactReportId: input.impactReportId } : {}), ...(input.impactReportRef ? { impactReportRef: input.impactReportRef } : {}), ...(input.conditionId ? { conditionId: input.conditionId } : {}), sourceKind: ctx.provenance.sourceKind }
  await ctx.db.query(`UPDATE conceptualize.decisions SET validity = 'under-review', review_flags = review_flags || $2::jsonb, record_version = record_version + 1 WHERE id = $1`, [id, JSON.stringify([flag])])
  await audit(ctx, { entityType: 'decision', entityId: id, conceptIds: d.outcomes.map((o) => o.conceptId), action: 'review-flagged', reason: input.reason, details: flag })
  await emit(ctx, 'decision.review-flagged', id, d.recordVersion + 1)
  return (await getDecision(ctx.db, ctx.projectId, id))!
}

/** Reviewer clears a review flag (valid) or records the decision as invalidated (a person's action, ADR-0046). */
export async function changeValidity(ctx: Ctx, id: string, validity: 'valid' | 'invalidated', expected: number, reason: string, invalidatedBy?: unknown): Promise<DecisionDto> {
  if (!roleAllows(ctx.role, 'decide')) throw forbidden('Clearing a review flag or recording invalidation needs a reviewer or administrator.')
  if (ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot change the validity of a decision.')
  const d = await lockDecision(ctx, id, expected)
  if (d.status !== 'recorded') throw conflict(`${d.key} is ${d.status}.`)
  if (d.validity === validity) throw invalid(`${d.key} is already ${validity}.`)
  if (d.validity === 'invalidated') throw conflict(`${d.key} is invalidated; record a superseding decision instead.`)
  const cleared = { by: ctx.actor, at: ctx.now.toISOString(), outcome: validity, note: reason }
  const flags = d.reviewFlags.map((f) => ((f as { cleared?: unknown }).cleared ? f : { ...f, cleared }))
  await ctx.db.query('UPDATE conceptualize.decisions SET validity = $2, review_flags = $3, record_version = record_version + 1 WHERE id = $1', [id, validity, JSON.stringify(flags)])
  await audit(ctx, { entityType: 'decision', entityId: id, conceptIds: d.outcomes.map((o) => o.conceptId), action: validity === 'invalidated' ? 'invalidated' : 'review-cleared', reason, details: { invalidatedBy: invalidatedBy ?? null } })
  if (validity === 'invalidated') await emit(ctx, 'decision.invalidated', id, d.recordVersion + 1)
  else await emit(ctx, 'concept.decision-recorded', id, d.recordVersion + 1)
  return (await getDecision(ctx.db, ctx.projectId, id))!
}

/** Deterministic rationale: the decision with alternatives, support, assumptions, constraints, study and validity. */
export async function decisionRationale(db: Queryable, projectId: string, id: string) {
  const d = await getDecision(db, projectId, id)
  if (!d) throw notFound(`Decision ${id} not found.`)
  const { describeRefs } = await import('./refs')
  const set = d.setId ? await getSet(db, projectId, d.setId) : undefined
  const altIds = [...new Set([...(set?.members.map((m) => m.conceptId) ?? []), ...d.outcomes.map((o) => o.conceptId)])]
  const concepts = await getConcepts(db, projectId, altIds)
  const alternatives = altIds.map((cid) => {
    const c = concepts.find((x) => x.id === cid)
    const o = d.outcomes.find((x) => x.conceptId === cid)
    return { ref: { module: 'conceptualize' as const, type: 'concept' as const, id: cid }, key: c?.key ?? '', name: c?.name ?? '', outcome: o?.outcome ?? null, outcomeRationale: o?.rationale ?? '', memberStatus: set?.members.find((m) => m.conceptId === cid)?.status ?? null }
  })
  const ev = d.support.length ? (await db.query<{ id: string; key: string; title: string; basis: string; outcome: string | null; qualifications: { checks: unknown[]; limits: unknown } | null; calculation: { manifest: unknown } | null }>(`SELECT e.id::text, e.key, e.title, e.basis, e.qualifications, e.calculation, (SELECT r.outcome FROM conceptualize.evidence_reviews r WHERE r.evidence_id = e.id ORDER BY r.reviewed_at DESC LIMIT 1) AS outcome FROM conceptualize.evidence e WHERE e.id = ANY($1::uuid[])`, [d.support.map((x) => x.ref.id)])).rows : []
  const { qualifyManifest } = await import('@ews/engineering-calc')
  const support = d.support.map((x) => {
    const e = ev.find((r) => r.id === x.ref.id)
    const q = e?.qualifications ?? (e?.calculation ? (qualifyManifest(e.calculation.manifest as never) as unknown as { checks: unknown[]; limits: unknown }) : null)
    return { ref: x.ref, key: e?.key ?? '', title: e?.title ?? '', role: x.role, basis: e?.basis ?? '', validationStatus: e?.outcome ?? 'unreviewed', ...(q ? { checks: q.checks, limits: q.limits } : {}) }
  })
  const infos = await describeRefs(db, projectId, [...d.assumptionIds, ...d.constraintIds])
  const { rows: texts } = await db.query<{ id: string; text: string }>(
    `SELECT a.id::text, v.statement AS text FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id AND v.revision = a.current_revision WHERE a.id = ANY($1::uuid[])
     UNION ALL SELECT c.id::text, v.statement FROM conceptualize.design_constraints c JOIN conceptualize.constraint_revisions v ON v.constraint_id = c.id AND v.revision = c.current_revision WHERE c.id = ANY($1::uuid[])`,
    [[...d.assumptionIds, ...d.constraintIds].map((x) => x.id)],
  )
  const stale: string[] = []
  const pinned = (x: DesignRefDto) => {
    const info = infos.find((i) => i.ref.id === x.id)
    if (info && x.revision && info.revision !== x.revision) stale.push(`${info.key} pinned at revision ${x.revision}, now ${info.revision}`)
    return { ref: x, key: info?.key ?? '', statement: texts.find((t) => t.id === x.id)?.text ?? '', pinnedRevision: x.revision ?? null, currentRevision: info?.revision ?? 0, status: info?.status ?? '' }
  }
  const assumptions = d.assumptionIds.map((x) => { const p = pinned(x); return { ref: p.ref, key: p.key, statement: p.statement, pinnedRevision: p.pinnedRevision, currentRevision: p.currentRevision, validationStatus: p.status } })
  const constraints = d.constraintIds.map(pinned)
  let tradeStudy = null
  if (d.tradeStudyId) {
    const { getStudy } = await import('./tradeStudies')
    const t = await getStudy(db, projectId, d.tradeStudyId)
    if (t) tradeStudy = { ref: { module: 'conceptualize' as const, type: 'trade-study' as const, id: t.id }, key: t.key, title: t.title, ranking: t.result.ranking, preliminary: t.result.preliminary }
  }
  const keyOf = async (did: string | null) => (did ? ((await getDecision(db, projectId, did))?.key ?? did) : null)
  return {
    decision: d,
    question: d.question,
    alternatives,
    support,
    assumptions,
    constraints,
    tradeStudy,
    invalidationConditions: d.invalidationConditions,
    validity: d.validity,
    reviewFlags: d.reviewFlags,
    supersedes: await keyOf(d.supersedesId),
    supersededBy: await keyOf(d.supersededById),
    stale,
  }
}
