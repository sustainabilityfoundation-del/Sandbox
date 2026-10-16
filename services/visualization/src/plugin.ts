import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { VISUALIZATION_API_VERSION, type GenerationRequest, type JobState, type RequestProvenance } from '@ews/visualization-client'
import type { AdapterRegistry } from './adapters/registry'
import { migrateVisualization } from './db/migrate'
import { errorBody, forbidden, invalid } from './errors'
import { createVisualizationEventHub, type VisualizationEventHub } from './events'
import { BASE } from './paths'
import { VisualizationService, type BlobPort, type ImageAccessPort } from './service'

export const VISUALIZATION_BASE_PATH = BASE

/** Illustrations belong to concepts: the Conceptualize subscription covers them (enforced here, on the server). */
export const ENTITLEMENT = 'tool:conceptualize'
const WRITE_ROLES = ['editor', 'reviewer', 'administrator']

export interface Principal {
  userId: string
  entitlements: string[]
}

export interface VisualizationPluginOptions {
  pool: Pool
  blobs: BlobPort
  adapters: AdapterRegistry
  access: ImageAccessPort
  authenticate: (request: FastifyRequest) => Promise<Principal>
  roleOf: (userId: string, projectId: string) => Promise<string | null | undefined>
  eventPollMs?: number
  runner?: { concurrency?: number; pollMs?: number; staleAfterMs?: number }
  onReady?: (services: { service: VisualizationService; events: VisualizationEventHub }) => void
}

// ---- schemas (also the OpenAPI components) -----------------------------------------------------------

