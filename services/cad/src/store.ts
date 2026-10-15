import { createHash } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020'
import { stableStringify, validateDocument, type CadDocument } from '@ews/cad-core'
import schema from '@ews/cad-core/schema/ews-cad.schema.json'
import type { Pool, PoolClient } from 'pg'
import { CadServiceError, conflict, invalid, notFound } from './errors'
import { emit } from './events'

/**
 * The CAD document store. Documents are native ews-cad JSON, validated by the same JSON Schema and
 * referential rules as the client (@ews/cad-core) before anything is written. Every save is an
 * immutable revision; the document row points to the current one.
 */

export interface Provenance {
  sourceKind: 'user' | 'assistant' | 'import' | 'system'
  conversationId?: string
  proposalId?: string
  messageId?: string
}

export interface Ctx {
  db: PoolClient
  projectId: string
  actor: string
  now: Date
  provenance: Provenance
}

export interface DocumentSummary {
  id: string
  projectId: string
  title: string
  revision: number
  archived: boolean
  formatVersion: string
  modelVersion: number
  partCount: number
  featureCount: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface RevisionInfo {
  revision: number
  title: string
  formatVersion: string
  modelVersion: number
  partCount: number
  featureCount: number
  message: string
  actor: string
  source: Provenance
  createdAt: string
}

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validateSchema = ajv.compile(schema as object)

/** Same validation as the client: JSON Schema (draft 2020-12) and cad-core's referential rules. */
export function validateContent(doc: unknown): CadDocument {
  if (!validateSchema(doc)) {
    const problems = (validateSchema.errors ?? []).slice(0, 12).map((e) => `${e.instancePath || '/'} ${e.message}`)
    throw invalid('The document does not match the ews-cad JSON Schema.', { problems })
  }
  const problems = validateDocument(doc)
  if (problems.length) throw invalid('The document is not a valid ews-cad model.', { problems: problems.slice(0, 12) })
  return doc as CadDocument
}

const hashOf = (doc: CadDocument) => createHash('sha256').update(stableStringify({ ...doc, version: 0 })).digest('hex')

type DocRow = { id: string; project_id: string; title: string; current_revision: number; archived: boolean; created_at: Date; created_by: string; updated_at: Date; updated_by: string }
type RevRow = { revision: number; title: string; format_version: string; model_version: number; part_count: number; feature_count: number; message: string; actor: string; source_kind: Provenance['sourceKind']; conversation_id: string | null; proposal_id: string | null; message_id: string | null; created_at: Date; content?: CadDocument; content_hash?: string }

const summary = (d: DocRow, r: RevRow): DocumentSummary => ({
  id: d.id,
  projectId: d.project_id,
  title: d.title,
  revision: d.current_revision,
  archived: d.archived,
  formatVersion: r.format_version,
  modelVersion: r.model_version,
  partCount: r.part_count,
  featureCount: r.feature_count,
  createdAt: d.created_at.toISOString(),
  createdBy: d.created_by,
  updatedAt: d.updated_at.toISOString(),
  updatedBy: d.updated_by,
})

const revisionInfo = (r: RevRow): RevisionInfo => ({
  revision: r.revision,
  title: r.title,
  formatVersion: r.format_version,
  modelVersion: r.model_version,
  partCount: r.part_count,
  featureCount: r.feature_count,
  message: r.message,
  actor: r.actor,
  source: { sourceKind: r.source_kind, ...(r.conversation_id ? { conversationId: r.conversation_id } : {}), ...(r.proposal_id ? { proposalId: r.proposal_id } : {}), ...(r.message_id ? { messageId: r.message_id } : {}) },
  createdAt: r.created_at.toISOString(),
})

const REV_COLS = 'revision, title, format_version, model_version, part_count, feature_count, message, actor, source_kind, conversation_id, proposal_id, message_id, created_at'

async function loadDoc(db: Pick<PoolClient, 'query'>, projectId: string, id: string, lock = false): Promise<DocRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound(`CAD document ${id} does not exist.`)
  const { rows } = await db.query<DocRow>(`SELECT * FROM cad.documents WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])
  const d = rows[0]
  if (!d || d.project_id !== projectId) throw notFound(`CAD document ${id} does not exist in project ${projectId}.`)
  return d
}

async function loadRevision(db: Pick<PoolClient, 'query'>, id: string, revision: number, withContent: boolean): Promise<RevRow> {
  const { rows } = await db.query<RevRow>(`SELECT ${REV_COLS}${withContent ? ', content, content_hash' : ', content_hash'} FROM cad.document_revisions WHERE document_id = $1 AND revision = $2`, [id, revision])
  if (!rows[0]) throw notFound(`Revision ${revision} of CAD document ${id} does not exist.`)
  return rows[0]
}

export async function listDocuments(db: Pick<PoolClient, 'query'>, projectId: string, includeArchived: boolean): Promise<DocumentSummary[]> {
  const { rows } = await db.query<DocRow & RevRow>(
    `SELECT d.*, r.revision, r.format_version, r.model_version, r.part_count, r.feature_count, r.message, r.actor, r.source_kind, r.conversation_id, r.proposal_id, r.message_id
     FROM cad.documents d JOIN cad.document_revisions r ON r.document_id = d.id AND r.revision = d.current_revision
     WHERE d.project_id = $1 ${includeArchived ? '' : 'AND NOT d.archived'} ORDER BY d.updated_at DESC, d.id LIMIT 500`,
    [projectId],
  )
  return rows.map((r) => summary(r, r))
}

export async function getDocument(db: Pick<PoolClient, 'query'>, projectId: string, id: string, revision?: number): Promise<{ summary: DocumentSummary; revision: RevisionInfo; document: CadDocument }> {
  const d = await loadDoc(db, projectId, id)
  const r = await loadRevision(db, id, revision ?? d.current_revision, true)
  return { summary: summary(d, await loadRevision(db, id, d.current_revision, false)), revision: revisionInfo(r), document: r.content! }
}

export async function listRevisions(db: Pick<PoolClient, 'query'>, projectId: string, id: string): Promise<RevisionInfo[]> {
  await loadDoc(db, projectId, id)
  const { rows } = await db.query<RevRow>(`SELECT ${REV_COLS} FROM cad.document_revisions WHERE document_id = $1 ORDER BY revision DESC LIMIT 1000`, [id])
  return rows.map(revisionInfo)
}

async function insertRevision(ctx: Ctx, doc: CadDocument, revision: number, message: string, hash: string) {
  const featureCount = doc.parts.reduce((n, p) => n + p.features.length, 0)
  await ctx.db.query(
    `INSERT INTO cad.document_revisions (document_id, revision, content, format_version, model_version, title, part_count, feature_count, content_hash, message, actor, source_kind, conversation_id, proposal_id, message_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [doc.documentId, revision, JSON.stringify(doc), doc.formatVersion, doc.version, doc.metadata.title || 'Untitled', doc.parts.length, featureCount, hash, message, ctx.actor, ctx.provenance.sourceKind, ctx.provenance.conversationId ?? null, ctx.provenance.proposalId ?? null, ctx.provenance.messageId ?? null, ctx.now],
  )
}

const titleOf = (doc: CadDocument) => (doc.metadata.title || 'Untitled').slice(0, 200)

export async function createDocumentRecord(ctx: Ctx, raw: unknown, message = ''): Promise<{ summary: DocumentSummary; revision: RevisionInfo }> {
  const doc = validateContent(raw)
  const existing = await ctx.db.query<{ project_id: string }>('SELECT project_id FROM cad.documents WHERE id = $1', [doc.documentId])
  if (existing.rows[0]) throw conflict(`A CAD document with ID ${doc.documentId} already exists${existing.rows[0].project_id === ctx.projectId ? '' : ' in another project'}. Save a new revision instead, or give the copy a new document ID.`, { reason: 'document-exists' })
  await ctx.db.query('INSERT INTO cad.documents (id, project_id, title, current_revision, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,$4,$5,$4,$5)', [doc.documentId, ctx.projectId, titleOf(doc), ctx.now, ctx.actor])
  await insertRevision(ctx, doc, 1, message, hashOf(doc))
  await emit(ctx.db, { type: 'cad.document-created', projectId: ctx.projectId, documentId: doc.documentId, revision: 1, actor: ctx.actor, sourceKind: ctx.provenance.sourceKind, at: ctx.now })
  const d = await loadDoc(ctx.db, ctx.projectId, doc.documentId)
  const r = await loadRevision(ctx.db, doc.documentId, 1, false)
  return { summary: summary(d, r), revision: revisionInfo(r) }
}

export async function saveRevision(ctx: Ctx, id: string, raw: unknown, expectedRevision: number, message = ''): Promise<{ summary: DocumentSummary; revision: RevisionInfo; unchanged: boolean }> {
  const doc = validateContent(raw)
  if (doc.documentId !== id) throw invalid(`The document's documentId (${doc.documentId}) does not match the URL (${id}).`, { fields: { documentId: 'mismatch' } })
  const d = await loadDoc(ctx.db, ctx.projectId, id, true)
  if (d.archived) throw conflict(`CAD document ${id} is archived; restore it before saving.`, { reason: 'archived' })
  if (d.current_revision !== expectedRevision)
    throw conflict(`CAD document ${id} was saved by someone else: expected revision ${expectedRevision}, current revision ${d.current_revision}. Open the latest revision and reapply your changes.`, { currentRevision: d.current_revision, expectedRevision })
  const current = await loadRevision(ctx.db, id, d.current_revision, false)
  const hash = hashOf(doc)
  if (current.content_hash === hash && current.title === titleOf(doc)) return { summary: summary(d, current), revision: revisionInfo(current), unchanged: true }
  const next = d.current_revision + 1
  await insertRevision(ctx, doc, next, message, hash)
  await ctx.db.query('UPDATE cad.documents SET current_revision = $2, title = $3, updated_at = $4, updated_by = $5 WHERE id = $1', [id, next, titleOf(doc), ctx.now, ctx.actor])
  await emit(ctx.db, { type: 'cad.revision-created', projectId: ctx.projectId, documentId: id, revision: next, actor: ctx.actor, sourceKind: ctx.provenance.sourceKind, at: ctx.now })
  const updated = await loadDoc(ctx.db, ctx.projectId, id)
  const r = await loadRevision(ctx.db, id, next, false)
  return { summary: summary(updated, r), revision: revisionInfo(r), unchanged: false }
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean, expectedRevision: number): Promise<DocumentSummary> {
  const d = await loadDoc(ctx.db, ctx.projectId, id, true)
  if (d.current_revision !== expectedRevision) throw conflict(`Expected revision ${expectedRevision}, current revision ${d.current_revision}.`, { currentRevision: d.current_revision, expectedRevision })
  if (d.archived !== archived) {
    await ctx.db.query('UPDATE cad.documents SET archived = $2, updated_at = $3, updated_by = $4 WHERE id = $1', [id, archived, ctx.now, ctx.actor])
    if (archived) await emit(ctx.db, { type: 'cad.document-archived', projectId: ctx.projectId, documentId: id, revision: d.current_revision, actor: ctx.actor, sourceKind: ctx.provenance.sourceKind, at: ctx.now })
  }
  return summary(await loadDoc(ctx.db, ctx.projectId, id), await loadRevision(ctx.db, id, d.current_revision, false))
}

// ---- transactions ---------------------------------------------------------------------------

const UNAVAILABLE = 'The CAD document database is not reachable. Nothing was changed; try again later.'

export async function withTransaction<T>(pool: Pool, base: Omit<Ctx, 'db' | 'now'>, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw new CadServiceError('unavailable', UNAVAILABLE)
    }
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ now: Date }>('SELECT now() AS now')
      const result = await fn({ ...base, db: client, now: rows[0].now })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      const code = (error as { code?: string }).code
      if ((code === '40001' || code === '40P01') && attempt === 0) continue
      throw mapDatabaseError(error)
    } finally {
      client.release()
    }
  }
}

export async function withRead<T>(pool: Pool, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient
  try {
    client = await pool.connect()
  } catch {
    throw new CadServiceError('unavailable', UNAVAILABLE)
  }
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw mapDatabaseError(error)
  } finally {
    client.release()
  }
}

function mapDatabaseError(error: unknown): unknown {
  if (error instanceof CadServiceError) return error
  const code = (error as { code?: string }).code
  if (code === '23505') return conflict('A record with the same identity already exists.')
  if (code === '23001') return conflict('Revisions are immutable.')
  if (code && ['ECONNREFUSED', '57P01', '57P03', '08006', '08001'].includes(code)) return new CadServiceError('unavailable', UNAVAILABLE)
  return error
}
