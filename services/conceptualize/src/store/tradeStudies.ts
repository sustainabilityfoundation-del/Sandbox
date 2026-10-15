import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { KEY_PREFIX } from '../domain/rules'
import { evaluateStudy } from '../domain/tradeStudy'
import { convert, parseUnit, quantityProblem } from '../domain/units'
import type { CriterionInputDto, ScoreInputDto, TradeStudyCreateDto, TradeStudyDto, TradeStudyPatchDto } from '../http/schemas'
import { requireSet } from './alternatives'
import { ASSISTANT_BASES, audit, emit, isUuid, isoRequired, nextKey, prov, type Ctx, type Queryable } from './context'

interface StudyRow {
  id: string
  key: string
  title: string
  description: string
  set_id: string | null
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}
interface CriterionRow {
  id: string
  study_id: string
  name: string
  category: TradeStudyDto['criteria'][number]['category']
  description: string
  weight: number
  direction: 'maximize' | 'minimize'
  scale: 'quantity' | 'qualitative'
  unit: string | null
  ordinal: number
  removed: boolean
}
interface ScoreRow {
  study_id: string
  criterion_id: string
  concept_id: string
  study_revision: number
  value: number | null
  low: number | null
  high: number | null
  qualitative: number | null
  cleared: boolean
  basis: TradeStudyDto['scores'][number]['basis']
  rationale: string
  evidence_id: string | null
  entered_unit: string | null
  created_at: Date
  created_by: string
  source_kind: TradeStudyDto['scores'][number]['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
}

export const DEFAULT_CRITERIA: CriterionInputDto[] = [
  { name: 'Performance', category: 'performance', weight: 1, direction: 'maximize', scale: 'qualitative' },
  { name: 'Mass', category: 'mass', weight: 1, direction: 'maximize', scale: 'qualitative', description: 'Qualitative: 5 = lightest' },
  { name: 'Cost', category: 'cost', weight: 1, direction: 'maximize', scale: 'qualitative', description: 'Qualitative: 5 = cheapest' },
  { name: 'Complexity', category: 'complexity', weight: 1, direction: 'maximize', scale: 'qualitative', description: 'Qualitative: 5 = simplest' },
  { name: 'Manufacturability', category: 'manufacturability', weight: 1, direction: 'maximize', scale: 'qualitative' },
  { name: 'Risk', category: 'risk', weight: 1, direction: 'maximize', scale: 'qualitative', description: 'Qualitative: 5 = lowest risk' },
]

export async function getStudy(db: Queryable, projectId: string, id: string): Promise<TradeStudyDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<StudyRow>('SELECT * FROM conceptualize.trade_studies WHERE id = $1 AND project_id = $2', [id, projectId])
  const s = rows[0]
  if (!s) return undefined
  const criteria = (await db.query<CriterionRow>('SELECT * FROM conceptualize.trade_criteria WHERE study_id = $1 AND NOT removed ORDER BY ordinal, name', [id])).rows
  const options = (await db.query<{ concept_id: string }>('SELECT concept_id FROM conceptualize.trade_options WHERE study_id = $1 AND NOT removed ORDER BY ordinal', [id])).rows.map((r) => r.concept_id)
  const scoreRows = (
    await db.query<ScoreRow>(
      `SELECT DISTINCT ON (criterion_id, concept_id) * FROM conceptualize.trade_scores WHERE study_id = $1 ORDER BY criterion_id, concept_id, study_revision DESC`,
      [id],
    )
  ).rows.filter((r) => !r.cleared && criteria.some((c) => c.id === r.criterion_id) && options.includes(r.concept_id))
  const scores = scoreRows.map((r) => ({
    criterionId: r.criterion_id,
    conceptId: r.concept_id,
    value: r.value,
    low: r.low,
    high: r.high,
    qualitative: r.qualitative,
    basis: r.basis,
    rationale: r.rationale,
    evidenceId: r.evidence_id,
    enteredUnit: r.entered_unit,
    studyRevision: r.study_revision,
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id },
  }))
  const crit = criteria.map((c) => ({ id: c.id, name: c.name, category: c.category, description: c.description, weight: c.weight, direction: c.direction, scale: c.scale, unit: c.unit }))
  const result = evaluateStudy(crit, options, scores)
  return {
    id: s.id,
    key: s.key,
    title: s.title,
    description: s.description,
    setId: s.set_id,
    revision: s.revision,
    criteria: crit,
    options,
    scores,
    result: { ...result, options: result.options.map((o) => ({ ...o, bases: o.bases as Record<string, number> })) },
    createdAt: isoRequired(s.created_at),
    createdBy: s.created_by,
    updatedAt: isoRequired(s.updated_at),
    updatedBy: s.updated_by,
  }
}

