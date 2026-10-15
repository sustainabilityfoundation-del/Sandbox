import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound, ServiceError } from '../errors'
import { DOCUMENT_KINDS, documentLifecycleProblem, type DocumentKind, type DocumentLifecycle } from '../domain/rules'
import { BlobIntegrityError, BlobNotFoundError } from '../blob/blobStore'
import { audit, emit, isoRequired, isUuid, nextKey, type Ctx } from './context'
import { registerOwn } from './artifacts'
import { linkSubjects } from './links'

/**
 * Documents and attachments (ADR-0066): metadata in PostgreSQL, bytes in the content-addressed blob store.
 * Versions are immutable; a new version of a released document returns it to working (the released version
 * stays downloadable). Retiring keeps every byte.
 */
interface DocumentRow {
  id: string
  project_id: string
  key: string
  title: string
  description: string
  document_kind: DocumentKind
  lifecycle: DocumentLifecycle
  current_version: number
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}

interface VersionRow {
  version: number
  blob_key: string
  file_name: string
  media_type: string
  note: string
  uploaded_at: Date
  uploaded_by: string
  sha256: string
  byte_size: string
}

const versionJson = (v: VersionRow) => ({
  version: v.version,
  fileName: v.file_name,
  mediaType: v.media_type,
  byteSize: Number(v.byte_size),
  sha256: v.sha256,
  note: v.note,
  uploadedAt: isoRequired(v.uploaded_at),
  uploadedBy: v.uploaded_by,
})

export function documentJson(r: DocumentRow, extra: { artifactId?: string; versions?: VersionRow[] } = {}) {
  return {
    id: r.id,
    projectId: r.project_id,
    key: r.key,
    title: r.title,
    description: r.description,
    documentKind: r.document_kind,
    lifecycle: r.lifecycle,
    currentVersion: r.current_version,
    ...(extra.artifactId ? { artifactId: extra.artifactId } : {}),
    ...(extra.versions ? { versions: extra.versions.map(versionJson) } : {}),
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
    updatedBy: r.updated_by,
    revision: r.revision,
  }
}

async function register(ctx: Ctx, d: DocumentRow) {
  return registerOwn(ctx, { kind: 'document', nativeId: d.id, category: 'document', key: d.key, title: d.title, lifecycle: d.lifecycle, moduleState: d.lifecycle, version: d.current_version })
}

