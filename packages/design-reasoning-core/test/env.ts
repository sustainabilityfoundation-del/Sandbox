/**
 * Test environment for the design reasoning scenarios on the real services: the API host's disposable
 * PostgreSQL environment (migrations, development users, seed, the real server), reached through Fastify inject.
 * Test infrastructure only (outside src/, not part of the package's runtime).
 */
import { createTestEnv as createApiTestEnv, type TestEnv } from '../../../services/api/test/helpers'
import { createConceptualizeHttpAdapter, createRequirementsHttpReader, type HttpTransport } from '../src/index'

export type { TestEnv }

export async function createRealEnv(): Promise<TestEnv> {
  return createApiTestEnv({ seed: true })
}

export function transportOf(env: TestEnv): HttpTransport {
  return async ({ method, path, body, headers }) => {
    const r = await env.call('', method, path, body, headers)
    return { status: r.status, body: r.body }
  }
}

export function realServices(env: TestEnv, user = 'eli') {
  const transport = transportOf(env)
  return { knowledge: createConceptualizeHttpAdapter({ transport }), requirements: createRequirementsHttpReader({ transport, user }), transport }
}

/** Adds project memberships for a new, empty project (no project service on main: test fixture). */
export async function addProject(env: TestEnv, projectId: string, members: Record<string, 'reader' | 'editor' | 'reviewer' | 'administrator'>) {
  for (const [user, role] of Object.entries(members)) {
    await env.pool.query('INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [projectId, user, role])
  }
}
