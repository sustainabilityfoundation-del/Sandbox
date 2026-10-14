import { createHash, randomUUID } from 'node:crypto'
import type { RequirementCreateDto, RequirementDto, RequirementListQueryDto, RequirementPatchDto } from '../http/schemas'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { KEY_PREFIX, PRIORITIES, STATUSES, VERIFICATION_METHODS, formatKey, roleAllows, type LifecycleStatus, type Role } from '../domain/rules'
import { getConventions, listAttributeDefinitions, validateAttributeValues } from './attributes'
import { addNode } from './collections'
import { audit, emit, isUuid, isoRequired, type Ctx, type Queryable } from './context'

/** Fields of a revision; changing any of them creates a new immutable revision. */
export const CONTENT_FIELDS = ['title', 'statement', 'statementXhtml', 'rationale', 'type', 'source', 'owner', 'priority', 'applicability', 'verificationMethods', 'acceptanceCriteria', 'attributes'] as const
export type ContentField = (typeof CONTENT_FIELDS)[number]

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  status: LifecycleStatus
  archived: boolean
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  title: string
  statement: string
  statement_xhtml: string | null
  rationale: string
  type: string
  source: string
  owner: string | null
  priority: RequirementDto['priority']
  applicability: string[]
  verification_methods: string[]
  acceptance_criteria: string
  attributes: Record<string, string | number | boolean | string[]>
  status_at_creation: LifecycleStatus
  change_reason: string
  rev_created_at: Date
  rev_created_by: string
  legacy_ids: string[] | null
  open_review_id: string | null
  /** For historical reads. */
  status_of_revision?: LifecycleStatus | null
  baseline_status?: LifecycleStatus | null
  baseline_archived?: boolean | null
  baseline_key?: string | null
}

const SELECT = `
  SELECT r.id, r.project_id, r.key, r.current_revision, r.status, r.archived, r.created_at, r.created_by, r.updated_at, r.updated_by,
         v.revision, v.title, v.statement, v.statement_xhtml, v.rationale, v.type, v.source, v.owner, v.priority, v.applicability,
         v.verification_methods, v.acceptance_criteria, v.attributes, v.status_at_creation, v.change_reason,
         v.created_at AS rev_created_at, v.created_by AS rev_created_by,
         (SELECT array_agg(a.alias ORDER BY a.alias) FROM requirements.requirement_aliases a WHERE a.requirement_id = r.id) AS legacy_ids,
         (SELECT rv.id FROM requirements.reviews rv WHERE rv.requirement_id = r.id AND rv.state = 'open') AS open_review_id`

function toDto(row: Row, baselineId?: string): RequirementDto {
  const historical = row.revision !== row.current_revision
  const status = row.baseline_status ?? (historical ? (row.status_of_revision ?? row.status_at_creation) : row.status)
  return {
    id: row.id,
    key: row.baseline_key ?? row.key,
    projectId: row.project_id,
    revision: row.revision,
    title: row.title,
    statement: row.statement,
    statementXhtml: row.statement_xhtml,
    rationale: row.rationale,
    type: row.type,
    source: row.source,
    owner: row.owner,
    priority: row.priority,
    status,
    archived: row.baseline_archived ?? row.archived,
    applicability: row.applicability,
    verificationMethods: row.verification_methods,
    acceptanceCriteria: row.acceptance_criteria,
    attributes: row.attributes,
    legacyIds: row.legacy_ids ?? [],
    changeReason: row.change_reason,
    revisionCreatedAt: isoRequired(row.rev_created_at),
    revisionCreatedBy: row.rev_created_by,
    createdAt: isoRequired(row.created_at),
    createdBy: row.created_by,
    updatedAt: isoRequired(historical || baselineId ? row.rev_created_at : row.updated_at),
    updatedBy: historical || baselineId ? row.rev_created_by : row.updated_by,
    openReviewId: historical || baselineId ? null : row.open_review_id,
    ...(baselineId ? { baselineId } : {}),
  }
}

