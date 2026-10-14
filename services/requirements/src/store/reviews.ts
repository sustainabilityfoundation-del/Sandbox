import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { roleAllows, type Role } from '../domain/rules'
import { audit, isUuid, iso, isoRequired, type Ctx, type Queryable } from './context'
import { getRequirement, recordLifecycle } from './requirements'

/**
 * Review records. A review is about one exact revision; decisions are immutable. Approval is a
 * review outcome, distinct from verification results, compliance assessment and modelled
 * satisfaction (contracts §2).
 */

type ReviewRow = { id: string; requirement_id: string; requirement_revision: number; state: string; requested_by: string; requested_at: Date; note: string; closed_by: string | null; closed_at: Date | null }
type DecisionRow = { id: string; review_id: string; decision: 'approve' | 'reject' | 'comment'; comment: string; decided_by: string; decided_at: Date }

export async function listReviews(db: Queryable, projectId: string, requirementId: string) {
  const { rows } = await db.query<ReviewRow>('SELECT * FROM requirements.reviews WHERE project_id = $1 AND requirement_id = $2 ORDER BY requested_at DESC', [projectId, requirementId])
  if (!rows.length) return []
  const decisions = await db.query<DecisionRow>('SELECT * FROM requirements.review_decisions WHERE review_id = ANY($1::uuid[]) ORDER BY decided_at', [rows.map((r) => r.id)])
  return rows.map((r) => ({
    id: r.id,
    requirementId: r.requirement_id,
    requirementRevision: r.requirement_revision,
    state: r.state as 'open',
    requestedBy: r.requested_by,
    requestedAt: isoRequired(r.requested_at),
    note: r.note,
    closedBy: r.closed_by,
    closedAt: iso(r.closed_at),
    decisions: decisions.rows.filter((d) => d.review_id === r.id).map((d) => ({ id: d.id, decision: d.decision, comment: d.comment, decidedBy: d.decided_by, decidedAt: isoRequired(d.decided_at) })),
  }))
}

export async function decide(ctx: Ctx, requirementId: string, reviewId: string, input: { decision: 'approve' | 'reject' | 'comment'; comment?: string; expectedRevision: number }, role: Role | null) {
  if (!isUuid(reviewId) || !isUuid(requirementId)) throw notFound('Review not found.')
  if (input.decision === 'comment' ? !roleAllows(role, 'comment') : !roleAllows(role, 'decide-review')) {
    throw forbidden(input.decision === 'comment' ? 'Your role may not comment on reviews.' : 'Only reviewers and administrators approve or reject reviews.')
  }
  await ctx.db.query('SELECT 1 FROM requirements.requirements WHERE id = $1 AND project_id = $2 FOR UPDATE', [requirementId, ctx.projectId])
  const { rows } = await ctx.db.query<ReviewRow>('SELECT * FROM requirements.reviews WHERE id = $1 AND requirement_id = $2 AND project_id = $3 FOR UPDATE', [reviewId, requirementId, ctx.projectId])
  const review = rows[0]
  if (!review) throw notFound('Review not found.')
  const r = (await getRequirement(ctx.db, ctx.projectId, requirementId))!
  if (review.state !== 'open') throw conflict(`The review is ${review.state}; decisions are only recorded on open reviews.`, r.revision, { reviewState: review.state })
  if (r.revision !== input.expectedRevision || review.requirement_revision !== r.revision) {
    throw conflict(`${r.key} changed since revision ${input.expectedRevision} (now ${r.revision}); review the current revision.`, r.revision)
  }
  if (input.decision !== 'comment') {
    const author = await ctx.db.query<{ created_by: string }>('SELECT created_by FROM requirements.requirement_revisions WHERE requirement_id = $1 AND revision = $2', [requirementId, r.revision])
    if (author.rows[0]?.created_by === ctx.actor) throw forbidden(`You authored revision ${r.revision} of ${r.key}; another reviewer must decide.`)
  }
  if (input.decision === 'reject' && !input.comment?.trim()) throw invalid('Give a reason when rejecting.', { comment: 'required for reject' })
  const id = randomUUID()
  await ctx.db.query('INSERT INTO requirements.review_decisions (id, review_id, decision, comment, decided_by, decided_at) VALUES ($1,$2,$3,$4,$5,$6)', [id, reviewId, input.decision, input.comment?.trim() ?? '', ctx.actor, ctx.now])
  await audit(ctx, { entityType: 'review', entityId: reviewId, action: `decision-${input.decision}`, revision: r.revision, reason: input.comment ?? '', details: { requirementId } })
  if (input.decision !== 'comment') {
    const state = input.decision === 'approve' ? 'approved' : 'rejected'
    await ctx.db.query('UPDATE requirements.reviews SET state = $2, closed_by = $3, closed_at = $4 WHERE id = $1', [reviewId, state, ctx.actor, ctx.now])
    await recordLifecycle(ctx, r, input.decision === 'approve' ? 'approved' : 'draft', input.comment?.trim() || (input.decision === 'approve' ? 'Approved in review' : 'Rejected in review'), reviewId)
  }
  return (await listReviews(ctx.db, ctx.projectId, requirementId)).find((x) => x.id === reviewId)!
}