export async function loadDocument(ctx: Ctx, id: string, forUpdate = false): Promise<DocumentRow> {
  if (!isUuid(id)) throw notFound(`No document ${id}.`)
  const { rows } = await ctx.db.query<DocumentRow>(`SELECT * FROM projects.documents WHERE id = $1 AND project_id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [id, ctx.projectId])
  if (!rows[0]) throw notFound(`No document ${id}.`)
  return rows[0]
}

async function versionsOf(ctx: Ctx, id: string) {
  const { rows } = await ctx.db.query<VersionRow>(
    `SELECT v.version, v.blob_key, v.file_name, v.media_type, v.note, v.uploaded_at, v.uploaded_by, b.sha256, b.byte_size FROM projects.document_versions v JOIN projects.blobs b ON b.key = v.blob_key WHERE v.document_id = $1 ORDER BY v.version DESC`,
    [id],
  )
  return rows
}

export interface DocumentInput {
  title: string
  description?: string
  documentKind?: DocumentKind
  subjects?: string[]
}

export async function createDocument(ctx: Ctx, input: DocumentInput) {
  if (!input.title?.trim()) throw invalid('A title is required.', { title: 'required' })
  const kind = input.documentKind ?? 'other'
  if (!DOCUMENT_KINDS.includes(kind)) throw invalid('Unknown document kind.', { documentKind: 'unknown' })
  const id = randomUUID()
  const key = await nextKey(ctx, 'DOC', 'documents')
  const { rows } = await ctx.db.query<DocumentRow>(
    `INSERT INTO projects.documents (id, project_id, key, title, description, document_kind, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8) RETURNING *`,
    [id, ctx.projectId, key, input.title.trim(), input.description ?? '', kind, ctx.now, ctx.actor],
  )
  const artifactId = await register(ctx, rows[0])
  if (input.subjects?.length) await linkSubjects(ctx, artifactId, input.subjects)
  await audit(ctx, { entityType: 'document', entityId: id, action: 'created', revision: 1, details: { key } })
  await emit(ctx, 'document.changed', id, 1)
  return documentJson(rows[0], { artifactId, versions: [] })
}

export async function getDocument(ctx: Ctx, id: string) {
  const d = await loadDocument(ctx, id)
  const a = await ctx.db.query<{ id: string }>(`SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = 'projects' AND kind = 'document' AND native_id = $2`, [ctx.projectId, id])
  return documentJson(d, { artifactId: a.rows[0]?.id, versions: await versionsOf(ctx, id) })
}

export async function listDocuments(ctx: Ctx, query: { q?: string; documentKind?: string; lifecycle?: string }) {
  const params: unknown[] = [ctx.projectId]
  const where = ['d.project_id = $1']
  if (query.documentKind) where.push(`d.document_kind = $${params.push(query.documentKind)}`)
  if (query.lifecycle) where.push(`d.lifecycle = $${params.push(query.lifecycle)}`)
  if (query.q?.trim()) where.push(`(d.key ILIKE $${params.push(`%${query.q.trim()}%`)} OR d.title ILIKE $${params.length} OR d.description ILIKE $${params.length})`)
  const { rows } = await ctx.db.query<DocumentRow & { artifact_id: string | null }>(
    `SELECT d.*, a.id AS artifact_id FROM projects.documents d LEFT JOIN projects.artifacts a ON a.project_id = d.project_id AND a.module = 'projects' AND a.kind = 'document' AND a.native_id = d.id::text
     WHERE ${where.join(' AND ')} ORDER BY d.key`,
    params,
  )
  return rows.map((r) => documentJson(r, { artifactId: r.artifact_id ?? undefined }))
}

export async function updateDocument(ctx: Ctx, id: string, expectedRevision: number, input: { title?: string; description?: string; documentKind?: DocumentKind; lifecycle?: DocumentLifecycle }) {
  const d = await loadDocument(ctx, id, true)
  if (d.revision !== expectedRevision) throw conflict(`${d.key} changed since revision ${expectedRevision} (now ${d.revision}).`, d.revision)
  if (input.title !== undefined && !input.title.trim()) throw invalid('A title is required.', { title: 'required' })
  if (input.documentKind && !DOCUMENT_KINDS.includes(input.documentKind)) throw invalid('Unknown document kind.', { documentKind: 'unknown' })
  if (input.lifecycle && input.lifecycle !== d.lifecycle) {
    const problem = documentLifecycleProblem(d.lifecycle, input.lifecycle, ctx.role, d.current_version)
    if (problem) throw new ServiceError(problem.code, problem.message)
    if (ctx.provenance.sourceKind === 'assistant' && input.lifecycle === 'released') throw new ServiceError('forbidden', 'Releasing a document is a person’s decision; the assistant may propose it but not apply it.')
  } else if (d.lifecycle === 'retired' && Object.keys(input).length) throw invalid('A retired document cannot be changed.')
  const { rows } = await ctx.db.query<DocumentRow>(
    `UPDATE projects.documents SET title = coalesce($2, title), description = coalesce($3, description), document_kind = coalesce($4, document_kind), lifecycle = coalesce($5, lifecycle),
       revision = revision + 1, updated_at = $6, updated_by = $7 WHERE id = $1 RETURNING *`,
    [id, input.title?.trim() ?? null, input.description ?? null, input.documentKind ?? null, input.lifecycle ?? null, ctx.now, ctx.actor],
  )
  const artifactId = await register(ctx, rows[0])
  await audit(ctx, { entityType: 'document', entityId: id, action: input.lifecycle && input.lifecycle !== d.lifecycle ? `lifecycle:${input.lifecycle}` : 'updated', revision: rows[0].revision, details: { changed: Object.keys(input) } })
  await emit(ctx, 'document.changed', id, rows[0].revision)
  return documentJson(rows[0], { artifactId, versions: await versionsOf(ctx, id) })
}

/**
 * Adds an immutable version. The bytes are stored (content-addressed) before the transaction records them;
 * if the transaction then fails, the stored bytes stay unreferenced, which is harmless (same content, same key)
 * and reported by integrity checks as unreferenced storage.
 */
export async function addDocumentVersion(ctx: Ctx, id: string, expectedRevision: number, upload: { bytes: Uint8Array; fileName: string; mediaType: string; note?: string; expectedSha256?: string; maxBytes: number }) {
  const d = await loadDocument(ctx, id, true)
  if (d.revision !== expectedRevision) throw conflict(`${d.key} changed since revision ${expectedRevision} (now ${d.revision}).`, d.revision)
  if (d.lifecycle === 'retired') throw invalid('A retired document cannot get new versions.')
  if (!upload.fileName.trim() || upload.fileName.length > 255 || /[\\/\x00-\x1f]/.test(upload.fileName)) throw invalid('X-File-Name must be a file name (1–255 characters, no path separators).', { 'X-File-Name': 'invalid' })
  if (upload.bytes.byteLength > upload.maxBytes) throw invalid(`The file is larger than the limit of ${upload.maxBytes} bytes.`, { body: 'too large' }, 413)
  const stored = await ctx.services.blobs.put(upload.bytes)
  if (upload.expectedSha256 && upload.expectedSha256 !== stored.sha256) throw invalid('The uploaded content does not match its Content-Digest (sha-256); nothing was recorded.', { 'Content-Digest': 'mismatch' })
  await ctx.db.query('INSERT INTO projects.blobs (key, sha256, byte_size, first_stored_at) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING', [stored.key, stored.sha256, stored.byteSize, ctx.now])
  const version = d.current_version + 1
  await ctx.db.query('INSERT INTO projects.document_versions (document_id, version, blob_key, file_name, media_type, note, uploaded_at, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
    id,
    version,
    stored.key,
    upload.fileName.trim(),
    upload.mediaType,
    upload.note ?? '',
    ctx.now,
    ctx.actor,
  ])
  const lifecycle: DocumentLifecycle = d.lifecycle === 'released' || d.lifecycle === 'in-review' ? 'working' : d.lifecycle
  const { rows } = await ctx.db.query<DocumentRow>(`UPDATE projects.documents SET current_version = $2, lifecycle = $3, revision = revision + 1, updated_at = $4, updated_by = $5 WHERE id = $1 RETURNING *`, [id, version, lifecycle, ctx.now, ctx.actor])
  const artifactId = await register(ctx, rows[0])
  await audit(ctx, { entityType: 'document', entityId: id, action: 'version-added', revision: rows[0].revision, details: { version, sha256: stored.sha256, byteSize: stored.byteSize, fileName: upload.fileName } })
  await emit(ctx, 'document.changed', id, rows[0].revision)
  return documentJson(rows[0], { artifactId, versions: await versionsOf(ctx, id) })
}

/** Reads a version's bytes with hash verification. */
export async function readDocumentVersion(ctx: Ctx, id: string, version: number) {
  await loadDocument(ctx, id)
  const v = (await versionsOf(ctx, id)).find((x) => x.version === version)
  if (!v) throw notFound(`Document ${id} has no version ${version}.`)
  try {
    const bytes = await ctx.services.blobs.get(v.blob_key, { verify: true })
    return { bytes, version: versionJson(v) }
  } catch (e) {
    if (e instanceof BlobIntegrityError) throw new ServiceError('unavailable', `The stored content of version ${version} is corrupt (hash mismatch). Restore it from a backup or upload it again.`, { reason: 'blob-corrupt' })
    if (e instanceof BlobNotFoundError) throw new ServiceError('unavailable', `The stored content of version ${version} is missing from the blob store. Restore it from a backup or upload it again.`, { reason: 'blob-missing' })
    throw e
  }
}
