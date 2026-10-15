import { randomUUID } from 'node:crypto'
import type { ConceptMaturity } from '@ews/platform-sdk'
import { conflict, forbidden, invalid, notFound } from '../errors'
import {
  ABSTRACTIONS,
  BASES,
  GATED_MATURITIES,
  KEY_PREFIX,
  MATURITIES,
  STATEFUL_KINDS,
  maturityProblem,
  roleAllows,
  type Basis,
  type StatementKind,
  type VerificationStatus,
} from '../domain/rules'
import { quantityProblem } from '../domain/units'
import type { AttributeDto, ConceptCreateDto, ConceptDto, ConceptListItemDto, ConceptListQueryDto, ConceptPatchDto, StatementDto, StatementInputDto } from '../http/schemas'
import { ASSISTANT_BASES, audit, emit, isUuid, isoRequired, nextKey, type Ctx, type Queryable } from './context'

/** Content fields of a revision; changing any of them creates a new immutable revision. */
export const CONTENT_FIELDS = ['name', 'summary', 'description', 'purpose', 'abstraction', 'classifications', 'attributes', 'statements'] as const

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  maturity: ConceptMaturity
  verification_status: VerificationStatus
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  name: string
  summary: string
  description: string
  purpose: string
  abstraction: ConceptDto['abstraction']
  classifications: string[]
  attributes: Record<string, AttributeDto>
  maturity_at_creation: ConceptMaturity
  change_reason: string
  source_kind: ConceptDto['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  rev_created_at: Date
  rev_created_by: string
  implementation_status: ConceptDto['implementationStatus']
}

interface StatementRow {
  concept_id: string
  revision: number
  statement_id: string
  kind: StatementKind
  text: string
  basis: Basis
  quantity: StatementDto['quantity']
  state: 'open' | 'resolved' | null
  evidence_id: string | null
  decision_id: string | null
  confirmed_by: string | null
  confirmed_at: Date | null
  source: string
}

/** Implementation status derived from active implementations: the most advanced; retired only when all are. */
export const IMPLEMENTATION_STATUS_SQL = `COALESCE((
  SELECT CASE
    WHEN bool_or(i.status = 'implemented') THEN 'implemented'
    WHEN bool_or(i.status = 'in-development') THEN 'in-development'
    WHEN bool_or(i.status = 'candidate') THEN 'candidate'
    ELSE 'retired' END
  FROM conceptualize.implementation_concepts ic JOIN conceptualize.implementations i ON i.id = ic.implementation_id
  WHERE ic.concept_id = c.id AND NOT ic.removed), 'none')`

const SELECT = `
  SELECT c.id, c.project_id, c.key, c.current_revision, c.maturity, c.verification_status, c.created_at, c.created_by, c.updated_at, c.updated_by,
         v.revision, v.name, v.summary, v.description, v.purpose, v.abstraction, v.classifications, v.attributes, v.maturity_at_creation,
         v.change_reason, v.source_kind, v.conversation_id, v.proposal_id, v.message_id, v.created_at AS rev_created_at, v.created_by AS rev_created_by,
         ${IMPLEMENTATION_STATUS_SQL} AS implementation_status`

const toStatement = (s: StatementRow): StatementDto => ({
  id: s.statement_id,
  kind: s.kind,
  text: s.text,
  basis: s.basis,
  quantity: s.quantity,
  state: s.state,
  evidenceId: s.evidence_id,
  decisionId: s.decision_id,
  confirmedBy: s.confirmed_by,
  confirmedAt: s.confirmed_at ? isoRequired(s.confirmed_at) : null,
  source: s.source,
})

function toDto(row: Row, statements: StatementRow[]): ConceptDto {
  const historical = row.revision !== row.current_revision
  return {
    id: row.id,
    key: row.key,
    projectId: row.project_id,
    revision: row.revision,
    name: row.name,
    summary: row.summary,
    description: row.description,
    purpose: row.purpose,
    abstraction: row.abstraction,
    classifications: row.classifications,
    attributes: row.attributes,
    statements: statements.map(toStatement),
    maturity: historical ? row.maturity_at_creation : row.maturity,
    verificationStatus: row.verification_status,
    implementationStatus: row.implementation_status,
    changeReason: row.change_reason,
    provenance: { sourceKind: row.source_kind, conversationId: row.conversation_id, proposalId: row.proposal_id, messageId: row.message_id },
    revisionCreatedAt: isoRequired(row.rev_created_at),
    revisionCreatedBy: row.rev_created_by,
    createdAt: isoRequired(row.created_at),
    createdBy: row.created_by,
    updatedAt: isoRequired(historical ? row.rev_created_at : row.updated_at),
    updatedBy: historical ? row.rev_created_by : row.updated_by,
  }
}

