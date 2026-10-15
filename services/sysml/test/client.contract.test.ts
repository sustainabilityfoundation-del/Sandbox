import { afterAll, beforeAll } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createHttpSysmlClient } from '../../../packages/sysml-client/src'
import { defineSysmlClientContract } from '../../../packages/sysml-client/src/contractTests'

/** The HTTP adapter of @ews/sysml-client against the real API and PostgreSQL (as editor eli). */
let env: TestEnv
let origin = ''
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
})
afterAll(async () => env?.close())

defineSysmlClientContract('HTTP adapter (real API)', async () => ({ client: createHttpSysmlClient({ baseUrl: `${origin}/api/sysml/v1`, devUser: 'eli' }), platformProjectId: 'PRJ-ACT100' }))
