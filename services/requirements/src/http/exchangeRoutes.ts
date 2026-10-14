import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import { conflict, invalid, notFound } from '../errors'
import { applyJsonImport, previewJsonImport } from '../exchange/json'
import { runExport } from '../exchange/reqifExport'
import { applyReqifImport, previewReqifImport } from '../exchange/reqifImport'
import { audit, isUuid } from '../store/context'
import { getJob, listJobs, listSources } from '../store/exchange'
import { registerRoute, type HostServices, type RouteSpec } from './route'
import * as S from './schemas'

const ERR = { 400: { description: 'invalid', schema: S.ErrorBody }, 401: { description: 'unauthenticated', schema: S.ErrorBody }, 403: { description: 'forbidden', schema: S.ErrorBody }, 404: { description: 'not-found', schema: S.ErrorBody }, 409: { description: 'conflict', schema: S.ErrorBody }, 422: { description: 'invalid', schema: S.ErrorBody } }
const PJ = Type.Object({ projectId: Type.String(), jobId: Type.String() })

export function registerExchangeRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)

  route({
    method: 'POST',
    path: '/projects/{projectId}/imports',
    operationId: 'previewImport',
    tag: 'Exchange',
    summary: 'Upload a ReqIF (.reqif, .reqifz) or JSON file and get an import preview',
    description:
      'The body is the file (application/xml, application/zip or application/octet-stream). Nothing is changed: the response is an import job with a preview of new, changed, unchanged, conflicting and unsupported records, attribute and relation mappings, validation findings (including schema validation against the official OMG ReqIF schemas when installed on the server) and the policies applied. DOCTYPE/entity declarations are refused.',
    params: Type.Object({ projectId: Type.String() }),
    query: Type.Object(
      { fileName: Type.String({ minLength: 1, maxLength: 255 }), format: Type.Optional(Type.Union([Type.Literal('reqif'), Type.Literal('json')])), sourceKey: Type.Optional(Type.String({ maxLength: 500 })), sourceName: Type.Optional(Type.String({ maxLength: 200 })) },
      { additionalProperties: false },
    ),
    rawBody: ['application/xml', 'application/zip', 'application/octet-stream'],
    permission: 'import',
    idempotency: 'required',
    responses: { 201: { description: 'Import job (status previewed)', schema: S.ImportJob }, ...ERR },
    handler: async (rc) => {
      const q = rc.query as { fileName: string; format?: 'reqif' | 'json'; sourceKey?: string; sourceName?: string }
      const body = rc.body
      if (!(body instanceof Uint8Array) || !body.byteLength) throw invalid('Send the file as the request body (application/xml, application/zip or application/octet-stream).', { body: 'missing' }, 400)
      const bytes = new Uint8Array(body)
      const format = q.format ?? (/\.json$/i.test(q.fileName) ? 'json' : 'reqif')
      return rc.write(async (ctx) => {
        try {
          const job = format === 'json' ? await previewJsonImport(ctx, services.storage, bytes, q.fileName) : await previewReqifImport(ctx, services.storage, bytes, { fileName: q.fileName, sourceKey: q.sourceKey, sourceName: q.sourceName, role: rc.role, schemaDir: services.reqifSchemaDir })
          return { status: 201, body: job }
        } catch (e) {
          const name = (e as Error)?.name
          if (name === 'ReqIFParseError' || name === 'ArchiveError') throw invalid((e as Error).message, { file: (e as { code?: string }).code ?? 'unreadable' })
          throw e
        }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/imports',
    operationId: 'listImports',
    tag: 'Exchange',
    summary: 'Recent import jobs',
    params: Type.Object({ projectId: Type.String() }),
    permission: 'read',
    responses: { 200: { description: 'Jobs', schema: Type.Array(S.ImportJob) }, ...ERR },
    handler: async (rc) => ({ body: await rc.read((ctx) => listJobs(ctx.db, rc.projectId)) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/imports/{jobId}',
    operationId: 'getImport',
    tag: 'Exchange',
    summary: 'An import job with its preview and result',
    params: PJ,
    permission: 'read',
    responses: { 200: { description: 'Job', schema: S.ImportJob }, ...ERR },
    handler: async (rc) => ({ body: (await rc.read((ctx) => getJob(ctx.db, rc.projectId, rc.params.jobId))).dto }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/imports/{jobId}/apply',
    operationId: 'applyImport',
    tag: 'Exchange',
    summary: 'Apply a previewed import with per-record decisions (one transaction)',
    description:
      'Decisions per preview record key: take-incoming, keep-local or skip. Defaults: new and changed records are imported, conflicts keep the local version. If any record changed since the preview, nothing is applied (409). Absent records are never deleted. Creating new custom attribute definitions requires an administrator.',
    params: PJ,
    body: S.ImportApply,
    permission: 'import',
    idempotency: 'optional',
    responses: { 200: { description: 'Job (status applied)', schema: S.ImportJob }, ...ERR },
    handler: async (rc) => {
      const body = rc.body as Static<typeof S.ImportApply>
      return rc.write(async (ctx) => {
        const { row } = await getJob(ctx.db, rc.projectId, rc.params.jobId)
        const job =
          row.format === 'json'
            ? await applyJsonImport(ctx, rc.params.jobId, { decisions: body.decisions ?? {}, storage: services.storage, twin: services.twin })
            : await applyReqifImport(ctx, rc.params.jobId, { decisions: body.decisions ?? {}, collectionName: body.collectionName, role: rc.role, storage: services.storage, twin: services.twin, schemaDir: services.reqifSchemaDir })
        return { body: job }
      })
    },
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/imports/{jobId}/discard',
    operationId: 'discardImport',
    tag: 'Exchange',
    summary: 'Discard a previewed import',
    params: PJ,
    body: Type.Object({}, { additionalProperties: false }),
    permission: 'import',
    responses: { 200: { description: 'Job (status discarded)', schema: S.ImportJob }, ...ERR },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const { row } = await getJob(ctx.db, rc.projectId, rc.params.jobId, true)
        if (row.status !== 'previewed') throw conflict(`The import is ${row.status}.`)
        await ctx.db.query(`UPDATE requirements.import_jobs SET status = 'discarded' WHERE id = $1`, [row.id])
        await audit(ctx, { entityType: 'import', entityId: row.id, action: 'discarded' })
        return { body: (await getJob(ctx.db, rc.projectId, rc.params.jobId)).dto }
      }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/exports',
    operationId: 'createExport',
    tag: 'Exchange',
    summary: 'Export a selection, a configuration or a baseline as ReqIF, ReqIF archive or JSON',
    description:
      'ReqIF exports are validated against the official schemas when they are installed on the server (report.schemaValidation). Lossy mappings (lifecycle, allocation to twin components, relationships leaving the selection) are listed in report.lossy. With sourceId, objects imported from that source keep their identifiers, types and preserved values.',
    params: Type.Object({ projectId: Type.String() }),
    body: S.ExportRequest,
    permission: 'export',
    idempotency: 'optional',
    responses: { 201: { description: 'Export job; download with /exports/{id}/content', schema: S.ExportJob }, ...ERR },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await runExport(ctx, services.storage, rc.body as Static<typeof S.ExportRequest>, services.reqifSchemaDir) })),
  })
  const exportRow = async (rc: { projectId: string; params: Record<string, string>; read: <T>(fn: (ctx: import('../store/context').Ctx) => Promise<T>) => Promise<T> }) => {
    if (!isUuid(rc.params.jobId)) throw notFound('Export not found.')
    const rows = await rc.read(async (ctx) => (await ctx.db.query<{ id: string; project_id: string; format: string; request: unknown; report: unknown; storage_key: string; file_name: string; media_type: string; byte_size: string; created_at: Date; created_by: string }>('SELECT * FROM requirements.export_jobs WHERE id = $1 AND project_id = $2', [rc.params.jobId, rc.projectId])).rows)
    if (!rows[0]) throw notFound('Export not found.')
    return rows[0]
  }
  route({
    method: 'GET',
    path: '/projects/{projectId}/exports/{jobId}',
    operationId: 'getExport',
    tag: 'Exchange',
    summary: 'An export job and its report',
    params: PJ,
    permission: 'export',
    responses: { 200: { description: 'Export job', schema: S.ExportJob }, ...ERR },
    handler: async (rc) => {
      const r = await exportRow(rc)
      return { body: { id: r.id, projectId: r.project_id, format: r.format, request: r.request, report: r.report, fileName: r.file_name, mediaType: r.media_type, byteSize: Number(r.byte_size), createdAt: new Date(r.created_at).toISOString(), createdBy: r.created_by } }
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/exports/{jobId}/content',
    operationId: 'getExportContent',
    tag: 'Exchange',
    summary: 'Download the exported file',
    params: PJ,
    permission: 'export',
    raw: true,
    responses: { 200: { description: 'The file', contentType: 'application/octet-stream' }, ...ERR },
    handler: async (rc) => {
      const r = await exportRow(rc)
      const bytes = await services.storage.get(r.storage_key)
      rc.reply.header('Content-Type', r.media_type).header('Content-Disposition', `attachment; filename="${r.file_name.replace(/[^\w.-]/g, '_')}"`).send(Buffer.from(bytes))
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/exchange-sources',
    operationId: 'listExchangeSources',
    tag: 'Exchange',
    summary: 'Exchange sources (identifier mappings are kept per source)',
    params: Type.Object({ projectId: Type.String() }),
    permission: 'read',
    responses: { 200: { description: 'Sources', schema: Type.Array(S.ExchangeSource) }, ...ERR },
    handler: async (rc) => ({ body: await rc.read((ctx) => listSources(ctx.db, rc.projectId)) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/attachments/{attachmentId}/content',
    operationId: 'getAttachmentContent',
    tag: 'Exchange',
    summary: 'Attachment bytes (stored through the object-storage abstraction)',
    description: 'Served with the recorded media type and X-Content-Type-Options: nosniff; SVG and HTML are served as attachments, never inline.',
    params: Type.Object({ projectId: Type.String(), attachmentId: Type.String() }),
    permission: 'read',
    raw: true,
    responses: { 200: { description: 'The bytes', contentType: 'application/octet-stream' }, ...ERR },
    handler: async (rc) => {
      const id = rc.params.attachmentId
      if (!isUuid(id)) throw notFound('Attachment not found.')
      const rows = await rc.read(async (ctx) => (await ctx.db.query<{ storage_key: string; media_type: string; original_name: string }>('SELECT storage_key, media_type, original_name FROM requirements.attachments WHERE id = $1 AND project_id = $2', [id, rc.projectId])).rows)
      if (!rows[0]) throw notFound('Attachment not found.')
      const safeInline = /^image\/(png|jpeg|gif|webp)$/.test(rows[0].media_type)
      rc.reply
        .header('Content-Type', safeInline ? rows[0].media_type : 'application/octet-stream')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `${safeInline ? 'inline' : 'attachment'}; filename="${rows[0].original_name.split('/').pop()!.replace(/[^\w.-]/g, '_')}"`)
        .send(Buffer.from(await services.storage.get(rows[0].storage_key)))
    },
  })
}