export interface ReadScope {
  revision?: number
  baselineId?: string
}

export async function getRequirement(db: Queryable, projectId: string, id: string, scope: ReadScope = {}): Promise<RequirementDto | undefined> {
  if (!isUuid(id)) return undefined
  if (scope.baselineId) {
    if (!isUuid(scope.baselineId)) return undefined
    const { rows } = await db.query<Row>(
      `${SELECT}, b.status AS baseline_status, b.archived AS baseline_archived, b.key AS baseline_key
       FROM requirements.baseline_requirements b
       JOIN requirements.requirements r ON r.id = b.requirement_id
       JOIN requirements.requirement_revisions v ON v.requirement_id = b.requirement_id AND v.revision = b.revision
       WHERE b.baseline_id = $1 AND r.id = $2 AND r.project_id = $3`,
      [scope.baselineId, id, projectId],
    )
    return rows[0] ? toDto(rows[0], scope.baselineId) : undefined
  }
  const { rows } = await db.query<Row>(
    `${SELECT},
       (SELECT le.to_status FROM requirements.lifecycle_events le WHERE le.requirement_id = r.id AND le.revision = v.revision ORDER BY le.occurred_at DESC, le.id DESC LIMIT 1) AS status_of_revision
     FROM requirements.requirements r
     JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = ${scope.revision ? '$3' : 'r.current_revision'}
     WHERE r.id = $1 AND r.project_id = $2`,
    scope.revision ? [id, projectId, scope.revision] : [id, projectId],
  )
  return rows[0] ? toDto(rows[0]) : undefined
}

export async function requireRequirement(db: Queryable, projectId: string, id: string, scope: ReadScope = {}): Promise<RequirementDto> {
  const r = await getRequirement(db, projectId, id, scope)
  if (!r) throw notFound(scope.revision ? `Requirement ${id} has no revision ${scope.revision}.` : scope.baselineId ? `Requirement ${id} is not in baseline ${scope.baselineId}.` : `Requirement ${id} not found.`)
  return r
}

