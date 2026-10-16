import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { forbidden, invalid } from '../errors'
import type { CadEventHub } from '../events'
import { withRead, withTransaction, type Ctx, type Provenance } from '../store'

/** Roles of the platform's project membership (`platform.project_memberships`). */
export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
export type Permission = 'read' | 'write'

export const PERMISSION_ROLES: Record<Permission, Role[]> = {
  read: ['reader', 'editor', 'reviewer', 'administrator'],
  write: ['editor', 'reviewer', 'administrator'],
}

/** The CAD subscription (contracts §1): enforced here, on the server, for every route. */
export const ENTITLEMENT = 'tool:cad'

export interface Principal {
  userId: string
  entitlements: string[]
}

export interface CadHost {
  pool: Pool
  /** Resolves the caller (development X-Dev-User or production auth). */
  authenticate: (request: FastifyRequest) => Promise<Principal>
  /** The caller's role in a platform project, or null when not a member. */
  roleOf: (userId: string, projectId: string) => Promise<Role | null | string>
}

export interface Services {
  host: CadHost
  events: CadEventHub
}

export interface Handled {
  status?: number
  body?: unknown
  /** Sets ETag to "<revision>". */
  etag?: number
  headers?: Record<string, string>
}

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, unknown>
  body: any
  principal: Principal
  role: Role
  projectId: string
  provenance: Provenance
  request: FastifyRequest
  reply: FastifyReply
  /** expectedRevision from the body or If-Match; required for writes that change a document. */
  expected: (bodyValue: number | undefined) => number
  /** One write transaction; with an Idempotency-Key the first outcome is stored in the same transaction and replayed. */
  write: (fn: (ctx: Ctx) => Promise<Handled>) => Promise<Handled>
  read: <T>(fn: (db: Ctx['db']) => Promise<T>) => Promise<T>
}

export interface RouteSpec {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  operationId: string
  summary: string
  description?: string
  tag: 'Documents' | 'Revisions' | 'Events'
  permission: Permission
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  response?: Record<string, unknown>
  responseStatus?: number
  idempotency?: 'optional' | 'required'
  ifMatch?: boolean
  raw?: boolean
  handler: (rc: RequestContext) => Promise<Handled | void>
}

