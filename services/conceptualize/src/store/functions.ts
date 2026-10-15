import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { KEY_PREFIX } from '../domain/rules'
import { quantityProblem } from '../domain/units'
import type { FunctionCreateDto, FunctionOut, FunctionPatchDto } from '../http/designSchemas'
import type { StatementDto } from '../http/schemas'
import { lockConcept, validateStatements } from './concepts'
import { ASSISTANT_BASES, audit, emit, isUuid, isoRequired, nextKey, type Ctx, type Queryable } from './context'

/**
 * Functions (CR-C1): what a system must accomplish, independent of how. Content is revisioned like
 * Concepts (immutable revisions, provenance); status draft/active/retired is a record field. A Function is
 * never implemented and never an alternative (enforced where implementations and sets are written).
 */

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  status: FunctionOut['status']
  origin_concept_id: string | null
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  name: string
  verb_phrase: string
  description: string
  purpose: string
  flows: FunctionOut['flows']
  objectives: FunctionOut['performanceObjectives']
  statements: StatementDto[]
  classifications: string[]
  change_reason: string
  source_kind: FunctionOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  rev_created_at: Date
  rev_created_by: string
}

const SELECT = `SELECT f.id, f.project_id, f.key, f.current_revision, f.status, f.origin_concept_id, f.created_at, f.created_by, f.updated_at, f.updated_by,
  v.revision, v.name, v.verb_phrase, v.description, v.purpose, v.flows, v.objectives, v.statements, v.classifications, v.change_reason,
  v.source_kind, v.conversation_id, v.proposal_id, v.message_id, v.created_at AS rev_created_at, v.created_by AS rev_created_by
  FROM conceptualize.functions f JOIN conceptualize.function_revisions v ON v.function_id = f.id`

/** R1: directions are minimize | maximize | target. Rows written before R1 used min/max for the bound side, which the quantity already carries. */
const normalizeObjective = (o: FunctionOut['performanceObjectives'][number]): FunctionOut['performanceObjectives'][number] => {
  const d = o.direction as string
  return d === 'min' || d === 'max' ? { ...o, direction: 'target' } : o
}

