import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { LINK_RULES, linkProblem } from '../domain/rules'
import { audit, emit, iso, isoRequired, isUuid, type Ctx } from './context'
import { artifactJson, loadArtifact, type ArtifactRow } from './artifacts'

/**
 * Links owned by Project Management (information-model.md §6). Validated by LINK_RULES; meanings owned by a
 * module (allocation, implementation, satisfy, verification) are refused with the module operation to use.
 * Links are never deleted: removal is recorded.
 */
interface LinkRow {
  id: string
  project_id: string
  type: string
  from_artifact: string
  from_revision: string | null
  to_artifact: string
  to_revision: string | null
  note: string
  created_at: Date
  created_by: string
  source_kind: string
  removed_at: Date | null
  removed_by: string | null
  removal_reason: string | null
  revision: number
}

export function linkJson(r: LinkRow) {
  return {
    id: r.id,
    projectId: r.project_id,
    type: r.type,
    from: { artifactId: r.from_artifact, ...(r.from_revision ? { revision: r.from_revision } : {}) },
    to: { artifactId: r.to_artifact, ...(r.to_revision ? { revision: r.to_revision } : {}) },
    note: r.note,
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    sourceKind: r.source_kind,
    ...(r.removed_at ? { removedAt: iso(r.removed_at), removedBy: r.removed_by, removalReason: r.removal_reason ?? '' } : {}),
    impact: LINK_RULES[r.type as keyof typeof LINK_RULES]?.impact ?? false,
    revision: r.revision,
  }
}

export interface CreateLinkInput {
  type: string
  from: { artifactId: string; revision?: string | number }
  to: { artifactId: string; revision?: string | number }
  note?: string
}

export async function createLink(ctx: Ctx, input: CreateLinkInput) {
  if (input.from.artifactId === input.to.artifactId) throw invalid('A link needs two different artifacts.', { to: 'same as from' })
  const from = await loadArtifact(ctx, input.from.artifactId)
  const to = await loadArtifact(ctx, input.to.artifactId)
  const problem = linkProblem(input.type, from, to)
  if (problem) throw invalid(problem, { type: input.type })
  const dup = await ctx.db.query(`SELECT 1 FROM projects.links WHERE project_id = $1 AND type = $2 AND from_artifact = $3 AND to_artifact = $4 AND removed_at IS NULL`, [ctx.projectId, input.type, from.id, to.id])
  if (dup.rowCount) throw conflict(`${from.key} already has a “${input.type}” link to ${to.key}.`)
  const id = randomUUID()
  const { rows } = await ctx.db.query<LinkRow>(
    `INSERT INTO projects.links (id, project_id, type, from_artifact, from_revision, to_artifact, to_revision, note, created_at, created_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [id, ctx.projectId, input.type, from.id, input.from.revision?.toString() ?? null, to.id, input.to.revision?.toString() ?? null, input.note ?? '', ctx.now, ctx.actor, ctx.provenance.sourceKind, ctx.provenance.conversationId ?? null, ctx.provenance.proposalId ?? null],
  )
  await audit(ctx, { entityType: 'link', entityId: id, action: 'created', revision: 1, details: { type: input.type, from: from.key, to: to.key } })
  await emit(ctx, 'link.created', id, 1)
  return linkJson(rows[0])
}

export async function removeLink(ctx: Ctx, linkId: string, reason: string) {
  if (!isUuid(linkId)) throw notFound(`No link ${linkId}.`)
  const { rows } = await ctx.db.query<LinkRow>('SELECT * FROM projects.links WHERE id = $1 AND project_id = $2 FOR UPDATE', [linkId, ctx.projectId])
  const link = rows[0]
  if (!link) throw notFound(`No link ${linkId}.`)
  if (link.removed_at) throw invalid('The link is already removed.')
  const updated = await ctx.db.query<LinkRow>(`UPDATE projects.links SET removed_at = $2, removed_by = $3, removal_reason = $4, revision = revision + 1 WHERE id = $1 RETURNING *`, [linkId, ctx.now, ctx.actor, reason])
  await audit(ctx, { entityType: 'link', entityId: linkId, action: 'removed', revision: updated.rows[0].revision, reason })
  await emit(ctx, 'link.removed', linkId, updated.rows[0].revision)
  return linkJson(updated.rows[0])
}

export async function listLinks(ctx: Ctx, query: { artifactId?: string; direction?: 'out' | 'in' | 'both'; type?: string; includeRemoved?: boolean }) {
  const params: unknown[] = [ctx.projectId]
  const where = ['l.project_id = $1']
  if (query.artifactId) {
    const p = `$${params.push(query.artifactId)}`
    const dir = query.direction ?? 'both'
    where.push(dir === 'out' ? `l.from_artifact = ${p}::uuid` : dir === 'in' ? `l.to_artifact = ${p}::uuid` : `(l.from_artifact = ${p}::uuid OR l.to_artifact = ${p}::uuid)`)
  }
  if (query.type) where.push(`l.type = $${params.push(query.type)}`)
  if (!query.includeRemoved) where.push('l.removed_at IS NULL')
  const { rows } = await ctx.db.query<LinkRow & { from_row: ArtifactRow; to_row: ArtifactRow }>(
    `SELECT l.*, to_jsonb(f) AS from_row, to_jsonb(t) AS to_row FROM projects.links l
     JOIN projects.artifacts f ON f.id = l.from_artifact JOIN projects.artifacts t ON t.id = l.to_artifact
     WHERE ${where.join(' AND ')} ORDER BY l.created_at, l.id`,
    params,
  )
  const summary = (a: ArtifactRow) => {
    const j = artifactJson({ ...a, version_at: new Date(a.version_at), created_at: new Date(a.created_at), modified_at: new Date(a.modified_at), confirmed_at: new Date(a.confirmed_at) })
    return { artifactId: j.artifactId, key: j.key, title: j.title, kind: j.kind, category: j.category, availability: j.availability }
  }
  return rows.map((r) => ({ ...linkJson(r), fromArtifact: summary(r.from_row), toArtifact: summary(r.to_row) }))
}

/** Creates `subject-of` links from a Project Management entity to its subjects (used by work items and documents). */
export async function linkSubjects(ctx: Ctx, fromArtifactId: string, subjects: string[]) {
  for (const s of [...new Set(subjects)]) await createLink(ctx, { type: 'subject-of', from: { artifactId: fromArtifactId }, to: { artifactId: s } })
}