const stableJson = (v: unknown): string =>
  v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stableJson).join(',')}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`

class Replay {
  constructor(readonly handled: Handled) {}
}

const header = (request: FastifyRequest, name: string): string | undefined => {
  const v = request.headers[name]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Provenance of a write: X-Source-Kind (user, assistant, import), X-Conversation-Id, X-Proposal-Id, X-Message-Id. */
export function provenanceOf(request: FastifyRequest): Provenance {
  // The platform's declarative-proposal gateway (SDK 1.8) sends X-Ews-Source and X-Ews-Proposal ("<conversation>/<proposal>").
  const gateway = header(request, 'x-ews-proposal')
  const slash = gateway ? gateway.indexOf('/') : -1
  const kind = header(request, 'x-source-kind') ?? header(request, 'x-ews-source') ?? 'user'
  if (!['user', 'assistant', 'import'].includes(kind)) throw invalid('X-Source-Kind must be user, assistant or import.', { fields: { 'X-Source-Kind': 'unknown' } }, 400)
  const ids: Record<string, string | undefined> = { conversationId: header(request, 'x-conversation-id') ?? (slash > 0 ? gateway!.slice(0, slash) : undefined), proposalId: header(request, 'x-proposal-id') ?? (slash > 0 ? gateway!.slice(slash + 1) : undefined), messageId: header(request, 'x-message-id') }
  for (const [k, v] of Object.entries(ids)) if (v && (v.length > 200 || !/^[\x21-\x7e]+$/.test(v))) throw invalid(`${k} must be 1–200 visible ASCII characters.`, { fields: { [k]: 'malformed' } }, 400)
  if (kind === 'assistant' && (!ids.conversationId || !ids.proposalId)) throw invalid('Assistant changes must name their conversation and proposal (X-Conversation-Id, X-Proposal-Id).', { fields: { 'X-Proposal-Id': 'required for assistant changes' } }, 400)
  return { sourceKind: kind as Provenance['sourceKind'], ...(ids.conversationId ? { conversationId: ids.conversationId } : {}), ...(ids.proposalId ? { proposalId: ids.proposalId } : {}), ...(ids.messageId ? { messageId: ids.messageId } : {}) }
}

function parseIfMatch(value: string | undefined): number | undefined {
  if (!value) return undefined
  const m = /^(?:W\/)?"?(\d+)"?$/.exec(value.trim())
  if (!m) throw invalid('If-Match must be an ETag such as "3".', { fields: { 'If-Match': 'malformed' } }, 400)
  return Number(m[1])
}

export function registerRoute(app: FastifyInstance, services: Services, spec: RouteSpec, registry: RouteSpec[]) {
  registry.push(spec)
  app.route({
    method: spec.method,
    url: spec.path.replace(/\{(\w+)\}/g, ':$1'),
    schema: {
      ...(spec.params ? { params: { type: 'object', properties: spec.params } } : {}),
      ...(spec.query ? { querystring: { type: 'object', properties: spec.query, additionalProperties: false } } : {}),
      ...(spec.body ? { body: spec.body } : {}),
    },
    handler: async (request, reply) => {
      const { host } = services
      const principal = await host.authenticate(request)
      if (!principal.entitlements.includes(ENTITLEMENT)) throw forbidden('Your subscription does not include CAD (tool:cad).')
      const params = request.params as Record<string, string>
      const projectId = params.projectId
      const r = await host.roleOf(principal.userId, projectId)
      if (!r) throw forbidden(`You are not a member of project ${projectId}.`)
      const role = r as Role
      if (!PERMISSION_ROLES[spec.permission].includes(role)) throw forbidden(`Your role (${role}) does not allow ${spec.permission === 'read' ? 'reading' : 'changing'} CAD documents.`)
      const provenance = spec.method === 'GET' ? ({ sourceKind: 'user' } as Provenance) : provenanceOf(request)
      const keyHeader = request.headers['idempotency-key']
      const key = typeof keyHeader === 'string' ? keyHeader.trim() : undefined
      if (spec.idempotency === 'required' && !key) throw invalid('This operation needs an Idempotency-Key header so retries are safe.', { fields: { 'Idempotency-Key': 'required' } }, 400)
      if (key && (key.length > 200 || !/^[\x21-\x7e]+$/.test(key))) throw invalid('Idempotency-Key must be 1–200 visible ASCII characters.', { fields: { 'Idempotency-Key': 'malformed' } }, 400)
      const ifMatch = parseIfMatch(request.headers['if-match'] as string | undefined)
      const base = { projectId, actor: principal.userId, provenance }

      const rc: RequestContext = {
        params,
        query: (request.query ?? {}) as Record<string, unknown>,
        body: request.body,
        principal,
        role,
        projectId,
        provenance,
        request,
        reply,
        expected(bodyValue) {
          if (bodyValue !== undefined && ifMatch !== undefined && bodyValue !== ifMatch) throw invalid('expectedRevision and If-Match disagree.', { fields: { expectedRevision: 'differs from If-Match' } }, 400)
          const v = bodyValue ?? ifMatch
          if (v === undefined) throw invalid('Send expectedRevision in the body or an If-Match header; documents are never overwritten without a revision check.', { fields: { expectedRevision: 'required' } }, 428)
          return v
        },
        read: (fn) => withRead(host.pool, fn),
        async write(fn) {
          if (!key) return withTransaction(host.pool, base, fn)
          const path = request.url.split('?')[0]
          const hash = createHash('sha256').update(`${spec.method} ${path}\n${stableJson(request.body ?? null)}\n${request.headers['if-match'] ?? ''}\n${stableJson(provenance)}`).digest('hex')
          try {
            return await withTransaction(host.pool, base, async (ctx) => {
              await ctx.db.query(`DELETE FROM cad.idempotency_keys WHERE actor = $1 AND key = $2 AND created_at < $3::timestamptz - interval '24 hours'`, [principal.userId, key, ctx.now])
              const inserted = await ctx.db.query(`INSERT INTO cad.idempotency_keys (actor, key, request_hash, method, path, status_code, created_at) VALUES ($1,$2,$3,$4,$5,0,$6) ON CONFLICT DO NOTHING`, [
                principal.userId,
                key,
                hash,
                spec.method,
                path,
                ctx.now,
              ])
              if (!inserted.rowCount) {
                const { rows } = await ctx.db.query<{ request_hash: string; status_code: number; response_body: unknown; response_etag: string | null }>(
                  'SELECT request_hash, status_code, response_body, response_etag FROM cad.idempotency_keys WHERE actor = $1 AND key = $2',
                  [principal.userId, key],
                )
                const stored = rows[0]
                if (stored.request_hash !== hash) throw invalid('This Idempotency-Key was already used for a different request.', { fields: { 'Idempotency-Key': 'reused with a different request' } })
                throw new Replay({ status: stored.status_code, body: stored.response_body, etag: stored.response_etag ? Number(stored.response_etag) : undefined, headers: { 'Idempotency-Replayed': 'true' } })
              }
              const handled = await fn(ctx)
              // Same transaction as the change: the record exists if and only if the change committed.
              await ctx.db.query('UPDATE cad.idempotency_keys SET status_code = $3, response_body = $4, response_etag = $5 WHERE actor = $1 AND key = $2', [
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
      reply.code(h.status ?? spec.responseStatus ?? 200)
      if (h.body === undefined) return reply.send()
      reply.type('application/json; charset=utf-8')
      return reply.send(JSON.stringify(h.body))
    },
  })
}
