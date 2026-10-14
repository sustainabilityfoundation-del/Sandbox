import { afterAll, beforeAll } from 'vitest'
import { defineRequirementsServiceContract } from '../src/contractTests'
import { createHttpRequirementsService } from '../src'
import { createTestEnv, type TestEnv } from '../../../services/api/test/helpers'

// The HTTP adapter against the real API on a disposable real PostgreSQL database.
let env: TestEnv
let origin: string
let baselineId: string
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
  baselineId = (await env.call('rho', 'GET', '/api/requirements/v1/projects/PRJ-ACT100/baselines')).body[0].id
})
afterAll(async () => env?.close())

defineRequirementsServiceContract('HTTP adapter (real API and PostgreSQL)', async () => ({
  service: createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: 'eli', retryMs: 200 }),
  projectId: 'PRJ-ACT100',
  baselineId,
  settle: () => env.server.events.flush(),
}))

defineRequirementsServiceContract('HTTP adapter as a SysML-only user (cross-module subset)', async () => ({
  service: createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: 'nia', retryMs: 200 }),
  projectId: 'PRJ-ACT100',
  baselineId,
  settle: () => env.server.events.flush(),
}))