export async function requireStudy(db: Queryable, projectId: string, id: string): Promise<TradeStudyDto> {
  const s = await getStudy(db, projectId, id)
  if (!s) throw notFound(`Trade study ${id} not found.`)
  return s
}

export async function listStudies(db: Queryable, projectId: string, filter: { setId?: string; conceptId?: string } = {}): Promise<TradeStudyDto[]> {
  const params: unknown[] = [projectId]
  let where = 'project_id = $1'
  if (filter.setId) {
    if (!isUuid(filter.setId)) throw invalid('setId must be a UUID.', { setId: 'uuid' }, 400)
    params.push(filter.setId)
    where += ` AND set_id = $${params.length}`
  }
  if (filter.conceptId) {
    if (!isUuid(filter.conceptId)) throw invalid('conceptId must be a UUID.', { conceptId: 'uuid' }, 400)
    params.push(filter.conceptId)
    where += ` AND (id IN (SELECT study_id FROM conceptualize.trade_options WHERE concept_id = $${params.length} AND NOT removed) OR set_id IN (SELECT id FROM conceptualize.alternative_sets WHERE parent_id = $${params.length}))`
  }
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM conceptualize.trade_studies WHERE ${where} ORDER BY created_at`, params)
  const out: TradeStudyDto[] = []
  for (const r of rows) out.push((await getStudy(db, projectId, r.id))!)
  return out
}

function validateCriterion(c: CriterionInputDto, path: string): Record<string, string> {
  const errors: Record<string, string> = {}
  if (c.scale === 'quantity') {
    if (!c.unit) errors[`${path}.unit`] = 'quantity criteria need a unit'
    else {
      try {
        parseUnit(c.unit)
      } catch (e) {
        errors[`${path}.unit`] = (e as Error).message
      }
    }
  } else if (c.unit) errors[`${path}.unit`] = 'qualitative criteria have no unit'
  return errors
}

async function insertCriteria(ctx: Ctx, studyId: string, criteria: CriterionInputDto[], startOrdinal: number): Promise<string[]> {
  const errors: Record<string, string> = {}
  criteria.forEach((c, i) => Object.assign(errors, validateCriterion(c, `criteria.${i}`)))
  if (Object.keys(errors).length) throw invalid('Some criteria are not valid.', errors)
  const ids: string[] = []
  for (const [i, c] of criteria.entries()) {
    const id = randomUUID()
    ids.push(id)
    await ctx.db.query(
      `INSERT INTO conceptualize.trade_criteria (id, study_id, name, category, description, weight, direction, scale, unit, ordinal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, studyId, c.name.trim(), c.category, (c.description ?? '').trim(), c.weight, c.direction, c.scale, c.scale === 'quantity' ? c.unit : null, startOrdinal + i],
    )
  }
  return ids
}

async function insertOptions(ctx: Ctx, studyId: string, conceptIds: string[], startOrdinal: number) {
  const { rows } = await ctx.db.query<{ id: string }>('SELECT id FROM conceptualize.concepts WHERE project_id = $1 AND id = ANY($2::uuid[])', [ctx.projectId, conceptIds])
  if (rows.length !== new Set(conceptIds).size) throw invalid('Every option must be a Concept of this project.', { conceptIds: 'unknown Concept' })
  for (const [i, c] of conceptIds.entries()) {
    await ctx.db.query(
      `INSERT INTO conceptualize.trade_options (study_id, concept_id, ordinal) VALUES ($1,$2,$3) ON CONFLICT (study_id, concept_id) DO UPDATE SET removed = false`,
      [studyId, c, startOrdinal + i],
    )
  }
}

