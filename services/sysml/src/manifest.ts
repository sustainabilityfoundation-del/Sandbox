import type { ServerModuleDescriptor } from '@ews/platform-sdk'
import { SYSML_BASE_PATH } from './http/plugin'

/**
 * The System Model's server manifest (docs/specifications/module-registration.md, M3): base path, API documentation page,
 * provisioning, its place in the AI access policy (module descriptor and operation classes) and the proposal API.
 *
 * The plugin needs the host's pool, authentication and options, so the host (services/api/src/modules.ts) adds `register`
 * to this descriptor and keeps the plugin order. The manifest ID is the AI module ID; the provisioning ID stays `sysml`.
 */
export const sysmlServerManifest: ServerModuleDescriptor = {
  id: 'sysml-modeler',
  name: 'System Model',
  basePath: SYSML_BASE_PATH,
  docs: 'System Model API',
  provisioning: { module: 'sysml', lazyReason: 'A SysML model is created in the System Model when you start modelling; none exists in a new project.' },
  proposals: { entitlement: 'tool:sysml' },
  aiModule: { id: 'sysml-modeler', label: 'System Model', description: 'SysML v2 models (repository-backed).', entitlement: 'tool:sysml', prefixes: ['sysml-modeler.'] },
  operations: {
    'sysml-modeler.describe_commands': 'read',
    'sysml-modeler.matrix': 'read',
    'sysml-modeler.coverage': 'read',
    'sysml-modeler.behavior': 'read',
    'sysml-modeler.explain_commit': 'read',
    'sysml-modeler.find_elements': 'search',
    'sysml-modeler.impact': 'calculate',
    'sysml-modeler.link_requirement': 'propose',
    'sysml-modeler.propose_commands': 'propose',
    'sysml-modeler.propose_text': 'propose',
    'sysml-modeler.read_element': 'read',
    'sysml-modeler.validate': 'calculate',
    'sysml-modeler.create_project': 'propose',
    'sysml-modeler.link_product_element': 'propose',
    'sysml-modeler.satisfy_requirement': 'propose',
  },
}
