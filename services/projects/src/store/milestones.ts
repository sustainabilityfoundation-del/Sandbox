import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { MILESTONE_STATUSES, type MilestoneStatus } from '../domain/rules'
import { audit, emit, isoRequired, isUuid, nextKey, type Ctx } from './context'
import { registerOwn } from './artifacts'
import { createLink } from './links'

interface MilestoneRow {
  id: string
  project_id: string
  key: string
  name: string
  description: string
  due: string | null
  status: MilestoneStatus
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}

const SELECT = `SELECT id, project_id, key, name, description, due::text AS due, status, revision, created_at, created_by, updated_at, updated_by FROM projects.milestones`

export function milestoneJson(r: MilestoneRow, artifactId?: string) {
  return {
    id: r.id,
    projectId: r.project_id,
    key: r.key,
    name: r.name,
    description: r.description,
    ...(r.due ? { due: r.due } : {}),
    status: r.status,
    ...(artifactId ? { artifactId } : {}),
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
    updatedBy: r.updated_by,
    revision: r.revision,
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function register(ctx: Ctx, m: MilestoneRow) {
  return registerOwn(ctx, {
    kind: 'milestone',
    nativeId: m.id,
    category: 'milestone',
    key: m.key,
    title: m.name,
    lifecycle: m.status === 'achieved' ? 'released' : m.status === 'cancelled' || m.status === 'missed' ? 'retired' : 'working',
    moduleState: m.status,
    version: m.revision,
  })
}

async function snapshot(ctx: Ctx, m: MilestoneRow) {
  await ctx.db.query('INSERT INTO projects.milestone_revisions (milestone_id, revision, snapshot, changed_at, changed_by) VALUES ($1,$2,$3,$4,$5)', [m.id, m.revision, JSON.stringify(milestoneJson(m)), ctx.now, ctx.actor])
}

export interface MilestoneInput {
  name: string
  description?: string
  due?: string
  status?: MilestoneStatus
  deliverables?: string[]
}

export async function createMilestone(ctx: Ctx, input: MilestoneInput) {
  if (!input.name?.trim()) throw invalid('A milestone needs a name.', { name: 'required' })
  if (input.due && !DATE.test(input.due)) throw invalid('Due date as YYYY-MM-DD.', { due: 'format' })
  if (input.status && !MILESTONE_STATUSES.includes(input.status)) throw invalid('Unknown milestone status.', { status: 'unknown' })
  const id = randomUUID()
  const key = await nextKey(ctx, 'MS', 'milestones')
  const { rows } = await ctx.db.query<MilestoneRow>(
    `INSERT INTO projects.milestones (id, project_id, key, name, description, due, status, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$9)
     RETURNING id, project_id, key, name, description, due::text AS due, status, revision, created_at, created_by, updated_at, updated_by`,
    [id, ctx.projectId, key, input.name.trim(), input.description ?? '', input.due ?? null, input.status ?? 'planned', ctx.now, ctx.actor],
  )
  const m = rows[0]
  await snapshot(ctx, m)
  const artifactId = await register(ctx, m)
  await addDeliverables(ctx, artifactId, input.deliverables ?? [])
  await audit(ctx, { entityType: 'milestone', entityId: id, action: 'created', revision: 1, details: { key } })
  await emit(ctx, 'milestone.changed', id, 1)
  return milestoneJson(m, artifactId)
}

export async function updateMilestone(ctx: Ctx, id: string, expectedRevision: number, input: Partial<MilestoneInput> & { due?: string | null }) {
  const current = await loadMilestone(ctx, id, true)
  if (current.revision !== expectedRevision) throw conflict(`${current.key} changed since revision ${expectedRevision} (now ${current.revision}).`, current.revision)
  if (input.due && !DATE.test(input.due)) throw invalid('Due date as YYYY-MM-DD.', { due: 'format' })
  if (input.status && !MILESTONE_STATUSES.includes(input.status)) throw invalid('Unknown milestone status.', { status: 'unknown' })
  if (input.name !== undefined && !input.name.trim()) throw invalid('A milestone needs a name.', { name: 'required' })
  const { rows } = await ctx.db.query<MilestoneRow>(
    `UPDATE projects.milestones SET name = coalesce($2, name), description = coalesce($3, description), due = CASE WHEN $4::boolean THEN $5::date ELSE due END, status = coalesce($6, status),
       revision = revision + 1, updated_at = $7, updated_by = $8 WHERE id = $1
     RETURNING id, project_id, key, name, description, due::text AS due, status, revision, created_at, created_by, updated_at, updated_by`,
    [id, input.name?.trim() ?? null, input.description ?? null, input.due !== undefined, input.due ?? null, input.status ?? null, ctx.now, ctx.actor],
  )
  const m = rows[0]
  await snapshot(ctx, m)
  const artifactId = await register(ctx, m)
  await addDeliverables(ctx, artifactId, input.deliverables ?? [])
  // Achieving a milestone with open deliverable work is allowed; the warning is returned, never a refusal.
  const warnings: string[] = []
  if (m.status === 'achieved') {
    const open = await ctx.db.query<{ key: string }>(`SELECT key FROM projects.work_items WHERE milestone_id = $1 AND status NOT IN ('done','cancelled','closed','rejected','accepted')`, [id])
    if (open.rowCount) warnings.push(`Open work items assigned to this milestone: ${open.rows.map((r) => r.key).join(', ')}.`)
  }
  await audit(ctx, { entityType: 'milestone', entityId: id, action: 'updated', revision: m.revision, details: { changed: Object.keys(input) } })
  await emit(ctx, 'milestone.changed', id, m.revision)
  return { ...milestoneJson(m, artifactId), ...(warnings.length ? { warnings } : {}) }
}

/** Adds `delivers` links for deliverables not linked yet (existing links stay). */
async function addDeliverables(ctx: Ctx, artifactId: string, deliverables: string[]) {
  for (const d of new Set(deliverables)) {
    const exists = await ctx.db.query(`SELECT 1 FROM projects.links WHERE project_id = $1 AND type = 'delivers' AND from_artifact = $2 AND to_artifact = $3 AND removed_at IS NULL`, [ctx.projectId, artifactId, d])
    if (!exists.rowCount) await createLink(ctx, { type: 'delivers', from: { artifactId }, to: { artifactId: d } })
  }
}

export async function loadMilestone(ctx: Ctx, id: string, forUpdate = false): Promise<MilestoneRow> {
  if (!isUuid(id)) throw notFound(`No milestone ${id}.`)
  const { rows } = await ctx.db.query<MilestoneRow>(`${SELECT} WHERE id = $1 AND project_id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [id, ctx.projectId])
  if (!rows[0]) throw notFound(`No milestone ${id}.`)
  return rows[0]
}

export async function getMilestone(ctx: Ctx, id: string) {
  const m = await loadMilestone(ctx, id)
  const a = await ctx.db.query<{ id: string }>(`SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = 'projects' AND kind = 'milestone' AND native_id = $2`, [ctx.projectId, id])
  return milestoneJson(m, a.rows[0]?.id)
}

export async function listMilestones(ctx: Ctx) {
  const { rows } = await ctx.db.query<MilestoneRow & { artifact_id: string | null }>(
    `SELECT m.id, m.project_id, m.key, m.name, m.description, m.due::text AS due, m.status, m.revision, m.created_at, m.created_by, m.updated_at, m.updated_by, a.id AS artifact_id
     FROM projects.milestones m LEFT JOIN projects.artifacts a ON a.project_id = m.project_id AND a.module = 'projects' AND a.kind = 'milestone' AND a.native_id = m.id::text
     WHERE m.project_id = $1 ORDER BY m.due NULLS LAST, m.key`,
    [ctx.projectId],
  )
  return rows.map((r) => milestoneJson(r, r.artifact_id ?? undefined))
}