/** A key or a legacy twin ID (alias) → canonical ID. */
export async function resolveId(db: Queryable, projectId: string, keyOrAlias: string): Promise<string | undefined> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM requirements.requirements WHERE project_id = $1 AND key = $2
     UNION ALL SELECT requirement_id FROM requirements.requirement_aliases WHERE project_id = $1 AND alias = $2 LIMIT 1`,
    [projectId, keyOrAlias],
  )
  return rows[0]?.id
}

// ---- listing ------------------------------------------------------------------------------------------

const csv = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])

/** Turns free text into a prefix tsquery ("act load" → act:* & load:*), or null. */
export function prefixQuery(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu)
  if (!words?.length) return null
  return words.slice(0, 12).map((w) => `${w}:*`).join(' & ')
}

interface Cursor {
  h: string
  v: (string | number)[]
}

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decodeCursor(s: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Cursor
    if (typeof c.h !== 'string' || !Array.isArray(c.v)) throw new Error()
    return c
  } catch {
    throw invalid('The cursor is not valid.', { cursor: 'malformed' }, 400)
  }
}

export async function listRequirements(db: Queryable, projectId: string, q: RequirementListQueryDto): Promise<{ items: RequirementDto[]; nextCursor?: string; total: number }> {
  const limit = q.limit ?? 50
  if (limit < 1 || limit > 200) throw invalid('limit must be between 1 and 200.', { limit: '1–200' }, 400)
  const sort = q.sort ?? 'key'
  const params: unknown[] = [projectId]
  const p = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }
  const where: string[] = ['r.project_id = $1']
  const baseline = q.baselineId
  if (baseline && !isUuid(baseline)) throw invalid('baselineId must be a UUID.', { baselineId: 'uuid' }, 400)
  const from = baseline
    ? `FROM requirements.baseline_requirements b
       JOIN requirements.requirements r ON r.id = b.requirement_id
       JOIN requirements.requirement_revisions v ON v.requirement_id = b.requirement_id AND v.revision = b.revision`
    : `FROM requirements.requirements r JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision`
  if (baseline) where.push(`b.baseline_id = ${p(baseline)}`)
  const keyExpr = baseline ? 'b.key' : 'r.key'
  const statusExpr = baseline ? 'b.status' : 'r.status'
  const archivedExpr = baseline ? 'b.archived' : 'r.archived'
  if (!q.includeArchived) where.push(`NOT ${archivedExpr}`)
  const statuses = csv(q.status)
  if (statuses.some((s) => !STATUSES.includes(s as LifecycleStatus))) throw invalid('Unknown status filter.', { status: STATUSES.join(', ') }, 400)
  if (statuses.length) where.push(`${statusExpr} = ANY(${p(statuses)})`)
  const types = csv(q.type)
  if (types.length) where.push(`v.type = ANY(${p(types)})`)
  const priorities = csv(q.priority)
  if (priorities.length) where.push(`v.priority = ANY(${p(priorities)})`)
  if (q.owner) where.push(`v.owner = ${p(q.owner)}`)
  const ids = csv(q.ids)
  if (ids.some((i) => !isUuid(i))) throw invalid('ids must be UUIDs.', { ids: 'uuid list' }, 400)
  if (ids.length) where.push(`r.id = ANY(${p(ids)}::uuid[])`)
  const keys = csv(q.keys)
  if (keys.length) where.push(`(${keyExpr} = ANY(${p(keys)}) OR EXISTS (SELECT 1 FROM requirements.requirement_aliases a WHERE a.requirement_id = r.id AND a.alias = ANY($${params.length})))`)
  if (q.configurationId) where.push(`(cardinality(v.applicability) = 0 OR ${p(q.configurationId)} = ANY(v.applicability))`)
  if (q.collectionId) {
    if (!isUuid(q.collectionId)) throw invalid('collectionId must be a UUID.', { collectionId: 'uuid' }, 400)
    where.push(
      baseline
        ? `EXISTS (SELECT 1 FROM requirements.baseline_collection_nodes n WHERE n.baseline_id = b.baseline_id AND n.collection_id = ${p(q.collectionId)} AND n.requirement_id = r.id)`
        : `EXISTS (SELECT 1 FROM requirements.collection_nodes n WHERE n.collection_id = ${p(q.collectionId)} AND n.requirement_id = r.id)`,
    )
  }
  if (q.allocatedTo) {
    where.push(
      baseline
        ? `EXISTS (SELECT 1 FROM requirements.baseline_relationships br JOIN requirements.relationship_revisions rr ON rr.relationship_id = br.relationship_id AND rr.revision = br.revision
                   JOIN requirements.relationships rel ON rel.id = br.relationship_id
                   WHERE br.baseline_id = b.baseline_id AND rel.from_requirement_id = r.id AND rel.type = 'allocated-to' AND NOT rr.deleted AND rel.to_twin_id = ANY(${p(csv(q.allocatedTo))}))`
        : `EXISTS (SELECT 1 FROM requirements.relationships rel WHERE rel.from_requirement_id = r.id AND rel.type = 'allocated-to' AND NOT rel.deleted AND rel.to_twin_id = ANY(${p(csv(q.allocatedTo))}))`,
    )
  }
  if (q.text?.trim()) {
    const tsq = prefixQuery(q.text)
    const like = p(`${q.text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    where.push(tsq ? `(v.search_document @@ to_tsquery('simple', ${p(tsq)}) OR ${keyExpr} ILIKE ${like})` : `${keyExpr} ILIKE ${like}`)
  }
  const filterHash = createHash('sha256').update(JSON.stringify({ ...q, cursor: undefined, limit: undefined })).digest('hex').slice(0, 16)
  const prefixExpr = `regexp_replace(${keyExpr}, '[0-9]+$', '')`
  const numExpr = `coalesce(substring(${keyExpr} from '([0-9]+)$')::bigint, 0)`
  const order = sort === 'key' ? `${prefixExpr}, ${numExpr}, ${keyExpr}, r.id` : `v.created_at DESC, r.id DESC`
  const whereSql = where.join(' AND ')
  const total = Number((await db.query<{ n: string }>(`SELECT count(*) AS n ${from} WHERE ${whereSql}`, params)).rows[0].n)
  const pageWhere = [...where]
  if (q.cursor) {
    const c = decodeCursor(q.cursor)
    if (c.h !== filterHash) throw invalid('The cursor belongs to a different query.', { cursor: 'query changed' }, 400)
    if (sort === 'key') pageWhere.push(`(${prefixExpr}, ${numExpr}, ${keyExpr}, r.id) > (${p(c.v[0])}, ${p(c.v[1])}::bigint, ${p(c.v[2])}, ${p(c.v[3])}::uuid)`)
    else pageWhere.push(`(v.created_at, r.id) < (${p(c.v[0])}::timestamptz, ${p(c.v[1])}::uuid)`)
  }
  const extra = baseline ? ', b.status AS baseline_status, b.archived AS baseline_archived, b.key AS baseline_key' : ''
  const { rows } = await db.query<Row & { sort_prefix: string; sort_num: string; sort_key: string }>(
    `${SELECT}${extra}, ${prefixExpr} AS sort_prefix, ${numExpr} AS sort_num, ${keyExpr} AS sort_key
     ${from} WHERE ${pageWhere.join(' AND ')} ORDER BY ${order} LIMIT ${p(limit + 1)}`,
    params,
  )
  const pageRows = rows.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor({ h: filterHash, v: sort === 'key' ? [last.sort_prefix, Number(last.sort_num), last.sort_key, last.id] : [isoRequired(last.rev_created_at), last.id] })
      : undefined
  return { items: pageRows.map((r) => toDto(r, baseline)), nextCursor, total }
}