export async function createStudy(ctx: Ctx, input: TradeStudyCreateDto): Promise<TradeStudyDto> {
  let options = input.conceptIds ?? []
  if (input.setId) {
    const set = await requireSet(ctx.db, ctx.projectId, input.setId).catch(() => {
      throw invalid('The alternative set does not exist.', { setId: 'not found' })
    })
    if (!input.conceptIds) options = set.members.filter((m) => m.status !== 'withdrawn').map((m) => m.conceptId)
  }
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.study, 'trade_studies')
  await ctx.db.query(
    `INSERT INTO conceptualize.trade_studies (id, project_id, key, title, description, set_id, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8)`,
    [id, ctx.projectId, key, input.title.trim(), (input.description ?? '').trim(), input.setId ?? null, ctx.now, ctx.actor],
  )
  await insertCriteria(ctx, id, [...(input.useDefaultCriteria ? DEFAULT_CRITERIA : []), ...(input.criteria ?? [])], 0)
  await insertOptions(ctx, id, options, 0)
  await audit(ctx, { entityType: 'trade-study', entityId: id, conceptIds: options, action: 'created', revision: 1, details: { key, title: input.title } })
  await emit(ctx, 'concept.revised', id, 1)
  return (await getStudy(ctx.db, ctx.projectId, id))!
}

async function lockStudy(ctx: Ctx, id: string, expected: number): Promise<TradeStudyDto> {
  if (!isUuid(id)) throw notFound(`Trade study ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.trade_studies WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Trade study ${id} not found.`)
  const s = (await getStudy(ctx.db, ctx.projectId, id))!
  if (s.revision !== expected) throw conflict(`${s.key} changed since revision ${expected} (now ${s.revision}). Reload; nothing was overwritten.`, s.revision)
  return s
}

async function bump(ctx: Ctx, id: string): Promise<number> {
  const { rows } = await ctx.db.query<{ revision: number }>('UPDATE conceptualize.trade_studies SET revision = revision + 1, updated_at = $2, updated_by = $3 WHERE id = $1 RETURNING revision', [id, ctx.now, ctx.actor])
  return rows[0].revision
}

export async function updateStudy(ctx: Ctx, id: string, patch: TradeStudyPatchDto, expected: number): Promise<TradeStudyDto> {
  const s = await lockStudy(ctx, id, expected)
  if (patch.title !== undefined || patch.description !== undefined) {
    await ctx.db.query('UPDATE conceptualize.trade_studies SET title = $2, description = $3 WHERE id = $1', [id, patch.title?.trim() ?? s.title, patch.description?.trim() ?? s.description])
  }
  if (patch.addCriteria?.length) await insertCriteria(ctx, id, patch.addCriteria, s.criteria.length)
  for (const u of patch.updateCriteria ?? []) {
    const c = s.criteria.find((x) => x.id === u.id)
    if (!c) throw invalid('Unknown criterion.', { updateCriteria: u.id })
    await ctx.db.query('UPDATE conceptualize.trade_criteria SET name = $2, description = $3, weight = $4, direction = $5 WHERE id = $1', [u.id, u.name?.trim() ?? c.name, u.description?.trim() ?? c.description, u.weight ?? c.weight, u.direction ?? c.direction])
  }
  for (const r of patch.removeCriteria ?? []) {
    if (!s.criteria.some((c) => c.id === r)) throw invalid('Unknown criterion.', { removeCriteria: r })
    await ctx.db.query('UPDATE conceptualize.trade_criteria SET removed = true WHERE id = $1', [r])
  }
  if (patch.addOptions?.length) await insertOptions(ctx, id, patch.addOptions, s.options.length)
  for (const r of patch.removeOptions ?? []) await ctx.db.query('UPDATE conceptualize.trade_options SET removed = true WHERE study_id = $1 AND concept_id = $2', [id, r])
  const revision = await bump(ctx, id)
  await audit(ctx, { entityType: 'trade-study', entityId: id, conceptIds: [...s.options, ...(patch.addOptions ?? [])], action: 'updated', revision, details: { fields: Object.keys(patch).filter((k) => k !== 'expectedRevision') } })
  await emit(ctx, 'concept.revised', id, revision)
  return (await getStudy(ctx.db, ctx.projectId, id))!
}

/**
 * Records scores (append-only rows at the new study revision). Quantity scores are converted to the
 * criterion unit with a dimension check; qualitative scores are 1–5. Assistant scores may only be
 * ai-hypothesis, assumption or estimate; evidence scores need a verified evidence record.
 */
