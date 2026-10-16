import { randomUUID } from 'node:crypto'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ProjectsEvent } from '@ews/platform-sdk'
import { buildOpenApi } from './openapi'
import { errorBody, registerRoute, type HostServices, type RouteSpec } from './route'
import { registerProjectRoutes } from './routes'
import { reconcileProject, startRegistryConsumer } from '../registry'
import { SCHEMAS } from './schemas'

export type ProjectsPluginOptions = HostServices

const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv

/** Removes `$id`s (shared sub-schemas appear several times in one request schema). */
function withoutIds(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutIds)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string | symbol, unknown> = {}
  for (const key of Reflect.ownKeys(schema)) {
    if (key === '$id') continue
    out[key] = withoutIds((schema as Record<string | symbol, unknown>)[key])
  }
  return out
}

/** Replaces `{ $ref: '<SchemaId>' }` by the named schema so request bodies can be declared by reference. */
function resolveRefs(schema: unknown, byId: Map<string, unknown>): unknown {
  if (Array.isArray(schema)) return schema.map((s) => resolveRefs(s, byId))
  if (!schema || typeof schema !== 'object') return schema
  const s = schema as Record<string, unknown>
  if (typeof s.$ref === 'string' && byId.has(s.$ref)) return resolveRefs(byId.get(s.$ref), byId)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) out[k] = resolveRefs(v, byId)
  return out
}

function compilers() {
  const byId = new Map(SCHEMAS.map((s) => [s.$id as string, s as unknown]))
  // Bodies are validated strictly (no coercion, unknown properties fail); query and path values are coerced from strings.
  const strict = addFormats(new Ajv({ allErrors: true, strict: false, removeAdditional: false, useDefaults: false, coerceTypes: false }))
  const coercing = addFormats(new Ajv({ allErrors: true, strict: false, removeAdditional: false, useDefaults: true, coerceTypes: 'array' }))
  return ({ schema, httpPart }: { schema: object; httpPart?: string }) => (httpPart === 'body' ? strict : coercing).compile(withoutIds(resolveRefs(schema, byId)) as object)
}

/**
 * The Project Management API as a Fastify plugin. The host registers it under `/api/projects/v1` and supplies the
 * database pool, identity, roles, the membership port, the blob store, the event hub and optionally the settings port.
 * Only this plugin touches the `projects` schema.
 */
export const projectsPlugin: FastifyPluginAsync<ProjectsPluginOptions> = async (app: FastifyInstance, services) => {
  const registry: RouteSpec[] = []
  app.setValidatorCompiler(compilers() as never)
  app.setErrorHandler((error, request, reply) => {
    const errorId = randomUUID()
    const { status, body } = errorBody(error, errorId)
    if (status >= 500) request.log.error({ err: error, errorId }, 'projects request failed')
    reply.code(status).type('application/json; charset=utf-8').send(JSON.stringify(body))
  })
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: 'not-found', message: `No route ${request.method} ${request.url}` } })
  })

  registerProjectRoutes(app, services, registry)

  // Registry consumer (ADR-0062): module events keep the artifact registry current; stopped with the host.
  if (services.artifactSources?.length) {
    const consumer = startRegistryConsumer({ pool: services.pool, sources: services.artifactSources, onError: (e) => app.log.error({ err: e }, 'projects registry consumer') })
    services.onRegistry?.({ idle: consumer.idle, reconcile: (projectId: string) => reconcileProject({ pool: services.pool, sources: services.artifactSources! }, projectId) })
    app.addHook('onClose', async () => {
      consumer.stop()
      await consumer.idle()
    })
  }

  registerRoute(
    app,
    services,
    {
      method: 'GET',
      path: '/projects/{projectId}/events',
      operationId: 'projectEvents',
      tag: 'Events',
      summary: 'Committed-change notifications (Server-Sent Events)',
      description:
        'text/event-stream. Each event: `id: <eventId>`, `event: <type>`, `data: <ProjectsEvent JSON>`. Resume with `?after=<eventId>` or `Last-Event-ID`. An unknown resume point starts with `event: reset` (reload everything). Delivery may repeat: dedupe by eventId. Comments (`: keep-alive`) every 15 s.',
      params: Type.Object({ projectId: Type.String() }),
      query: Type.Object({ after: Type.Optional(Type.String()) }, { additionalProperties: false }),
      permission: 'read',
      anyState: true,
      raw: true,
      responses: { 200: { description: 'Event stream', contentType: 'text/event-stream', schema: Type.Ref('ProjectsEvent') as never } },
      handler: async (rc) => {
        const after = (rc.query.after as string | undefined) ?? (rc.request.headers['last-event-id'] as string | undefined) ?? null
        const reply = rc.reply
        reply.hijack()
        const res = reply.raw
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
        res.write('retry: 3000\n\n')
        const sent = new Set<string>()
        let ready = false
        const buffer: ProjectsEvent[] = []
        const send = (e: ProjectsEvent) => {
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
