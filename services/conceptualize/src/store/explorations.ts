import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { GATED_MATURITIES } from '../domain/rules'
import type { ExplorationCreateDto, ExplorationDto } from '../http/schemas'
import { addMember, createSet, getSet, withdrawMember } from './alternatives'
import { createConcept, getConcept, requireConcept, setMaturity } from './concepts'
import { audit, emit, isUuid, iso, isoRequired, prov, type Ctx, type Queryable } from './context'
import { createEvidence } from './implementations'
import { createDecomposition, createRelationship, getRelationship, removeRelationship } from './relationships'
import { createStudy, putScores } from './tradeStudies'

interface ExplorationRow {
  id: string
  objective: string
  parent_id: string
  set_id: string | null
  trade_study_id: string | null
  created_ids: ExplorationDto['created']
  generator: string
  undone: boolean
  undone_at: Date | null
  undone_by: string | null
  created_at: Date
  created_by: string
  source_kind: ExplorationDto['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}
const toExploration = (r: ExplorationRow): ExplorationDto => ({
  id: r.id,
  objective: r.objective,
  parentId: r.parent_id,
  setId: r.set_id,
  tradeStudyId: r.trade_study_id,
  created: r.created_ids,
  generator: r.generator,
  undone: r.undone,
  undoneAt: iso(r.undone_at),
  undoneBy: r.undone_by,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
})

export async function getExploration(db: Queryable, projectId: string, id: string): Promise<ExplorationDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<ExplorationRow>('SELECT * FROM conceptualize.explorations WHERE id = $1 AND project_id = $2', [id, projectId])
  return rows[0] ? toExploration(rows[0]) : undefined
}

export async function listExplorations(db: Queryable, projectId: string, conceptId?: string): Promise<ExplorationDto[]> {
  const { rows } = await db.query<ExplorationRow>(
    `SELECT * FROM conceptualize.explorations WHERE project_id = $1 ${conceptId ? `AND (parent_id = $2 OR created_ids->'concepts' @> jsonb_build_array(jsonb_build_object('id', $2::text)))` : ''} ORDER BY created_at DESC`,
    conceptId ? [projectId, conceptId] : [projectId],
  )
  return rows.map(toExploration)
}

/**
 * Creates an exploration atomically: the parent Concept (or uses an existing one), an alternative set,
 * one Concept per alternative with its functional decomposition, interfaces between the parts,
 * preliminary evidence records and an optional trade study with scores. Used by the assistant (one
 * service proposal) and by the UI. Every record carries the request's provenance.
 */
export async function createExploration(ctx: Ctx, input: ExplorationCreateDto): Promise<ExplorationDto> {
  if (!input.parentId && !input.parent) throw invalid('Give an existing parent Concept (parentId) or a new one (parent).', { parentId: 'or parent required' })
  if (input.parentId && input.parent) throw invalid('Give either parentId or parent, not both.', { parent: 'with parentId' })
  const created: ExplorationDto['created'] = { concepts: [], relationships: [], evidence: [] }
  const parent = input.parentId
    ? await requireConcept(ctx.db, ctx.projectId, input.parentId).catch(() => {
        throw invalid('The parent Concept does not exist.', { parentId: 'not found' })
      })
    : await createConcept(ctx, { ...input.parent!, maturity: 'exploring', reason: `Exploration: ${input.objective.slice(0, 200)}` })
  if (!input.parentId) created.concepts.push({ id: parent.id, key: parent.key, name: parent.name, role: 'parent' })
  const set = await createSet(ctx, { parentId: parent.id, name: input.setName ?? `Alternatives for ${parent.name}`, question: input.question ?? input.objective })
  const altIds: string[] = []
  for (const [i, alt] of input.alternatives.entries()) {
    const { children, interfaces, evidence, ...seed } = alt
    const concept = await createConcept(ctx, { ...seed, maturity: 'exploring', reason: `Alternative ${i + 1} of exploration` })
    altIds.push(concept.id)
    created.concepts.push({ id: concept.id, key: concept.key, name: concept.name, role: 'alternative' })
    await addMember(ctx, set.id, concept.id, { silent: true })
    const childIds: string[] = []
    if (children?.length) {
      const decomposition = await createDecomposition(ctx, { parentId: concept.id, name: 'Functional decomposition', description: `Proposed with alternative ${concept.key}` })
      for (const child of children) {
        const c = await createConcept(ctx, { ...child, abstraction: child.abstraction ?? 'function', maturity: 'idea' })
        childIds.push(c.id)
        created.concepts.push({ id: c.id, key: c.key, name: c.name, role: 'child' })
        const rel = await createRelationship(ctx, { type: 'contains', fromId: concept.id, toId: c.id, decompositionId: decomposition.id })
        created.relationships.push(rel.id)
      }
    }
    for (const [k, itf] of (interfaces ?? []).entries()) {
      const end = (n: number) => (n === -1 ? concept.id : childIds[n])
      const from = end(itf.from)
      const to = end(itf.to)
      if (!from || !to) throw invalid('An interface refers to a child that does not exist.', { [`alternatives.${i}.interfaces.${k}`]: 'unknown child index' })
      const rel = await createRelationship(ctx, { type: 'interfaces-with', fromId: from, toId: to, interface: itf.definition })
      created.relationships.push(rel.id)
    }
    for (const e of evidence ?? []) {
      const rec = await createEvidence(ctx, { ...e, conceptId: concept.id })
      created.evidence.push(rec.id)
    }
  }
  let tradeStudyId: string | null = null
  if (input.tradeStudy) {
    const study = await createStudy(ctx, { title: input.tradeStudy.title, setId: set.id, conceptIds: altIds, criteria: input.tradeStudy.criteria })
    tradeStudyId = study.id
    const scores = (input.tradeStudy.scores ?? []).map((s, i) => {
      const criterion = study.criteria[s.criterion]
      const conceptId = altIds[s.alternative]
      if (!criterion || !conceptId) throw invalid('A trade-study score refers to an unknown criterion or alternative.', { [`tradeStudy.scores.${i}`]: 'index out of range' })
      return { criterionId: criterion.id, conceptId, value: s.value, low: s.low, high: s.high, unit: s.unit, qualitative: s.qualitative, basis: s.basis, rationale: s.rationale }
    })
    if (scores.length) await putScores(ctx, study.id, scores, study.revision)
  }
  const id = randomUUID()
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  await ctx.db.query(
    `INSERT INTO conceptualize.explorations (id, project_id, objective, parent_id, set_id, trade_study_id, created_ids, generator, created_at, created_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, ctx.projectId, input.objective.trim(), parent.id, set.id, tradeStudyId, JSON.stringify(created), (input.generator ?? '').trim(), ctx.now, ctx.actor, sourceKind, conversationId, proposalId],
  )
  await audit(ctx, { entityType: 'exploration', entityId: id, conceptIds: [parent.id, ...created.concepts.map((c) => c.id)], action: 'created', details: { objective: input.objective, alternatives: altIds.length, generator: input.generator ?? '' } })
  await emit(ctx, 'concept.relationships-changed', parent.id, parent.revision)
  return (await getExploration(ctx.db, ctx.projectId, id))!
}

/**
 * Compensating undo of an exploration: archives the Concepts it created (new maturity events; no
 * revision or record is deleted), removes its relationships and withdraws its alternatives. Refused
 * when any created Concept has since passed an approval gate or a decision recorded on its set.
 */
export async function undoExploration(ctx: Ctx, id: string, reason = ''): Promise<ExplorationDto> {
  const { rows } = await ctx.db.query<ExplorationRow>('SELECT * FROM conceptualize.explorations WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  const e = rows[0]
  if (!e) throw notFound(`Exploration ${id} not found.`)
  if (e.undone) throw conflict('The exploration was already undone.')
  const note = reason || `Undo of exploration ${id}${ctx.provenance.proposalId ? ` (proposal ${ctx.provenance.proposalId})` : ''}`
  if (e.set_id) {
    const { rowCount } = await ctx.db.query(`SELECT 1 FROM conceptualize.decisions WHERE set_id = $1 AND status = 'recorded'`, [e.set_id])
    if (rowCount) throw conflict('A decision has been recorded on these alternatives; supersede the decision instead of undoing the exploration.')
  }
  const concepts = []
  for (const c of e.created_ids.concepts) {
    const concept = await getConcept(ctx.db, ctx.projectId, c.id)
    if (!concept) continue
    if (GATED_MATURITIES.includes(concept.maturity)) throw conflict(`${concept.key} is ${concept.maturity} since the exploration; it cannot be undone automatically.`)
    concepts.push(concept)
  }
  for (const rid of e.created_ids.relationships) {
    const rel = await getRelationship(ctx.db, ctx.projectId, rid)
    if (rel && !rel.removed) await removeRelationship(ctx, rid, rel.revision, note)
  }
  if (e.set_id) {
    const set = await getSet(ctx.db, ctx.projectId, e.set_id)
    for (const m of set?.members ?? []) if (m.status === 'candidate') await withdrawMember(ctx, e.set_id, m.conceptId, note)
  }
  for (const c of concepts) if (c.maturity !== 'archived') await setMaturity(ctx, c, 'archived', note)
  await ctx.db.query('UPDATE conceptualize.explorations SET undone = true, undone_at = $2, undone_by = $3 WHERE id = $1', [id, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'exploration', entityId: id, conceptIds: e.created_ids.concepts.map((c) => c.id), action: 'undone', reason: note })
  return (await getExploration(ctx.db, ctx.projectId, id))!
}
