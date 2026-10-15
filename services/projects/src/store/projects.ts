import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import {
  DEFAULT_RETENTION_DAYS,
  DISCIPLINES,
  PROJECT_KEY,
  PROJECT_STATES,
  PROJECT_STATUSES,
  isRole,
  stateTransitionProblem,
  templateById,
  type ProjectState,
  type ProjectStatus,
  type Role,
  type StateTransition,
} from '../domain/rules'
import { audit, emit, iso, isoRequired, type Ctx } from './context'
import type { Queryable } from '../ports'
import { createMilestone } from './milestones'
import { createWorkItem } from './workItems'

export interface ProjectRow {
  id: string
  key: string
  name: string
  description: string
  objectives: string[]
  scope: string
  disciplines: string[]
  status: ProjectStatus
  state: ProjectState
  template_id: string
  owner_id: string
  tags: string[]
  legacy: boolean
  archived_at: Date | null
  deleted_at: Date | null
  purge_after: Date | null
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}

export function projectJson(r: ProjectRow, extra: { role?: string | null; counts?: Record<string, number> } = {}) {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    objectives: r.objectives,
    scope: r.scope,
    disciplines: r.disciplines,
    status: r.status,
    state: r.state,
    templateId: r.template_id,
    ownerId: r.owner_id,
    tags: r.tags,
    legacy: r.legacy,
    ...(r.archived_at ? { archivedAt: iso(r.archived_at) } : {}),
    ...(r.deleted_at ? { deletedAt: iso(r.deleted_at) } : {}),
    ...(r.purge_after ? { purgeAfter: iso(r.purge_after) } : {}),
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
    updatedBy: r.updated_by,
    revision: r.revision,
    ...(extra.role !== undefined ? { role: extra.role } : {}),
    ...(extra.counts ? { counts: extra.counts } : {}),
  }
}

export type ProjectJson = ReturnType<typeof projectJson>

export async function loadProject(db: Queryable, projectId: string, options: { forUpdate?: boolean } = {}): Promise<ProjectRow> {
  const { rows } = await db.query<ProjectRow>(`SELECT * FROM projects.projects WHERE id = $1${options.forUpdate ? ' FOR UPDATE' : ''}`, [projectId])
  if (!rows[0]) throw notFound(`No project ${projectId}.`)
  return rows[0]
}

/** Writes refused for archived and deleted projects (record state), except the transitions themselves. */
export function assertWritable(p: ProjectRow) {
  if (p.state === 'archived') throw forbidden(`Project ${p.key} is archived and read-only. Restore it to make changes.`, { reason: 'archived' })
  if (p.state === 'deleted') throw forbidden(`Project ${p.key} is deleted. Restore it within the retention period to make changes.`, { reason: 'deleted' })
}

