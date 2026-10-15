import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound, ServiceError } from '../errors'
import { PRIORITIES, WORK_ITEM_KINDS, WORK_ITEM_PREFIX, WORK_ITEM_STATUSES, riskScore, workItemStatusProblem, type IssueDetails, type Priority, type RiskDetails, type WorkItemKind } from '../domain/rules'
import { audit, emit, isoRequired, isUuid, nextKey, type Ctx } from './context'
import { registerOwn } from './artifacts'
import { linkSubjects } from './links'

/** Tasks, issues and risks (lifecycle-and-persistence.md §4). Every change creates an immutable revision. */
interface WorkItemRow {
  id: string
  project_id: string
  key: string
  kind: WorkItemKind
  title: string
  description: string
  status: string
  priority: Priority
  assignee_id: string | null
  due: string | null
  milestone_id: string | null
  details: { risk?: RiskDetails; issue?: IssueDetails; statusNote?: string }
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  source_kind: string
}

const COLUMNS = `id, project_id, key, kind, title, description, status, priority, assignee_id, due::text AS due, milestone_id, details, revision, created_at, created_by, updated_at, updated_by, source_kind`

export function workItemJson(r: WorkItemRow, extra: { artifactId?: string; subjects?: string[] } = {}) {
  return {
    id: r.id,
    projectId: r.project_id,
    key: r.key,
    kind: r.kind,
    title: r.title,
    description: r.description,
    status: r.status,
    closed: WORK_ITEM_STATUSES[r.kind].closed.includes(r.status),
    priority: r.priority,
    ...(r.assignee_id ? { assigneeId: r.assignee_id } : {}),
    ...(r.due ? { due: r.due } : {}),
    ...(r.milestone_id ? { milestoneId: r.milestone_id } : {}),
    ...(r.details.risk ? { risk: { ...r.details.risk, score: riskScore(r.details.risk) } } : {}),
    ...(r.details.issue ? { issue: r.details.issue } : {}),
    ...(r.details.statusNote ? { statusNote: r.details.statusNote } : {}),
    ...(extra.artifactId ? { artifactId: extra.artifactId } : {}),
    subjects: extra.subjects ?? [],
    sourceKind: r.source_kind,
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
    updatedBy: r.updated_by,
    revision: r.revision,
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface WorkItemInput {
  kind: WorkItemKind
  title: string
  description?: string
  status?: string
  statusNote?: string
  priority?: Priority
  assigneeId?: string | null
  due?: string | null
  milestoneId?: string | null
  risk?: Partial<RiskDetails>
  issue?: Partial<IssueDetails>
  /** Artifact IDs the work item concerns (`subject-of` links, same transaction). */
  subjects?: string[]
}

function checkRisk(r: Partial<RiskDetails> | undefined): RiskDetails | undefined {
  if (!r) return undefined
  const likelihood = r.likelihood ?? 3
  const impact = r.impact ?? 3
  for (const [name, v] of [['likelihood', likelihood], ['impact', impact]] as const) if (!Number.isInteger(v) || v < 1 || v > 5) throw invalid(`Risk ${name} is a whole number from 1 to 5.`, { [`risk.${name}`]: 'range' })
  const response = r.response ?? 'mitigate'
  if (!['avoid', 'mitigate', 'transfer', 'accept'].includes(response)) throw invalid('Risk response is avoid, mitigate, transfer or accept.', { 'risk.response': 'unknown' })
  return { likelihood, impact, mitigation: r.mitigation ?? '', response }
}

function checkIssue(i: Partial<IssueDetails> | undefined): IssueDetails | undefined {
  if (!i) return undefined
  const severity = i.severity ?? 'major'
  if (!['minor', 'major', 'critical'].includes(severity)) throw invalid('Issue severity is minor, major or critical.', { 'issue.severity': 'unknown' })
  return { severity, ...(i.detectedIn ? { detectedIn: i.detectedIn } : {}), ...(i.resolution ? { resolution: i.resolution } : {}) }
}

async function checkRefs(ctx: Ctx, input: { assigneeId?: string | null; milestoneId?: string | null; due?: string | null }) {
  if (input.due && !DATE.test(input.due)) throw invalid('Due date as YYYY-MM-DD.', { due: 'format' })
  if (input.milestoneId) {
    if (!isUuid(input.milestoneId)) throw invalid('Unknown milestone.', { milestoneId: 'unknown' })
    const m = await ctx.db.query('SELECT 1 FROM projects.milestones WHERE id = $1 AND project_id = $2', [input.milestoneId, ctx.projectId])
    if (!m.rowCount) throw invalid('Unknown milestone.', { milestoneId: 'unknown' })
  }
  if (input.assigneeId) {
    const members = await ctx.services.memberships.list(ctx.db, ctx.projectId)
    if (!members.some((m) => m.userId === input.assigneeId)) throw invalid(`${input.assigneeId} is not a member of this project.`, { assigneeId: 'not a member' })
  }
}

async function register(ctx: Ctx, w: WorkItemRow) {
  const closed = WORK_ITEM_STATUSES[w.kind].closed.includes(w.status)
  return registerOwn(ctx, { kind: w.kind, nativeId: w.id, category: 'work-item', key: w.key, title: w.title, lifecycle: closed ? 'retired' : 'working', moduleState: w.status, version: w.revision })
}

async function snapshot(ctx: Ctx, w: WorkItemRow) {
  await ctx.db.query('INSERT INTO projects.work_item_revisions (work_item_id, revision, snapshot, changed_at, changed_by) VALUES ($1,$2,$3,$4,$5)', [w.id, w.revision, JSON.stringify(workItemJson(w)), ctx.now, ctx.actor])
}

export async function createWorkItem(ctx: Ctx, input: WorkItemInput) {
  if (!WORK_ITEM_KINDS.includes(input.kind)) throw invalid('Kind is task, issue or risk.', { kind: 'unknown' })
  if (!input.title?.trim()) throw invalid('A title is required.', { title: 'required' })
  if (input.priority && !PRIORITIES.includes(input.priority)) throw invalid('Unknown priority.', { priority: 'unknown' })
  await checkRefs(ctx, input)
  const status = input.status ?? WORK_ITEM_STATUSES[input.kind].initial
  const problem = workItemStatusProblem({ kind: input.kind, to: status, role: ctx.role, rationale: input.statusNote, issueResolution: input.issue?.resolution })
  if (problem) throw new ServiceError(problem.code, problem.message)
  const details = {
    ...(input.kind === 'risk' ? { risk: checkRisk(input.risk ?? {}) } : {}),
    ...(input.kind === 'issue' ? { issue: checkIssue(input.issue ?? {}) } : {}),
    ...(input.statusNote ? { statusNote: input.statusNote } : {}),
  }
  const id = randomUUID()
  const key = await nextKey(ctx, WORK_ITEM_PREFIX[input.kind], 'work_items')
  const p = ctx.provenance
  const { rows } = await ctx.db.query<WorkItemRow>(
    `INSERT INTO projects.work_items (id, project_id, key, kind, title, description, status, priority, assignee_id, due, milestone_id, details, created_at, created_by, updated_at, updated_by, source_kind, conversation_id, proposal_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$13,$14,$15,$16,$17) RETURNING ${COLUMNS}`,
    [id, ctx.projectId, key, input.kind, input.title.trim(), input.description ?? '', status, input.priority ?? 'medium', input.assigneeId ?? null, input.due ?? null, input.milestoneId ?? null, JSON.stringify(details), ctx.now, ctx.actor, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null],
  )
  const w = rows[0]
  await snapshot(ctx, w)
  const artifactId = await register(ctx, w)
  if (input.subjects?.length) await linkSubjects(ctx, artifactId, input.subjects)
  await audit(ctx, { entityType: 'work-item', entityId: id, action: 'created', revision: 1, details: { key, kind: input.kind } })
  await emit(ctx, 'work-item.created', id, 1)
  return workItemJson(w, { artifactId, subjects: [...new Set(input.subjects ?? [])] })
}

export async function loadWorkItem(ctx: Ctx, id: string, forUpdate = false): Promise<WorkItemRow> {
  if (!isUuid(id)) throw notFound(`No work item ${id}.`)
  const { rows } = await ctx.db.query<WorkItemRow>(`SELECT ${COLUMNS} FROM projects.work_items WHERE id = $1 AND project_id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [id, ctx.projectId])
  if (!rows[0]) throw notFound(`No work item ${id}.`)
  return rows[0]
}

async function subjectsOf(ctx: Ctx, artifactIds: string[]): Promise<Map<string, string[]>> {
  const { rows } = await ctx.db.query<{ from_artifact: string; to_artifact: string }>(
    `SELECT from_artifact, to_artifact FROM projects.links WHERE project_id = $1 AND type = 'subject-of' AND removed_at IS NULL AND from_artifact = ANY($2::uuid[]) ORDER BY created_at`,
    [ctx.projectId, artifactIds],
  )
  const map = new Map<string, string[]>()
  for (const r of rows) map.set(r.from_artifact, [...(map.get(r.from_artifact) ?? []), r.to_artifact])
  return map
}

export async function getWorkItem(ctx: Ctx, id: string) {
  const w = await loadWorkItem(ctx, id)
  const a = await ctx.db.query<{ id: string }>(`SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = 'projects' AND kind = $2 AND native_id = $3`, [ctx.projectId, w.kind, w.id])
  const artifactId = a.rows[0]?.id
  return workItemJson(w, { artifactId, subjects: artifactId ? ((await subjectsOf(ctx, [artifactId])).get(artifactId) ?? []) : [] })
}

export async function updateWorkItem(ctx: Ctx, id: string, expectedRevision: number, input: Partial<Omit<WorkItemInput, 'kind'>>) {
  const current = await loadWorkItem(ctx, id, true)
  if (current.revision !== expectedRevision) throw conflict(`${current.key} changed since revision ${expectedRevision} (now ${current.revision}). Reload and apply your change again.`, current.revision)
  if (input.title !== undefined && !input.title.trim()) throw invalid('A title is required.', { title: 'required' })
  if (input.priority && !PRIORITIES.includes(input.priority)) throw invalid('Unknown priority.', { priority: 'unknown' })
  await checkRefs(ctx, input)
  const details = { ...current.details }
  if (input.risk) {
    if (current.kind !== 'risk') throw invalid('Risk details apply to risks only.', { risk: 'not a risk' })
    details.risk = checkRisk({ ...current.details.risk, ...input.risk })
  }
  if (input.issue) {
    if (current.kind !== 'issue') throw invalid('Issue details apply to issues only.', { issue: 'not an issue' })
    details.issue = checkIssue({ ...current.details.issue, ...input.issue })
  }
  if (input.statusNote !== undefined) details.statusNote = input.statusNote
  if (input.status !== undefined && input.status !== current.status) {
    const problem = workItemStatusProblem({ kind: current.kind, to: input.status, role: ctx.role, rationale: input.statusNote, issueResolution: details.issue?.resolution })
    if (problem) throw new ServiceError(problem.code, problem.message)
    if (ctx.provenance.sourceKind === 'assistant' && current.kind === 'risk' && input.status === 'accepted') throw new ServiceError('forbidden', 'Accepting a risk is a person’s decision; the assistant may propose it but not apply it.')
  }
  const { rows } = await ctx.db.query<WorkItemRow>(
    `UPDATE projects.work_items SET title = coalesce($2, title), description = coalesce($3, description), status = coalesce($4, status), priority = coalesce($5, priority),
       assignee_id = CASE WHEN $6::boolean THEN $7 ELSE assignee_id END, due = CASE WHEN $8::boolean THEN $9::date ELSE due END,
       milestone_id = CASE WHEN $10::boolean THEN $11::uuid ELSE milestone_id END, details = $12,
       revision = revision + 1, updated_at = $13, updated_by = $14 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, input.title?.trim() ?? null, input.description ?? null, input.status ?? null, input.priority ?? null, input.assigneeId !== undefined, input.assigneeId ?? null, input.due !== undefined, input.due ?? null, input.milestoneId !== undefined, input.milestoneId ?? null, JSON.stringify(details), ctx.now, ctx.actor],
  )
  const w = rows[0]
  await snapshot(ctx, w)
  const artifactId = await register(ctx, w)
  if (input.subjects?.length) {
    const existing = (await subjectsOf(ctx, [artifactId])).get(artifactId) ?? []
    await linkSubjects(
      ctx,
      artifactId,
      input.subjects.filter((s) => !existing.includes(s)),
    )
  }
  await audit(ctx, { entityType: 'work-item', entityId: id, action: input.status && input.status !== current.status ? `status:${input.status}` : 'updated', revision: w.revision, details: { changed: Object.keys(input) } })
  await emit(ctx, 'work-item.updated', id, w.revision)
  return workItemJson(w, { artifactId, subjects: (await subjectsOf(ctx, [artifactId])).get(artifactId) ?? [] })
}

export async function listWorkItems(ctx: Ctx, query: { kind?: WorkItemKind; status?: string; open?: boolean; assignee?: string; priority?: string; milestone?: string; subject?: string; q?: string; sort?: string; limit?: number; cursor?: string }) {
  const sorts: Record<string, string> = { key: 'w.key', updated: 'w.updated_at', due: 'w.due', priority: "array_position(ARRAY['critical','high','medium','low'], w.priority)", title: 'lower(w.title)' }
  const sortKey = (query.sort ?? 'key').replace(/^-/, '')
  if (!sorts[sortKey]) throw invalid('Unknown sort. Use key, updated, due, priority or title.', { sort: 'unknown' })
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200)
  const offset = query.cursor ? Number.parseInt(Buffer.from(query.cursor, 'base64url').toString('utf8'), 10) : 0
  if (!Number.isInteger(offset) || offset < 0) throw invalid('Invalid cursor.', { cursor: 'malformed' })
  const params: unknown[] = [ctx.projectId]
  const where = ['w.project_id = $1']
  if (query.kind) where.push(`w.kind = $${params.push(query.kind)}`)
  if (query.status) where.push(`w.status = $${params.push(query.status)}`)
  if (query.open !== undefined) where.push(`${query.open ? 'NOT ' : ''}(w.status IN ('done','cancelled','closed','rejected','accepted'))`)
  if (query.assignee) where.push(`w.assignee_id = $${params.push(query.assignee)}`)
  if (query.priority) where.push(`w.priority = $${params.push(query.priority)}`)
  if (query.milestone) where.push(`w.milestone_id = $${params.push(query.milestone)}::uuid`)
  if (query.subject) where.push(`EXISTS (SELECT 1 FROM projects.links l WHERE l.from_artifact = a.id AND l.type = 'subject-of' AND l.removed_at IS NULL AND l.to_artifact = $${params.push(query.subject)}::uuid)`)
  if (query.q?.trim()) where.push(`(w.key ILIKE $${params.push(`%${query.q.trim()}%`)} OR w.title ILIKE $${params.length} OR w.description ILIKE $${params.length})`)
  const { rows } = await ctx.db.query<WorkItemRow & { artifact_id: string | null; total: string }>(
    `SELECT ${COLUMNS.split(', ').map((c) => (c.includes(' AS ') ? c.replace(/^(\w+)/, 'w.$1') : `w.${c}`)).join(', ')}, a.id AS artifact_id, count(*) OVER () AS total
     FROM projects.work_items w LEFT JOIN projects.artifacts a ON a.project_id = w.project_id AND a.module = 'projects' AND a.kind = w.kind AND a.native_id = w.id::text
     WHERE ${where.join(' AND ')} ORDER BY ${sorts[sortKey]} ${query.sort?.startsWith('-') ? 'DESC' : 'ASC'} NULLS LAST, w.key LIMIT ${limit + 1} OFFSET ${offset}`,
    params,
  )
  const page = rows.slice(0, limit)
  const subjects = await subjectsOf(ctx, page.map((r) => r.artifact_id).filter((x): x is string => !!x))
  return {
    items: page.map((r) => workItemJson(r, { artifactId: r.artifact_id ?? undefined, subjects: r.artifact_id ? (subjects.get(r.artifact_id) ?? []) : [] })),
    ...(rows.length > limit ? { nextCursor: Buffer.from(String(offset + limit)).toString('base64url') } : {}),
    total: Number(rows[0]?.total ?? 0),
  }
}

export async function workItemHistory(ctx: Ctx, id: string) {
  await loadWorkItem(ctx, id)
  const { rows } = await ctx.db.query<{ revision: number; snapshot: unknown; changed_at: Date; changed_by: string }>('SELECT * FROM projects.work_item_revisions WHERE work_item_id = $1 ORDER BY revision DESC', [id])
  return rows.map((r) => ({ revision: r.revision, changedAt: isoRequired(r.changed_at), changedBy: r.changed_by, snapshot: r.snapshot }))
}