const uuid = { type: 'string', format: 'uuid' }
const Subject = { type: 'object', required: ['module', 'type', 'id', 'revision'], additionalProperties: false, properties: { module: { const: 'conceptualize' }, type: { const: 'concept' }, id: uuid, revision: { type: 'integer', minimum: 1 } } }
const Provenance = { type: 'object', required: ['sourceKind'], additionalProperties: false, properties: { sourceKind: { enum: ['user', 'assistant'] }, conversationId: { type: 'string', maxLength: 200 }, proposalId: { type: 'string', maxLength: 200 }, messageId: { type: 'string', maxLength: 200 } } }
const GenerationRequestSchema = {
  type: 'object',
  required: ['kind', 'subject', 'instruction'],
  additionalProperties: false,
  properties: {
    kind: { const: 'illustration' },
    subject: Subject,
    instruction: { type: 'string', minLength: 1, maxLength: 4000 },
    adapter: { type: 'string', maxLength: 100 },
    model: { type: 'string', maxLength: 100 },
    options: { type: 'object', additionalProperties: false, properties: { size: { enum: ['1024x1024', '1536x1024', '1024x1536'] }, quality: { enum: ['low', 'medium', 'high'] }, background: { enum: ['opaque', 'transparent', 'auto'] } } },
    referenceAssetIds: { type: 'array', maxItems: 4, items: uuid },
    purpose: { type: 'string', maxLength: 200 },
    clientRef: { type: 'string', maxLength: 200 },
    provenance: Provenance,
  },
}
const Asset = {
  type: 'object',
  properties: {
    id: uuid,
    projectId: { type: 'string' },
    sha256: { type: 'string' },
    mediaType: { enum: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
    byteSize: { type: 'integer' },
    width: { type: ['integer', 'null'] },
    height: { type: ['integer', 'null'] },
    origin: { enum: ['upload', 'generated'] },
    jobId: { type: ['string', 'null'] },
    testAsset: { type: 'boolean' },
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    contentUrl: { type: 'string' },
  },
}
const Job = {
  type: 'object',
  description: 'A generation job. State: pending → running → succeeded | failed | cancelled; failed and cancelled jobs can be retried.',
  properties: {
    id: uuid,
    projectId: { type: 'string' },
    batchId: { type: ['string', 'null'] },
    state: { enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'] },
    kind: { const: 'illustration' },
    subject: Subject,
    instruction: { type: 'string' },
    adapter: { type: 'string' },
    provider: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' }, method: { type: ['string', 'null'] } } },
    options: { type: 'object' },
    referenceAssets: { type: 'array', items: { type: 'object', properties: { id: uuid, sha256: { type: 'string' }, mediaType: { type: 'string' } } } },
    idempotencyKey: { type: 'string', description: 'SHA-256 of the derived request key.' },
    attempt: { type: 'integer' },
    purpose: { type: ['string', 'null'] },
    clientRef: { type: ['string', 'null'] },
    provenance: Provenance,
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    startedAt: { type: ['string', 'null'] },
    finishedAt: { type: ['string', 'null'] },
    cancelRequested: { type: 'boolean' },
    error: { type: ['object', 'null'], properties: { code: { type: 'string' }, message: { type: 'string' }, retryable: { type: 'boolean' } } },
    output: { type: ['object', 'null'], properties: { asset: { $ref: '#/components/schemas/Asset' }, revisedPrompt: { type: 'string' } } },
    usage: { type: ['object', 'null'], properties: { inputTokens: { type: 'integer' }, outputTokens: { type: 'integer' }, imageInputTokens: { type: 'integer' }, textInputTokens: { type: 'integer' }, estimatedCostUsd: { type: 'number' } } },
    testAsset: { type: 'boolean' },
  },
}
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

interface Route {
  method: 'GET' | 'POST'
  path: string
  operationId: string
  summary: string
  description?: string
  tag: 'Adapters' | 'Jobs' | 'Assets' | 'Events'
  write?: boolean
  body?: Record<string, unknown>
  query?: Record<string, unknown>
  response?: Record<string, unknown>
  status?: number
  produces?: string
  handler: (c: { principal: Principal; projectId: string; params: Record<string, string>; query: Record<string, string | undefined>; body: any; request: FastifyRequest; reply: FastifyReply }) => Promise<unknown>
}

function provenanceOf(request: FastifyRequest, body?: RequestProvenance): RequestProvenance {
  if (body) return body
  const h = (n: string) => (typeof request.headers[n] === 'string' ? (request.headers[n] as string).trim() : undefined)
  const kind = h('x-source-kind') ?? h('x-ews-source') ?? 'user'
  if (kind !== 'user' && kind !== 'assistant') throw invalid('X-Source-Kind must be user or assistant.', { 'X-Source-Kind': 'user, assistant' }, 400)
  const gateway = h('x-ews-proposal')
  const slash = gateway ? gateway.indexOf('/') : -1
  const conversationId = h('x-conversation-id') ?? (slash > 0 ? gateway!.slice(0, slash) : undefined)
  const proposalId = h('x-proposal-id') ?? (slash > 0 ? gateway!.slice(slash + 1) : undefined)
  const messageId = h('x-message-id')
  return { sourceKind: kind, ...(conversationId ? { conversationId: conversationId.slice(0, 200) } : {}), ...(proposalId ? { proposalId: proposalId.slice(0, 200) } : {}), ...(messageId ? { messageId: messageId.slice(0, 200) } : {}) }
}

/**
 * The visualization API as a Fastify plugin, hosted under `/api/visualization/v1` (contracts §1). It migrates schema
 * `visualization`, starts the job runner and serves jobs, batches, assets, events and OpenAPI 3.1.
 */
export const visualizationPlugin: FastifyPluginAsync<VisualizationPluginOptions> = async (app: FastifyInstance, options) => {
  await migrateVisualization(options.pool)
  const events = await createVisualizationEventHub(options.pool, { pollMs: options.eventPollMs, onError: (e) => app.log.error(e) })
  const service = new VisualizationService({ pool: options.pool, blobs: options.blobs, adapters: options.adapters, access: options.access, events, ...options.runner, log: app.log })
  service.start()
  app.addHook('onClose', async () => {
    await service.close()
    await events.close()
  })
  app.setErrorHandler((error, request, reply) => {
    const errorId = randomUUID()
    const { status, body } = errorBody(error, errorId)
    if (status >= 500) request.log.error({ err: error, errorId }, 'visualization request failed')
    reply.code(status).type('application/json; charset=utf-8').send(JSON.stringify(body))
  })
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'not-found', message: `No route ${request.method} ${request.url}` } }))

  const routes: Route[] = [
    {
      method: 'GET',
      path: '/adapters',
      operationId: 'listAdapters',
      summary: 'Image adapters and whether each is available to you in a project',
      description: 'Availability depends on your AI connection and your Image generation setting. Test adapters appear only on development servers.',
      tag: 'Adapters',
      query: { projectId: { type: 'string', maxLength: 100 } },
      response: { type: 'object', properties: { adapters: { type: 'array', items: { type: 'object' } }, defaultAdapter: { type: ['string', 'null'] } } },
      handler: async ({ principal, projectId }) => service.adapters(principal.userId, projectId),
    },
    {
      method: 'POST',
      path: '/projects/{projectId}/jobs',
      operationId: 'createJob',
      summary: 'Request an illustration (idempotent)',
      description:
        'Creates a generation job, or returns the job of an identical earlier request (200, created false): the key is derived from project, kind, subject and revision, normalised instruction, adapter, model, options and reference content, so repeats never generate or charge twice. Refused with 409 generation-unavailable (details.reason not-connected, images-disabled, method-unsupported, provider-missing) or 429 (daily-limit); then no job exists and nothing is charged.',
      tag: 'Jobs',
      write: true,
      body: GenerationRequestSchema,
      response: { type: 'object', properties: { job: ref('Job'), created: { type: 'boolean' } } },
      status: 201,
      handler: async ({ principal, projectId, body, request, reply }) => {
        const r = await service.createJob(principal.userId, projectId, body as GenerationRequest, { provenance: provenanceOf(request, (body as GenerationRequest).provenance) })
        reply.code(r.created ? 201 : 200)
        return r
      },
    },
    {
      method: 'POST',
      path: '/projects/{projectId}/batches',
      operationId: 'createBatch',
      summary: 'Request several illustrations; each item has its own outcome',
      description: 'Items are created independently: a refused item (outcome refused, with the error) never prevents the others. Running jobs fail or succeed independently too.',
      tag: 'Jobs',
      write: true,
      body: { type: 'object', required: ['items'], additionalProperties: false, properties: { items: { type: 'array', minItems: 1, maxItems: 6, items: GenerationRequestSchema } } },
      response: { type: 'object', properties: { batchId: uuid, items: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, outcome: { enum: ['created', 'existing', 'refused'] }, job: ref('Job'), error: { type: 'object' } } } } } },
      handler: async ({ principal, projectId, body, request }) => service.createBatch(principal.userId, projectId, body.items, provenanceOf(request)),
    },
    {
      method: 'GET',
      path: '/projects/{projectId}/jobs',
      operationId: 'listJobs',
      summary: 'Generation jobs, newest first',
      tag: 'Jobs',
      query: { conceptId: uuid, batchId: uuid, clientRef: { type: 'string', maxLength: 200 }, state: { enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'] }, limit: { type: 'integer', minimum: 1, maximum: 500 } },
      response: { type: 'object', properties: { items: { type: 'array', items: ref('Job') } } },
      handler: async ({ projectId, query }) => ({ items: await service.listJobs(projectId, { conceptId: query.conceptId, batchId: query.batchId, clientRef: query.clientRef, state: query.state as JobState | undefined, limit: query.limit ? Number(query.limit) : undefined }) }),
    },
    { method: 'GET', path: '/projects/{projectId}/jobs/{jobId}', operationId: 'getJob', summary: 'A generation job', tag: 'Jobs', response: ref('Job'), handler: async ({ projectId, params }) => service.getJob(projectId, params.jobId) },
    {
      method: 'POST',
      path: '/projects/{projectId}/jobs/{jobId}/cancel',
      operationId: 'cancelJob',
      summary: 'Cancel a job',
      description: 'Pending: cancelled at once. Running: cancelRequested, then cancelled when the adapter stops; a result that arrives afterwards is discarded. Succeeded jobs cannot be cancelled (409); their image is kept.',
      tag: 'Jobs',
      write: true,
      response: ref('Job'),
      handler: async ({ projectId, params }) => service.cancel(projectId, params.jobId),
    },
    {
      method: 'POST',
      path: '/projects/{projectId}/jobs/{jobId}/retry',
      operationId: 'retryJob',
      summary: 'Run a failed or cancelled job again',
      description: 'The same job returns to pending with attempt + 1. Access is checked again. Jobs that failed with retryable false need a changed request instead.',
      tag: 'Jobs',
      write: true,
      response: ref('Job'),
      handler: async ({ principal, projectId, params }) => service.retry(principal.userId, projectId, params.jobId),
    },
    {
      method: 'POST',
      path: '/projects/{projectId}/assets',
      operationId: 'uploadAsset',
      summary: 'Upload a reference image (PNG, JPEG or WebP, up to 1.5 MB)',
      description: 'The bytes are stored in the project blob store (content-addressed); the same content returns the existing asset.',
      tag: 'Assets',
      write: true,
      body: { type: 'object', required: ['mediaType', 'contentBase64'], additionalProperties: false, properties: { fileName: { type: 'string', maxLength: 200 }, mediaType: { enum: ['image/png', 'image/jpeg', 'image/webp'] }, contentBase64: { type: 'string', maxLength: 2_100_000 } } },
      response: ref('Asset'),
      status: 201,
      handler: async ({ principal, projectId, body }) => service.uploadAsset(principal.userId, projectId, body),
    },
    { method: 'GET', path: '/projects/{projectId}/assets/{assetId}', operationId: 'getAsset', summary: 'Asset metadata', tag: 'Assets', response: ref('Asset'), handler: async ({ projectId, params }) => service.getAsset(projectId, params.assetId) },
    {
      method: 'GET',
      path: '/projects/{projectId}/assets/{assetId}/content',
      operationId: 'getAssetContent',
      summary: 'Asset bytes (verified against their SHA-256)',
      tag: 'Assets',
      produces: 'image/*',
      handler: async ({ projectId, params, reply }) => {
        const { asset, bytes } = await service.assetContent(projectId, params.assetId)
        reply.header('Content-Type', asset.mediaType).header('ETag', `"${asset.sha256}"`).header('Cache-Control', 'private, max-age=31536000, immutable').header('X-Content-Type-Options', 'nosniff')
        // SVG (test assets only) can carry script: never let it run.
        if (asset.mediaType === 'image/svg+xml') reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        if (asset.testAsset) reply.header('X-Test-Asset', 'true')
        return reply.send(Buffer.from(bytes))
      },
    },
    {
      method: 'GET',
      path: '/projects/{projectId}/events',
      operationId: 'streamEvents',
      summary: 'Job changes as server-sent events',
      description: 'event: visualization.job-changed, id: <seq>, data: JobChangedEvent. Resume with ?after=<seq> or Last-Event-ID. Events are hints: re-read the job.',
      tag: 'Events',
      query: { after: { type: 'integer', minimum: 0 } },
      produces: 'text/event-stream',
      handler: async ({ projectId, query, request, reply }) => {
        const lastId = Number(request.headers['last-event-id'] ?? query.after ?? 0)
        reply.hijack()
        const res = reply.raw
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
        let after = Number.isFinite(lastId) ? lastId : 0
        const send = (e: { seq: number }) => {
          if (e.seq <= after) return
          after = e.seq
          res.write(`id: ${e.seq}\nevent: visualization.job-changed\ndata: ${JSON.stringify(e)}\n\n`)
        }
        const queued: { seq: number }[] = []
        let replaying = true
        const off = events.subscribe(projectId, (e) => (replaying ? queued.push(e) : send(e)))
        for (const e of await events.readAfter(projectId, after)) send(e)
        replaying = false
        for (const e of queued) send(e)
        res.write(': connected\n\n')
        const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
        request.raw.on('close', () => {
          clearInterval(ping)
          off()
        })
      },
    },
  ]

  for (const r of routes) {
    app.route({
      method: r.method,
      url: r.path.replace(/\{(\w+)\}/g, ':$1'),
      schema: { ...(r.body ? { body: r.body } : {}), ...(r.query ? { querystring: { type: 'object', properties: r.query, additionalProperties: false } } : {}) },
      handler: async (request, reply) => {
        const principal = await options.authenticate(request)
        if (!principal.entitlements.includes(ENTITLEMENT)) throw forbidden('Your subscription does not include Conceptualize (tool:conceptualize), which visuals belong to.')
        const params = (request.params ?? {}) as Record<string, string>
        const query = (request.query ?? {}) as Record<string, string | undefined>
        const projectId = params.projectId ?? query.projectId
        if (!projectId) throw invalid('Name the project (projectId).', { projectId: 'required' }, 400)
        const role = await options.roleOf(principal.userId, projectId)
        if (!role) throw forbidden(`You are not a member of project ${projectId}.`)
        if (r.write && !WRITE_ROLES.includes(role)) throw forbidden(`Your role (${role}) does not allow requesting or changing visuals.`)
        const out = await r.handler({ principal, projectId, params, query, body: request.body, request, reply })
        if (r.produces) return reply
        if (!reply.sent && reply.statusCode === 200 && r.status && r.method === 'POST' && r.operationId !== 'createJob') reply.code(r.status)
        reply.type('application/json; charset=utf-8')
        return reply.send(JSON.stringify(out))
      },
    })
  }

  let doc: unknown
  app.get('/openapi.json', async (_req, reply) => {
    doc ??= buildVisualizationOpenApi(routes)
    reply.header('Cache-Control', 'no-cache').send(doc)
  })
  options.onReady?.({ service, events })
}