export async function putScores(ctx: Ctx, id: string, scores: ScoreInputDto[], expected: number): Promise<TradeStudyDto> {
  const s = await lockStudy(ctx, id, expected)
  const revision = s.revision + 1
  const errors: Record<string, string> = {}
  const rows: unknown[][] = []
  const [sourceKind, conversationId, proposalId] = prov(ctx)
  for (const [i, sc] of scores.entries()) {
    const path = `scores.${i}`
    const c = s.criteria.find((x) => x.id === sc.criterionId)
    if (!c) {
      errors[`${path}.criterionId`] = 'not a criterion of this study'
      continue
    }
    if (!s.options.includes(sc.conceptId)) {
      errors[`${path}.conceptId`] = 'not an option of this study'
      continue
    }
    if (ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(sc.basis)) errors[`${path}.basis`] = 'the assistant may only score as ai-hypothesis, assumption or estimate'
    if (sc.basis === 'calculated') {
      const ok = ctx.provenance.sourceKind !== 'assistant' && sc.evidenceId && (await ctx.db.query(`SELECT 1 FROM conceptualize.evidence WHERE id = $1 AND basis IN ('calculated', 'evidence')`, [sc.evidenceId])).rowCount
      if (!ok) errors[`${path}.evidenceId`] = 'basis calculated needs a calculated evidence record (and cannot come from the assistant until CR-C8)'
    }
    if (sc.basis === 'evidence') {
      const ok = sc.evidenceId && (await ctx.db.query(`SELECT 1 FROM conceptualize.evidence WHERE id = $1 AND basis = 'evidence' AND concept_id = $2`, [sc.evidenceId, sc.conceptId])).rowCount
      if (!ok) errors[`${path}.evidenceId`] = 'basis evidence needs a verified evidence record of this option'
    }
    let value = sc.value ?? null
    let low = sc.low ?? null
    let high = sc.high ?? null
    let qualitative = sc.qualitative ?? null
    if (!sc.clear) {
      if (c.scale === 'qualitative') {
        if (qualitative == null) errors[`${path}.qualitative`] = 'qualitative criteria need a score from 1 to 5'
        if (value != null || low != null || high != null) errors[`${path}.value`] = 'qualitative criteria take only a 1–5 score'
      } else {
        if (qualitative != null) errors[`${path}.qualitative`] = `quantity criteria take a value in ${c.unit}`
        const unit = sc.unit ?? c.unit!
        const problem = quantityProblem({ value, unit, min: low, max: high }, c.unit!)
        if (problem) errors[`${path}.value`] = problem
        else if (unit !== c.unit) {
          const conv = (v: number | null) => (v == null ? null : convert(v, unit, c.unit!))
          value = conv(value)
          low = conv(low)
          high = conv(high)
        }
      }
    } else {
      value = low = high = qualitative = null
    }
    rows.push([id, sc.criterionId, sc.conceptId, revision, value, low, high, qualitative, !!sc.clear, sc.basis, (sc.rationale ?? '').trim(), sc.evidenceId ?? null, c.scale === 'quantity' ? (sc.unit ?? c.unit) : null, ctx.now, ctx.actor, sourceKind, conversationId, proposalId])
  }
  if (Object.keys(errors).length) throw invalid('Some scores are not valid.', errors)
  const keys = new Set<string>()
  for (const r of rows) {
    const k = `${r[1]}|${r[2]}`
    if (keys.has(k)) throw invalid('Each criterion and option may be scored once per request.', { scores: 'duplicate' })
    keys.add(k)
    await ctx.db.query(
      `INSERT INTO conceptualize.trade_scores (study_id, criterion_id, concept_id, study_revision, value, low, high, qualitative, cleared, basis, rationale, evidence_id, entered_unit, created_at, created_by, source_kind, conversation_id, proposal_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      r,
    )
  }
  await bump(ctx, id)
  await audit(ctx, { entityType: 'trade-study', entityId: id, conceptIds: [...new Set(scores.map((x) => x.conceptId))], action: 'scored', revision, details: { scores: scores.length } })
  await emit(ctx, 'concept.revised', id, revision)
  return (await getStudy(ctx.db, ctx.projectId, id))!
}
