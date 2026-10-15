import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { RESERVED_SETTING_NAMESPACES } from '@ews/platform-sdk'
import { migrateSettings } from './db/migrate'
import { SettingsServiceError, SettingsStore, computeEffective, type Role, type SettingsRegistry } from './service'

export const SETTINGS_BASE_PATH = '/api/settings/v1'
export const SETTINGS_API_VERSION = '0.1.0'

export interface SettingsHost {
  pool: Pool
  registry: SettingsRegistry
  /** The host's identity (development X-Dev-User or production authentication). */
  authenticate: (request: FastifyRequest) => Promise<{ userId: string; entitlements: string[] }>
  roleOf: (userId: string, projectId: string) => Promise<Role | null | string>
  /** Called with the store once ready (other server-side services read settings through it). */
  onReady?: (store: SettingsStore) => void
}

const PROJECT_ID = { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9_.-]+$' }
// Values are checked by the service against their definitions (no schema coercion: null must stay null).
const VALUE = { description: 'boolean, number, string or null (null resets to the default)' }
const VALUES = { type: 'object', additionalProperties: VALUE, maxProperties: 200 }
const SCOPE_VALUES = { type: 'object', required: ['values', 'etag'], properties: { values: VALUES, etag: { type: 'string' } } }
const ERROR = { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } }

/** Fastify plugin: definitions, user and project values with ETag / If-Match, OpenAPI 3.1. */
export const settingsPlugin: FastifyPluginAsync<SettingsHost> = async (app: FastifyInstance, host) => {
  await migrateSettings(host.pool)
  const store = new SettingsStore(host.pool, host.registry)
  host.onReady?.(store)

  app.setErrorHandler((error, request, reply) => {
    const e = error as { code?: unknown; status?: unknown; statusCode?: number; message?: string; details?: unknown; validation?: unknown }
    if (error instanceof SettingsServiceError) return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } })
    if (typeof e.code === 'string' && typeof e.status === 'number' && e.message) return reply.code(e.status).send({ error: { code: e.code, message: e.message } })
    if (e.validation) return reply.code(400).send({ error: { code: 'invalid', message: `The request is not valid: ${e.message}` } })
    const errorId = randomUUID()
    request.log.error({ err: error, errorId }, 'settings request failed')
    return reply.code(500).send({ error: { code: 'unavailable', message: `Internal error (reference ${errorId}). Nothing was changed.` } })
  })

  const role = async (userId: string, projectId: string) => ((await host.roleOf(userId, projectId)) as Role | null) ?? null
  const ifMatch = (request: FastifyRequest) => (typeof request.headers['if-match'] === 'string' ? request.headers['if-match'] : undefined)

  app.get('/definitions', async (request) => {
    await host.authenticate(request)
    return {
      pages: [...new Map(host.registry.list().map((r) => [r.pageId, { id: r.pageId, title: r.pageTitle }])).values()],
      definitions: host.registry.list().map((r) => ({ ...r.definition, pageId: r.pageId })),
      reservedNamespaces: RESERVED_SETTING_NAMESPACES,
    }
  })

  app.get('/values', { schema: { querystring: { type: 'object', required: ['projectId'], properties: { projectId: PROJECT_ID } } } }, async (request) => {
    const principal = await host.authenticate(request)
    const { projectId } = request.query as { projectId: string }
    const r = await role(principal.userId, projectId)
    if (!r) throw new SettingsServiceError('forbidden', `You are not a member of project ${projectId}.`)
    const [user, project] = await Promise.all([store.read('user', principal.userId), store.read('project', projectId)])
    return {
      userId: principal.userId,
      projectId,
      role: r,
      canEditProject: r === 'administrator',
      user: { values: user.values, etag: user.etag },
      project: { values: project.values, etag: project.etag },
      effective: computeEffective(host.registry, user.values, project.values),
    }
  })

  app.put(
    '/users/me/values',
    { schema: { querystring: { type: 'object', required: ['projectId'], properties: { projectId: PROJECT_ID } }, body: { type: 'object', required: ['values'], additionalProperties: false, properties: { values: VALUES } } } },
    async (request, reply) => {
      const principal = await host.authenticate(request)
      const { projectId } = request.query as { projectId: string }
      const r = await role(principal.userId, projectId)
      if (!r) throw new SettingsServiceError('forbidden', `You are not a member of project ${projectId}.`)
      const result = await store.write('user', principal.userId, (request.body as { values: Record<string, unknown> }).values, { ifMatch: ifMatch(request), actor: { userId: principal.userId, role: r }, projectId })
      reply.header('ETag', result.etag)
      return { values: result.values, etag: result.etag }
    },
  )

  app.put(
    '/projects/:projectId/values',
    { schema: { params: { type: 'object', properties: { projectId: PROJECT_ID } }, body: { type: 'object', required: ['values'], additionalProperties: false, properties: { values: VALUES } } } },
    async (request, reply) => {
      const principal = await host.authenticate(request)
      const { projectId } = request.params as { projectId: string }
      const r = await role(principal.userId, projectId)
      if (!r) throw new SettingsServiceError('forbidden', `You are not a member of project ${projectId}.`)
      const result = await store.write('project', projectId, (request.body as { values: Record<string, unknown> }).values, { ifMatch: ifMatch(request), actor: { userId: principal.userId, role: r }, projectId })
      reply.header('ETag', result.etag)
      return { values: result.values, etag: result.etag }
    },
  )

  app.get('/openapi.json', async (_request, reply) => {
    reply.header('Cache-Control', 'no-cache').send(settingsOpenApi())
  })
}