export function buildVisualizationOpenApi(routes: Route[]) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of routes) {
    const parameters: unknown[] = []
    for (const m of r.path.matchAll(/\{(\w+)\}/g)) parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })
    for (const [name, schema] of Object.entries(r.query ?? {})) parameters.push({ name, in: 'query', required: r.path === '/adapters' && name === 'projectId', schema })
    if (r.write) parameters.push({ name: 'X-Source-Kind', in: 'header', required: false, schema: { enum: ['user', 'assistant'] } }, { name: 'X-Conversation-Id', in: 'header', required: false, schema: { type: 'string' } }, { name: 'X-Proposal-Id', in: 'header', required: false, schema: { type: 'string' } })
    paths[r.path] = {
      ...(paths[r.path] ?? {}),
      [r.method.toLowerCase()]: {
        operationId: r.operationId,
        summary: r.summary,
        ...(r.description ? { description: r.description } : {}),
        tags: [r.tag],
        parameters,
        'x-permissions': { entitlement: ENTITLEMENT, roles: r.write ? WRITE_ROLES : ['reader', ...WRITE_ROLES] },
        security: [{ devUser: [] }, { bearer: [] }],
        ...(r.body ? { requestBody: { required: true, content: { 'application/json': { schema: r.body } } } } : {}),
        responses: {
          [String(r.status ?? 200)]: { description: 'Success', content: { [r.produces ?? 'application/json']: { schema: r.response ?? {} } } },
          ...(r.operationId === 'createJob' ? { '200': { description: 'An identical request already has this job (created false)', content: { 'application/json': { schema: r.response } } } } : {}),
          '4XX': { description: 'Error `{ error: { code, message, details } }` (invalid 400/422, unauthenticated 401, forbidden 403, not-found 404, conflict or generation-unavailable 409, daily limit 429)', content: { 'application/json': { schema: ref('Error') } } },
          '500': { description: 'Internal error (code unavailable, details.errorId)', content: { 'application/json': { schema: ref('Error') } } },
        },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Visualization API',
      version: VISUALIZATION_API_VERSION,
      description:
        'Image generation for concept visuals (docs/specifications/concept-visualization-contracts.md): idempotent generation jobs (pending, running, succeeded, failed, cancelled) with retry and cancel, batches with per-item outcomes, assets in the project blob store, and job events. Generated images are illustrations, never evidence or geometry. Provider credentials stay on the server.',
    },
    servers: [{ url: BASE }],
    components: {
      securitySchemes: { devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only' }, bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
        GenerationRequest: GenerationRequestSchema,
        Job,
        Asset,
      },
    },
    paths,
  }
}