// ---- writes ---------------------------------------------------------------------------------------------

interface Content {
  title: string
  statement: string
  statementXhtml: string | null
  rationale: string
  type: string
  source: string
  owner: string | null
  priority: RequirementDto['priority']
  applicability: string[]
  verificationMethods: string[]
  acceptanceCriteria: string
  attributes: Record<string, string | number | boolean | string[] | null>
}

async function validateContent(ctx: Ctx, c: Content): Promise<Content> {
  const errors: Record<string, string> = {}
  const title = c.title.trim()
  if (!title) errors.title = 'required'
  const conventions = (await getConventions(ctx.db, ctx.projectId)).settings
  if (!conventions.requirementTypes.includes(c.type)) errors.type = `must be one of ${conventions.requirementTypes.join(', ')}`
  if (c.priority !== null && !(PRIORITIES as readonly string[]).includes(c.priority)) errors.priority = PRIORITIES.join(', ')
  const methods = [...new Set(c.verificationMethods)]
  if (methods.some((m) => !(VERIFICATION_METHODS as readonly string[]).includes(m))) errors.verificationMethods = `allowed: ${VERIFICATION_METHODS.join(', ')}`
  const applicability = [...new Set(c.applicability.map((a) => a.trim()).filter(Boolean))]
  if (applicability.some((a) => !/^[A-Za-z0-9_.:-]{1,100}$/.test(a))) errors.applicability = 'configuration IDs only'
  if (Object.keys(errors).length) throw invalid('The requirement is not valid.', errors)
  const defs = await listAttributeDefinitions(ctx.db, ctx.projectId)
  const attributes = validateAttributeValues(defs, c.attributes)
  return { ...c, title, statement: c.statement.trim(), rationale: c.rationale.trim(), source: c.source.trim(), acceptanceCriteria: c.acceptanceCriteria.trim(), verificationMethods: methods, applicability, attributes }
}