const errors = {
  '4XX': { description: 'Error `{ error: { code, message, details } }`: invalid 400/422 (details.fields per setting), unauthenticated 401, forbidden 403, conflict 412 (stale If-Match), precondition-required 428 (If-Match missing)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
}

/** OpenAPI 3.1 description of the settings API. */
export function settingsOpenApi() {
  const security = [{ devUser: [] }, { bearer: [] }]
  const projectQuery = { name: 'projectId', in: 'query', required: true, schema: PROJECT_ID, description: 'Platform project (membership is required; project ceilings come from it)' }
  const ifMatchHeader = { name: 'If-Match', in: 'header', required: true, schema: { type: 'string' }, description: 'ETag of the scope as read (GET /values); stale writes are refused with 412' }
  const writeBody = { required: true, content: { 'application/json': { schema: { type: 'object', required: ['values'], properties: { values: { ...VALUES, description: 'Setting ID → value; null resets to the default' } } } } } }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Settings API',
      version: SETTINGS_API_VERSION,
      description:
        'Typed module settings (SDK 1.6 SettingsContribution). Definitions are registered by the API host; values are user- or project-scoped. Every write is validated on the server: registered ID, type and range, required project role, project ceilings (a person can only narrow what an administrator allows), and If-Match against the scope ETag. Secrets are never stored here; secret-reference settings hold an opaque reference written only by the owning service.',
    },
    servers: [{ url: SETTINGS_BASE_PATH }],
    components: {
      securitySchemes: { devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only' }, bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { Error: ERROR, ScopeValues: SCOPE_VALUES },
    },
    paths: {
      '/definitions': { get: { operationId: 'getDefinitions', summary: 'Registered setting definitions and pages', tags: ['Definitions'], security, responses: { '200': { description: 'Definitions', content: { 'application/json': { schema: { type: 'object' } } } }, ...errors } } },
      '/values': {
        get: {
          operationId: 'getValues', summary: 'Your values, the project values (ceilings) and the effective values', tags: ['Values'], security, parameters: [projectQuery],
          responses: { '200': { description: 'Values with ETags', content: { 'application/json': { schema: { type: 'object', required: ['user', 'project', 'effective'], properties: { user: SCOPE_VALUES, project: SCOPE_VALUES, effective: VALUES, canEditProject: { type: 'boolean' }, role: { type: 'string' } } } } } }, ...errors },
        },
      },
      '/users/me/values': {
        put: { operationId: 'putUserValues', summary: 'Change your own settings (atomic; all or nothing)', tags: ['Values'], security, parameters: [projectQuery, ifMatchHeader], requestBody: writeBody, responses: { '200': { description: 'New values and ETag', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScopeValues' } } } }, ...errors } },
      },
      '/projects/{projectId}/values': {
        put: {
          operationId: 'putProjectValues', summary: 'Change project settings and ceilings (administrator)', tags: ['Values'], security,
          parameters: [{ name: 'projectId', in: 'path', required: true, schema: PROJECT_ID }, ifMatchHeader], requestBody: writeBody,
          'x-permissions': { roles: ['administrator'], note: 'or the role a definition names in requiresPermission' },
          responses: { '200': { description: 'New values and ETag', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScopeValues' } } } }, ...errors },
        },
      },
    },
  }
}
