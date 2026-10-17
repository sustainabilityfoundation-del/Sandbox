import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { computeGaps, intentProblems, type IntentContent } from '../domain/intent'
import { KEY_PREFIX } from '../domain/rules'
import type { IntentCreateDto, IntentOut, IntentPatchDto } from '../http/intentSchemas'
import { listAssumptions } from './assumptions'
import { allListItems } from './concepts'
import { listConstraints } from './constraints'
import { audit, emit, isUuid, isoRequired, nextKey, type Ctx, type Queryable } from './context'
import { artifactProblem } from './implementations'

/**
 * Engineering Intents (ECII increment 1): revisioned like Functions (immutable revisions, provenance). The model
 * writes the intent; this module validates its structure and computes gaps from it. It never interprets text.
 */

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  status: IntentOut['status']
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  design_object: string
  role: IntentOut['role']
  integration: IntentOut['integration']
  rationale: string
  external_systems: IntentOut['externalSystems']
  objectives: string[]
  environment: string[]
  information_needs: IntentOut['informationNeeds']
  assumption_ids: string[]
  questions: IntentOut['questions']
  basis: IntentOut['basis']
  change_reason: string
  source_kind: IntentOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  rev_created_at: Date
  rev_created_by: string
}

const SELECT = `SELECT i.id, i.project_id, i.key, i.current_revision, i.status, i.created_at, i.created_by, i.updated_at, i.updated_by,
  v.revision, v.design_object, v.role, v.integration, v.rationale, v.external_systems, v.objectives, v.environment, v.information_needs, v.assumption_ids::text[] AS assumption_ids, v.questions, v.basis, v.change_reason,
  v.source_kind, v.conversation_id, v.proposal_id, v.message_id, v.created_at AS rev_created_at, v.created_by AS rev_created_by
  FROM conceptualize.intents i JOIN conceptualize.intent_revisions v ON v.intent_id = i.id`

const toDto = (r: Row): IntentOut => {
  const historical = r.revision !== r.current_revision
  return {
    id: r.id,
    key: r.key,
    projectId: r.project_id,
    revision: r.revision,
    designObject: r.design_object,
    role: r.role,
    integration: r.integration,
    rationale: r.rationale,
    externalSystems: r.external_systems,
    objectives: r.objectives,
    environment: r.environment,
    informationNeeds: r.information_needs,
    assumptions: r.assumption_ids,
    questions: r.questions,
    basis: r.basis,
    status: r.status,
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

export async function getIntent(db: Queryable, projectId: string, id: string, revision?: number): Promise<IntentOut | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = ${revision ? '$3' : 'i.current_revision'} WHERE i.id = $1 AND i.project_id = $2`, revision ? [id, projectId, revision] : [id, projectId])
  return rows[0] ? toDto(rows[0]) : undefined
}

export async function requireIntent(db: Queryable, projectId: string, id: string, revision?: number): Promise<IntentOut> {
  const i = await getIntent(db, projectId, id, revision)
  if (!i) throw notFound(revision ? `Intent ${id} has no revision ${revision}.` : `Intent ${id} not found.`)
  return i
}

/** Accepts the UUID or the key (INT-001). */
export async function resolveIntent(db: Queryable, projectId: string, idOrKey: string): Promise<IntentOut> {
  if (isUuid(idOrKey)) return requireIntent(db, projectId, idOrKey)
  const { rows } = await db.query<{ id: string }>('SELECT id FROM conceptualize.intents WHERE project_id = $1 AND upper(key) = upper($2)', [projectId, idOrKey])
  if (!rows[0]) throw notFound(`Intent ${idOrKey} not found.`)
  return requireIntent(db, projectId, rows[0].id)
}

export async function listIntents(db: Queryable, projectId: string, q: { status?: string } = {}): Promise<IntentOut[]> {
  const params: unknown[] = [projectId]
  const where = ['i.project_id = $1']
  if (q.status) {
    params.push(q.status.split(',').map((s) => s.trim()))
    where.push(`i.status = ANY($${params.length})`)
  } else where.push(`i.status <> 'retired'`)
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = i.current_revision WHERE ${where.join(' AND ')} ORDER BY lpad(regexp_replace(i.key, '\\D', '', 'g'), 12, '0'), i.id LIMIT 500`, params)
  return rows.map(toDto)
}