// ---- comments and external references ------------------------------------------------------------------

export async function listComments(db: Queryable, projectId: string, requirementId: string) {
  const { rows } = await db.query<{ id: string; requirement_id: string; revision: number; body: string; author: string; created_at: Date }>(
    'SELECT * FROM requirements.comments WHERE project_id = $1 AND requirement_id = $2 ORDER BY created_at, id',
    [projectId, requirementId],
  )
  return rows.map((c) => ({ id: c.id, requirementId: c.requirement_id, revision: c.revision, body: c.body, author: c.author, createdAt: isoRequired(c.created_at) }))
}

export async function addComment(ctx: Ctx, requirementId: string, body: string) {
  const r = await getRequirement(ctx.db, ctx.projectId, requirementId)
  if (!r) throw notFound('Requirement not found.')
  if (!body.trim()) throw invalid('A comment needs text.', { body: 'required' })
  const id = randomUUID()
  await ctx.db.query('INSERT INTO requirements.comments (id, project_id, requirement_id, revision, body, author, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, ctx.projectId, requirementId, r.revision, body.trim(), ctx.actor, ctx.now])
  await audit(ctx, { entityType: 'comment', entityId: id, action: 'added', revision: r.revision, details: { requirementId } })
  return (await listComments(ctx.db, ctx.projectId, requirementId)).find((c) => c.id === id)!
}

export async function listExternalReferences(db: Queryable, projectId: string, requirementId: string) {
  const own = await db.query<{ id: string; requirement_id: string; system: string; external_id: string; url: string | null; note: string; created_at: Date; created_by: string }>(
    'SELECT * FROM requirements.external_references WHERE project_id = $1 AND requirement_id = $2 ORDER BY created_at',
    [projectId, requirementId],
  )
  const mapped = await db.query<{ source_id: string; name: string; source_key: string; external_id: string; updated_at: Date }>(
    `SELECT m.source_id, s.name, s.source_key, m.external_id, m.updated_at FROM requirements.external_mappings m JOIN requirements.exchange_sources s ON s.id = m.source_id
     WHERE s.project_id = $1 AND m.internal_kind = 'requirement' AND m.internal_id = $2`,
    [projectId, requirementId],
  )
  return [
    ...own.rows.map((x) => ({ id: x.id, requirementId: x.requirement_id, system: x.system, externalId: x.external_id, url: x.url, note: x.note, createdAt: isoRequired(x.created_at), createdBy: x.created_by })),
    ...mapped.rows.map((m) => ({ id: m.source_id, requirementId, system: `ReqIF source: ${m.name}`, externalId: m.external_id, url: null, note: `Exchange mapping (source key ${m.source_key})`, createdAt: isoRequired(m.updated_at), createdBy: 'import', sourceMapping: true })),
  ]
}

export async function addExternalReference(ctx: Ctx, requirementId: string, input: { system: string; externalId: string; url?: string; note?: string }) {
  const r = await getRequirement(ctx.db, ctx.projectId, requirementId)
  if (!r) throw notFound('Requirement not found.')
  const dup = await ctx.db.query('SELECT 1 FROM requirements.external_references WHERE requirement_id = $1 AND system = $2 AND external_id = $3', [requirementId, input.system.trim(), input.externalId.trim()])
  if (dup.rowCount) throw conflict('This external reference already exists.')
  const id = randomUUID()
  await ctx.db.query(
    'INSERT INTO requirements.external_references (id, project_id, requirement_id, system, external_id, url, note, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, ctx.projectId, requirementId, input.system.trim(), input.externalId.trim(), input.url ?? null, input.note ?? '', ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'external-reference', entityId: id, action: 'added', revision: r.revision, details: { requirementId, system: input.system, externalId: input.externalId } })
  return (await listExternalReferences(ctx.db, ctx.projectId, requirementId)).find((x) => x.id === id)!
}
