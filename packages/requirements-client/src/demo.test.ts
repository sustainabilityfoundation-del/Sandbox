import { defineRequirementsServiceContract } from './contractTests'
import { createDemoRequirementsService } from './demo'

// The explicit demo adapter must satisfy the same SDK contract as the HTTP adapter.
defineRequirementsServiceContract('demo adapter', async () => ({ service: createDemoRequirementsService(), projectId: 'PRJ-ACT100' }))
