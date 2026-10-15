import { defineCadClientContract } from './contractTests'
import { createLocalCadClient } from './local'

defineCadClientContract('local adapter', async () => ({ client: createLocalCadClient(), projectId: 'PRJ-LOCAL' }))
