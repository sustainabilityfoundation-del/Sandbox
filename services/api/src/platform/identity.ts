import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { ServiceError, migrate, type Principal, type Role } from '@ews/requirements-service'

/**
 * Platform identity, project membership and entitlements (contracts §6).
 *
 * Development: the caller names a seeded user in the `X-Dev-User` header. The header is refused
 * when NODE_ENV is 'production'. Production integration point: validate an OIDC bearer token in
 * `authenticate` and map its subject to the same `platform.users` record; nothing else changes.
 */

export const PLATFORM_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export const migratePlatform = (pool: Pool) => migrate(pool, { schema: 'platform', directory: PLATFORM_MIGRATIONS })

export const DEV_USERS: { id: string; name: string; role: Role; entitlements: string[] }[] = [
  { id: 'ada', name: 'Ada (administrator)', role: 'administrator', entitlements: ['tool:requirements', 'tool:sysml', 'tool:cad'] },
  { id: 'rui', name: 'Rui (reviewer)', role: 'reviewer', entitlements: ['tool:requirements', 'tool:sysml'] },
  { id: 'eli', name: 'Eli (editor)', role: 'editor', entitlements: ['tool:requirements', 'tool:sysml', 'tool:cad'] },
  { id: 'rho', name: 'Rho (reader)', role: 'reader', entitlements: ['tool:requirements'] },
  { id: 'nia', name: 'Nia (editor, SysML and CAD only)', role: 'editor', entitlements: ['tool:sysml', 'tool:cad'] },
]

export async function seedPlatform(pool: Pool, projectId = 'PRJ-ACT100') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const u of DEV_USERS) {
      await client.query('INSERT INTO platform.users (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [u.id, u.name])
      await client.query('INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [projectId, u.id, u.role])
      for (const e of u.entitlements) await client.query('INSERT INTO platform.entitlements (user_id, entitlement) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, e])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export interface IdentityOptions {
  production: boolean
  /**
   * Accept the X-Dev-User header. Default: `!production`. A deployed host sets it only with the explicit
   * EWS_ALLOW_DEV_IDENTITIES=1 (see config.ts `devIdentitiesAllowed`).
   */
  devIdentities?: boolean
  /**
   * Record state of a project in the Project Management registry (CR-PM-API-4). Archived projects are read-only
   * for every hosted service (the role is capped at reader); deleted projects have no members until restored.
   * Projects unknown to the registry keep their roles unchanged.
   */
  projectState?: (projectId: string) => Promise<'active' | 'archived' | 'deleted' | undefined>
}

/** Non-login identity of in-process registry adapters (CR-PM-API-2). Never a row in platform.users. */
export const SYSTEM_PROJECTS_PRINCIPAL = 'system:projects'

export function identity(pool: Pool, options: IdentityOptions) {
  // A random per-process token for in-process calls (app.inject) by registry adapters. Never logged or returned.
  const internalToken = randomBytes(32).toString('hex')
  const devIdentities = options.devIdentities ?? !options.production
  const internalMatches = (value: unknown) => typeof value === 'string' && value.length === internalToken.length && timingSafeEqual(Buffer.from(value), Buffer.from(internalToken))

  async function authenticate(request: FastifyRequest): Promise<Principal> {
    const internal = request.headers['x-internal-token']
    if (internal !== undefined) {
      if (!internalMatches(internal)) throw new ServiceError('unauthenticated', 'Invalid internal token.')
      if (request.method !== 'GET') throw new ServiceError('forbidden', 'The system principal may only read.')
      const { rows } = await pool.query<{ entitlement: string }>('SELECT DISTINCT entitlement FROM platform.entitlements ORDER BY entitlement')
      return { userId: SYSTEM_PROJECTS_PRINCIPAL, entitlements: rows.map((r) => r.entitlement) }
    }
    const dev = request.headers['x-dev-user']
    if (!devIdentities) {
      if (dev !== undefined) throw new ServiceError('unauthenticated', 'X-Dev-User is not accepted in production. Authenticate with a bearer token.')
      throw new ServiceError('unauthenticated', 'Production authentication (OIDC bearer token) is not configured on this host.')
    }
    if (typeof dev !== 'string' || !dev.trim()) throw new ServiceError('unauthenticated', 'No identity. In development send X-Dev-User with a seeded user (ada, rui, eli, rho, nia).')
    const { rows } = await pool
      .query<{ id: string; active: boolean; entitlements: string[] | null }>(
        'SELECT u.id, u.active, (SELECT array_agg(e.entitlement ORDER BY e.entitlement) FROM platform.entitlements e WHERE e.user_id = u.id) AS entitlements FROM platform.users u WHERE u.id = $1',
        [dev.trim()],
      )
      .catch((e) => {
        // The driver message stays in the server log; clients get a generic message.
        request.log.error({ err: e }, 'platform database not reachable during authentication')
        throw new ServiceError('unavailable', 'The platform database is not reachable. Try again shortly.')
      })
    const user = rows[0]
    if (!user || !user.active) throw new ServiceError('unauthenticated', `Unknown development user “${dev}”.`)
    return { userId: user.id, entitlements: user.entitlements ?? [] }
  }

  async function roleOf(userId: string, projectId: string): Promise<Role | null> {
    if (userId === SYSTEM_PROJECTS_PRINCIPAL) return 'reader'
    const { rows } = await pool.query<{ role: Role }>('SELECT role FROM platform.project_memberships WHERE user_id = $1 AND project_id = $2', [userId, projectId])
    const role = rows[0]?.role ?? null
    if (!role || !options.projectState) return role
    const state = await options.projectState(projectId)
    if (state === 'deleted') return null
    if (state === 'archived') return 'reader'
    return role
  }

  /** Raw membership role, ignoring the record state (Project Management decides itself what archived and deleted allow). */
  async function membershipRole(userId: string, projectId: string): Promise<Role | null> {
    const { rows } = await pool.query<{ role: Role }>('SELECT role FROM platform.project_memberships WHERE user_id = $1 AND project_id = $2', [userId, projectId])
    return rows[0]?.role ?? null
  }

  /** Headers for an in-process read as the system principal (registry adapters using app.inject). */
  const internalHeaders = () => ({ 'x-internal-token': internalToken })

  return { authenticate, roleOf, membershipRole, internalHeaders }
}

/** `GET /api/platform/v1/me` and, in development, the list of development users for a user selector. */
export function registerPlatformRoutes(app: FastifyInstance, pool: Pool, auth: ReturnType<typeof identity>, options: IdentityOptions) {
  app.get('/api/platform/v1/me', async (request) => {
    const principal = await auth.authenticate(request)
    const { rows } = await pool.query<{ project_id: string; role: string }>('SELECT project_id, role FROM platform.project_memberships WHERE user_id = $1 ORDER BY project_id', [principal.userId])
    return { userId: principal.userId, entitlements: principal.entitlements, projects: rows.map((r) => ({ projectId: r.project_id, role: r.role })), identity: (options.devIdentities ?? !options.production) ? 'development (X-Dev-User)' : 'production' }
  })
  if (options.devIdentities ?? !options.production) {
    app.get('/api/platform/v1/dev-users', async () => {
      const { rows } = await pool.query<{ id: string; name: string }>('SELECT id, name FROM platform.users WHERE active ORDER BY id')
      return rows
    })
  }
}
