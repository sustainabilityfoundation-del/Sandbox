import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import { migrateAssistant } from './db/migrate'
import { AssistantBackend, AssistantError, type AssistantBackendOptions, type Principal } from './service'
import { WIRE_REQUEST_SCHEMA, type WireRequest } from './wire'

export const ASSISTANT_BASE_PATH = '/api/assistant/v1'
export const ASSISTANT_API_VERSION = '0.1.0'

export interface AssistantPluginOptions extends Omit<AssistantBackendOptions, 'roleOf'> {
  authenticate: (request: FastifyRequest) => Promise<Principal>
  roleOf: (userId: string, projectId: string) => Promise<string | null>
  /** Receives the backend (the host wires the OAuth callback and server-side callers to it). */
  onReady?: (backend: AssistantBackend) => void
}

const PROJECT = { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9_.-]+$' }
const projectQuery = { type: 'object', required: ['projectId'], properties: { projectId: PROJECT } }

/** The assistant API as a Fastify plugin (hosted under /api/assistant/v1). Responses never contain credentials. */
export const assistantPlugin: FastifyPluginAsync<AssistantPluginOptions> = async (app: FastifyInstance, options) => {
  await migrateAssistant(options.pool)
  const backend = new AssistantBackend({ ...options, roleOf: options.roleOf, log: options.log ?? app.log })
  options.onReady?.(backend)

  app.setErrorHandler((error, request, reply) => {
    const e = error as { code?: unknown; status?: unknown; message?: string; validation?: unknown }
    if (error instanceof AssistantError) return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } })
    if (typeof e.code === 'string' && typeof e.status === 'number' && e.message) return reply.code(e.status).send({ error: { code: e.code, message: e.message } })
    if (e.validation) return reply.code(400).send({ error: { code: 'invalid', message: `The request is not valid: ${e.message}` } })
    const errorId = randomUUID()
    // Never log request bodies here: they may contain an API key.
    request.log.error({ errorId, message: (error as Error).message }, 'assistant request failed')
    return reply.code(500).send({ error: { code: 'unavailable', message: `Internal error (reference ${errorId}).` } })
  })

  const who = (request: FastifyRequest) => options.authenticate(request)
  const pid = (request: FastifyRequest) => (request.query as { projectId: string }).projectId

  app.get('/providers', async (request) => {
    await who(request)
    return { providers: backend.providers() }
  })

  app.get('/connection', async (request) => ({ connection: await backend.status((await who(request)).userId) }))

  app.post(
    '/connection/api-key',
    { schema: { querystring: projectQuery, body: { type: 'object', required: ['provider', 'apiKey'], additionalProperties: false, properties: { provider: { type: 'string', maxLength: 60 }, method: { type: 'string', maxLength: 60 }, apiKey: { type: 'string', minLength: 1, maxLength: 500 }, model: { type: 'string', maxLength: 120 } } } } },
    async (request, reply) => {
      const principal = await who(request)
      const body = request.body as { provider: string; method?: string; apiKey: string; model?: string }
      reply.code(201)
      return { connection: await backend.connectApiKey(principal, pid(request), body) }
    },
  )

  app.post(
    '/connection/oauth/start',
    { schema: { querystring: projectQuery, body: { type: 'object', required: ['provider', 'method'], additionalProperties: false, properties: { provider: { type: 'string', maxLength: 60 }, method: { type: 'string', maxLength: 60 }, returnTo: { type: 'string', maxLength: 2000 } } } } },
    async (request) => backend.startOAuth(await who(request), pid(request), request.body as { provider: string; method: string; returnTo?: string }),
  )

  app.get('/connection/models', async (request) => backend.models((await who(request)).userId))

  app.put('/connection/model', { schema: { body: { type: 'object', required: ['model'], additionalProperties: false, properties: { model: { type: 'string', minLength: 1, maxLength: 120 } } } } }, async (request) => ({
    connection: await backend.setModel((await who(request)).userId, (request.body as { model: string }).model),
  }))

  app.post('/connection/test', async (request) => backend.test((await who(request)).userId))

  app.delete('/connection', { schema: { querystring: projectQuery } }, async (request) => backend.disconnect((await who(request)).userId, pid(request)))

  app.get('/policy', { schema: { querystring: projectQuery } }, async (request) => backend.policyView(await who(request), pid(request)))

  app.post('/preview', { schema: { body: WIRE_REQUEST_SCHEMA } }, async (request) => backend.preview(await who(request), request.body as WireRequest))

  app.post('/respond', { schema: { body: WIRE_REQUEST_SCHEMA } }, async (request) => {
    const principal = await who(request)
    const controller = new AbortController()
    request.raw.on('close', () => {
      if (!request.raw.complete) controller.abort()
    })
    return backend.respond(principal, request.body as WireRequest, controller.signal)
  })

  app.get('/audit', { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } } } } }, async (request) => ({
    records: await backend.store.auditRecords((await who(request)).userId, Number((request.query as { limit?: number }).limit ?? 50)),
  }))

  app.get('/openapi.json', async (_request, reply) => reply.header('Cache-Control', 'no-cache').send(assistantOpenApi()))
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * The OAuth loopback callback (`GET /auth/callback`, at the root of the API host on 127.0.0.1, as the
 * provider requires). Shows a small page and returns the person to the workspace; tokens never appear in it.
 */
