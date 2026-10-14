import { randomUUID } from 'node:crypto'
import { notFound } from '../errors'
import { audit, isUuid, iso, isoRequired, type Ctx, type Queryable } from './context'

/** Exchange sources, external ID mappings (keyed by source) and import/export jobs. */

export interface MappingRow {
  source_id: string
  external_kind: string
  external_id: string
  internal_kind: string
  internal_id: string | null
  external_last_change: Date | null
  internal_revision: number | null
  preserved: Record<string, unknown> | null
}

export async function findSource(db: Queryable, projectId: string, format: 'reqif' | 'json', sourceKey: string) {
  const { rows } = await db.query<{ id: string; name: string; source_key: string }>('SELECT id, name, source_key FROM requirements.exchange_sources WHERE project_id = $1 AND format = $2 AND source_key = $3', [projectId, format, sourceKey])
  return rows[0]
}

export async function ensureSource(ctx: Ctx, format: 'reqif' | 'json', sourceKey: string, name: string): Promise<string> {
  const found = await findSource(ctx.db, ctx.projectId, format, sourceKey)
  if (found) return found.id
  const id = randomUUID()
  await ctx.db.query('INSERT INTO requirements.exchange_sources (id, project_id, format, source_key, name, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, ctx.projectId, format, sourceKey, name, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'import', entityId: id, action: 'source-created', details: { format, sourceKey, name } })
  return id
}

export async function mappingsOf(db: Queryable, sourceId: string): Promise<MappingRow[]> {
  return (await db.query<MappingRow>('SELECT * FROM requirements.external_mappings WHERE source_id = $1', [sourceId])).rows
}

export async function upsertMapping(ctx: Ctx, m: { sourceId: string; externalKind: string; externalId: string; internalKind: string; internalId: string | null; externalLastChange?: string | null; internalRevision?: number | null; preserved?: unknown }) {
  await ctx.db.query(
    `INSERT INTO requirements.external_mappings (source_id, external_kind, external_id, internal_kind, internal_id, external_last_change, internal_revision, preserved, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (source_id, external_kind, external_id) DO UPDATE SET internal_kind = $4, internal_id = $5, external_last_change = $6, internal_revision = $7, preserved = $8, updated_at = $9`,
    [m.sourceId, m.externalKind, m.externalId, m.internalKind, m.internalId, m.externalLastChange && !Number.isNaN(Date.parse(m.externalLastChange)) ? m.externalLastChange : null, m.internalRevision ?? null, m.preserved === undefined ? null : JSON.stringify(m.preserved), ctx.now],
  )
}

export async function listSources(db: Queryable, projectId: string) {
  const { rows } = await db.query<{ id: string; format: string; source_key: string; name: string; created_at: Date; created_by: string; n: string }>(
    `SELECT s.*, (SELECT count(*) FROM requirements.external_mappings m WHERE m.source_id = s.id AND m.internal_id IS NOT NULL) AS n FROM requirements.exchange_sources s WHERE s.project_id = $1 ORDER BY s.created_at`,
    [projectId],
  )
  return rows.map((r) => ({ id: r.id, format: r.format, sourceKey: r.source_key, name: r.name, createdAt: isoRequired(r.created_at), createdBy: r.created_by, mappedRecords: Number(r.n) }))
}

type JobRow = {
  id: string
  project_id: string
  format: 'reqif' | 'json'
  status: 'previewed' | 'applied' | 'failed' | 'discarded'
  file_name: string
  sha256: string
  byte_size: string
  source_id: string | null
  source_key: string | null
  storage_key: string
  preview: Record<string, unknown>
  result: Record<string, unknown> | null
  created_at: Date
  created_by: string
  applied_at: Date | null
  applied_by: string | null
}

export const jobDto = (r: JobRow) => ({
  id: r.id,
  projectId: r.project_id,
  format: r.format,
  status: r.status,
  fileName: r.file_name,
  sha256: r.sha256,
  byteSize: Number(r.byte_size),
  sourceId: r.source_id,
  sourceKey: r.source_key,
  preview: r.preview,
  result: r.result,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  appliedAt: iso(r.applied_at),
  appliedBy: r.applied_by,
})

export async function getJob(db: Queryable, projectId: string, id: string, lock = false) {
  if (!isUuid(id)) throw notFound('Import job not found.')
  const { rows } = await db.query<JobRow>(`SELECT * FROM requirements.import_jobs WHERE id = $1 AND project_id = $2 ${lock ? 'FOR UPDATE' : ''}`, [id, projectId])
  if (!rows[0]) throw notFound('Import job not found.')
  return { row: rows[0], dto: jobDto(rows[0]) }
}

export async function listJobs(db: Queryable, projectId: string) {
  const { rows } = await db.query<JobRow>('SELECT * FROM requirements.import_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50', [projectId])
  return rows.map(jobDto)
}

export async function insertJob(ctx: Ctx, j: { format: 'reqif' | 'json'; fileName: string; sha256: string; byteSize: number; sourceId: string | null; sourceKey: string; storageKey: string; preview: unknown }) {
  const id = randomUUID()
  await ctx.db.query(
    `INSERT INTO requirements.import_jobs (id, project_id, format, status, file_name, sha256, byte_size, source_id, source_key, storage_key, preview, created_at, created_by)
     VALUES ($1,$2,$3,'previewed',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, ctx.projectId, j.format, j.fileName, j.sha256, j.byteSize, j.sourceId, j.sourceKey, j.storageKey, JSON.stringify(j.preview), ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'import', entityId: id, action: 'previewed', details: { fileName: j.fileName, sha256: j.sha256, sourceKey: j.sourceKey } })
  return (await getJob(ctx.db, ctx.projectId, id)).dto
}
