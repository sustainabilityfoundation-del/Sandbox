import type { ServerModuleDescriptor } from '@ews/platform-sdk'
import { BASE_PATH } from './http/openapi'

/**
 * Project Management's server manifest (docs/specifications/module-registration.md, M1): its API documentation page and
 * its place in the AI access policy. The assistant operations `projects.*` are not classified individually, so each
 * takes the policy default (propose); declare `operations` here to change that.
 *
 * The host composes the plugin itself (`projectsPlugin` in services/api/src/server.ts) because Project Management
 * consumes the artifact sources, provisioning and settings of the other modules, so this is a descriptor without `register`.
 * The host reads `basePath`, `docs`, `operations`, `aiModule` and `proposals` from it.
 */
export const projectsServerManifest: ServerModuleDescriptor = {
  id: 'projects',
  name: 'Project Management',
  basePath: BASE_PATH,
  docs: 'Project Management API',
  selectContext: { path: '/projects/{projectId}/select-context', operations: ['projects.', 'conceptualize.', 'assistant.', 'context.', 'digest'], version: 'projects-context/1' },
  aiModule: {
    id: 'projects',
    label: 'Project Management',
    description: 'Projects, members, work items and milestones (headless module).',
    prefixes: ['projects.'],
  },
}
