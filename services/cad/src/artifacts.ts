import type { ArtifactChange, ArtifactDescriptor, ArtifactKindInfo, ArtifactSource, NativeRef } from '@ews/platform-sdk'
import type { CadDocument } from '@ews/cad-core'
import type { Pool } from 'pg'
import type { CadEvent, CadEventHub } from './events'

/**
 * Artifact source for Project Management (SDK 1.7, CR-PM-REG-4). It is read-only, built over the
 * `cad` tables and outbox, and never writes.
 *
 * Artifacts:
 * - `cad-document`: id = document UUID.
 * - `cad-modeler-entity` (CR-CAD-1): id = `<documentUuid>/<partId>`, for each part of the current
 *   revision. Its container is the document.
 * - Assemblies and configurations do not exist in ews-cad 1.1. When they are added they will be
 *   listed under the same kind, with their own entity IDs.
 *
 * Archived documents are listed with lifecycle `retired`, and their parts are reported too, so that
 * reconciliation and events agree. A new project has no CAD documents, and provisioning has nothing
 * to do.
 */

export const CAD_ARTIFACT_KINDS: ArtifactKindInfo[] = [
  { kind: 'cad-document', label: 'CAD document', category: 'geometry', navigable: true },
  { kind: 'cad-modeler-entity', label: 'CAD part', category: 'geometry', navigable: true },
]

type DocRow = { id: string; project_id: string; title: string; current_revision: number; archived: boolean; created_at: Date; created_by: string; updated_at: Date; updated_by: string; content: CadDocument }

const docRef = (id: string): NativeRef => ({ module: 'cad', kind: 'cad-document', id })
const partRef = (doc: string, part: string): NativeRef => ({ module: 'cad', kind: 'cad-modeler-entity', id: `${doc}/${part}` })
const short = (uuid: string) => uuid.slice(0, 8)
/** Workspace deep link (?tool=cad-modeler&document=<uuid>): opens the current revision; parts open their document. */
const openLink = (documentId: string) => ({ toolId: 'cad-modeler', params: { document: documentId } })

function relationsOf(doc: CadDocument, subject: string): ArtifactDescriptor['relations'] {
  const out = (doc.references ?? [])
    .filter((r) => r.subject === subject)
    .map((r) => ({ type: r.role, to: { module: r.target.module, kind: r.target.kind ?? 'unknown', id: r.target.id }, ...(typeof r.target.revision === 'number' ? { toRevision: r.target.revision } : {}) }))
  return out.length ? out : undefined
}

function descriptorsOf(d: DocRow): ArtifactDescriptor[] {
  const lifecycle = d.archived ? 'retired' : 'working'
  const moduleState = d.archived ? 'archived' : 'active'
  const version = { value: d.current_revision, label: `Revision ${d.current_revision}`, at: d.updated_at.toISOString() }
  const common = { lifecycle, moduleState, version, createdAt: d.created_at.toISOString(), createdBy: d.created_by, modifiedAt: d.updated_at.toISOString(), modifiedBy: d.updated_by } as const
  const doc = d.content
  const docRel = relationsOf(doc, doc.documentId)
  return [
    { ref: docRef(d.id), key: `CAD ${short(d.id)}`, title: d.title, ...common, open: openLink(d.id), ...(docRel ? { relations: docRel } : {}) },
    ...doc.parts.map((p): ArtifactDescriptor => {
      const rel = relationsOf(doc, p.id)
      // Part times are the document's: the service versions whole documents, not single parts.
      return { ref: partRef(d.id, p.id), key: `CAD ${short(d.id)}/${p.id}`, title: p.name, ...common, container: docRef(d.id), open: openLink(d.id), ...(rel ? { relations: rel } : {}) }
    }),
  ]
}

const SELECT = `SELECT d.*, r.content FROM cad.documents d JOIN cad.document_revisions r ON r.document_id = d.id AND r.revision = d.current_revision`

function encodeCursor(c: { d: string; i: number }) {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}
function decodeCursor(s: string | undefined): { d: string; i: number } | undefined {
  if (!s) return undefined
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (typeof c.d === 'string' && Number.isInteger(c.i)) return c
  } catch {
    /* invalid cursor: start over */
  }
  throw Object.assign(new Error('Invalid cursor.'), { code: 'invalid' })
}