async function statementsOf(db: Queryable, pairs: { id: string; revision: number }[]): Promise<Map<string, StatementRow[]>> {
  const map = new Map<string, StatementRow[]>()
  if (!pairs.length) return map
  const { rows } = await db.query<StatementRow>(
    `SELECT s.* FROM conceptualize.concept_statements s JOIN unnest($1::uuid[], $2::int[]) AS p(id, rev) ON s.concept_id = p.id AND s.revision = p.rev ORDER BY s.concept_id, s.ordinal`,
    [pairs.map((p) => p.id), pairs.map((p) => p.revision)],
  )
  for (const r of rows) map.set(`${r.concept_id}|${r.revision}`, [...(map.get(`${r.concept_id}|${r.revision}`) ?? []), r])
  return map
}

export async function getConcept(db: Queryable, projectId: string, id: string, revision?: number): Promise<ConceptDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(
    `${SELECT} FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = ${revision ? '$3' : 'c.current_revision'}
     WHERE c.id = $1 AND c.project_id = $2`,
    revision ? [id, projectId, revision] : [id, projectId],
  )
  const row = rows[0]
  if (!row) return undefined
  const st = await statementsOf(db, [{ id: row.id, revision: row.revision }])
  return toDto(row, st.get(`${row.id}|${row.revision}`) ?? [])
}

export async function requireConcept(db: Queryable, projectId: string, id: string, revision?: number): Promise<ConceptDto> {
  const c = await getConcept(db, projectId, id, revision)
  if (!c) throw notFound(revision ? `Concept ${id} has no revision ${revision}.` : `Concept ${id} not found.`)
  return c
}

/** Several Concepts at their current revision (missing IDs are skipped). */
export async function getConcepts(db: Queryable, projectId: string, ids: string[]): Promise<ConceptDto[]> {
  const valid = ids.filter(isUuid)
  if (!valid.length) return []
  const { rows } = await db.query<Row>(
    `${SELECT} FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision
     WHERE c.project_id = $1 AND c.id = ANY($2::uuid[])`,
    [projectId, valid],
  )
  const st = await statementsOf(db, rows.map((r) => ({ id: r.id, revision: r.revision })))
  return rows.map((r) => toDto(r, st.get(`${r.id}|${r.revision}`) ?? []))
}

// ---- list -------------------------------------------------------------------------------------------------

const csv = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])

export function prefixQuery(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu)
  if (!words?.length) return null
  return words.slice(0, 12).map((w) => `${w}:*`).join(' & ')
}

const encodeCursor = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
function decodeCursor(s: string): { h: string; k: string; id: string } {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (typeof c.h !== 'string' || typeof c.k !== 'string' || typeof c.id !== 'string') throw new Error()
    return c
  } catch {
    throw invalid('The cursor is not valid.', { cursor: 'malformed' }, 400)
  }
}

const LIST_SELECT = `
  SELECT c.id, c.key, c.project_id, c.current_revision AS revision, v.name, v.summary, v.abstraction, v.classifications, c.maturity,
         c.verification_status, ${IMPLEMENTATION_STATUS_SQL} AS implementation_status, v.source_kind, c.updated_at,
         (SELECT count(*)::int FROM conceptualize.concept_statements s WHERE s.concept_id = c.id AND s.revision = c.current_revision AND s.kind = 'question' AND s.state IS DISTINCT FROM 'resolved') AS open_questions,
         (SELECT count(*)::int FROM conceptualize.concept_statements s WHERE s.concept_id = c.id AND s.revision = c.current_revision AND s.basis = 'ai-hypothesis' AND s.confirmed_by IS NULL) AS unconfirmed,
         lpad(regexp_replace(c.key, '\\D', '', 'g'), 12, '0') || c.key AS sort_key`

