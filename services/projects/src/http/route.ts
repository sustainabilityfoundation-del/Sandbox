import { createHash, randomUUID } from 'node:crypto'
import type { TSchema } from '@sinclair/typebox'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { ServiceError, forbidden, invalid, notFound } from '../errors'
import { PERMISSIONS, roleAllows, type Permission, type Role } from '../domain/rules'
import { DryRunResult, withReadTransaction, withTransaction, type Ctx, type Provenance, type StoreServices } from '../store/context'
import type { EventHub } from '../events/hub'
import type { BlobStore } from '../blob/blobStore'
import type { MembershipPort, Principal, ProjectSettingsPort } from '../ports'
import type { ProvisioningModule } from '../provisioning'

export interface HostServices {
  pool: Pool
  events: EventHub
  blobs: BlobStore
  /** Resolves the caller; throws an error with code 'unauthenticated' when there is none. */
  authenticate: (request: FastifyRequest) => Promise<Principal>
  /** The caller's role in a project, or null when not a member. */
  roleOf: (userId: string, projectId: string) => Promise<Role | string | null>
  memberships: MembershipPort
  settings?: ProjectSettingsPort
  /** Installed modules, provisioned after a project is created (C1). Absent: none recorded. */
  modules?: ProvisioningModule[]
  /** Upload limit per document version in bytes (default 200 MB). */
  maxUploadBytes?: number
}

export interface Handled {
  status?: number
  body?: unknown
  /** Sets ETag to "<revision>". */
  etag?: number | string
  headers?: Record<string, string>
  /** Raw bytes (downloads). */
  bytes?: Uint8Array
  contentType?: string
}

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, unknown>
  body: unknown
  principal: Principal
  role: Role | null
  projectId: string
  provenance: Provenance
  dryRun: boolean
  request: FastifyRequest
  reply: FastifyReply
  /** expectedRevision from the body or If-Match (required for writes that use it). */
  expected: (bodyValue: number | undefined, label?: string) => number
  /** Runs a write transaction; with an Idempotency-Key the first outcome is stored and replayed; with dryRun it rolls back. */
  write: (fn: (ctx: Ctx) => Promise<Handled>) => Promise<Handled>
  read: <T>(fn: (ctx: Ctx) => Promise<T>) => Promise<T>
}

export interface RouteSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Path below the plugin prefix, with `{param}` placeholders (OpenAPI style). */
  path: string
  operationId: string
  summary: string
  description?: string
  tag: string
  params?: TSchema
  query?: TSchema
  body?: TSchema
  /** Raw request body (uploads): the body is a Buffer, not validated as JSON. */
  rawBody?: { mediaType: string; description: string }
  responses: Record<number, { description: string; schema?: TSchema; contentType?: string }>
  /** 'authenticated': any signed-in user, no project role needed (project list, create, templates, recents). */
  permission: Permission | 'authenticated'
  idempotency?: 'optional' | 'required'
  concurrency?: string
  /** Supports ?dryRun=true (validates and returns the would-be result without committing). */
  dryRun?: boolean
  /** Needs `X-Confirm: <project key>` (destructive). */
  confirm?: boolean
  /** Allowed while the project is archived or deleted (state transitions, reads of the project record). */
  anyState?: boolean
  notes?: string
  /** Handles the response itself (SSE). */
  raw?: boolean
  handler: (rc: RequestContext) => Promise<Handled | void>
}

const stableJson = (v: unknown): string =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(stableJson).join(',')}]`
      : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`

class Replay {
  constructor(readonly handled: Handled) {}
}

function parseIfMatch(header: string | undefined): number | undefined {
  if (!header) return undefined
  const m = /^(?:W\/)?"?(\d+)"?$/.exec(header.trim())
  if (!m) throw invalid('If-Match must be an ETag such as "3".', { 'If-Match': 'malformed' }, 400)
  return Number(m[1])
}