const toDto = (r: Row): FunctionOut => {
  const historical = r.revision !== r.current_revision
  return {
    id: r.id,
    key: r.key,
    projectId: r.project_id,
    revision: r.revision,
    name: r.name,
    verbPhrase: r.verb_phrase,
    description: r.description,
    purpose: r.purpose,
    flows: r.flows,
    performanceObjectives: (r.objectives ?? []).map(normalizeObjective),
    statements: r.statements,
    classifications: r.classifications,
    status: r.status,
    originConceptId: r.origin_concept_id,
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

export async function getFunction(db: Queryable, projectId: string, id: string, revision?: number): Promise<FunctionOut | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = ${revision ? '$3' : 'f.current_revision'} WHERE f.id = $1 AND f.project_id = $2`, revision ? [id, projectId, revision] : [id, projectId])
  return rows[0] ? toDto(rows[0]) : undefined
}

export async function requireFunction(db: Queryable, projectId: string, id: string, revision?: number): Promise<FunctionOut> {
  const f = await getFunction(db, projectId, id, revision)
  if (!f) throw notFound(revision ? `Function ${id} has no revision ${revision}.` : `Function ${id} not found.`)
  return f
}

export async function listFunctions(db: Queryable, projectId: string, q: { text?: string; status?: string; ids?: string } = {}): Promise<FunctionOut[]> {
  const params: unknown[] = [projectId]
  const where = ['f.project_id = $1']
  if (q.status) {
    params.push(q.status.split(',').map((s) => s.trim()))
    where.push(`f.status = ANY($${params.length})`)
  } else where.push(`f.status <> 'retired'`)
  if (q.ids) {
    const ids = q.ids.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.some((i) => !isUuid(i))) throw invalid('ids must be UUIDs.', { ids: 'uuid list' }, 400)
    params.push(ids)
    where.push(`f.id = ANY($${params.length}::uuid[])`)
  }
  if (q.text) {
    params.push(`%${q.text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)
    where.push(`(v.name ILIKE $${params.length} OR v.verb_phrase ILIKE $${params.length} OR v.description ILIKE $${params.length} OR f.key ILIKE $${params.length})`)
  }
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = f.current_revision WHERE ${where.join(' AND ')} ORDER BY lpad(regexp_replace(f.key, '\\D', '', 'g'), 12, '0'), f.id LIMIT 1000`, params)
  return rows.map(toDto)
}

interface Content {
  name: string
  verbPhrase: string
  description: string
  purpose: string
  flows: FunctionOut['flows']
  objectives: FunctionOut['performanceObjectives']
  statements: StatementDto[]
  classifications: string[]
}
const CONTENT_FIELDS = ['name', 'verbPhrase', 'description', 'purpose', 'flows', 'objectives', 'statements', 'classifications'] as const

function validateQuantities(ctx: Ctx, flows: FunctionOut['flows'], objectives: FunctionOut['performanceObjectives']) {
  const errors: Record<string, string> = {}
  flows.forEach((f, i) => {
    if (f.quantity) {
      const p = quantityProblem(f.quantity)
      if (p) errors[`flows.${i}.quantity`] = p
    }
  })
  const out = objectives.map((o, i) => {
    const p = o.quantity ? quantityProblem(o.quantity) : null
    if (p) errors[`performanceObjectives.${i}.quantity`] = p
    const basis = o.basis ?? (ctx.provenance.sourceKind === 'assistant' ? 'ai-hypothesis' : 'user-assertion')
    if (ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(basis)) errors[`performanceObjectives.${i}.basis`] = 'the assistant may only record ai-hypothesis, assumption, assessment or estimate'
    if (['evidence', 'decision', 'calculated'].includes(basis)) errors[`performanceObjectives.${i}.basis`] = 'record evidence, calculations and decisions as their own records'
    return { ...o, basis }
  })
  if (Object.keys(errors).length) throw invalid('The function is not valid.', errors)
  return out
}

async function insertRevision(ctx: Ctx, id: string, revision: number, c: Content, reason: string) {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.function_revisions (function_id, revision, name, verb_phrase, description, purpose, flows, objectives, statements, classifications, change_reason, source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [id, revision, c.name, c.verbPhrase, c.description, c.purpose, JSON.stringify(c.flows), JSON.stringify(c.objectives), JSON.stringify(c.statements), c.classifications, reason, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
}

export async function createFunction(ctx: Ctx, input: FunctionCreateDto, options: { id?: string; originConceptId?: string } = {}): Promise<FunctionOut> {
  const id = options.id ?? randomUUID()
  const content: Content = {
    name: input.name.trim(),
    verbPhrase: (input.verbPhrase ?? '').trim(),
    description: (input.description ?? '').trim(),
    purpose: (input.purpose ?? '').trim(),
    flows: input.flows ?? [],
    objectives: [],
    statements: await validateStatements(ctx, null, input.statements ?? [], []),
    classifications: [...new Set((input.classifications ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))],
  }
  content.objectives = validateQuantities(ctx, content.flows, input.performanceObjectives ?? [])
  const key = await nextKey(ctx, KEY_PREFIX.function, 'functions')
  await ctx.db.query(
    `INSERT INTO conceptualize.functions (id, project_id, key, current_revision, status, origin_concept_id, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,$4,$5,$6,$7,$6,$7)`,
    [id, ctx.projectId, key, input.status ?? 'active', options.originConceptId ?? null, ctx.now, ctx.actor],
  )
  const reason = (input.reason ?? '').trim()
  await insertRevision(ctx, id, 1, content, reason)
  await audit(ctx, { entityType: 'function', entityId: id, action: 'created', revision: 1, reason, details: { key, name: content.name } })
  await emit(ctx, 'function.created', id, 1)
  if (input.parentFunctionId) {
    const { createDesignLink } = await import('./designLinks')
    await createDesignLink(ctx, { type: 'decomposes-into', from: { module: 'conceptualize', type: 'function', id: input.parentFunctionId }, to: { module: 'conceptualize', type: 'function', id }, decompositionId: input.decompositionId })
  }
  return (await getFunction(ctx.db, ctx.projectId, id))!
}

async function lock(ctx: Ctx, id: string): Promise<FunctionOut> {
  if (!isUuid(id)) throw notFound(`Function ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.functions WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Function ${id} not found.`)
  return (await getFunction(ctx.db, ctx.projectId, id))!
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export async function updateFunction(ctx: Ctx, id: string, patch: FunctionPatchDto, expected: number): Promise<FunctionOut> {
  const current = await lock(ctx, id)
  if (current.revision !== expected) throw conflict(`${current.key} changed since revision ${expected} (now ${current.revision}). Reload; nothing was overwritten.`, current.revision)
  const merged: Content = {
    name: (patch.name ?? current.name).trim(),
    verbPhrase: (patch.verbPhrase ?? current.verbPhrase).trim(),
    description: (patch.description ?? current.description).trim(),
    purpose: (patch.purpose ?? current.purpose).trim(),
    flows: patch.flows ?? current.flows,
    objectives: current.performanceObjectives,
    statements: patch.statements ? await validateStatements(ctx, null, patch.statements, current.statements) : current.statements,
    classifications: patch.classifications ? [...new Set(patch.classifications.map((c) => c.trim().toLowerCase()).filter(Boolean))] : current.classifications,
  }
  merged.objectives = patch.performanceObjectives ? validateQuantities(ctx, merged.flows, patch.performanceObjectives) : current.performanceObjectives
  const reason = (patch.reason ?? '').trim()
  const changed = CONTENT_FIELDS.filter((f) => !same(merged[f], f === 'objectives' ? current.performanceObjectives : current[f]))
  let revision = current.revision
  if (changed.length) {
    if (current.status === 'retired') throw invalid(`${current.key} is retired. Set it to draft or active before editing.`)
    revision++
    await insertRevision(ctx, id, revision, merged, reason)
    await ctx.db.query('UPDATE conceptualize.functions SET current_revision = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, revision, ctx.now, ctx.actor])
    await audit(ctx, { entityType: 'function', entityId: id, action: 'revised', revision, reason, details: { fields: changed } })
    await emit(ctx, 'function.revised', id, revision)
  }
  if (patch.status && patch.status !== current.status) {
    await ctx.db.query('UPDATE conceptualize.functions SET status = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, patch.status, ctx.now, ctx.actor])
    await audit(ctx, { entityType: 'function', entityId: id, action: 'status-changed', revision, reason, details: { from: current.status, to: patch.status } })
    await emit(ctx, patch.status === 'retired' ? 'function.retired' : 'function.revised', id, revision)
  }
  return (await getFunction(ctx.db, ctx.projectId, id))!
}

export async function listFunctionRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; name: string; change_reason: string; created_at: Date; created_by: string; source_kind: FunctionOut['provenance']['sourceKind']; conversation_id: string | null; proposal_id: string | null; message_id: string | null }>(
    `SELECT v.revision, v.name, v.change_reason, v.created_at, v.created_by, v.source_kind, v.conversation_id, v.proposal_id, v.message_id
     FROM conceptualize.function_revisions v JOIN conceptualize.functions f ON f.id = v.function_id WHERE f.id = $1 AND f.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({ revision: r.revision, name: r.name, changeReason: r.change_reason, maturityAtCreation: '', createdAt: isoRequired(r.created_at), createdBy: r.created_by, provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id } }))
}