async function snapshot(ctx: Ctx, p: ProjectRow, summary: string) {
  await ctx.db.query(
    `INSERT INTO projects.project_revisions (project_id, revision, snapshot, changed_at, changed_by, summary, source_kind, conversation_id, proposal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [p.id, p.revision, JSON.stringify(projectJson(p)), ctx.now, ctx.actor, summary, ctx.provenance.sourceKind, ctx.provenance.conversationId ?? null, ctx.provenance.proposalId ?? null],
  )
}

function checkDisciplines(values: string[] | undefined) {
  const bad = (values ?? []).filter((d) => !(DISCIPLINES as readonly string[]).includes(d))
  if (bad.length) throw invalid(`Unknown discipline(s): ${bad.join(', ')}. Use ${DISCIPLINES.join(', ')}.`, { disciplines: 'unknown value' })
}

export interface CreateProjectInput {
  key: string
  name: string
  description?: string
  objectives?: string[]
  scope?: string
  disciplines?: string[]
  status?: ProjectStatus
  templateId?: string
  tags?: string[]
  settings?: Record<string, boolean | number | string | null>
  modules?: string[]
  members?: { userId: string; role: Role }[]
  milestones?: { name: string; due?: string }[]
  /** Fixed ID (the legacy example project, imports in restore mode). Otherwise a new UUID. */
  id?: string
  legacy?: boolean
}

/**
 * Creates a project in one transaction: project row and revision 1, creation record, the creator as
 * administrator (membership port, same transaction), further members, module states, template planning
 * items, audit and outbox. A blank template creates no artifacts at all.
 */
export async function createProject(ctx: Ctx, input: CreateProjectInput, extra: { duplicatedFrom?: string } = {}) {
  const key = input.key.trim().toUpperCase()
  if (!PROJECT_KEY.test(key)) throw invalid('The project key is 2–20 characters: letters, digits and hyphens, starting with a letter (for example EEP or ACT-200).', { key: 'format' })
  const templateId = input.templateId ?? 'blank'
  const template = templateById(templateId)
  if (!template) throw invalid(`Unknown template “${templateId}”.`, { templateId: 'unknown' })
  checkDisciplines(input.disciplines)
  if (input.status && !PROJECT_STATUSES.includes(input.status)) throw invalid('Unknown lifecycle status.', { status: 'unknown' })
  const taken = await ctx.db.query('SELECT 1 FROM projects.projects WHERE upper(key) = $1', [key])
  if (taken.rowCount) throw conflict(`The project key ${key} is already used (keys stay reserved for archived and deleted projects).`)
  const id = input.id ?? randomUUID()
  const disciplines = [...new Set([...(input.disciplines ?? template.disciplines)])]
  const { rows } = await ctx.db.query<ProjectRow>(
    `INSERT INTO projects.projects (id, key, name, description, objectives, scope, disciplines, status, template_id, owner_id, tags, legacy, created_at, created_by, updated_at, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$13,$14) RETURNING *`,
    [id, key, input.name.trim(), input.description ?? '', JSON.stringify(input.objectives ?? []), input.scope ?? '', disciplines, input.status ?? 'planning', templateId, ctx.actor, input.tags ?? [], input.legacy ?? false, ctx.now, ctx.actor],
  )
  const project = rows[0]
  const projectCtx: Ctx = { ...ctx, projectId: id, role: 'administrator' }
  await snapshot(projectCtx, project, extra.duplicatedFrom ? `Duplicated from ${extra.duplicatedFrom}` : `Created (${template.name})`)
  const requested = { ...input, settings: { ...template.settings, ...(input.settings ?? {}) } }
  delete (requested as { id?: string }).id
  await ctx.db.query(`INSERT INTO projects.creation_records (project_id, template_id, template_version, requested, duplicated_from, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    id,
    templateId,
    template.version,
    JSON.stringify(requested),
    extra.duplicatedFrom ?? null,
    ctx.now,
    ctx.actor,
  ])

  // The creator becomes administrator in the same transaction (Q4); then invited members.
  await ctx.services.memberships.set(ctx.db, { projectId: id, userId: ctx.actor, role: 'administrator', actor: ctx.actor })
  for (const m of input.members ?? []) {
    if (m.userId === ctx.actor) continue
    if (!isRole(m.role)) throw invalid(`Unknown role ${m.role}.`, { members: 'role' })
    if (!(await ctx.services.memberships.userExists(ctx.db, m.userId))) throw invalid(`Unknown user “${m.userId}”.`, { members: 'unknown user' })
    await ctx.services.memberships.set(ctx.db, { projectId: id, userId: m.userId, role: m.role, actor: ctx.actor })
  }

  // Settings are applied after commit through the settings service; their state is recorded here.
  await ctx.db.query(`INSERT INTO projects.module_states (project_id, module, status, updated_at) VALUES ($1, 'settings', $2, $3)`, [
    id,
    Object.keys(requested.settings).length === 0 ? 'not-needed' : ctx.services.settings ? 'pending' : 'unavailable',
    ctx.now,
  ])
  for (const m of input.modules ?? []) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(m)) throw invalid(`Invalid module ID ${m}.`, { modules: 'format' })
    await ctx.db.query(`INSERT INTO projects.module_states (project_id, module, enabled, status, updated_at) VALUES ($1,$2,true,'not-needed',$3) ON CONFLICT DO NOTHING`, [id, m, ctx.now])
  }

  // Planning items from the template and the wizard (never engineering artifacts).
  const start = ctx.now.getTime()
  for (const ms of template.milestones) {
    await createMilestone(projectCtx, { name: ms.name, due: ms.offsetDays !== undefined ? new Date(start + ms.offsetDays * 86_400_000).toISOString().slice(0, 10) : undefined })
  }
  for (const ms of input.milestones ?? []) await createMilestone(projectCtx, ms)
  for (const wi of template.workItems) await createWorkItem(projectCtx, { kind: wi.kind, title: wi.title })

  await audit(projectCtx, { entityType: 'project', entityId: id, action: 'created', revision: 1, details: { templateId, key, duplicatedFrom: extra.duplicatedFrom } })
  await emit(projectCtx, 'project.created', id, 1)
  return { project, requestedSettings: requested.settings }
}

