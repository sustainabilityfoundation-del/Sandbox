import type { CapabilityEntry } from '@ews/platform-sdk'

/** Capability-inventory entries of Project Management (module-registration.md, M1); the module manifest in module.ts carries them. */
const e = (entry: CapabilityEntry) => entry

export const PROJECTS_CAPABILITIES: CapabilityEntry[] = [
  e({ id: 'projects.home', module: 'projects', surface: 'header', label: 'Project Home, New project wizard and project switcher', effect: 'mutation', status: 'implemented', coverage: 'equivalent', aiOperations: ['projects.create', 'projects.open', 'projects.list_projects', 'projects.get_context'], note: 'projects.create makes a blank project (server dry run before the preview).' }),
  e({ id: 'projects.product-structure', module: 'projects', surface: 'tree', label: 'Product structure: product elements and breakdown positions', effect: 'mutation', status: 'implemented', coverage: 'equivalent', aiOperations: ['projects.create_product_element', 'projects.add_breakdown_edge'] }),
  e({ id: 'projects.artifacts', module: 'projects', surface: 'panel', label: 'Artifact registry across modules', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['projects.list_artifacts'] }),
  e({ id: 'projects.documents', module: 'projects', surface: 'panel', label: 'Project documents with provenance (for example exported STEP files)', effect: 'import', status: 'implemented', coverage: 'partial', aiOperations: ['projects.store_document'], note: 'File hand-off from a tool without passing bytes through the model is CR-PM-SDK-4.' }),
]