interface ListRow {
  id: string
  key: string
  project_id: string
  revision: number
  name: string
  summary: string
  abstraction: ConceptDto['abstraction']
  classifications: string[]
  maturity: ConceptMaturity
  verification_status: VerificationStatus
  implementation_status: ConceptDto['implementationStatus']
  source_kind: ConceptDto['provenance']['sourceKind']
  updated_at: Date
  open_questions: number
  unconfirmed: number
  sort_key: string
}

const toListItem = (r: ListRow): ConceptListItemDto => ({
  id: r.id,
  key: r.key,
  projectId: r.project_id,
  revision: r.revision,
  name: r.name,
  summary: r.summary,
  abstraction: r.abstraction,
  classifications: r.classifications,
  maturity: r.maturity,
  verificationStatus: r.verification_status,
  implementationStatus: r.implementation_status,
  sourceKind: r.source_kind,
  openQuestions: r.open_questions,
  unconfirmedHypotheses: r.unconfirmed,
  updatedAt: isoRequired(r.updated_at),
})

export async function listConcepts(db: Queryable, projectId: string, q: ConceptListQueryDto): Promise<{ items: ConceptListItemDto[]; nextCursor?: string; total: number }> {
  const limit = q.limit ?? 50
  if (limit < 1 || limit > 200) throw invalid('limit must be between 1 and 200.', { limit: '1–200' }, 400)
  const params: unknown[] = [projectId]
  const p = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }
  const where = ['c.project_id = $1']
  const maturities = csv(q.maturity)
  if (maturities.some((m) => !MATURITIES.includes(m as ConceptMaturity))) throw invalid('Unknown maturity filter.', { maturity: MATURITIES.join(', ') }, 400)
  if (maturities.length) where.push(`c.maturity = ANY(${p(maturities)})`)
  else if (!q.includeArchived) where.push(`c.maturity NOT IN ('archived', 'superseded')`)
  const abstractions = csv(q.abstraction)
  if (abstractions.some((a) => !ABSTRACTIONS.includes(a as ConceptDto['abstraction']))) throw invalid('Unknown abstraction filter.', { abstraction: ABSTRACTIONS.join(', ') }, 400)
  if (abstractions.length) where.push(`v.abstraction = ANY(${p(abstractions)})`)
  if (q.classification) where.push(`${p(q.classification)} = ANY(v.classifications)`)
  const ids = csv(q.ids)
  if (ids.some((i) => !isUuid(i))) throw invalid('ids must be UUIDs.', { ids: 'uuid list' }, 400)
  if (ids.length) where.push(`c.id = ANY(${p(ids)}::uuid[])`)
  if (q.text) {
    const tsq = prefixQuery(q.text)
    const like = `%${q.text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    where.push(`(${tsq ? `v.search_document @@ to_tsquery('simple', ${p(tsq)}) OR ` : ''}c.key ILIKE ${p(like)})`)
  }
  const hash = encodeCursor({ projectId, ...q, cursor: undefined, limit: undefined }).slice(0, 40)
  const from = `FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision`
  const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where.join(' AND ')}`, params)).rows[0].n
  if (q.cursor) {
    const c = decodeCursor(q.cursor)
    if (c.h !== hash) throw invalid('The cursor belongs to a different query.', { cursor: 'different query' }, 400)
    where.push(`(lpad(regexp_replace(c.key, '\\D', '', 'g'), 12, '0') || c.key, c.id::text) > (${p(c.k)}, ${p(c.id)})`)
  }
  const { rows } = await db.query<ListRow>(`${LIST_SELECT} ${from} WHERE ${where.join(' AND ')} ORDER BY sort_key, c.id::text LIMIT ${p(limit + 1)}`, params)
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return { items: page.map(toListItem), total, ...(rows.length > limit && last ? { nextCursor: encodeCursor({ h: hash, k: last.sort_key, id: last.id }) } : {}) }
}

export async function listItems(db: Queryable, projectId: string, ids: string[]): Promise<ConceptListItemDto[]> {
  if (!ids.length) return []
  const { rows } = await db.query<ListRow>(
    `${LIST_SELECT} FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision WHERE c.project_id = $1 AND c.id = ANY($2::uuid[]) ORDER BY sort_key`,
    [projectId, ids],
  )
  return rows.map(toListItem)
}

