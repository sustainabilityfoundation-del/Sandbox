import { afterAll, beforeAll } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createHttpCadClient } from '../../../packages/cad-client/src'
import { defineCadClientContract } from '../../../packages/cad-client/src/contractTests'

/** The HTTP adapter of @ews/cad-client against the real API and PostgreSQL (as editor eli). */
let env: TestEnv
let origin = ''
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
})
afterAll(async () => env?.close())

defineCadClientContract('HTTP adapter (real API)', async () => ({ client: createHttpCadClient({ baseUrl: `${origin}/api/cad/v1`, devUser: 'eli' }), projectId: 'PRJ-ACT100' }))