export async function listIntentRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; design_object: string; change_reason: string; created_at: Date; created_by: string; source_kind: IntentOut['provenance']['sourceKind']; conversation_id: string | null; proposal_id: string | null; message_id: string | null }>(
    `SELECT v.revision, v.design_object, v.change_reason, v.created_at, v.created_by, v.source_kind, v.conversation_id, v.proposal_id, v.message_id
     FROM conceptualize.intent_revisions v JOIN conceptualize.intents i ON i.id = v.intent_id WHERE i.id = $1 AND i.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({ revision: r.revision, name: r.design_object, changeReason: r.change_reason, maturityAtCreation: '', createdAt: isoRequired(r.created_at), createdBy: r.created_by, provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id } }))
}

interface Content extends IntentContent {
  assumptions: string[]
  basis: IntentOut['basis']
}
const CONTENT_FIELDS = ['designObject', 'role', 'integration', 'rationale', 'externalSystems', 'objectives', 'environment', 'informationNeeds', 'assumptions', 'questions', 'basis'] as const

async function validate(ctx: Ctx, c: Content): Promise<Content> {
  const errors = intentProblems(c)
  c.externalSystems.forEach((s, i) => {
    if (s.productElement) {
      const p = artifactProblem(s.productElement as never)
      if (p) errors[`externalSystems.${i}.productElement`] = p
      else if (s.productElement.module !== 'product') errors[`externalSystems.${i}.productElement`] = 'a system is referenced as a product element'
    }
  })
  if (ctx.provenance.sourceKind === 'assistant' && c.basis !== 'ai-hypothesis') errors.basis = 'the assistant may only record the basis ai-hypothesis'
  if (c.assumptions.some((a) => !isUuid(a))) errors.assumptions = 'assumption IDs are UUIDs'
  if (Object.keys(errors).length) throw invalid('The intent is not valid.', errors)
  if (c.assumptions.length) {
    const { rows } = await ctx.db.query<{ id: string }>('SELECT id::text FROM conceptualize.assumptions WHERE project_id = $1 AND id = ANY($2::uuid[])', [ctx.projectId, c.assumptions])
    const known = new Set(rows.map((r) => r.id))
    const missing = c.assumptions.filter((a) => !known.has(a))
    if (missing.length) throw invalid('The intent is not valid.', { assumptions: `unknown assumption ${missing.join(', ')}` })
  }
  return c
}

const defaultBasis = (ctx: Ctx): IntentOut['basis'] => (ctx.provenance.sourceKind === 'assistant' ? 'ai-hypothesis' : 'user-assertion')

async function insertRevision(ctx: Ctx, id: string, revision: number, c: Content, reason: string) {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.intent_revisions (intent_id, revision, design_object, role, integration, rationale, external_systems, objectives, environment, information_needs, assumption_ids, questions, basis, change_reason, source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[],$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [id, revision, c.designObject, c.role, c.integration, c.rationale, JSON.stringify(c.externalSystems), JSON.stringify(c.objectives), JSON.stringify(c.environment), JSON.stringify(c.informationNeeds), c.assumptions, JSON.stringify(c.questions), c.basis, reason, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
}

const trimmed = (c: Content): Content => ({
  ...c,
  designObject: c.designObject.trim(),
  rationale: c.rationale.trim(),
  externalSystems: c.externalSystems.map((s) => ({ ...s, name: s.name.trim(), role: s.role.trim(), description: s.description.trim() })),
  objectives: c.objectives.map((o) => o.trim()),
  environment: c.environment.map((o) => o.trim()),
  assumptions: [...new Set(c.assumptions)],
})

export async function createIntent(ctx: Ctx, input: IntentCreateDto): Promise<IntentOut> {
  const content = await validate(
    ctx,
    trimmed({
      designObject: input.designObject,
      role: input.role,
      integration: input.integration,
      rationale: input.rationale ?? '',
      externalSystems: (input.externalSystems ?? []) as Content['externalSystems'],
      objectives: input.objectives ?? [],
      environment: input.environment ?? [],
      informationNeeds: (input.informationNeeds ?? []) as Content['informationNeeds'],
      assumptions: input.assumptions ?? [],
      questions: (input.questions ?? []) as Content['questions'],
      basis: input.basis ?? defaultBasis(ctx),
    }),
  )
  const id = randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.intent, 'intents')
  await ctx.db.query(`INSERT INTO conceptualize.intents (id, project_id, key, current_revision, status, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,'active',$4,$5,$4,$5)`, [id, ctx.projectId, key, ctx.now, ctx.actor])
  const reason = (input.reason ?? '').trim()
  await insertRevision(ctx, id, 1, content, reason)
  await audit(ctx, { entityType: 'intent', entityId: id, action: 'created', revision: 1, reason, details: { key, designObject: content.designObject, integration: content.integration } })
  await emit(ctx, 'intent.created', id, 1)
  return (await getIntent(ctx.db, ctx.projectId, id))!
}

async function lock(ctx: Ctx, id: string): Promise<IntentOut> {
  if (!isUuid(id)) throw notFound(`Intent ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.intents WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Intent ${id} not found.`)
  return (await getIntent(ctx.db, ctx.projectId, id))!
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export async function updateIntent(ctx: Ctx, id: string, patch: IntentPatchDto, expected: number): Promise<IntentOut> {
  const current = await lock(ctx, id)
  if (patch.status === 'retired' && ctx.provenance.sourceKind === 'assistant') throw forbidden('Retiring an intent is an action for a person; the assistant cannot retire it.')
  if (current.revision !== expected) throw conflict(`${current.key} changed since revision ${expected} (now ${current.revision}). Reload; nothing was overwritten.`, current.revision)
  const before: Content = { designObject: current.designObject, role: current.role, integration: current.integration, rationale: current.rationale, externalSystems: current.externalSystems as Content['externalSystems'], objectives: current.objectives, environment: current.environment, informationNeeds: current.informationNeeds as Content['informationNeeds'], assumptions: current.assumptions, questions: current.questions as Content['questions'], basis: current.basis }
  const merged = await validate(
    ctx,
    trimmed({
      designObject: patch.designObject ?? before.designObject,
      role: patch.role ?? before.role,
      integration: patch.integration ?? before.integration,
      rationale: patch.rationale ?? before.rationale,
      externalSystems: (patch.externalSystems ?? before.externalSystems) as Content['externalSystems'],
      objectives: patch.objectives ?? before.objectives,
      environment: patch.environment ?? before.environment,
      informationNeeds: (patch.informationNeeds ?? before.informationNeeds) as Content['informationNeeds'],
      assumptions: patch.assumptions ?? before.assumptions,
      questions: (patch.questions ?? before.questions) as Content['questions'],
      basis: patch.basis ?? (ctx.provenance.sourceKind === 'assistant' ? defaultBasis(ctx) : before.basis),
    }),
  )
  const reason = (patch.reason ?? '').trim()
  const changed = CONTENT_FIELDS.filter((f) => !same(merged[f], before[f]))
  let revision = current.revision
  if (changed.length) {
    if (current.status === 'retired' && patch.status !== 'active') throw invalid(`${current.key} is retired. Set it to active before editing.`)
    revision++
    await insertRevision(ctx, id, revision, merged, reason)
    await ctx.db.query('UPDATE conceptualize.intents SET current_revision = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, revision, ctx.now, ctx.actor])
    await audit(ctx, { entityType: 'intent', entityId: id, action: 'revised', revision, reason, details: { fields: changed } })
    await emit(ctx, 'intent.revised', id, revision)
  }
  if (patch.status && patch.status !== current.status) {
    await ctx.db.query('UPDATE conceptualize.intents SET status = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, patch.status, ctx.now, ctx.actor])
    await audit(ctx, { entityType: 'intent', entityId: id, action: 'status-changed', revision, reason, details: { from: current.status, to: patch.status } })
    await emit(ctx, patch.status === 'retired' ? 'intent.retired' : 'intent.revised', id, revision)
  }
  return (await getIntent(ctx.db, ctx.projectId, id))!
}

const contentOf = (i: IntentOut): IntentContent => ({
  designObject: i.designObject,
  role: i.role,
  integration: i.integration,
  rationale: i.rationale,
  externalSystems: i.externalSystems as IntentContent['externalSystems'],
  objectives: i.objectives,
  environment: i.environment,
  informationNeeds: i.informationNeeds as IntentContent['informationNeeds'],
  questions: i.questions as IntentContent['questions'],
})

/** Deterministic gaps of one intent revision (domain/intent.ts computeGaps). */
export async function intentGaps(db: Queryable, projectId: string, idOrKey: string, revision?: number) {
  const intent = revision ? await requireIntent(db, projectId, idOrKey, revision) : await resolveIntent(db, projectId, idOrKey)
  return { intentId: intent.id, key: intent.key, revision: intent.revision, ...computeGaps(contentOf(intent)) }
}

/** The intent with the records around it. */
export async function intentContext(db: Queryable, projectId: string, idOrKey: string) {
  const intent = await resolveIntent(db, projectId, idOrKey)
  const listed = intent.assumptions.length ? (await listAssumptions(db, projectId)).filter((a) => intent.assumptions.includes(a.id)) : []
  const constraints = await listConstraints(db, projectId)
  const concepts = (await allListItems(db, projectId, false)).slice(0, 100).map((c) => ({ id: c.id, key: c.key, name: c.name, maturity: c.maturity }))
  return {
    intent,
    assumptions: listed,
    constraints,
    concepts,
    questions: intent.questions.filter((q) => q.state === 'open'),
    gaps: { intentId: intent.id, key: intent.key, revision: intent.revision, ...computeGaps(contentOf(intent)) },
  }
}