export async function allListItems(db: Queryable, projectId: string, includeArchived: boolean): Promise<ConceptListItemDto[]> {
  const { rows } = await db.query<ListRow>(
    `${LIST_SELECT} FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision
     WHERE c.project_id = $1 ${includeArchived ? '' : `AND c.maturity NOT IN ('archived', 'superseded')`} ORDER BY sort_key LIMIT 5000`,
    [projectId],
  )
  return rows.map(toListItem)
}

// ---- validation -------------------------------------------------------------------------------------------

interface Content {
  name: string
  summary: string
  description: string
  purpose: string
  abstraction: ConceptDto['abstraction']
  classifications: string[]
  attributes: Record<string, AttributeDto>
  statements: StatementDto[]
}

/**
 * Validates statements against the basis rules (brief §11):
 * - assistant-sourced requests may only write ai-hypothesis, assumption or estimate, never confirm;
 * - evidence needs an evidence record of this Concept with basis evidence; decision needs a recorded decision;
 * - an AI hypothesis becomes a user assertion only through an explicit confirmation (who and when are recorded);
 * - quantities must have a valid unit and consistent range.
 */
async function validateStatements(ctx: Ctx, conceptId: string | null, input: StatementInputDto[], previous: StatementDto[]): Promise<StatementDto[]> {
  const assistant = ctx.provenance.sourceKind === 'assistant'
  const prev = new Map(previous.map((s) => [s.id, s]))
  const errors: Record<string, string> = {}
  const out: StatementDto[] = []
  const seen = new Set<string>()
  for (const [i, s] of input.entries()) {
    const before = s.id ? prev.get(s.id) : undefined
    if (s.id && seen.has(s.id)) errors[`statements.${i}.id`] = 'duplicate statement id'
    const id = s.id ?? randomUUID()
    seen.add(id)
    const textChanged = !!before && before.text !== s.text.trim()
    let basis: Basis = s.basis ?? (assistant && (textChanged || !before) ? 'ai-hypothesis' : before?.basis) ?? 'user-assertion'
    let confirmedBy = before?.confirmedBy ?? null
    let confirmedAt = before?.confirmedAt ?? null
    if (s.confirm) {
      if (assistant) errors[`statements.${i}.confirm`] = 'the assistant cannot confirm statements; a person must'
      else if ((before?.basis ?? basis) === 'ai-hypothesis' || basis === 'ai-hypothesis') {
        basis = 'user-assertion'
        confirmedBy = ctx.actor
        confirmedAt = ctx.now.toISOString()
      }
    }
    if (!BASES.includes(basis)) errors[`statements.${i}.basis`] = 'unknown basis'
    if (assistant && !ASSISTANT_BASES.includes(basis) && !(before && before.basis === basis && !textChanged)) {
      errors[`statements.${i}.basis`] = `the assistant may only record ai-hypothesis, assumption or estimate (not ${basis})`
    }
    if (before && before.basis === 'ai-hypothesis' && basis === 'user-assertion' && !s.confirm && !before.confirmedBy) {
      errors[`statements.${i}.basis`] = 'an AI hypothesis becomes a user assertion only through explicit confirmation (confirm: true)'
    }
    const evidenceId = s.evidenceId !== undefined ? s.evidenceId : (before?.evidenceId ?? null)
    const decisionId = s.decisionId !== undefined ? s.decisionId : (before?.decisionId ?? null)
    if (basis === 'evidence') {
      if (!evidenceId) errors[`statements.${i}.evidenceId`] = 'basis evidence needs a verified evidence record'
      else {
        const { rows } = await ctx.db.query<{ basis: string; concept_id: string }>('SELECT basis, concept_id FROM conceptualize.evidence WHERE id = $1 AND project_id = $2', [evidenceId, ctx.projectId])
        if (!rows[0] || rows[0].basis !== 'evidence') errors[`statements.${i}.evidenceId`] = 'not a verified evidence record of this project'
        else if (conceptId && rows[0].concept_id !== conceptId) errors[`statements.${i}.evidenceId`] = 'the evidence belongs to another Concept'
      }
    }
    if (basis === 'decision') {
      if (!decisionId) errors[`statements.${i}.decisionId`] = 'basis decision needs a recorded decision'
      else {
        const { rows } = await ctx.db.query<{ status: string }>('SELECT status FROM conceptualize.decisions WHERE id = $1 AND project_id = $2', [decisionId, ctx.projectId])
        if (rows[0]?.status !== 'recorded') errors[`statements.${i}.decisionId`] = 'not a recorded decision of this project'
      }
    }
    if (s.quantity) {
      const problem = quantityProblem(s.quantity)
      if (problem) errors[`statements.${i}.quantity`] = problem
    }
    const stateful = STATEFUL_KINDS.includes(s.kind)
    out.push({
      id,
      kind: s.kind,
      text: s.text.trim(),
      basis,
      quantity: s.quantity ? { value: s.quantity.value ?? null, unit: s.quantity.unit, min: s.quantity.min ?? null, max: s.quantity.max ?? null } : null,
      state: stateful ? (s.state ?? before?.state ?? 'open') : null,
      evidenceId,
      decisionId,
      confirmedBy,
      confirmedAt,
      source: (s.source ?? before?.source ?? '').trim(),
    })
  }
  if (Object.keys(errors).length) throw invalid('Some statements are not valid.', errors)
  return out
}

