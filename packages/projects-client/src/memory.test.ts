import { defineProjectsServiceContract } from './contractTests'
import { createMemoryProjectsService } from './adapters'

const PROJECT = '6a0c3f2e-1111-4a2b-9c3d-000000000001'

defineProjectsServiceContract('in-memory contract-test adapter', async () => {
  const service = createMemoryProjectsService({
    projects: [{ id: PROJECT, key: 'MEM', name: 'Memory project', status: 'planning', state: 'active', role: 'editor', updatedAt: '2026-10-15T00:00:00.000Z', revision: 1 }],
    artifacts: {
      [PROJECT]: [{ artifactId: '6a0c3f2e-2222-4a2b-9c3d-000000000001', ref: { module: 'projects', kind: 'task', id: 't1' }, key: 'TSK-001', title: 'Task', category: 'work-item', lifecycle: 'working', version: { value: 1 }, availability: 'available' }],
    },
  })
  return {
    service,
    projectId: PROJECT,
    knownRef: { module: 'projects', kind: 'task', id: 't1' },
    change: async () => service.emit({ eventId: 'e1', type: 'work-item.updated', projectId: PROJECT, entityId: 't1', committedRevision: 2, occurredAt: '2026-10-15T00:00:00.000Z', actor: 'eli' }),
  }
})
