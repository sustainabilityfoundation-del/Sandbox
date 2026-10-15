import { defineConceptsServiceContract } from './contractTests'
import { createDemoConceptsService } from './demo'

// The explicit demo adapter must satisfy the same SDK contract as the HTTP adapter.
defineConceptsServiceContract('demo adapter', async () => ({ service: createDemoConceptsService(), projectId: 'PRJ-ACT100' }))