export function registerOAuthCallback(app: FastifyInstance, backend: () => AssistantBackend | undefined, path = '/auth/callback') {
  app.get(path, async (request, reply) => {
    const b = backend()
    const result = b ? await b.completeOAuth(request.query as Record<string, string | undefined>) : { ok: false, message: 'The assistant service is not ready.', returnTo: 'http://localhost:5173/workspace/?settings=ai' }
    const target = new URL(result.returnTo)
    target.searchParams.set('settings', 'ai')
    target.searchParams.set('ai-connect', result.ok ? 'ok' : 'failed')
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Engineering Workspace: sign-in</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:CanvasText;background:Canvas}a{color:LinkText}</style></head>
<body><h1>${result.ok ? 'Account connected' : 'Not connected'}</h1><p>${escapeHtml(result.message)}</p>
<p><a href="${escapeHtml(target.toString())}">Return to the workspace</a>. You can close this tab; the workspace updates by itself.</p>
<script>try{if(window.opener){window.opener.postMessage({type:'ews-ai-connect',ok:${result.ok}},'*');setTimeout(function(){window.close()},1500)}}catch(e){}</script></body></html>`)
  })
}

/** OpenAPI 3.1 description of the assistant API. */
export function assistantOpenApi() {
  const security = [{ devUser: [] }, { bearer: [] }]
  const err = { $ref: '#/components/schemas/Error' }
  const errors = {
    '4XX': { description: 'Error `{ error: { code, message, details } }`: invalid 400/422, unauthenticated 401, forbidden 403 (not a member, forged tool result), not-connected / plan-usage-disabled / not-available 409, provider-rate-limit / usage-limit / insufficient-quota 429', content: { 'application/json': { schema: err } } },
    '5XX': { description: 'provider-invalid-credential, provider-unavailable, provider-model-not-found 502; provider-timeout 504; unavailable 500', content: { 'application/json': { schema: err } } },
  }
  const projectId = { name: 'projectId', in: 'query', required: true, schema: PROJECT }
  const ok = (description: string, schema: unknown = { type: 'object' }) => ({ '200': { description, content: { 'application/json': { schema } } }, ...errors })
  const json = (schema: unknown) => ({ required: true, content: { 'application/json': { schema } } })
  return {
    openapi: '3.1.0',
    info: {
      title: 'Assistant API',
      version: ASSISTANT_API_VERSION,
      description:
        'Provider-neutral model backend for the workspace assistant. The person connects their own account (OpenAI API key, or Sign in with ChatGPT where available); the credential is validated, stored encrypted on the server and never returned. The browser runs the tool-calling loop with POST /respond; the server sends the model only the operations the person’s AI access policy and subscription allow, refuses other tool calls, signs every call it issues and accepts tool results only for those calls. Every model call is audited (no credentials; prompts only if the person enables prompt storage).',
    },
    servers: [{ url: ASSISTANT_BASE_PATH }],
    components: {
      securitySchemes: { devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only' }, bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
        Connection: { type: ['object', 'null'], properties: { id: { type: 'string' }, provider: { type: 'string' }, method: { type: 'string' }, account: { type: 'string', description: 'Display only, e.g. "key ending abcd"' }, keyLast4: { type: 'string' }, model: { type: 'string' }, status: { enum: ['active', 'needs-sign-in', 'plan-usage-disabled'] } } },
        AssistantRequest: WIRE_REQUEST_SCHEMA,
      },
    },
    paths: {
      '/providers': { get: { operationId: 'getProviders', tags: ['Connection'], summary: 'Registered providers and their connection methods', security, responses: ok('Providers') } },
      '/connection': {
        get: { operationId: 'getConnection', tags: ['Connection'], summary: 'Your connection status (never the credential)', security, responses: ok('Status', { type: 'object', properties: { connection: { $ref: '#/components/schemas/Connection' } } }) },
        delete: { operationId: 'deleteConnection', tags: ['Connection'], summary: 'Disconnect: revoke the sign-in where supported and delete the stored credential', security, parameters: [projectId], responses: ok('Disconnected') },
      },
      '/connection/api-key': { post: { operationId: 'connectApiKey', tags: ['Connection'], summary: 'Connect with an API key (validated with the provider, then stored encrypted)', security, parameters: [projectId], requestBody: json({ type: 'object', required: ['provider', 'apiKey'], properties: { provider: { type: 'string' }, method: { type: 'string' }, apiKey: { type: 'string', writeOnly: true }, model: { type: 'string' } } }), responses: { '201': { description: 'Connected', content: { 'application/json': { schema: { type: 'object', properties: { connection: { $ref: '#/components/schemas/Connection' } } } } } }, ...errors } } },
      '/connection/oauth/start': { post: { operationId: 'startOAuth', tags: ['Connection'], summary: 'Start a provider sign-in (authorization code with PKCE); returns the URL to open', security, parameters: [projectId], requestBody: json({ type: 'object', required: ['provider', 'method'], properties: { provider: { type: 'string' }, method: { type: 'string' }, returnTo: { type: 'string' } } }), responses: ok('Authorization URL') } },
      '/connection/models': { get: { operationId: 'getModels', tags: ['Connection'], summary: 'Models available to your connected account', security, responses: ok('Models') } },
      '/connection/model': { put: { operationId: 'putModel', tags: ['Connection'], summary: 'Choose the model', security, requestBody: json({ type: 'object', required: ['model'], properties: { model: { type: 'string' } } }), responses: ok('Updated') } },
      '/connection/test': { post: { operationId: 'testConnection', tags: ['Connection'], summary: 'Test the connection with a cheap provider call', security, responses: ok('Reachable') } },
      '/policy': { get: { operationId: 'getPolicy', tags: ['Policy'], summary: 'Your effective AI access policy (settings clamped to project limits) and the operation catalogue', security, parameters: [projectId], responses: ok('Policy') } },
      '/preview': { post: { operationId: 'previewRequest', tags: ['Policy'], summary: 'What would be sent to the provider for this request (nothing is sent)', security, requestBody: json({ $ref: '#/components/schemas/AssistantRequest' }), responses: ok('Preview') } },
      '/respond': { post: { operationId: 'respond', tags: ['Assistant'], summary: 'One step of the tool-calling loop: tool calls (signed) or a final answer', security, requestBody: json({ $ref: '#/components/schemas/AssistantRequest' }), responses: ok('AssistantResponse') } },
      '/audit': { get: { operationId: 'getAudit', tags: ['Audit'], summary: 'Your recent AI calls: time, model, operations, tokens, outcome', security, parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } }], responses: ok('Records') } },
    },
  }
}
