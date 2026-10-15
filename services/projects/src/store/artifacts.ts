import { randomUUID } from 'node:crypto'
import { ARTIFACT_CATEGORIES, ARTIFACT_LIFECYCLES, type ArtifactCategory, type ArtifactLifecycle } from '@ews/platform-sdk'
import { invalid, notFound } from '../errors'
import { emit, iso, isoRequired, isUuid, type Ctx } from './context'

/**
 * The artifact registry (ADR-0061): one record per artifact with a global UUID, mapped to the owning module's
 * native reference. Phase B registers Project Management's own entities (work items, milestones, documents) in
 * the same transaction as their change. Module artifacts arrive through ArtifactSource adapters (ADR-0062),
 * which is a later phase. Records are never deleted.
 */
export interface ArtifactRow {
  id: string
  project_id: string
  module: string
  kind: string
  native_id: string
  category: ArtifactCategory
  key: string
  title: string
  lifecycle: ArtifactLifecycle
  module_state: string | null
  version_value: string
  version_label: string | null
  version_at: Date
  container_id: string | null
  availability: 'available' | 'module-unavailable' | 'missing-in-module'
  source: string
  open_link: { toolId: string; params: Record<string, string> } | null
  created_at: Date
  created_by: string
  modified_at: Date
  modified_by: string
  confirmed_at: Date
  revision: number
}

export function artifactJson(r: ArtifactRow) {
  return {
    artifactId: r.id,
    projectId: r.project_id,
    ref: { module: r.module, kind: r.kind, id: r.native_id },
    key: r.key,
    title: r.title,
    kind: r.kind,
    category: r.category,
    ownerModule: r.module,
    lifecycle: r.lifecycle,
    ...(r.module_state ? { moduleState: r.module_state } : {}),
    version: { value: /^\d+$/.test(r.version_value) ? Number(r.version_value) : r.version_value, ...(r.version_label ? { label: r.version_label } : {}), at: isoRequired(r.version_at) },
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    modifiedAt: isoRequired(r.modified_at),
    modifiedBy: r.modified_by,
    confirmedAt: isoRequired(r.confirmed_at),
    availability: r.availability,
    source: r.source,
    ...(r.container_id ? { containerId: r.container_id } : {}),
    ...(r.open_link ? { open: r.open_link } : {}),
    revision: r.revision,
  }
}

export type ArtifactJson = ReturnType<typeof artifactJson>

export interface OwnArtifact {
  kind: 'task' | 'issue' | 'risk' | 'milestone' | 'document'
  nativeId: string
  category: ArtifactCategory
  key: string
  title: string
  lifecycle: ArtifactLifecycle
  moduleState: string
  version: number
}

/** Registers or updates one of Project Management's own entities in the registry (same transaction). Returns the artifact ID. */
export async function registerOwn(ctx: Ctx, a: OwnArtifact): Promise<string> {
  const existing = await ctx.db.query<{ id: string; revision: number }>(
    `SELECT id, revision FROM projects.artifacts WHERE project_id = $1 AND module = 'projects' AND kind = $2 AND native_id = $3 FOR UPDATE`,
    [ctx.projectId, a.kind, a.nativeId],
  )
  let id: string
  let revision: number
  if (existing.rows[0]) {
    id = existing.rows[0].id
    const { rows } = await ctx.db.query<{ revision: number }>(
      `UPDATE projects.artifacts SET key = $2, title = $3, lifecycle = $4, module_state = $5, version_value = $6, version_at = $7, modified_at = $7, modified_by = $8, confirmed_at = $7, revision = revision + 1 WHERE id = $1 RETURNING revision`,
      [id, a.key, a.title, a.lifecycle, a.moduleState, String(a.version), ctx.now, ctx.actor],
    )
    revision = rows[0].revision
    await emit(ctx, 'artifact.updated', id, revision)
  } else {
    id = randomUUID()
    revision = 1
    await ctx.db.query(
      `INSERT INTO projects.artifacts (id, project_id, module, kind, native_id, category, key, title, lifecycle, module_state, version_value, version_at, source, open_link, created_at, created_by, modified_at, modified_by, confirmed_at)
       VALUES ($1,$2,'projects',$3,$4,$5,$6,$7,$8,$9,$10,$11,'projects',$12,$11,$13,$11,$13,$11)`,
      [id, ctx.projectId, a.kind, a.nativeId, a.category, a.key, a.title, a.lifecycle, a.moduleState, String(a.version), ctx.now, JSON.stringify({ toolId: 'projects', params: { kind: a.kind, id: a.nativeId } }), ctx.actor],
    )
    await emit(ctx, 'artifact.registered', id, 1)
  }
  await ctx.db.query(
    `INSERT INTO projects.artifact_observations (artifact_id, record_revision, version_value, lifecycle, availability, observed_at, via, actor) VALUES ($1,$2,$3,$4,'available',$5,'projects',$6)`,
    [id, revision, String(a.version), a.lifecycle, ctx.now, ctx.actor],
  )
  return id
}

