import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
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
  /**
   * With an Idempotency-Key: records the response inside the caller's database transaction (the
   * repository's commit transaction), so a committed change and its replay record are atomic.
   */
  idempotency?: IdempotencyScope
}

export interface IdempotencyScope {
  /** Stores the response in the given transaction. Throws IdempotencyRace when the same key was recorded concurrently. */
  record: (db: Pick<PoolClient, 'query'>, body: unknown) => Promise<void>
  readonly recorded: boolean
}

/** Another request with the same Idempotency-Key committed first; replay its stored outcome. */
export class IdempotencyRace extends Error {}

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
        const stored = async () =>
          (
            await ctx.host.pool.query<{ request_hash: string; status_code: number; response_body: unknown }>(
              `SELECT request_hash, status_code, response_body FROM sysml.idempotency_keys WHERE actor = $1 AND key = $2 AND created_at > now() - interval '24 hours'`,
              [principal.userId, key],
            )
          ).rows[0]
        const replay = (row: { request_hash: string; status_code: number; response_body: unknown }) => {
          if (row.request_hash !== hash) throw invalid('This Idempotency-Key was already used for a different request.', { fields: { 'Idempotency-Key': 'reused with a different request' } })
          reply.header('Idempotency-Replayed', 'true')
          reply.code(row.status_code).type('application/json; charset=utf-8')
          return reply.send(JSON.stringify(row.response_body))
        }
        const first = await stored()
        if (first) return replay(first)
        let recorded = false
        const scope: IdempotencyScope = {
          get recorded() {
            return recorded
          },
          async record(db, responseBody) {
            await db.query(`DELETE FROM sysml.idempotency_keys WHERE actor = $1 AND key = $2 AND created_at <= now() - interval '24 hours'`, [principal.userId, key])
            try {
              await db.query('SAVEPOINT idempotency')
              await db.query(
                'INSERT INTO sysml.idempotency_keys (actor, key, request_hash, method, path, status_code, response_body) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                [principal.userId, key, hash, spec.method, request.url.split('?')[0], status, JSON.stringify(responseBody ?? null)],
              )
              await db.query('RELEASE SAVEPOINT idempotency')
            } catch (e) {
              if ((e as { code?: string }).code === '23505') throw new IdempotencyRace()
              throw e
            }
            recorded = true
          },
        }
        rc.idempotency = scope
        try {
          body = await spec.handler(rc)
        } catch (e) {
          // A concurrent request with this key may have committed first (this one then fails with a
          // conflict or an IdempotencyRace): the retry gets the first outcome, as if it arrived later.
          const winner = await stored().catch(() => undefined)
          // Same key, different input, committed concurrently: refused like a sequential reuse (422), nothing applied twice.
          if (winner) return replay(winner)
          throw e
        }
        // Reads and dry runs write nothing in the database: record them after the fact.
        if (!recorded) await scope.record(ctx.host.pool, body).catch(() => undefined)
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