export function createCadArtifactSource(pool: Pool, events: Pick<CadEventHub, 'subscribeAll'>): ArtifactSource {
  return {
    module: 'cad',
    contractVersion: '1.0.0',
    describeModule: () => ({ name: 'CAD Modeler', kinds: CAD_ARTIFACT_KINDS }),

    async list(projectId, options = {}) {
      const limit = Math.max(1, Math.min(500, options.limit ?? 500))
      const kinds = options.kinds?.length ? new Set(options.kinds) : undefined
      const after = decodeCursor(options.cursor)
      // Stable order: document UUID, then the document itself (index 0) and its parts in file order.
      const items: ArtifactDescriptor[] = []
      let lastKey: { d: string; i: number } | undefined
      let from = after?.d ?? ''
      let first = true
      for (;;) {
        const { rows } = await pool.query<DocRow>(`${SELECT} WHERE d.project_id = $1 AND d.id::text ${first && after ? '>=' : '>'} $2 ORDER BY d.id::text LIMIT 50`, [projectId, from])
        first = false
        if (!rows.length) return { items }
        for (const row of rows) {
          const all = descriptorsOf(row)
          for (let i = 0; i < all.length; i++) {
            if (after && row.id === after.d && i <= after.i) continue
            if (kinds && !kinds.has(all[i].ref.kind)) continue
            if (items.length === limit) return { items, nextCursor: encodeCursor(lastKey!) }
            items.push(all[i])
            lastKey = { d: row.id, i }
          }
          from = row.id
        }
      }
    },

    async describe(projectId, refs) {
      const wanted = refs.filter((r) => r.module === 'cad')
      const ids = [...new Set(wanted.map((r) => r.id.split('/')[0]).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))]
      if (!ids.length) return []
      const { rows } = await pool.query<DocRow>(`${SELECT} WHERE d.project_id = $1 AND d.id = ANY($2::uuid[])`, [projectId, ids])
      const byKey = new Map(rows.flatMap(descriptorsOf).map((a) => [`${a.ref.kind}|${a.ref.id}`, a]))
      return wanted.map((r) => byKey.get(`${r.kind}|${r.id}`)).filter((a): a is ArtifactDescriptor => !!a)
    },

    subscribe(listener) {
      // Changes are delivered in event (delivery) order: each event waits for the previous one.
      let queue: Promise<void> = Promise.resolve()
      return events.subscribeAll((e) => {
        queue = queue.then(() =>
          toChanges(pool, e).then(
            (changes) => changes.forEach((c) => listener(c)),
            () => listener({ kind: 'reconcile', eventId: `${e.eventId}:reconcile`, projectId: e.projectId, reason: 'The CAD event could not be itemised.', occurredAt: e.occurredAt }),
          ),
        )
      })
    },

    async provision() {
      return { status: 'not-needed' }
    },
  }
}

/** One CAD event → artifact changes. Parts removed by a revision are reported as retired. */
export async function toChanges(pool: Pool, e: CadEvent): Promise<ArtifactChange[]> {
  const base = { projectId: e.projectId, occurredAt: e.occurredAt, actor: e.actor }
  if (!e.parts) return [{ kind: 'reconcile', eventId: e.eventId, projectId: e.projectId, reason: 'CAD event recorded before part descriptors existed (service migration 0002).', occurredAt: e.occurredAt }]
  const refs = [docRef(e.documentId), ...e.parts.map((p) => partRef(e.documentId, p.id))]
  if (e.type === 'cad.document-archived') return [{ kind: 'retired', eventId: e.eventId, refs, ...base }]
  const changes: ArtifactChange[] = [{ kind: 'upserted', eventId: e.eventId, refs, ...base }]
  if (e.type === 'cad.revision-created' && e.revision && e.revision > 1) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT p->>'id' AS id FROM cad.document_revisions r, jsonb_array_elements(r.content->'parts') p WHERE r.document_id = $1 AND r.revision = $2`,
      [e.documentId, e.revision - 1],
    )
    const now = new Set(e.parts.map((p) => p.id))
    const removed = rows.map((r) => r.id).filter((id) => !now.has(id))
    if (removed.length) changes.push({ kind: 'retired', eventId: `${e.eventId}:removed-parts`, refs: removed.map((id) => partRef(e.documentId, id)), ...base })
  }
  return changes
}
