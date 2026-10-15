import { afterAll, beforeAll } from 'vitest'
import { createHttpProjectsService, getProjectsClient } from '@ews/projects-client'
import { defineProjectsServiceContract } from '@ews/projects-client/contract-tests'
import { createTestEnv, newKey, type TestEnv } from './helpers'

// The HTTP adapter of the SDK ProjectsService against the real API on a disposable real PostgreSQL.
let env: TestEnv
let origin: string
let fixture: { projectId: string; taskId: string } | undefined
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
})
afterAll(async () => env?.close())

async function setup() {
  const service = createHttpProjectsService({ baseUrl: `${origin}/api/projects/v1`, devUser: 'eli' })
  const client = getProjectsClient(service)!
  if (!fixture) {
    const p = await client.createProject({ key: newKey(), name: 'Contract project' })
    const t = await client.createWorkItem(p.id, { kind: 'task', title: 'Contract task' })
    fixture = { projectId: p.id, taskId: t.id }
  }
  return { service, client, ...fixture }
}

defineProjectsServiceContract('HTTP adapter (real API and PostgreSQL)', async () => {
  const { service, client, projectId, taskId } = await setup()
  return {
    service,
    projectId,
    knownRef: { module: 'projects', kind: 'task', id: taskId },
    change: async () => void (await client.createWorkItem(projectId, { kind: 'task', title: 'Another' })),
    settle: () => env.server.projectEvents.flush(),
  }
})
