import type { ServerModuleDescriptor } from '@ews/platform-sdk'
import { BASE_PATH } from './http/openapi'

/**
 * The Requirements server manifest (docs/specifications/module-registration.md, M6): base path, API documentation page,
 * provisioning, its place in the AI access policy (module descriptor and operation classes) and the proposal API.
 *
 * The plugin needs the twin and SysML directories and runs first in the fixed migration and seed order of `prepareDatabase`;
 * that wiring stays composed in the host (owner decision (c), pending), so the host (services/api/src/modules.ts) adds
 * `register` to this descriptor at the same list position and registration order does not change.
 */
export const requirementsServerManifest: ServerModuleDescriptor = {
  id: 'requirements',
  name: 'Requirements',
  basePath: BASE_PATH,
  docs: 'Requirements Management API',
  provisioning: { lazyReason: 'Requirements stores data by project ID; its project space appears with the first requirement.' },
  proposals: { entitlement: 'tool:requirements', projectParam: 'projectId' },
  aiModule: { id: 'requirements', label: 'Requirements', description: 'Requirements Management.', entitlement: 'tool:requirements', prefixes: ['requirements.'] },
  operations: {
    'requirements.read_for_component': 'read',
    'requirements.search': 'search',
    'requirements.explain_quality': 'calculate',
    'requirements.update': 'propose',
    'requirements.create': 'propose',
    'requirements.get': 'read',
    'requirements.get_conventions': 'read',
    'requirements.allocate': 'propose',
  },
}