export async function getProject(ctx: Ctx, projectId: string) {
  const p = await loadProject(ctx.db, projectId)
  const counts = await countsOf(ctx, projectId)
  return projectJson(p, { role: ctx.role, counts })
}

export async function countsOf(ctx: Ctx, projectId: string) {
  const { rows } = await ctx.db.query<{ artifacts: string; open_work: string; milestones: string; documents: string }>(
    `SELECT (SELECT count(*) FROM projects.artifacts WHERE project_id = $1) AS artifacts,
            (SELECT count(*) FROM projects.work_items WHERE project_id = $1 AND status NOT IN ('done','cancelled','closed','rejected','accepted')) AS open_work,
            (SELECT count(*) FROM projects.milestones WHERE project_id = $1) AS milestones,
            (SELECT count(*) FROM projects.documents WHERE project_id = $1) AS documents`,
    [projectId],
  )
  const members = (await ctx.services.memberships.list(ctx.db, projectId)).length
  return { members, artifacts: Number(rows[0].artifacts), openWorkItems: Number(rows[0].open_work), milestones: Number(rows[0].milestones), documents: Number(rows[0].documents) }
}

export interface ListProjectsQuery {
  q?: string
  status?: string[]
  state?: ProjectState | 'all'
  discipline?: string
  sort?: string
  limit?: number
  cursor?: string
}

const SORTS: Record<string, string> = {
  name: 'lower(p.name)',
  key: 'upper(p.key)',
  updated: 'p.updated_at',
  created: 'p.created_at',
  opened: 'coalesce(r.opened_at, \'epoch\'::timestamptz)',
}

/** Projects the caller is a member of (memberships from the platform port), with search, filter and sort. */
export async function listProjects(ctx: Ctx, memberProjects: { projectId: string; role: string }[], query: ListProjectsQuery) {
  const roles = new Map(memberProjects.map((m) => [m.projectId, m.role]))
  const ids = [...roles.keys()]
  const sortKey = (query.sort ?? '-updated').replace(/^-/, '')
  if (!SORTS[sortKey]) throw invalid(`Unknown sort “${query.sort}”. Use name, key, updated, created or opened, with “-” for descending.`, { sort: 'unknown' })
  const desc = (query.sort ?? '-updated').startsWith('-')
  const state = query.state ?? 'active'
  if (state !== 'all' && !PROJECT_STATES.includes(state)) throw invalid('Unknown state.', { state: 'unknown' })
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const offset = query.cursor ? Number.parseInt(Buffer.from(query.cursor, 'base64url').toString('utf8'), 10) : 0
  if (!Number.isInteger(offset) || offset < 0) throw invalid('Invalid cursor.', { cursor: 'malformed' })
  const params: unknown[] = [ids, ctx.actor]
  const where = ['p.id = ANY($1)']
  if (state !== 'all') where.push(`p.state = $${params.push(state)}`)
  if (query.status?.length) where.push(`p.status = ANY($${params.push(query.status)})`)
  if (query.discipline) where.push(`$${params.push(query.discipline)} = ANY(p.disciplines)`)
  if (query.q?.trim()) where.push(`(p.key ILIKE $${params.push(`%${query.q.trim()}%`)} OR p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`)
  const { rows } = await ctx.db.query<ProjectRow & { opened_at: Date | null; total: string }>(
    `SELECT p.*, r.opened_at, count(*) OVER () AS total FROM projects.projects p
     LEFT JOIN projects.recent_projects r ON r.project_id = p.id AND r.user_id = $2
     WHERE ${where.join(' AND ')}
     ORDER BY ${SORTS[sortKey]} ${desc ? 'DESC' : 'ASC'}, p.id
     LIMIT ${limit + 1} OFFSET ${offset}`,
    params,
  )
  const page = rows.slice(0, limit)
  return {
    items: page.map((r) => ({ ...projectJson(r, { role: roles.get(r.id) ?? null }), ...(r.opened_at ? { openedAt: iso(r.opened_at) } : {}) })),
    ...(rows.length > limit ? { nextCursor: Buffer.from(String(offset + limit)).toString('base64url') } : {}),
    total: Number(rows[0]?.total ?? 0),
  }
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  objectives?: string[]
  scope?: string
  disciplines?: string[]
  status?: ProjectStatus
  tags?: string[]
  key?: string
  ownerId?: string
}

