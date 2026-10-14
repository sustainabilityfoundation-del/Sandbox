import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { RequirementsEvent } from '@ews/platform-sdk'
import { ServiceError } from '../errors'
import { buildOpenApi } from './openapi'
import { errorBody, registerRoute, type HostServices, type RouteSpec } from './route'
import { registerRequirementRoutes } from './routes'
import { registerExchangeRoutes } from './exchangeRoutes'

export type RequirementsPluginOptions = HostServices

const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv

function compilers() {
  // Bodies are validated strictly (no coercion, unknown properties fail); query and path values are coerced from strings.
  const strict = addFormats(new Ajv({ allErrors: true, strict: false, removeAdditional: false, useDefaults: false, coerceTypes: false }))
  const coercing = addFormats(new Ajv({ allErrors: true, strict: false, removeAdditional: false, useDefaults: true, coerceTypes: 'array' }))
  return ({ schema, httpPart }: { schema: object; httpPart?: string }) => (httpPart === 'body' ? strict : coercing).compile(schema)
}

/**
 * The Requirements API as a Fastify plugin. The host registers it under `/api/requirements/v1`
 * and supplies the database pool, identity resolution, roles, twin directory, storage and event
 * hub. Only this plugin touches the `requirements` schema.
 */
export const requirementsPlugin: FastifyPluginAsync<RequirementsPluginOptions> = async (app: FastifyInstance, services) => {
  const registry: RouteSpec[] = []
  app.setValidatorCompiler(compilers() as never)
  app.setErrorHandler((error, request, reply) => {
    const { status, body } = errorBody(error)
    if (status >= 500) request.log.error({ err: error }, 'requirements request failed')
    reply.code(status).type('application/json; charset=utf-8').send(JSON.stringify(body))
  })
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: 'not-found', message: `No route ${request.method} ${request.url}` } })
  })
  for (const type of ['application/octet-stream', 'application/xml', 'text/xml', 'application/zip', 'application/x-reqifz', 'application/reqif+xml']) {
    app.addContentTypeParser(type, { parseAs: 'buffer', bodyLimit: 50 * 1024 * 1024 }, (_req, body, done) => done(null, body))
  }

  registerRequirementRoutes(app, services, registry)
  registerExchangeRoutes(app, services, registry)

  registerRoute(
    app,
    services,
    {
      method: 'GET',
      path: '/projects/{projectId}/events',
      operationId: 'events',
      tag: 'Events',
      summary: 'Committed-change notifications (Server-Sent Events)',
      description:
        'text/event-stream. Each event: `id: <eventId>`, `event: <type>`, `data: <RequirementsEvent JSON>`. Resume with `?after=<eventId>` or the `Last-Event-ID` header. If the resume point is unknown the stream starts with `event: reset` (reload everything). Delivery may repeat: dedupe by eventId and reread authoritative records. Comments (`: keep-alive`) are sent every 15 s.',
      params: Type.Object({ projectId: Type.String() }),
      query: Type.Object({ after: Type.Optional(Type.String()) }, { additionalProperties: false }),
      permission: 'read',
      crossModule: true,
      raw: true,
      responses: { 200: { description: 'Event stream', contentType: 'text/event-stream', schema: Type.Ref('RequirementsEvent') as never } },
      handler: async (rc) => {
        const after = (rc.query.after as string | undefined) ?? (rc.request.headers['last-event-id'] as string | undefined) ?? null
        const reply = rc.reply
        reply.hijack()
        const res = reply.raw
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
        res.write('retry: 3000\n\n')
        const sent = new Set<string>()
        let ready = false
        const buffer: RequirementsEvent[] = []
        const send = (e: RequirementsEvent) => {
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
    },
    registry,
  )

  let document: unknown
  app.get('/openapi.json', async (_req, reply) => {
    document ??= buildOpenApi(registry)
    reply.header('Cache-Control', 'no-cache').send(document)
  })
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError
}