export async function artifactIdOf(ctx: Ctx, kind: string, nativeId: string): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(`SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = 'projects' AND kind = $2 AND native_id = $3`, [ctx.projectId, kind, nativeId])
  if (!rows[0]) throw notFound(`No registry entry for ${kind} ${nativeId}.`)
  return rows[0].id
}

export async function loadArtifact(ctx: Ctx, artifactId: string): Promise<ArtifactRow> {
  if (!isUuid(artifactId)) throw notFound(`No artifact ${artifactId} in this project.`)
  const { rows } = await ctx.db.query<ArtifactRow>('SELECT * FROM projects.artifacts WHERE id = $1 AND project_id = $2', [artifactId, ctx.projectId])
  if (!rows[0]) throw notFound(`No artifact ${artifactId} in this project.`)
  return rows[0]
}

export interface ListArtifactsQuery {
  q?: string
  module?: string
  kind?: string
  category?: string
  lifecycle?: string
  availability?: string
  sort?: string
  limit?: number
  cursor?: string
}

export async function listArtifacts(ctx: Ctx, query: ListArtifactsQuery) {
  if (query.category && !(ARTIFACT_CATEGORIES as string[]).includes(query.category)) throw invalid('Unknown category.', { category: 'unknown' })
  if (query.lifecycle && !(ARTIFACT_LIFECYCLES as string[]).includes(query.lifecycle)) throw invalid('Unknown lifecycle.', { lifecycle: 'unknown' })
  const sorts: Record<string, string> = { title: 'lower(title)', key: 'key', modified: 'modified_at', created: 'created_at' }
  const sortKey = (query.sort ?? 'title').replace(/^-/, '')
  if (!sorts[sortKey]) throw invalid('Unknown sort. Use title, key, modified or created.', { sort: 'unknown' })
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const offset = query.cursor ? Number.parseInt(Buffer.from(query.cursor, 'base64url').toString('utf8'), 10) : 0
  if (!Number.isInteger(offset) || offset < 0) throw invalid('Invalid cursor.', { cursor: 'malformed' })
  const params: unknown[] = [ctx.projectId]
  const where = ['project_id = $1']
  for (const [col, v] of [['module', query.module], ['kind', query.kind], ['category', query.category], ['lifecycle', query.lifecycle], ['availability', query.availability]] as const) {
    if (v) where.push(`${col} = $${params.push(v)}`)
  }
  if (query.q?.trim()) where.push(`(key ILIKE $${params.push(`%${query.q.trim()}%`)} OR title ILIKE $${params.length})`)
  const { rows } = await ctx.db.query<ArtifactRow & { total: string }>(
    `SELECT *, count(*) OVER () AS total FROM projects.artifacts WHERE ${where.join(' AND ')} ORDER BY ${sorts[sortKey]} ${query.sort?.startsWith('-') ? 'DESC' : 'ASC'}, id LIMIT ${limit + 1} OFFSET ${offset}`,
    params,
  )
  return {
    items: rows.slice(0, limit).map(artifactJson),
    ...(rows.length > limit ? { nextCursor: Buffer.from(String(offset + limit)).toString('base64url') } : {}),
    total: Number(rows[0]?.total ?? 0),
  }
}

export async function artifactHistory(ctx: Ctx, artifactId: string) {
  await loadArtifact(ctx, artifactId)
  const { rows } = await ctx.db.query<{ record_revision: number; version_value: string; lifecycle: string; availability: string; observed_at: Date; via: string; actor: string }>(
    'SELECT * FROM projects.artifact_observations WHERE artifact_id = $1 ORDER BY id DESC',
    [artifactId],
  )
  return rows.map((r) => ({ recordRevision: r.record_revision, version: r.version_value, lifecycle: r.lifecycle, availability: r.availability, observedAt: iso(r.observed_at), via: r.via, actor: r.actor }))
}
