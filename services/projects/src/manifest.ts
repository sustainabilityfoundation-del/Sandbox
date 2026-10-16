import type { ServerModuleManifest } from '@ews/platform-sdk'
import { BASE_PATH } from './http/openapi'

/**
 * Project Management's server manifest (docs/specifications/module-registration.md, M1): its API documentation page and
 * its place in the AI access policy. The assistant operations `projects.*` are not classified individually, so each
 * takes the policy default (propose); declare `operations` here to change that.
 *
 * The host composes the plugin itself (`projectsPlugin` in services/api/src/server.ts) because Project Management
 * consumes the artifact sources, provisioning and settings of the other modules, so `register` is not used and
 * refuses to run. The host reads `basePath`, `docs`, `operations` and `aiModule` from this manifest.
 */
export const projectsServerManifest: ServerModuleManifest = {
  id: 'projects',
  name: 'Project Management',
  basePath: BASE_PATH,
  docs: 'Project Management API',
  aiModule: {
    id: 'projects',
    label: 'Project Management',
    description: 'Projects, members, work items and milestones (headless module).',
    prefixes: ['projects.'],
  },
  register() {
    throw new Error('Project Management is composed by the API host (it consumes the other modules’ artifact sources); register projectsPlugin there.')
  },
}