export async function updateProject(ctx: Ctx, projectId: string, expectedRevision: number, input: UpdateProjectInput, canAdminister: boolean) {
  const p = await loadProject(ctx.db, projectId, { forUpdate: true })
  assertWritable(p)
  if (p.revision !== expectedRevision) throw conflict(`Project ${p.key} changed since revision ${expectedRevision} (now ${p.revision}). Reload and apply your change again.`, p.revision)
  if ((input.key !== undefined || input.ownerId !== undefined) && !canAdminister) throw forbidden('Changing the project key or owner needs the administrator role.')
  checkDisciplines(input.disciplines)
  const changed = Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined)
  if (!changed.length) throw invalid('Nothing to change.')
  let key = p.key
  if (input.key !== undefined) {
    key = input.key.trim().toUpperCase()
    if (!PROJECT_KEY.test(key)) throw invalid('Invalid project key.', { key: 'format' })
    if (key !== p.key && (await ctx.db.query('SELECT 1 FROM projects.projects WHERE upper(key) = $1', [key])).rowCount) throw conflict(`The project key ${key} is already used.`)
  }
  if (input.ownerId !== undefined) {
    const members = await ctx.services.memberships.list(ctx.db, projectId)
    if (!members.some((m) => m.userId === input.ownerId && m.role === 'administrator')) throw invalid('The owner must be an administrator of the project.', { ownerId: 'not an administrator' })
  }
  const { rows } = await ctx.db.query<ProjectRow>(
    `UPDATE projects.projects SET key = $2, name = coalesce($3, name), description = coalesce($4, description), objectives = coalesce($5, objectives), scope = coalesce($6, scope),
       disciplines = coalesce($7, disciplines), status = coalesce($8, status), tags = coalesce($9, tags), owner_id = coalesce($10, owner_id),
       revision = revision + 1, updated_at = $11, updated_by = $12 WHERE id = $1 RETURNING *`,
    [projectId, key, input.name?.trim() ?? null, input.description ?? null, input.objectives ? JSON.stringify(input.objectives) : null, input.scope ?? null, input.disciplines ?? null, input.status ?? null, input.tags ?? null, input.ownerId ?? null, ctx.now, ctx.actor],
  )
  const updated = rows[0]
  await snapshot(ctx, updated, `Changed ${changed.join(', ')}`)
  await audit(ctx, { entityType: 'project', entityId: projectId, action: 'updated', revision: updated.revision, details: { changed } })
  await emit(ctx, 'project.updated', projectId, updated.revision)
  return updated
}

