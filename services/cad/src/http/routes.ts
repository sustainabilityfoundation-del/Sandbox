import type { FastifyInstance } from 'fastify'
import { allIds } from '@ews/cad-core'
import { notFound } from '../errors'
import type { CadEvent } from '../events'
import { createDocumentRecord, getDocument, listDocuments, listRevisions, saveRevision, setArchived } from '../store'
import { registerRoute, type RouteSpec, type Services } from './route'

const uuid = { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' }
const projectId = { type: 'string', minLength: 1, maxLength: 100 }
const document = { type: 'object', description: 'A native ews-cad document (format 1.x); validated with the published JSON Schema and cad-core rules.' }
const message = { type: 'string', maxLength: 2000, description: 'Revision message (shown in the revision history).' }
const summary = {
  type: 'object',
  properties: {
    id: uuid,
    kind: { type: 'string', const: 'cad-document' },
    projectId,
    title: { type: 'string' },
    revision: { type: 'integer' },
    archived: { type: 'boolean' },
    formatVersion: { type: 'string' },
    modelVersion: { type: 'integer' },
    partCount: { type: 'integer' },
    featureCount: { type: 'integer' },
    parts: {
      type: 'array',
      description: 'Parts of the current revision. uuid is stable: version 5 of the part ID in the document UUID namespace.',
      items: { type: 'object', properties: { uuid, id: { type: 'string' }, name: { type: 'string' } } },
    },
    createdAt: { type: 'string', format: 'date-time' },
    createdBy: { type: 'string' },
    updatedAt: { type: 'string', format: 'date-time' },
    updatedBy: { type: 'string' },
  },
}

/** Platform reference to a CAD Modeler entity (CR-CAD-1, approved). */
export function entityRef(documentId: string, entityId: string | null, revision?: number) {
  return { module: 'cad' as const, kind: 'cad-modeler-entity', id: `${documentId}/${entityId ?? documentId}`, ...(revision !== undefined ? { revision } : {}) }
}

export function registerRoutes(app: FastifyInstance, services: Services, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)
  const D = '/projects/{projectId}/documents'

  route({
    method: 'GET',
    path: D,
    operationId: 'listDocuments',
    tag: 'Documents',
    summary: 'CAD documents of a project (current revision summaries)',
    permission: 'read',
    params: { projectId },
    query: { includeArchived: { type: 'boolean' } },
    response: { type: 'array', items: summary },
    handler: async (rc) => ({ body: await rc.read((db) => listDocuments(db, rc.projectId, rc.query.includeArchived === true)) }),
  })

  route({
    method: 'POST',
    path: D,
    operationId: 'createDocument',
    tag: 'Documents',
    summary: 'Store a new CAD document as revision 1',
    description: 'The body document keeps its own documentId (UUID). Fails with conflict when that ID exists. Requires an Idempotency-Key so retries are safe.',
    permission: 'write',
    params: { projectId },
    body: { type: 'object', required: ['document'], additionalProperties: false, properties: { document, message } },
    response: { type: 'object', properties: { summary, revision: { type: 'object' } } },
    responseStatus: 201,
    idempotency: 'required',
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const out = await createDocumentRecord(ctx, rc.body.document, rc.body.message)
        return { status: 201, body: out, etag: out.summary.revision, headers: { Location: `${rc.request.url.split('?')[0]}/${out.summary.id}` } }
      }),
  })

  route({
    method: 'GET',
    path: `${D}/{documentId}`,
    operationId: 'getDocument',
    tag: 'Documents',
    summary: 'The current (or a given) revision of a CAD document, with its native content',
    description: 'ETag is the current revision; use it as If-Match when saving.',
    permission: 'read',
    params: { projectId, documentId: uuid },
    query: { revision: { type: 'integer', minimum: 1 } },
    response: { type: 'object', properties: { summary, revision: { type: 'object' }, document } },
    handler: async (rc) => {
      const out = await rc.read((db) => getDocument(db, rc.projectId, rc.params.documentId, rc.query.revision as number | undefined))
      return { body: out, etag: out.summary.revision }
    },
  })

  route({
    method: 'PUT',
    path: `${D}/{documentId}`,
    operationId: 'saveRevision',
    tag: 'Documents',
    summary: 'Save a new revision of a CAD document',
    description:
      'Optimistic concurrency: send expectedRevision in the body or If-Match. A stale revision fails with 409 conflict (details.currentRevision); nothing is overwritten. Saving identical content returns the current revision with unchanged: true. Idempotency-Key recommended.',
    permission: 'write',
    params: { projectId, documentId: uuid },
    body: { type: 'object', required: ['document'], additionalProperties: false, properties: { document, expectedRevision: { type: 'integer', minimum: 1 }, message } },
    response: { type: 'object', properties: { summary, revision: { type: 'object' }, unchanged: { type: 'boolean' } } },
    idempotency: 'optional',
    ifMatch: true,
    handler: async (rc) => {
      const expected = rc.expected(rc.body.expectedRevision)
      return rc.write(async (ctx) => {
        const out = await saveRevision(ctx, rc.params.documentId, rc.body.document, expected, rc.body.message)
        return { body: out, etag: out.summary.revision }
      })
    },
  })

  route({
    method: 'POST',
    path: `${D}/{documentId}/archive`,
    operationId: 'archiveDocument',
    tag: 'Documents',
    summary: 'Archive or restore a CAD document (revisions are never deleted)',
    permission: 'write',
    params: { projectId, documentId: uuid },
    body: { type: 'object', required: ['archived'], additionalProperties: false, properties: { archived: { type: 'boolean' }, expectedRevision: { type: 'integer', minimum: 1 } } },
    response: summary,
    idempotency: 'optional',
    ifMatch: true,
    handler: async (rc) => {
      const expected = rc.expected(rc.body.expectedRevision)
      return rc.write(async (ctx) => {
        const out = await setArchived(ctx, rc.params.documentId, rc.body.archived, expected)
        return { body: out, etag: out.revision }
      })
    },
  })

  route({
    method: 'GET',
    path: `${D}/{documentId}/revisions`,
    operationId: 'listRevisions',
    tag: 'Revisions',
    summary: 'Revision history (newest first) with provenance',
    permission: 'read',
    params: { projectId, documentId: uuid },
    response: { type: 'array', items: { type: 'object' } },
    handler: async (rc) => ({ body: await rc.read((db) => listRevisions(db, rc.projectId, rc.params.documentId)) }),
  })

  route({
    method: 'GET',
    path: `${D}/{documentId}/entities/{entityId}`,
    operationId: 'resolveEntity',
    tag: 'Documents',
    summary: 'Resolve a CAD Modeler entity for cross-module references (ArtifactRef, CR-CAD-1)',
    description:
      'entityId is a document-local ID (part-1, ext-5, par-2, sk-3 …), the document ID itself, or a stable face name (ext-5/cap-end, URL-encoded). Returns the platform reference { module: "cad", kind: "cad-modeler-entity", id: "<documentId>/<entityId>", revision }. Face names are checked against the feature that generates them; whether the face exists in the regenerated geometry is not checked by the server (no kernel).',
    permission: 'read',
    params: { projectId, documentId: uuid, entityId: { type: 'string', minLength: 1, maxLength: 300 } },
    query: { revision: { type: 'integer', minimum: 1 } },
    response: { type: 'object' },
    handler: async (rc) => {
      const out = await rc.read((db) => getDocument(db, rc.projectId, rc.params.documentId, rc.query.revision as number | undefined))
      const entityId = decodeURIComponent(rc.params.entityId)
      const doc = out.document
      const isDoc = entityId === doc.documentId
      const ids = new Set(allIds(doc))
      const featureId = entityId.split('/')[0]
      const isFace = entityId.includes('/') && doc.parts.some((p) => p.features.some((f) => f.id === featureId))
      if (!isDoc && !ids.has(entityId) && !isFace) throw notFound(`${entityId} is not an entity of CAD document ${doc.documentId} (revision ${out.revision.revision}).`)
      const part = doc.parts.find((p) => p.id === entityId)
      const feature = doc.parts.flatMap((p) => p.features).find((f) => f.id === (isFace ? featureId : entityId))
      const parameter = doc.parts.flatMap((p) => p.parameters).find((x) => x.id === entityId)
      const entityType = isDoc ? 'document' : part ? 'part' : isFace ? 'face' : feature ? feature.type : parameter ? 'parameter' : 'sketch-element'
      const label = isDoc ? doc.metadata.title : part?.name ?? (isFace ? `${feature?.name ?? featureId} · ${entityId.slice(featureId.length + 1)}` : feature?.name ?? parameter?.name ?? entityId)
      return { body: { ref: entityRef(doc.documentId, isDoc ? null : entityId, out.revision.revision), entityType, label, documentTitle: doc.metadata.title, verifiedInGeometry: !isFace }, etag: out.summary.revision }
    },
  })

  route({
    method: 'GET',
    path: '/projects/{projectId}/events',
    operationId: 'cadEvents',
    tag: 'Events',
    summary: 'Committed-change notifications (Server-Sent Events)',
    description:
      'text/event-stream. Each event: `id: <eventId>`, `event: <type>` (cad.document-created, cad.revision-created, cad.document-archived, cad.document-restored), `data: <CadEvent JSON>` with kind, name, revision, updatedAt, updatedBy and the part descriptors (uuid, id, name). Resume with `?after=<eventId>` or Last-Event-ID; an unknown resume point starts with `event: reset`. Delivery may repeat: dedupe by eventId and reread the document.',
    permission: 'read',
    params: { projectId },
    query: { after: { type: 'string' } },
    raw: true,
    handler: async (rc) => {
      const after = (rc.query.after as string | undefined) ?? (rc.request.headers['last-event-id'] as string | undefined) ?? null
      const reply = rc.reply
      reply.hijack()
      const res = reply.raw
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      res.write('retry: 3000\n\n')
      const sent = new Set<string>()
      let ready = false
      const buffer: CadEvent[] = []
      const send = (e: CadEvent) => {
        if (sent.has(e.eventId)) return
        sent.add(e.eventId)
        if (sent.size > 5000) sent.delete(sent.values().next().value!)
        res.write(`id: ${e.eventId}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      }
      const unsubscribe = services.events.subscribe(rc.projectId, (e) => (ready ? send(e) : buffer.push(e)))
      const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000)
      const close = () => {
        clearInterval(keepAlive)
        unsubscribe()
      }
      rc.request.raw.on('close', close)
      try {
        const backlog = await services.events.readAfter(rc.projectId, after)
        if (backlog === undefined) res.write(`event: reset\ndata: ${JSON.stringify({ reason: 'unknown resume point', after })}\n\n`)
        else backlog.forEach(send)
        ready = true
        buffer.splice(0).forEach(send)
      } catch (e) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: e instanceof Error ? e.message : String(e) })}\n\n`)
        close()
        res.end()
      }
    },
  })
}