function validateAttributes(ctx: Ctx, attributes: Record<string, AttributeDto>): Record<string, AttributeDto> {
  const errors: Record<string, string> = {}
  const out: Record<string, AttributeDto> = {}
  for (const [k, a] of Object.entries(attributes)) {
    const problem = quantityProblem(a)
    if (problem) errors[`attributes.${k}`] = problem
    const basis = a.basis ?? (ctx.provenance.sourceKind === 'assistant' ? 'ai-hypothesis' : 'user-assertion')
    if (ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(basis)) errors[`attributes.${k}.basis`] = 'the assistant may only record ai-hypothesis, assumption or estimate'
    if (basis === 'evidence' || basis === 'decision') errors[`attributes.${k}.basis`] = 'record evidence or decisions as statements linked to the record'
    out[k] = { value: a.value ?? null, unit: a.unit, min: a.min ?? null, max: a.max ?? null, basis, ...(a.note ? { note: a.note } : {}) }
  }
  if (Object.keys(errors).length) throw invalid('Some attributes are not valid.', errors)
  return out
}

// ---- writes ------------------------------------------------------------------------------------------------

async function insertRevision(ctx: Ctx, id: string, revision: number, c: Content, maturity: ConceptMaturity, reason: string) {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.concept_revisions (concept_id, revision, name, summary, description, purpose, abstraction, classifications, attributes, maturity_at_creation, change_reason,
       source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [id, revision, c.name, c.summary, c.description, c.purpose, c.abstraction, c.classifications, JSON.stringify(c.attributes), maturity, reason, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
  for (const [ordinal, s] of c.statements.entries()) {
    await ctx.db.query(
      `INSERT INTO conceptualize.concept_statements (concept_id, revision, ordinal, statement_id, kind, text, basis, quantity, state, evidence_id, decision_id, confirmed_by, confirmed_at, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, revision, ordinal, s.id, s.kind, s.text, s.basis, s.quantity ? JSON.stringify(s.quantity) : null, s.state, s.evidenceId, s.decisionId, s.confirmedBy, s.confirmedAt, s.source],
    )
  }
}

export interface CreateOptions {
  id?: string
  key?: string
  silent?: boolean
  /** Internal (seed, imports): any maturity; the API accepts only idea, exploring and defined on creation. */
  maturity?: ConceptMaturity
}

export async function createConcept(ctx: Ctx, input: ConceptCreateDto, options: CreateOptions = {}): Promise<ConceptDto> {
  const id = options.id ?? randomUUID()
  const content: Content = {
    name: input.name.trim(),
    summary: (input.summary ?? '').trim(),
    description: (input.description ?? '').trim(),
    purpose: (input.purpose ?? '').trim(),
    abstraction: input.abstraction ?? 'abstract',
    classifications: [...new Set((input.classifications ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))],
    attributes: validateAttributes(ctx, input.attributes ?? {}),
    statements: await validateStatements(ctx, id, input.statements ?? [], []),
  }
  if (!content.name) throw invalid('The Concept needs a name.', { name: 'required' })
  const maturity = options.maturity ?? input.maturity ?? 'idea'
  const key = options.key ?? (await nextKey(ctx, KEY_PREFIX.concept, 'concepts'))
  const reason = (input.reason ?? '').trim()
  await ctx.db.query(
    `INSERT INTO conceptualize.concepts (id, project_id, key, current_revision, maturity, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,$4,$5,$6,$5,$6)`,
    [id, ctx.projectId, key, maturity, ctx.now, ctx.actor],
  )
  await insertRevision(ctx, id, 1, content, maturity, reason)
  await audit(ctx, { entityType: 'concept', entityId: id, conceptIds: [id], action: 'created', revision: 1, reason, details: { key, name: content.name, statements: content.statements.length } })
  if (!options.silent) await emit(ctx, 'concept.created', id, 1)
  return (await getConcept(ctx.db, ctx.projectId, id))!
}

export async function lockConcept(ctx: Ctx, id: string): Promise<ConceptDto> {
  if (!isUuid(id)) throw notFound(`Concept ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.concepts WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Concept ${id} not found.`)
  return (await getConcept(ctx.db, ctx.projectId, id))!
}

export function checkRevision(current: { key: string; revision: number }, expected: number) {
  if (current.revision !== expected) throw conflict(`${current.key} changed since revision ${expected} (now ${current.revision}). Reload to see the newer change; nothing was overwritten.`, current.revision)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Applies a patch with optimistic concurrency; content changes create a new immutable revision. */
export async function updateConcept(ctx: Ctx, id: string, patch: ConceptPatchDto, expectedRevision: number): Promise<{ concept: ConceptDto; changed: boolean }> {
  const current = await lockConcept(ctx, id)
  checkRevision(current, expectedRevision)
  if (current.maturity === 'archived' || current.maturity === 'superseded') throw invalid(`${current.key} is ${current.maturity}. Reopen it (change its maturity) before editing.`)
  const attributes = { ...current.attributes }
  for (const [k, v] of Object.entries(patch.attributes ?? {})) {
    if (v === null) delete attributes[k]
    else attributes[k] = v
  }
  const merged: Content = {
    name: (patch.name ?? current.name).trim(),
    summary: (patch.summary ?? current.summary).trim(),
    description: (patch.description ?? current.description).trim(),
    purpose: (patch.purpose ?? current.purpose).trim(),
    abstraction: patch.abstraction ?? current.abstraction,
    classifications: patch.classifications ? [...new Set(patch.classifications.map((c) => c.trim().toLowerCase()).filter(Boolean))] : current.classifications,
    attributes: patch.attributes ? validateAttributes(ctx, attributes) : current.attributes,
    statements: patch.statements ? await validateStatements(ctx, id, patch.statements, current.statements) : current.statements,
  }
  const changedFields = CONTENT_FIELDS.filter((f) => !same(merged[f], current[f]))
  if (!changedFields.length) return { concept: current, changed: false }
  const reason = (patch.reason ?? '').trim()
  const revision = current.revision + 1
  await insertRevision(ctx, id, revision, merged, current.maturity, reason)
  await ctx.db.query(`UPDATE conceptualize.concepts SET current_revision = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1`, [id, revision, ctx.now, ctx.actor])
  const confirmed = merged.statements.filter((s) => s.confirmedAt === ctx.now.toISOString()).map((s) => s.id)
  await audit(ctx, { entityType: 'concept', entityId: id, conceptIds: [id], action: 'revised', revision, reason, details: { fields: changedFields, ...(confirmed.length ? { confirmedStatements: confirmed } : {}) } })
  await emit(ctx, 'concept.revised', id, revision)
  return { concept: (await getConcept(ctx.db, ctx.projectId, id))!, changed: true }
}

/** Maturity changes are lifecycle events, not content revisions (no mandatory sequence; gates in rules.ts). */
export async function changeMaturity(ctx: Ctx, id: string, to: ConceptMaturity, expectedRevision: number, reason: string, replacedBy?: string): Promise<ConceptDto> {
  const current = await lockConcept(ctx, id)
  checkRevision(current, expectedRevision)
  const problem = maturityProblem({
    from: current.maturity,
    to,
    role: ctx.role,
    implemented: current.implementationStatus === 'implemented',
    verificationStatus: current.verificationStatus,
    replacedBy,
  })
  if (problem) throw problem.code === 'forbidden' ? forbidden(problem.message) : invalid(problem.message, { to: problem.message })
  if (ctx.provenance.sourceKind === 'assistant' && GATED_MATURITIES.includes(to)) throw forbidden('The assistant cannot pass an approval gate; a reviewer sets this maturity.')
  if (replacedBy) {
    if (to !== 'superseded') throw invalid('replacedBy is only used when superseding a Concept.', { replacedBy: 'only with to = superseded' })
    const replacement = await getConcept(ctx.db, ctx.projectId, replacedBy)
    if (!replacement) throw invalid('The replacing Concept does not exist.', { replacedBy: 'not found' })
    if (replacement.id === id) throw invalid('A Concept cannot replace itself.', { replacedBy: 'same Concept' })
  }
  await setMaturity(ctx, current, to, reason)
  if (replacedBy) {
    const { createRelationship } = await import('./relationships')
    await createRelationship(ctx, { type: 'replaces', fromId: replacedBy, toId: id, note: reason }, { skipConceptEvents: true })
  }
  return (await getConcept(ctx.db, ctx.projectId, id))!
}

/** Records a maturity change (callers check the rules). */
export async function setMaturity(ctx: Ctx, current: ConceptDto, to: ConceptMaturity, reason: string) {
  await ctx.db.query(`UPDATE conceptualize.concepts SET maturity = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1`, [current.id, to, ctx.now, ctx.actor])
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.maturity_events (id, concept_id, revision, field, from_value, to_value, reason, actor, occurred_at, source_kind, conversation_id, proposal_id) VALUES ($1,$2,$3,'maturity',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(), current.id, current.revision, current.maturity, to, reason, ctx.actor, ctx.now, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null],
  )
  await audit(ctx, { entityType: 'concept', entityId: current.id, conceptIds: [current.id], action: 'maturity-changed', revision: current.revision, reason, details: { from: current.maturity, to } })
  await emit(ctx, to === 'selected' ? 'concept.selected' : to === 'superseded' ? 'concept.superseded' : 'concept.revised', current.id, current.revision)
}

export async function changeVerificationStatus(ctx: Ctx, id: string, status: VerificationStatus, evidenceIds: string[], expectedRevision: number, reason: string): Promise<ConceptDto> {
  if (!roleAllows(ctx.role, 'decide')) throw forbidden('Setting the verification status needs a reviewer or administrator.')
  if (ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot set a verification status.')
  const current = await lockConcept(ctx, id)
  checkRevision(current, expectedRevision)
  if (current.verificationStatus === status) throw invalid(`The verification status is already ${status}.`)
  if (status === 'verified' || status === 'partially-verified' || status === 'failed') {
    if (!evidenceIds.length) throw invalid(`Verification status ${status} needs at least one evidence record.`, { evidenceIds: 'required' })
    const { rows } = await ctx.db.query<{ id: string; basis: string }>('SELECT id, basis FROM conceptualize.evidence WHERE id = ANY($1::uuid[]) AND concept_id = $2', [evidenceIds, id])
    if (rows.length !== new Set(evidenceIds).size) throw invalid('Every evidence record must belong to this Concept.', { evidenceIds: 'unknown or other Concept' })
    if (rows.some((r) => r.basis !== 'evidence')) throw invalid('Only verified evidence (basis evidence) can support a verification status; estimates and AI hypotheses cannot.', { evidenceIds: 'preliminary evidence' })
  }
  await ctx.db.query(`UPDATE conceptualize.concepts SET verification_status = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1`, [id, status, ctx.now, ctx.actor])
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.maturity_events (id, concept_id, revision, field, from_value, to_value, reason, actor, occurred_at, source_kind, conversation_id, proposal_id) VALUES ($1,$2,$3,'verification-status',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(), id, current.revision, current.verificationStatus, status, reason, ctx.actor, ctx.now, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null],
  )
  await audit(ctx, { entityType: 'concept', entityId: id, conceptIds: [id], action: 'verification-status-changed', revision: current.revision, reason, details: { from: current.verificationStatus, to: status, evidenceIds } })
  await emit(ctx, 'concept.revised', id, current.revision)
  return (await getConcept(ctx.db, ctx.projectId, id))!
}

/** A new Concept from the current revision of another: own identity, derived-from link; the original is unchanged. */
export async function branchConcept(ctx: Ctx, id: string, input: { name?: string; alternativeSetId?: string; reason?: string }): Promise<ConceptDto> {
  const source = await requireConcept(ctx.db, ctx.projectId, id)
  const branch = await createConcept(ctx, {
    name: input.name?.trim() || `${source.name} (branch)`,
    summary: source.summary,
    description: source.description,
    purpose: source.purpose,
    abstraction: source.abstraction,
    classifications: source.classifications,
    attributes: source.attributes,
    // New statement identities: the branch evolves independently.
    statements: source.statements.map((s) => ({ kind: s.kind, text: s.text, basis: ASSISTANT_BASES.includes(s.basis) || ctx.provenance.sourceKind !== 'assistant' ? (s.basis === 'evidence' || s.basis === 'decision' ? 'user-assertion' : s.basis) : 'ai-hypothesis', quantity: s.quantity, state: s.state, source: s.source || `Branched from ${source.key} rev ${source.revision}` })),
    maturity: 'exploring',
    reason: input.reason ?? `Branched from ${source.key} rev ${source.revision}`,
  })
  const { createRelationship } = await import('./relationships')
  await createRelationship(ctx, { type: 'derived-from', fromId: branch.id, toId: source.id, note: `Branch of ${source.key} rev ${source.revision}` }, { skipConceptEvents: true })
  if (input.alternativeSetId) {
    const { addMember } = await import('./alternatives')
    await addMember(ctx, input.alternativeSetId, branch.id)
  }
  return branch
}

// ---- history ------------------------------------------------------------------------------------------------

export async function listRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; name: string; change_reason: string; maturity_at_creation: string; created_at: Date; created_by: string; source_kind: Row['source_kind']; conversation_id: string | null; proposal_id: string | null; message_id: string | null }>(
    `SELECT v.revision, v.name, v.change_reason, v.maturity_at_creation, v.created_at, v.created_by, v.source_kind, v.conversation_id, v.proposal_id, v.message_id
     FROM conceptualize.concept_revisions v JOIN conceptualize.concepts c ON c.id = v.concept_id WHERE c.id = $1 AND c.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({
    revision: r.revision,
    name: r.name,
    changeReason: r.change_reason,
    maturityAtCreation: r.maturity_at_creation,
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id },
  }))
}

export function compareConcepts(a: ConceptDto, b: ConceptDto) {
  return CONTENT_FIELDS.filter((f) => !same(a[f], b[f])).map((f) => ({ field: f, from: a[f], to: b[f] }))
}

export async function listHistory(db: Queryable, projectId: string, filter: { conceptId?: string; proposalId?: string }, limit = 300) {
  const params: unknown[] = [projectId]
  let where = 'project_id = $1'
  if (filter.conceptId) {
    params.push(filter.conceptId)
    where += ` AND $${params.length}::uuid = ANY(concept_ids)`
  }
  if (filter.proposalId) {
    params.push(filter.proposalId)
    where += ` AND proposal_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await db.query<{ id: string; entity_type: string; entity_id: string; concept_ids: string[]; action: string; revision: number | null; actor: string; occurred_at: Date; reason: string; source_kind: Row['source_kind']; conversation_id: string | null; proposal_id: string | null; message_id: string | null; details: Record<string, unknown> }>(
    `SELECT id::text, entity_type, entity_id, concept_ids::text[], action, revision, actor, occurred_at, reason, source_kind, conversation_id, proposal_id, message_id, details FROM conceptualize.audit_events WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    conceptIds: r.concept_ids,
    action: r.action,
    revision: r.revision,
    actor: r.actor,
    occurredAt: isoRequired(r.occurred_at),
    reason: r.reason,
    provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id },
    details: r.details,
  }))
}