/** Archive, restore or soft-delete (ADR-0065). Module data is never touched. */
export async function transitionProject(ctx: Ctx, projectId: string, transition: StateTransition, options: { reason?: string; retentionDays?: number } = {}) {
  const p = await loadProject(ctx.db, projectId, { forUpdate: true })
  const problem = stateTransitionProblem(p.state, transition, p.purge_after, ctx.now)
  if (problem) throw invalid(problem, { state: p.state })
  const days = options.retentionDays ?? DEFAULT_RETENTION_DAYS
  const next: ProjectState = transition === 'archive' ? 'archived' : transition === 'delete' ? 'deleted' : 'active'
  const { rows } = await ctx.db.query<ProjectRow>(
    `UPDATE projects.projects SET state = $2,
       archived_at = CASE WHEN $2 = 'archived' THEN $3::timestamptz WHEN $2 = 'active' THEN NULL ELSE archived_at END,
       deleted_at = CASE WHEN $2 = 'deleted' THEN $3::timestamptz WHEN $2 = 'active' THEN NULL ELSE deleted_at END,
       purge_after = CASE WHEN $2 = 'deleted' THEN $3::timestamptz + make_interval(secs => $4 * 86400) WHEN $2 = 'active' THEN NULL ELSE purge_after END,
       revision = revision + 1, updated_at = $3, updated_by = $5
     WHERE id = $1 RETURNING *`,
    [projectId, next, ctx.now, days, ctx.actor],
  )
  const updated = rows[0]
  const action = transition === 'archive' ? 'archived' : transition === 'delete' ? 'deleted' : 'restored'
  await snapshot(ctx, updated, `${action[0].toUpperCase()}${action.slice(1)}${options.reason ? `: ${options.reason}` : ''}`)
  await audit(ctx, { entityType: 'project', entityId: projectId, action, revision: updated.revision, reason: options.reason, details: { from: p.state, to: next, ...(next === 'deleted' ? { retentionDays: days } : {}) } })
  await emit(ctx, transition === 'archive' ? 'project.archived' : transition === 'delete' ? 'project.deleted' : 'project.restored', projectId, updated.revision)
  const openWork = await ctx.db.query<{ n: string }>(`SELECT count(*) AS n FROM projects.work_items WHERE project_id = $1 AND status NOT IN ('done','cancelled','closed','rejected','accepted')`, [projectId])
  return { project: updated, effects: { openWorkItems: Number(openWork.rows[0].n), moduleDataUnchanged: true } }
}

export async function lifecycleHistory(ctx: Ctx, projectId: string) {
  await loadProject(ctx.db, projectId)
  const { rows } = await ctx.db.query<{ revision: number; changed_at: Date; changed_by: string; summary: string; source_kind: string; snapshot: { state: string; status: string } }>(
    'SELECT revision, changed_at, changed_by, summary, source_kind, snapshot FROM projects.project_revisions WHERE project_id = $1 ORDER BY revision DESC',
    [projectId],
  )
  return rows.map((r) => ({ revision: r.revision, changedAt: isoRequired(r.changed_at), changedBy: r.changed_by, summary: r.summary, sourceKind: r.source_kind, state: r.snapshot.state, status: r.snapshot.status }))
}

export async function recordOpened(ctx: Ctx, projectId: string) {
  await ctx.db.query(
    `INSERT INTO projects.recent_projects (user_id, project_id, opened_at) VALUES ($1,$2,$3) ON CONFLICT (user_id, project_id) DO UPDATE SET opened_at = EXCLUDED.opened_at`,
    [ctx.actor, projectId, ctx.now],
  )
}

export async function recentProjects(ctx: Ctx, memberProjects: { projectId: string; role: string }[]) {
  const roles = new Map(memberProjects.map((m) => [m.projectId, m.role]))
  const { rows } = await ctx.db.query<ProjectRow & { opened_at: Date }>(
    `SELECT p.*, r.opened_at FROM projects.recent_projects r JOIN projects.projects p ON p.id = r.project_id
     WHERE r.user_id = $1 AND p.id = ANY($2) AND p.state <> 'deleted' ORDER BY r.opened_at DESC LIMIT 20`,
    [ctx.actor, [...roles.keys()]],
  )
  return rows.map((r) => ({ ...projectJson(r, { role: roles.get(r.id) ?? null }), openedAt: isoRequired(r.opened_at) }))
}