const header = (request: FastifyRequest, name: string): string | undefined => {
  const v = request.headers[name]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Provenance of a write: X-Source-Kind (user, assistant, import; default user), X-Conversation-Id, X-Proposal-Id,
 * X-Message-Id. Assistant-sourced writes must name the proposal they apply.
 */
export function provenanceOf(request: FastifyRequest): Provenance {
  const kind = header(request, 'x-source-kind') ?? 'user'
  if (!['user', 'assistant', 'import'].includes(kind)) throw invalid('X-Source-Kind must be user, assistant or import.', { 'X-Source-Kind': 'unknown' }, 400)
  const ids: Record<string, string | undefined> = { conversationId: header(request, 'x-conversation-id'), proposalId: header(request, 'x-proposal-id'), messageId: header(request, 'x-message-id') }
  for (const [k, v] of Object.entries(ids)) if (v && (v.length > 200 || !/^[\x21-\x7e]+$/.test(v))) throw invalid(`${k} must be 1–200 visible ASCII characters.`, { [k]: 'malformed' }, 400)
  if (kind === 'assistant' && (!ids.conversationId || !ids.proposalId)) throw invalid('Assistant changes must name their conversation and proposal (X-Conversation-Id, X-Proposal-Id).', { 'X-Proposal-Id': 'required for assistant changes' }, 400)
  return { sourceKind: kind as Provenance['sourceKind'], ...(ids.conversationId ? { conversationId: ids.conversationId } : {}), ...(ids.proposalId ? { proposalId: ids.proposalId } : {}), ...(ids.messageId ? { messageId: ids.messageId } : {}) }
}

export function registerRoute(app: FastifyInstance, services: HostServices, spec: RouteSpec, registry: RouteSpec[]) {
  registry.push(spec)
  const url = spec.path.replace(/\{(\w+)\}/g, ':$1')
  const store: StoreServices = { memberships: services.memberships, blobs: services.blobs, settings: services.settings, modules: services.modules }
  app.route({
    method: spec.method,
    url,
    ...(spec.rawBody ? { bodyLimit: (services.maxUploadBytes ?? 200 * 1024 * 1024) + 1024 } : {}),
    schema: {
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.query ? { querystring: spec.query } : {}),
      ...(spec.body ? { body: spec.body } : {}),
    },
    handler: async (request, reply) => {
      const params = request.params as Record<string, string>
      const projectId = params.projectId ?? ''
      const principal = await services.authenticate(request)
      let role: Role | null = null
      if (projectId) {
        role = (await services.roleOf(principal.userId, projectId)) as Role | null
        if (!role) throw forbidden(`You are not a member of project ${projectId}.`)
        const { rows } = await services.pool.query<{ key: string; state: string }>('SELECT key, state FROM projects.projects WHERE id = $1', [projectId]).catch(() => {
          throw new ServiceError('unavailable', 'The Project Management database is not reachable. Nothing was changed; try again later.')
        })
        const project = rows[0]
        if (!project) throw notFound(`No project ${projectId} in the project registry.`)
        if (!spec.anyState && project.state === 'deleted') throw forbidden(`Project ${project.key} is deleted. An administrator can restore it within the retention period.`, { reason: 'deleted' })
        if (!spec.anyState && project.state === 'archived' && spec.method !== 'GET') throw forbidden(`Project ${project.key} is archived and read-only. Restore it to make changes.`, { reason: 'archived' })
        if (spec.confirm) {
          const confirmation = header(request, 'x-confirm')
          if (!confirmation || confirmation.toUpperCase() !== project.key.toUpperCase())
            throw new ServiceError('invalid', `This is a destructive change. Confirm it by sending X-Confirm with the project key (${project.key}).`, { confirmation: 'required', expected: 'project key' }, 428)
        }
      }
      if (spec.permission !== 'authenticated' && !roleAllows(role, spec.permission)) throw forbidden(`Your role (${role ?? 'none'}) does not allow: ${PERMISSIONS[spec.permission].label.toLowerCase()}.`)
      const provenance = spec.method === 'GET' ? { sourceKind: 'user' as const } : provenanceOf(request)
      const query = (request.query ?? {}) as Record<string, unknown>
      const dryRun = query.dryRun === true || query.dryRun === 'true'
      if (dryRun && !spec.dryRun) throw invalid('This operation has no dry run.', { dryRun: 'not supported' }, 400)

      const idempotencyKey = request.headers['idempotency-key']
      const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : undefined
      if (spec.idempotency === 'required' && !key && !dryRun) throw invalid('This operation needs an Idempotency-Key header so retries are safe.', { 'Idempotency-Key': 'required' }, 400)
      if (key && (key.length > 200 || !/^[\x21-\x7e]+$/.test(key))) throw invalid('Idempotency-Key must be 1–200 visible ASCII characters.', { 'Idempotency-Key': 'malformed' }, 400)
      const base = { projectId, actor: principal.userId, provenance, role, services: store }
      const ifMatch = parseIfMatch(request.headers['if-match'] as string | undefined)

      const rc: RequestContext = {
        params,
        query,
        body: request.body,
        principal,
        role,
        projectId,
        provenance,
        dryRun,
        request,
        reply,
        expected(bodyValue, label = 'expectedRevision') {
          if (bodyValue !== undefined && ifMatch !== undefined && bodyValue !== ifMatch) throw invalid(`${label} and If-Match disagree.`, { [label]: 'differs from If-Match' }, 400)
          const v = bodyValue ?? ifMatch
          if (v === undefined) throw invalid(`Send ${label} in the body or an If-Match header; changes are never applied without a revision check.`, { [label]: 'required' }, 400)
          return v
        },
        read: (fn) => withReadTransaction(services.pool, base, fn),
        async write(fn) {
          if (dryRun) {
            return withTransaction(services.pool, base, async (ctx) => {
              const handled = await fn(ctx)
              throw new DryRunResult<Handled>({ ...handled, status: 200, body: { dryRun: true, result: handled.body }, etag: undefined })
            })
          }
          if (!key) return withTransaction(services.pool, base, fn)
          const bodyForHash = Buffer.isBuffer(request.body) ? createHash('sha256').update(request.body).digest('hex') : (request.body ?? null)
          const hash = createHash('sha256')
            .update(`${spec.method} ${request.url.split('?')[0]}\n${stableJson(bodyForHash)}\n${request.headers['if-match'] ?? ''}\n${stableJson(provenance)}`)
            .digest('hex')
          try {
            return await withTransaction(services.pool, base, async (ctx) => {
              await ctx.db.query(`DELETE FROM projects.idempotency_keys WHERE actor = $1 AND key = $2 AND created_at < $3::timestamptz - interval '24 hours'`, [principal.userId, key, ctx.now])
              const inserted = await ctx.db.query(
                `INSERT INTO projects.idempotency_keys (actor, key, request_hash, method, path, status_code, created_at) VALUES ($1,$2,$3,$4,$5,0,$6) ON CONFLICT DO NOTHING`,
                [principal.userId, key, hash, spec.method, request.url.split('?')[0], ctx.now],
              )
              if (!inserted.rowCount) {
                const { rows } = await ctx.db.query<{ request_hash: string; status_code: number; response_body: unknown; response_etag: string | null }>(
                  'SELECT request_hash, status_code, response_body, response_etag FROM projects.idempotency_keys WHERE actor = $1 AND key = $2',
                  [principal.userId, key],
                )
                const stored = rows[0]
                if (stored.request_hash !== hash) throw invalid('This Idempotency-Key was already used for a different request.', { 'Idempotency-Key': 'reused with a different request' })
                throw new Replay({ status: stored.status_code, body: stored.response_body, etag: stored.response_etag ?? undefined, headers: { 'Idempotency-Replayed': 'true' } })
              }
              const handled = await fn(ctx)
              await ctx.db.query('UPDATE projects.idempotency_keys SET status_code = $3, response_body = $4, response_etag = $5 WHERE actor = $1 AND key = $2', [
                principal.userId,
                key,
                handled.status ?? 200,
                JSON.stringify(handled.body ?? null),
                handled.etag === undefined ? null : String(handled.etag),
              ])
              return handled
            })
          } catch (e) {
            if (e instanceof Replay) return e.handled
            throw e
          }
        },
      }
      const handled = await spec.handler(rc)
      if (spec.raw) return reply
      const h = handled ?? {}
      if (h.etag !== undefined) reply.header('ETag', `"${h.etag}"`)
      for (const [k, v] of Object.entries(h.headers ?? {})) reply.header(k, v)
      reply.code(h.status ?? 200)
      if (h.bytes) return reply.type(h.contentType ?? 'application/octet-stream').send(Buffer.from(h.bytes))
      if (h.body === undefined) return reply.send()
      reply.type('application/json; charset=utf-8')
      return reply.send(JSON.stringify(h.body))
    },
  })
}

