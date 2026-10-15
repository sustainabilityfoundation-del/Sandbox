import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { migrateCad } from '../db/migrate'
import { errorBody } from '../errors'
import { createCadEventHub, type CadEventHub } from '../events'
import { registerRoutes } from './routes'
import type { CadHost, RouteSpec } from './route'

export const CAD_BASE_PATH = '/api/cad/v1'
export const CAD_API_VERSION = '0.1.0'

export interface CadPluginOptions extends CadHost {
  eventPollMs?: number
  /** Called with the event hub (tests, host integration). */
  onReady?: (services: { events: CadEventHub }) => void
}

/**
 * The CAD document API as a Fastify plugin, hosted under `/api/cad/v1`. It migrates its own schema
 * `cad` on registration (idempotent, advisory-locked) and serves documents with immutable
 * revisions, events and OpenAPI 3.1. Only this plugin touches the `cad` schema.
 */
export const cadPlugin: FastifyPluginAsync<CadPluginOptions> = async (app: FastifyInstance, options) => {
  await migrateCad(options.pool)
  const events = await createCadEventHub(options.pool, { pollMs: options.eventPollMs, onError: (e) => app.log.error(e) })
  app.addHook('onClose', async () => events.close())
  app.setErrorHandler((error, request, reply) => {
    const errorId = randomUUID()
    const { status, body } = errorBody(error, errorId)
    if (status >= 500) request.log.error({ err: error, errorId }, 'cad request failed')
    reply.code(status).type('application/json; charset=utf-8').send(JSON.stringify(body))
  })
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: 'not-found', message: `No route ${request.method} ${request.url}` } })
  })
  const registry: RouteSpec[] = []
  registerRoutes(app, { host: options, events }, registry)
  let doc: unknown
  app.get('/openapi.json', async (_req, reply) => {
    doc ??= buildCadOpenApi(registry)
    reply.header('Cache-Control', 'no-cache').send(doc)
  })
  options.onReady?.({ events })
}

/** OpenAPI 3.1 document generated from the route definitions. */
export function buildCadOpenApi(routes: RouteSpec[]) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of routes) {
    const parameters: unknown[] = []
    for (const [name, schema] of Object.entries(r.params ?? {})) parameters.push({ name, in: 'path', required: true, schema })
    for (const [name, schema] of Object.entries(r.query ?? {})) parameters.push({ name, in: 'query', required: false, schema })
    if (r.idempotency) parameters.push({ name: 'Idempotency-Key', in: 'header', required: r.idempotency === 'required', schema: { type: 'string', maxLength: 200 }, description: 'Retries with the same key return the first outcome (24 h); recorded in the same transaction as the change.' })
    if (r.ifMatch) parameters.push({ name: 'If-Match', in: 'header', required: false, schema: { type: 'string' }, description: 'Current revision ETag, e.g. "3"; alternative to expectedRevision.' })
    if (r.method !== 'GET')
      parameters.push(
        { name: 'X-Source-Kind', in: 'header', required: false, schema: { type: 'string', enum: ['user', 'assistant', 'import'] } },
        { name: 'X-Conversation-Id', in: 'header', required: false, schema: { type: 'string' }, description: 'Required for assistant changes' },
        { name: 'X-Proposal-Id', in: 'header', required: false, schema: { type: 'string' }, description: 'Required for assistant changes' },
      )
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      tags: [r.tag],
      parameters,
      'x-permissions': { entitlement: 'tool:cad', permission: r.permission, roles: r.permission === 'read' ? ['reader', 'editor', 'reviewer', 'administrator'] : ['editor', 'reviewer', 'administrator'] },
      security: [{ devUser: [] }, { bearer: [] }],
      responses: {
        [String(r.responseStatus ?? 200)]: { description: 'Success', content: { [r.raw ? 'text/event-stream' : 'application/json']: { schema: r.response ?? {} } } },
        '4XX': { description: 'Error `{ error: { code, message, details } }` (invalid 400/422/428, unauthenticated 401, forbidden 403, not-found 404, conflict 409)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '500': { description: 'Internal error (code unavailable, details.errorId); a write was rolled back', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    }
    if (r.body) op.requestBody = { required: true, content: { 'application/json': { schema: r.body } } }
    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method.toLowerCase()]: op }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'CAD Modeler API',
      version: CAD_API_VERSION,
      description:
        'Document store of the CAD Modeler: native ews-cad parametric documents (open JSON format, schema in @ews/cad-core) with immutable revisions, optimistic concurrency (ETag/If-Match), idempotent writes and committed-change events. Geometry is regenerated by clients; the server validates documents with the same schema and rules but runs no kernel.',
    },
    servers: [{ url: CAD_BASE_PATH }],
    components: {
      securitySchemes: { devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only' }, bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } } },
    },
    paths,
  }
}
