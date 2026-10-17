import type { ServerModuleDescriptor } from '@ews/platform-sdk'
import { CAD_SETTINGS } from '@ews/cad-client'
import { CAD_BASE_PATH } from './http/plugin'

/**
 * The CAD's server manifest (docs/specifications/module-registration.md, M4): base path, API documentation page,
 * settings, provisioning, its place in the AI access policy (module descriptor and operation classes) and the proposal API.
 *
 * The plugin needs the host's pool, authentication and options, so the host (services/api/src/modules.ts) adds `register`
 * to this descriptor and keeps the plugin order. The manifest ID is the AI module ID; the provisioning ID stays `cad`.
 * Entitlement tool:cad is enforced by the plugin (CR-CAD-2).
 */
export const cadServerManifest: ServerModuleDescriptor = {
  id: 'cad-modeler',
  name: 'CAD',
  basePath: CAD_BASE_PATH,
  docs: 'CAD API',
  // Server-validated settings: the same definitions the tool declares.
  settings: { page: CAD_SETTINGS.page, definitions: CAD_SETTINGS.definitions },
  provisioning: { module: 'cad', lazyReason: 'CAD documents are created when you model; none exists in a new project.' },
  proposals: { entitlement: 'tool:cad', projectParam: 'projectId' },
  aiModule: { id: 'cad-modeler', label: 'CAD', description: 'Parametric CAD documents and exports.', entitlement: 'tool:cad', prefixes: ['cad-modeler.'] },
  operations: {
    'cad-modeler.describe_model': 'read',
    'cad-modeler.query': 'read',
    'cad-modeler.run_commands': 'propose',
    'cad-modeler.undo': 'propose',
    'cad-modeler.redo': 'propose',
    'cad-modeler.new_document': 'propose',
    'cad-modeler.open_document': 'propose',
    'cad-modeler.export': 'export',
    'cad-modeler.list_documents': 'read',
    'cad-modeler.save_document': 'propose',
    'cad-modeler.check': 'read',
    'cad-modeler.check_bindings': 'read',
    'cad-modeler.start_from_handoff': 'propose',
  },
}
