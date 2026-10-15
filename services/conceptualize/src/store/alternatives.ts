import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { GATED_MATURITIES, KEY_PREFIX, roleAllows } from '../domain/rules'
import type { AlternativeSetDto, DecisionCreateDto, DecisionDto } from '../http/schemas'
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
 * Creates a design decision. Proposed decisions may be created by editors (and by the assistant);
 * recording accepted or rejected outcomes is the approval gate (reviewer or administrator, never the
 * assistant). Deferred-only decisions may be recorded by editors.
 */
export async function createDecision(ctx: Ctx, input: DecisionCreateDto): Promise<DecisionDto> {
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
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.decision, 'decisions')
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.decisions (id, project_id, key, title, question, rationale, subject_id, set_id, trade_study_id, outcomes, status, supersedes_id, proposed_by, proposed_at, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'proposed',$11,$12,$13,$14,$15,$16)`,
    [id, ctx.projectId, key, input.title.trim(), (input.question ?? '').trim(), input.rationale.trim(), input.subjectId ?? null, input.setId ?? null, input.tradeStudyId ?? null, JSON.stringify(input.outcomes.map((o) => ({ conceptId: o.conceptId, outcome: o.outcome, rationale: (o.rationale ?? '').trim() }))), input.supersedesId ?? null, ctx.actor, ctx.now, sourceKind, conversationId, proposalId],
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
    await ctx.db.query('UPDATE conceptualize.decisions SET superseded_by_id = $2, record_version = record_version + 1 WHERE id = $1', [d.supersedesId, id])
    await audit(ctx, { entityType: 'decision', entityId: d.supersedesId, action: 'superseded', details: { by: id } })
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