/**
 * CR-C1 step 3: explicit conversion of a function-Concept. Creates a Function from the Concept's current
 * revision (statements of kind function, behavior, performance and constraint), links Function
 * derived-from Concept, and re-expresses each `implements` relationship into the Concept as a `performs`
 * link to the Function. The Concept and its relationships stay as history (the user may archive it).
 */
export async function convertToFunction(ctx: Ctx, conceptId: string, expected: number, reason = '') {
  const concept = await lockConcept(ctx, conceptId)
  if (concept.revision !== expected) throw conflict(`${concept.key} changed since revision ${expected} (now ${concept.revision}). Reload; nothing was overwritten.`, concept.revision)
  const { rows: already } = await ctx.db.query<{ key: string }>('SELECT key FROM conceptualize.functions WHERE origin_concept_id = $1 AND project_id = $2', [conceptId, ctx.projectId])
  if (already[0]) throw conflict(`${concept.key} was already converted to ${already[0].key}.`)
  const keep = concept.statements.filter((s) => ['function', 'behavior', 'performance', 'constraint'].includes(s.kind))
  const objectives = keep
    .filter((s) => (s.kind === 'performance' || s.kind === 'constraint') && s.quantity)
    .map((s) => ({ name: s.text, quantity: { value: s.quantity!.value ?? null, unit: s.quantity!.unit, min: s.quantity!.min ?? null, max: s.quantity!.max ?? null }, direction: 'target' as const, basis: s.basis === 'evidence' || s.basis === 'decision' || s.basis === 'calculated' ? ('user-assertion' as const) : s.basis }))
  const fn = await createFunction(
    ctx,
    {
      name: concept.name,
      description: concept.description || concept.summary,
      purpose: concept.purpose,
      classifications: concept.classifications,
      statements: keep.map((s) => ({ kind: s.kind, text: s.text, basis: ['evidence', 'decision', 'calculated'].includes(s.basis) ? 'user-assertion' : s.basis, quantity: s.quantity, state: s.state, source: s.source || `From ${concept.key} rev ${concept.revision}` })),
      performanceObjectives: objectives,
      status: 'active',
      reason: reason || `Converted from ${concept.key} rev ${concept.revision}`,
    },
    { originConceptId: concept.id },
  )
  const { createDesignLink } = await import('./designLinks')
  const derived = await createDesignLink(ctx, { type: 'derived-from', from: { module: 'conceptualize', type: 'function', id: fn.id }, to: { module: 'conceptualize', type: 'concept', id: concept.id, revision: concept.revision }, note: `Converted from ${concept.key} rev ${concept.revision}` })
  const { rows: impls } = await ctx.db.query<{ from_id: string; basis: string }>(`SELECT from_id, basis FROM conceptualize.relationships WHERE project_id = $1 AND type = 'implements' AND to_id = $2 AND NOT removed`, [ctx.projectId, concept.id])
  const performs: string[] = []
  for (const r of impls) {
    const l = await createDesignLink(ctx, { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: r.from_id }, to: { module: 'conceptualize', type: 'function', id: fn.id }, basis: r.basis as never, note: `Re-expressed from implements ${concept.key}` })
    performs.push(l.id)
  }
  await audit(ctx, { entityType: 'concept', entityId: concept.id, conceptIds: [concept.id], action: 'converted-to-function', revision: concept.revision, reason, details: { functionId: fn.id, functionKey: fn.key, performs: performs.length } })
  return { function: fn, derivedLinkId: derived.id, performsLinkIds: performs, conceptId: concept.id }
}