export async function creationRecord(ctx: Ctx, projectId: string) {
  const { rows } = await ctx.db.query<{ template_id: string; template_version: number; requested: Record<string, unknown>; duplicated_from: string | null; created_at: Date; created_by: string }>(
    'SELECT * FROM projects.creation_records WHERE project_id = $1',
    [projectId],
  )
  const r = rows[0]
  return r ? { templateId: r.template_id, templateVersion: r.template_version, requested: r.requested, duplicatedFrom: r.duplicated_from, createdAt: isoRequired(r.created_at), createdBy: r.created_by } : null
}

export async function moduleStates(ctx: Ctx, projectId: string) {
  const { rows } = await ctx.db.query<{ module: string; enabled: boolean; status: string; attempts: number; last_error: string | null; updated_at: Date }>(
    'SELECT * FROM projects.module_states WHERE project_id = $1 ORDER BY module',
    [projectId],
  )
  return rows.map((r) => ({ module: r.module, enabled: r.enabled, status: r.status, attempts: r.attempts, ...(r.last_error ? { lastError: r.last_error } : {}), updatedAt: isoRequired(r.updated_at) }))
}

export async function setModuleState(db: Queryable, projectId: string, module: string, status: string, error: string | null, now: Date) {
  await db.query(
    `INSERT INTO projects.module_states (project_id, module, status, attempts, last_error, updated_at) VALUES ($1,$2,$3,1,$4,$5)
     ON CONFLICT (project_id, module) DO UPDATE SET status = EXCLUDED.status, attempts = projects.module_states.attempts + 1, last_error = EXCLUDED.last_error, updated_at = EXCLUDED.updated_at`,
    [projectId, module, status, error, now],
  )
}

// ---- members --------------------------------------------------------------------------------------------

export async function setMember(ctx: Ctx, projectId: string, userId: string, role: Role) {
  const p = await loadProject(ctx.db, projectId, { forUpdate: true })
  assertWritable(p)
  if (!isRole(role)) throw invalid(`Unknown role ${role}.`, { role: 'unknown' })
  if (!(await ctx.services.memberships.userExists(ctx.db, userId))) throw invalid(`Unknown user “${userId}”.`, { userId: 'unknown' })
  const members = await ctx.services.memberships.list(ctx.db, projectId)
  const current = members.find((m) => m.userId === userId)
  if (current?.role === 'administrator' && role !== 'administrator' && members.filter((m) => m.role === 'administrator').length === 1) {
    throw invalid('The project needs at least one administrator; make someone else administrator first.', { role: 'last administrator' })
  }
  if (userId === p.owner_id && role !== 'administrator') throw invalid('The project owner must stay an administrator; change the owner first.', { role: 'owner' })
  await ctx.services.memberships.set(ctx.db, { projectId, userId, role, actor: ctx.actor })
  await audit(ctx, { entityType: 'membership', entityId: userId, action: current ? 'role-changed' : 'added', details: { role, previous: current?.role ?? null } })
  await emit(ctx, 'project.members-changed', userId, p.revision)
  return { userId, role }
}

export async function removeMember(ctx: Ctx, projectId: string, userId: string) {
  const p = await loadProject(ctx.db, projectId, { forUpdate: true })
  assertWritable(p)
  const members = await ctx.services.memberships.list(ctx.db, projectId)
  const current = members.find((m) => m.userId === userId)
  if (!current) throw notFound(`${userId} is not a member of ${p.key}.`)
  if (current.role === 'administrator' && members.filter((m) => m.role === 'administrator').length === 1) throw invalid('The last administrator cannot be removed.', { userId: 'last administrator' })
  if (userId === p.owner_id) throw invalid('The project owner cannot be removed; change the owner first.', { userId: 'owner' })
  await ctx.services.memberships.remove(ctx.db, { projectId, userId, actor: ctx.actor })
  await audit(ctx, { entityType: 'membership', entityId: userId, action: 'removed', details: { previous: current.role } })
  await emit(ctx, 'project.members-changed', userId, p.revision)
}
