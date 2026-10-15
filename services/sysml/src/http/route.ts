import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { SysmlServiceError, forbidden, invalid } from '../errors'
import type { SysmlEventHub } from '../events'
import type { ProjectRow, SysmlRepository } from '../repository'

/** Roles of the platform's project membership (`platform.project_memberships`). */
export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
export type Permission = 'read' | 'write' | 'create-project'

export const PERMISSION_ROLES: Record<Permission, Role[]> = {
  read: ['reader', 'editor', 'reviewer', 'administrator'],
  write: ['editor', 'reviewer', 'administrator'],
  'create-project': ['editor', 'reviewer', 'administrator'],
}

export interface Principal {
  userId: string
  entitlements: string[]
}

export interface SysmlHost {
  pool: Pool
  /** Resolves the caller (the host's identity: development X-Dev-User or production auth). */
  authenticate: (request: FastifyRequest) => Promise<Principal>
  /** The caller's role in a platform project, or null when not a member. */
  roleOf: (userId: string, platformProjectId: string) => Promise<Role | null | string>
}

export interface Ctx {
  repo: SysmlRepository
  events: SysmlEventHub
  host: SysmlHost
}

export interface RouteSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  operationId: string
  summary: string
  description?: string
  tag: 'Projects' | 'Branches' | 'Tags' | 'Commits' | 'Elements' | 'Queries' | 'Transactions' | 'Model services' | 'Events' | 'Schema'
  /** 'aligned': Systems Modeling API PSM path; 'extension': platform extension. */
  alignment: 'aligned' | 'extension'
  permission: Permission
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  response?: Record<string, unknown>
  responseStatus?: number
  idempotent?: boolean
  raw?: boolean
  handler: (rc: RequestContext) => Promise<unknown>
}

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, unknown>
  body: any
  principal: Principal
  project?: ProjectRow
  role?: Role
  request: FastifyRequest
  reply: FastifyReply
  /** Set response headers (ETag etc.). */
  header: (name: string, value: string) => void
}

const stableJson = (v: unknown): string =>
  v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stableJson).join(',')}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`

export function registerRoute(app: FastifyInstance, ctx: Ctx, spec: RouteSpec, registry: RouteSpec[]) {
  registry.push(spec)
  app.route({
    method: spec.method,
    url: spec.path.replace(/\{(\w+)\}/g, ':$1'),
    schema: {
      ...(spec.params ? { params: { type: 'object', properties: spec.params } } : {}),
      ...(spec.query ? { querystring: { type: 'object', properties: spec.query } } : {}),
      ...(spec.body ? { body: spec.body } : {}),
    },
    handler: async (request, reply) => {
      const principal = await ctx.host.authenticate(request)
      if (!principal.entitlements.includes('tool:sysml')) throw forbidden('Your subscription does not include SysML (tool:sysml).')
      const params = request.params as Record<string, string>
      let project: ProjectRow | undefined
      let role: Role | undefined
      if (params.projectId) {
        project = await ctx.repo.getProject(params.projectId)
        const r = await ctx.host.roleOf(principal.userId, project.platform_project_id)
        if (!r) throw forbidden(`You are not a member of project ${project.platform_project_id}.`)
        role = r as Role
        if (!PERMISSION_ROLES[spec.permission].includes(role)) throw forbidden(`Your role (${role}) does not allow ${spec.permission === 'read' ? 'reading' : 'changing'} SysML models.`)
      }
      const headers: Record<string, string> = {}
      const rc: RequestContext = { params, query: (request.query ?? {}) as Record<string, unknown>, body: request.body, principal, project, role, request, reply, header: (n, v) => void (headers[n] = v) }
      const keyHeader = request.headers['idempotency-key']
      const key = typeof keyHeader === 'string' ? keyHeader.trim() : undefined
      if (key && (key.length > 200 || !/^[\x21-\x7e]+$/.test(key))) throw invalid('Idempotency-Key must be 1–200 visible ASCII characters.', { fields: { 'Idempotency-Key': 'malformed' } }, 400)
      let body: unknown
      let status = spec.responseStatus ?? 200
      if (spec.idempotent && key && spec.method !== 'GET') {
        const hash = createHash('sha256').update(`${spec.method} ${request.url.split('?')[0]}\n${stableJson(request.body ?? null)}\n${request.url.split('?')[1] ?? ''}`).digest('hex')
        const { rows } = await ctx.host.pool.query<{ request_hash: string; status_code: number; response_body: unknown }>(
          `SELECT request_hash, status_code, response_body FROM sysml.idempotency_keys WHERE actor = $1 AND key = $2 AND created_at > now() - interval '24 hours'`,
          [principal.userId, key],
        )
        if (rows[0]) {
          if (rows[0].request_hash !== hash) throw invalid('This Idempotency-Key was already used for a different request.', { fields: { 'Idempotency-Key': 'reused with a different request' } })
          reply.header('Idempotency-Replayed', 'true')
          reply.code(rows[0].status_code).type('application/json; charset=utf-8')
          return reply.send(JSON.stringify(rows[0].response_body))
        }
        body = await spec.handler(rc)
        await ctx.host.pool.query(
          `INSERT INTO sysml.idempotency_keys (actor, key, request_hash, method, path, status_code, response_body) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (actor, key) DO UPDATE SET request_hash = EXCLUDED.request_hash, status_code = EXCLUDED.status_code, response_body = EXCLUDED.response_body, created_at = now()`,
          [principal.userId, key, hash, spec.method, request.url.split('?')[0], status, JSON.stringify(body ?? null)],
        )
      } else body = await spec.handler(rc)
      if (spec.raw) return reply
      for (const [k, v] of Object.entries(headers)) reply.header(k, v)
      if (body === undefined) {
        status = 204
        return reply.code(status).send()
      }
      reply.code(status).type('application/json; charset=utf-8')
      return reply.send(JSON.stringify(body))
    },
  })
}

export function assertCommitBelongs(e: unknown): asserts e is SysmlServiceError {
  void e
}