async function insertRevision(ctx: Ctx, id: string, revision: number, c: Content, status: LifecycleStatus, reason: string) {
  await ctx.db.query(
    `INSERT INTO requirements.requirement_revisions (requirement_id, revision, title, statement, statement_xhtml, rationale, type, source, owner, priority, applicability,
       verification_methods, acceptance_criteria, attributes, status_at_creation, change_reason, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, revision, c.title, c.statement, c.statementXhtml, c.rationale, c.type, c.source, c.owner, c.priority, c.applicability, c.verificationMethods, c.acceptanceCriteria, JSON.stringify(c.attributes), status, reason, ctx.now, ctx.actor],
  )
}

async function nextKey(ctx: Ctx, prefix = KEY_PREFIX): Promise<string> {
  for (;;) {
    const { rows } = await ctx.db.query<{ v: number }>(
      `INSERT INTO requirements.key_counters (project_id, prefix, next_value) VALUES ($1, $2, 2)
       ON CONFLICT (project_id, prefix) DO UPDATE SET next_value = requirements.key_counters.next_value + 1
       RETURNING next_value - 1 AS v`,
      [ctx.projectId, prefix],
    )
    const key = formatKey(prefix, rows[0].v)
    const taken = await ctx.db.query('SELECT 1 FROM requirements.requirements WHERE project_id = $1 AND key = $2', [ctx.projectId, key])
    if (!taken.rowCount) return key
  }
}

export interface CreateOptions {
  id?: string
  key?: string
  legacyIds?: string[]
  status?: LifecycleStatus
  statementXhtml?: string | null
  reason?: string
  /** Skip the outbox event (callers that emit their own, e.g. imports). */
  silent?: boolean
}

export async function createRequirement(ctx: Ctx, input: RequirementCreateDto, options: CreateOptions = {}): Promise<RequirementDto> {
  const conventions = (await getConventions(ctx.db, ctx.projectId)).settings
  const content = await validateContent(ctx, {
    title: input.title,
    statement: input.statement,
    statementXhtml: options.statementXhtml ?? null,
    rationale: input.rationale ?? '',
    type: input.type ?? (conventions.requirementTypes.includes('functional') ? 'functional' : conventions.requirementTypes[0]),
    source: input.source ?? '',
    owner: input.owner ?? null,
    priority: input.priority ?? null,
    applicability: input.applicability ?? [],
    verificationMethods: input.verificationMethods ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? '',
    attributes: input.attributes ?? {},
  })
  const id = options.id ?? randomUUID()
  const key = options.key ?? (await nextKey(ctx))
  const status = options.status ?? 'draft'
  const reason = (input.reason ?? options.reason ?? '').trim()
  await ctx.db.query(
    `INSERT INTO requirements.requirements (id, project_id, key, current_revision, status, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, $3, 1, $4, $5, $6, $5, $6)`,
    [id, ctx.projectId, key, status, ctx.now, ctx.actor],
  )
  await insertRevision(ctx, id, 1, content, status, reason)
  for (const alias of options.legacyIds ?? []) {
    await ctx.db.query(`INSERT INTO requirements.requirement_aliases (project_id, alias, requirement_id, kind) VALUES ($1, $2, $3, 'legacy-twin-id')`, [ctx.projectId, alias, id])
  }
  if (input.collectionId) {
    await addNode(ctx, input.collectionId, { kind: 'requirement', requirementId: id, parentId: input.parentNodeId ?? null }, null)
  }
  await audit(ctx, { entityType: 'requirement', entityId: id, action: 'created', revision: 1, reason, details: { key, title: content.title } })
  if (!options.silent) await emit(ctx, 'requirement.created', id, 1)
  return (await getRequirement(ctx.db, ctx.projectId, id))!
}

async function lockRequirement(ctx: Ctx, id: string): Promise<RequirementDto> {
  if (!isUuid(id)) throw notFound(`Requirement ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM requirements.requirements WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Requirement ${id} not found.`)
  return (await getRequirement(ctx.db, ctx.projectId, id))!
}

function checkRevision(current: RequirementDto, expected: number) {
  if (current.revision !== expected) throw conflict(`${current.key} changed since revision ${expected} (now ${current.revision}). Reload to see the newer change; nothing was overwritten.`, current.revision)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export interface UpdateOptions {
  reason?: string
  role: Role | null
  statementXhtml?: string | null
  silent?: boolean
}

/**
 * Applies a patch with optimistic concurrency. Content changes create a new revision; an in-review
 * or approved requirement returns to draft (its open review is superseded) so an approval always
 * refers to the revision that was approved. Returns the requirement and whether anything changed.
 */
export async function updateRequirement(ctx: Ctx, id: string, patch: RequirementPatchDto, expectedRevision: number, options: UpdateOptions): Promise<{ requirement: RequirementDto; changed: boolean }> {
  const current = await lockRequirement(ctx, id)
  checkRevision(current, expectedRevision)
  const reason = (patch.reason ?? options.reason ?? '').trim()
  let changed = false

  if (patch.key !== undefined && patch.key !== current.key) {
    if (!roleAllows(options.role, 'renumber')) throw forbidden('Only administrators change requirement keys.')
    const taken = await ctx.db.query('SELECT 1 FROM requirements.requirements WHERE project_id = $1 AND key = $2', [ctx.projectId, patch.key])
    if (taken.rowCount) throw conflict(`The key ${patch.key} is already used.`)
    await ctx.db.query('UPDATE requirements.requirements SET key = $3, record_version = record_version + 1, updated_at = $4, updated_by = $5 WHERE id = $1 AND project_id = $2', [id, ctx.projectId, patch.key, ctx.now, ctx.actor])
    await audit(ctx, { entityType: 'requirement', entityId: id, action: 'renumbered', revision: current.revision, reason, details: { from: current.key, to: patch.key } })
    changed = true
  }

  const merged: Content = {
    title: patch.title ?? current.title,
    statement: patch.statement ?? current.statement,
    statementXhtml: options.statementXhtml !== undefined ? options.statementXhtml : patch.statement !== undefined && patch.statement !== current.statement ? null : current.statementXhtml,
    rationale: patch.rationale ?? current.rationale,
    type: patch.type ?? current.type,
    source: patch.source ?? current.source,
    owner: patch.owner !== undefined ? patch.owner : current.owner,
    priority: patch.priority !== undefined ? patch.priority : current.priority,
    applicability: patch.applicability ?? current.applicability,
    verificationMethods: patch.verificationMethods ?? current.verificationMethods,
    acceptanceCriteria: patch.acceptanceCriteria ?? current.acceptanceCriteria,
    attributes: { ...current.attributes },
  }
  if (patch.attributes) {
    for (const [k, v] of Object.entries(patch.attributes)) {
      if (v === null) {
        const defs = await listAttributeDefinitions(ctx.db, ctx.projectId)
        const def = defs.find((d) => d.id === k || d.key === k)
        if (def) delete merged.attributes[def.id]
      } else (merged.attributes as Record<string, unknown>)[k] = v
    }
  }
  const content = await validateContent(ctx, merged)
  const contentChanged = CONTENT_FIELDS.some((f) => !same(content[f], (current as unknown as Record<string, unknown>)[f]))
  if (contentChanged) {
    if (current.archived) throw invalid(`${current.key} is archived. Restore it before editing.`)
    if (current.status === 'retired') throw invalid(`${current.key} is retired. Reinstate it before editing.`)
    const revision = current.revision + 1
    const backToDraft = current.status === 'in-review' || current.status === 'approved'
    await insertRevision(ctx, id, revision, content, backToDraft ? 'draft' : current.status, reason)
    await ctx.db.query(
      `UPDATE requirements.requirements SET current_revision = $3, status = $4, record_version = record_version + 1, updated_at = $5, updated_by = $6 WHERE id = $1 AND project_id = $2`,
      [id, ctx.projectId, revision, backToDraft ? 'draft' : current.status, ctx.now, ctx.actor],
    )
    if (backToDraft) {
      await ctx.db.query(`UPDATE requirements.reviews SET state = 'superseded', closed_at = $2, closed_by = $3 WHERE requirement_id = $1 AND state = 'open'`, [id, ctx.now, ctx.actor])
      await ctx.db.query(
        `INSERT INTO requirements.lifecycle_events (id, requirement_id, revision, from_status, to_status, actor, occurred_at, reason) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7)`,
        [randomUUID(), id, revision, current.status, ctx.actor, ctx.now, `Edited after ${current.status === 'approved' ? 'approval' : 'review request'}: the new revision needs review`],
      )
    }
    const fields = CONTENT_FIELDS.filter((f) => !same(content[f], (current as unknown as Record<string, unknown>)[f]))
    await audit(ctx, { entityType: 'requirement', entityId: id, action: 'revised', revision, reason, details: { fields, ...(backToDraft ? { status: { from: current.status, to: 'draft' } } : {}) } })
    changed = true
  }
  const requirement = (await getRequirement(ctx.db, ctx.projectId, id))!
  if (changed && !options.silent) await emit(ctx, 'requirement.updated', id, requirement.revision)
  return { requirement, changed }
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean, expectedRevision: number, reason = ''): Promise<RequirementDto> {
  const current = await lockRequirement(ctx, id)
  checkRevision(current, expectedRevision)
  if (current.archived === archived) return current
  await ctx.db.query(`UPDATE requirements.requirements SET archived = $3, record_version = record_version + 1, updated_at = $4, updated_by = $5 WHERE id = $1 AND project_id = $2`, [id, ctx.projectId, archived, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'requirement', entityId: id, action: archived ? 'archived' : 'restored', revision: current.revision, reason })
  await emit(ctx, archived ? 'requirement.archived' : 'requirement.restored', id, current.revision)
  return (await getRequirement(ctx.db, ctx.projectId, id))!
}

export async function recordLifecycle(ctx: Ctx, r: RequirementDto, to: LifecycleStatus, reason: string, reviewId: string | null) {
  await ctx.db.query(`UPDATE requirements.requirements SET status = $3, record_version = record_version + 1, updated_at = $4, updated_by = $5 WHERE id = $1 AND project_id = $2`, [r.id, ctx.projectId, to, ctx.now, ctx.actor])
  await ctx.db.query(
    `INSERT INTO requirements.lifecycle_events (id, requirement_id, revision, from_status, to_status, review_id, actor, occurred_at, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), r.id, r.revision, r.status, to, reviewId, ctx.actor, ctx.now, reason],
  )
  await audit(ctx, { entityType: 'requirement', entityId: r.id, action: 'status-changed', revision: r.revision, reason, details: { from: r.status, to, reviewId } })
  await emit(ctx, 'requirement.updated', r.id, r.revision)
}

