import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { migrateSysml } from '../db/migrate'
import { errorBody } from '../errors'
import { createSysmlEventHub, type SysmlEventHub } from '../events'
import { SysmlRepository } from '../repository'
import { seedSysml } from '../seed'
import { registerRoutes } from './routes'
import type { RouteSpec, SysmlHost } from './route'

export const SYSML_BASE_PATH = '/api/sysml/v1'
export const SYSML_API_VERSION = '0.1.0'

export interface SysmlPluginOptions extends SysmlHost {
  /** Seed the multidisciplinary example (development and tests; never production). */
  seed?: boolean
  eventPollMs?: number
  /** Called with the repository and event hub (tests, host integration). */
  onReady?: (services: { repo: SysmlRepository; events: SysmlEventHub }) => void
}

/**
 * The SysML Modeler API as a Fastify plugin, hosted under `/api/sysml/v1`. It migrates its own
 * schema `sysml` on registration (idempotent, advisory-locked), optionally seeds the example, and
 * serves the Systems Modeling API-aligned subset plus platform extensions with OpenAPI 3.1.
 */
export const sysmlPlugin: FastifyPluginAsync<SysmlPluginOptions> = async (app: FastifyInstance, options) => {
  await migrateSysml(options.pool)
  const repo = new SysmlRepository(options.pool)
  const events = await createSysmlEventHub(options.pool, { pollMs: options.eventPollMs, onError: (e) => app.log.error(e) })
  if (options.seed) await seedSysml(repo)
  app.addHook('onClose', async () => events.close())
  app.setErrorHandler((error, request, reply) => {
    const errorId = randomUUID()
    const { status, body } = errorBody(error, errorId)
    if (status >= 500) request.log.error({ err: error, errorId }, 'sysml request failed')
    reply.code(status).type('application/json; charset=utf-8').send(JSON.stringify(body))
  })
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: { code: 'not-found', message: `No route ${request.method} ${request.url}` } })
  })
  const registry: RouteSpec[] = []
  registerRoutes(app, { repo, events, host: options }, registry)
  let doc: unknown
  app.get('/openapi.json', async (_req, reply) => {
    doc ??= buildSysmlOpenApi(registry)
    reply.header('Cache-Control', 'no-cache').send(doc)
  })
  options.onReady?.({ repo, events })
}

/** OpenAPI 3.1 document generated from the route definitions. */
export function buildSysmlOpenApi(routes: RouteSpec[]) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of routes) {
    const parameters: unknown[] = []
    for (const [name, schema] of Object.entries(r.params ?? {})) parameters.push({ name, in: 'path', required: true, schema })
    for (const [name, schema] of Object.entries(r.query ?? {})) parameters.push({ name, in: 'query', required: false, schema })
    if (r.method !== 'GET' && r.idempotent) parameters.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', maxLength: 200 }, description: 'Retries with the same key return the first outcome (24 h).' })
    if (r.operationId === 'postTransaction') parameters.push({ name: 'If-Match', in: 'header', required: false, schema: { type: 'string' }, description: 'Branch ETag (head commit ID); alternative to baseCommitId' })
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      tags: [r.tag],
      parameters,
      'x-ews-alignment': r.alignment === 'aligned' ? 'Systems Modeling API and Services (REST/HTTP PSM) aligned subset' : 'platform extension',
      'x-permissions': { entitlement: 'tool:sysml', permission: r.permission, roles: r.permission === 'read' ? ['reader', 'editor', 'reviewer', 'administrator'] : ['editor', 'reviewer', 'administrator'] },
      security: [{ devUser: [] }, { bearer: [] }],
      responses: {
        [String(r.responseStatus ?? 200)]: { description: 'Success', content: { [r.raw ? 'text/event-stream' : 'application/json']: { schema: r.response ?? {} } } },
        '4XX': { description: 'Error `{ error: { code, message, details } }` (invalid 400/422, rejected 422, unauthenticated 401, forbidden 403, not-found 404, conflict 409)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '500': { description: 'Internal error (code unavailable, details.errorId); a write was rolled back', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    }
    if (r.body) op.requestBody = { required: true, content: { 'application/json': { schema: r.body } } }
    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method.toLowerCase()]: op }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'SysML Modeler API',
      version: SYSML_API_VERSION,
      description:
        'Model repository of the SysML Modeler. Operations tagged x-ews-alignment "aligned" follow the resource model, paths and JSON shapes (@id, @type) of the OMG Systems Modeling API and Services (REST/HTTP PSM); this is an aligned subset, not a conformance claim. Platform extensions add typed command transactions (dry run, validation, element-level concurrency), revert, textual notation, validation, impact analysis and events. Every write is validated by the same semantic core the editor and the assistant use.',
    },
    servers: [{ url: SYSML_BASE_PATH }],
    components: {
      securitySchemes: { devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only' }, bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } } },
    },
    paths,
  }
}
