import { afterAll, beforeAll } from 'vitest'
import { createHttpConceptsService, getConceptsModuleClient } from '@ews/conceptualize-client'
import { defineConceptsServiceContract } from '@ews/conceptualize-client/contract-tests'
import { createTestEnv, type TestEnv } from './helpers'

// The HTTP adapter of the SDK ConceptsService against the real API on a disposable real PostgreSQL.
let env: TestEnv
let origin: string
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
})
afterAll(async () => env?.close())

defineConceptsServiceContract('HTTP adapter (real API and PostgreSQL)', async () => {
  const service = createHttpConceptsService({ baseUrl: `${origin}/api/concepts/v1`, devUser: 'eli', retryMs: 200 })
  return {
    service,
    projectId: 'PRJ-ACT100',
    createConcept: async () => (await getConceptsModuleClient(service, 'PRJ-ACT100')!.createConcept({ name: 'Contract event' })).id,
    settle: () => env.server.conceptEvents.flush(),
  }
})

defineConceptsServiceContract('HTTP adapter as a SysML/CAD-only user (SDK read subset)', async () => ({
  service: createHttpConceptsService({ baseUrl: `${origin}/api/concepts/v1`, devUser: 'nia', retryMs: 200 }),
  projectId: 'PRJ-ACT100',
}))