export async function transition(ctx: Ctx, id: string, action: 'request-review' | 'withdraw' | 'reopen' | 'retire' | 'reinstate', expectedRevision: number, role: Role | null, reason = '', note = ''): Promise<RequirementDto> {
  const current = await lockRequirement(ctx, id)
  checkRevision(current, expectedRevision)
  if (current.archived) throw invalid(`${current.key} is archived. Restore it first.`)
  const need = { 'request-review': 'request-review', withdraw: 'request-review', reopen: 'author', retire: 'retire', reinstate: 'retire' } as const
  if (!roleAllows(role, need[action])) throw forbidden(`Your role (${role ?? 'none'}) may not ${action.replace('-', ' ')} requirements.`)
  const allowed: Record<typeof action, LifecycleStatus[]> = { 'request-review': ['draft'], withdraw: ['in-review'], reopen: ['approved'], retire: ['draft', 'approved'], reinstate: ['retired'] }
  if (!allowed[action].includes(current.status)) throw conflict(`${current.key} is ${current.status}; “${action}” applies to ${allowed[action].join(' or ')} requirements.`, current.revision, { status: current.status })
  if (action === 'request-review') {
    if (!current.statement.trim()) throw invalid(`${current.key} has no statement to review.`, { statement: 'required for review' })
    const reviewId = randomUUID()
    await ctx.db.query(
      `INSERT INTO requirements.reviews (id, project_id, requirement_id, requirement_revision, state, requested_by, requested_at, note) VALUES ($1,$2,$3,$4,'open',$5,$6,$7)`,
      [reviewId, ctx.projectId, id, current.revision, ctx.actor, ctx.now, note || reason],
    )
    await audit(ctx, { entityType: 'review', entityId: reviewId, action: 'requested', revision: current.revision, reason, details: { requirementId: id } })
    await recordLifecycle(ctx, current, 'in-review', reason || 'Review requested', reviewId)
  } else if (action === 'withdraw') {
    const { rows } = await ctx.db.query<{ id: string }>(`UPDATE requirements.reviews SET state = 'withdrawn', closed_at = $2, closed_by = $3 WHERE requirement_id = $1 AND state = 'open' RETURNING id`, [id, ctx.now, ctx.actor])
    await recordLifecycle(ctx, current, 'draft', reason || 'Review withdrawn', rows[0]?.id ?? null)
  } else {
    const to: LifecycleStatus = action === 'retire' ? 'retired' : 'draft'
    await recordLifecycle(ctx, current, to, reason || (action === 'retire' ? 'Retired' : action === 'reinstate' ? 'Reinstated' : 'Reopened'), null)
  }
  return (await getRequirement(ctx.db, ctx.projectId, id))!
}