/**
 * Maps errors to `{ error: { code, message, details } }`. Unexpected failures become HTTP 500 with code
 * `unavailable` and `details: { reason: 'internal-error', errorId }`; the message never contains SQL or driver text.
 */
export function errorBody(error: unknown, errorId: string = randomUUID()): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (error instanceof ServiceError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } }
  const e = error as { validation?: { instancePath?: string; message?: string; params?: Record<string, unknown> }[]; statusCode?: number; code?: string; message?: string; validationContext?: string }
  if (e && typeof e.code === 'string' && ['unauthenticated', 'forbidden', 'unavailable', 'invalid', 'not-found', 'conflict'].includes(e.code) && typeof (e as { status?: number }).status === 'number') {
    return { status: (e as { status: number }).status, body: { error: { code: e.code, message: e.message ?? '' } } }
  }
  if (e.validation) {
    const fields: Record<string, string> = {}
    for (const v of e.validation) {
      const path = (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.') || (v.params?.missingProperty as string) || (v.params?.additionalProperty as string) || e.validationContext || 'request'
      const extra = v.params?.additionalProperty ? ` (${v.params.additionalProperty})` : v.params?.missingProperty ? ` (${v.params.missingProperty})` : ''
      fields[path] = `${v.message ?? 'invalid'}${extra}`
    }
    return { status: 400, body: { error: { code: 'invalid', message: `The ${e.validationContext ?? 'request'} is not valid.`, details: { fields } } } }
  }
  if (e.statusCode === 415 || e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return { status: 415, body: { error: { code: 'invalid', message: e.message ?? 'Unsupported content type.' } } }
  if (e.statusCode === 413 || e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return { status: 413, body: { error: { code: 'invalid', message: 'The request body is too large.' } } }
  if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) return { status: e.statusCode, body: { error: { code: e.statusCode === 404 ? 'not-found' : 'invalid', message: e.message ?? 'Bad request' } } }
  return {
    status: 500,
    body: { error: { code: 'unavailable', message: `Internal error (reference ${errorId}). The request was not completed; a write was rolled back. Retrying may succeed; report the reference if it persists.`, details: { reason: 'internal-error', errorId } } },
  }
}