// ---- history ---------------------------------------------------------------------------------------------

export async function listRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; title: string; change_reason: string; created_at: Date; created_by: string; status_at_creation: LifecycleStatus }>(
    `SELECT v.revision, v.title, v.change_reason, v.created_at, v.created_by, v.status_at_creation FROM requirements.requirement_revisions v
     JOIN requirements.requirements r ON r.id = v.requirement_id WHERE r.id = $1 AND r.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({ revision: r.revision, title: r.title, changeReason: r.change_reason, createdAt: isoRequired(r.created_at), createdBy: r.created_by, statusAtCreation: r.status_at_creation }))
}

export function compareRequirements(a: RequirementDto, b: RequirementDto) {
  const fields = [...CONTENT_FIELDS, 'status', 'archived', 'key'] as const
  return fields.filter((f) => !same((a as unknown as Record<string, unknown>)[f], (b as unknown as Record<string, unknown>)[f])).map((f) => ({ field: f, from: (a as unknown as Record<string, unknown>)[f], to: (b as unknown as Record<string, unknown>)[f] }))
}

export async function listHistory(db: Queryable, projectId: string, entityId: string, limit = 200) {
  const { rows } = await db.query<{ id: string; entity_type: string; entity_id: string; action: string; revision: number | null; actor: string; occurred_at: Date; reason: string; details: Record<string, unknown> }>(
    `SELECT id::text, entity_type, entity_id, action, revision, actor, occurred_at, reason, details FROM requirements.audit_events
     WHERE project_id = $1 AND (entity_id = $2 OR details->>'requirementId' = $2 OR details->>'fromId' = $2 OR details->>'toRequirementId' = $2)
     ORDER BY id DESC LIMIT $3`,
    [projectId, entityId, limit],
  )
  return rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, action: r.action, revision: r.revision, actor: r.actor, occurredAt: isoRequired(r.occurred_at), reason: r.reason, details: r.details }))
}

export async function listLifecycle(db: Queryable, id: string) {
  const { rows } = await db.query<{ id: string; revision: number; from_status: LifecycleStatus; to_status: LifecycleStatus; review_id: string | null; actor: string; occurred_at: Date; reason: string }>(
    'SELECT * FROM requirements.lifecycle_events WHERE requirement_id = $1 ORDER BY occurred_at DESC, id',
    [id],
  )
  return rows.map((r) => ({ id: r.id, revision: r.revision, fromStatus: r.from_status, toStatus: r.to_status, reviewId: r.review_id, actor: r.actor, occurredAt: isoRequired(r.occurred_at), reason: r.reason }))
}

