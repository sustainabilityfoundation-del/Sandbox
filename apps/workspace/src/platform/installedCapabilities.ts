/**
 * Capability-inventory entries of the installed modules (module-registration.md, increment I2). Each array is the
 * module's contribution to its manifest in installedModules.ts; they moved here unchanged from assistant/capabilities.ts.
 * When a module moves into its own package (M-steps) its array moves with it.
 */
import type { CapabilityEntry } from '@ews/platform-sdk'

const e = (entry: CapabilityEntry) => entry

export const SYSML_CAPABILITIES: CapabilityEntry[] = [
  e({ id: 'sysml.read', module: 'sysml', surface: 'panel', label: 'Diagram, property panel and text notation', effect: 'query', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.read_model'], note: 'Text notation is illustrative, not SysML v2.' }),
  e({ id: 'sysml.select', module: 'sysml', surface: 'toolbar', toolbarItem: 'select', label: 'Select mode', effect: 'view', status: 'experimental', coverage: 'none' }),
  e({ id: 'sysml.add-part', module: 'sysml', surface: 'toolbar', toolbarItem: 'add-part', label: 'Add a part', effect: 'mutation', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.create_part'] }),
  e({ id: 'sysml.add-requirement', module: 'sysml', surface: 'toolbar', toolbarItem: 'add-requirement', label: 'Add a requirement reference', effect: 'mutation', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.add_requirement_reference'] }),
  e({ id: 'sysml.connect', module: 'sysml', surface: 'toolbar', toolbarItem: 'connect', label: 'Connect parts or satisfy a requirement usage', effect: 'mutation', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.connect'] }),
  e({ id: 'sysml.fit', module: 'sysml', surface: 'toolbar', toolbarItem: 'fit', label: 'Fit the diagram', effect: 'view', status: 'experimental', coverage: 'none' }),
  e({ id: 'sysml.text', module: 'sysml', surface: 'toolbar', toolbarItem: 'text', label: 'Show text notation', effect: 'view', status: 'experimental', coverage: 'none' }),
  e({ id: 'sysml.edit-properties', module: 'sysml', surface: 'field', label: 'Rename an element, set its type name, remove links', effect: 'mutation', status: 'experimental', coverage: 'partial', aiOperations: ['propose_changes'], note: 'Field rules cover the SysML editable fields; link removal is limited to editable relationship rules.' }),
  e({ id: 'sysml.create-requirement', module: 'sysml', surface: 'dialog', label: 'Create a requirement from SysML (stored in the Requirements service) and reference it', effect: 'mutation', status: 'experimental', coverage: 'none', note: 'Sprint 003, via createRequirement. Assistant proposals cannot carry Requirements service writes yet (contract request 3).' }),
  e({ id: 'sysml.edit-requirement', module: 'sysml', surface: 'inspector', label: 'Edit a referenced requirement’s canonical title and statement from SysML', effect: 'mutation', status: 'experimental', coverage: 'partial', aiOperations: ['requirements.update'], note: 'The assistant edits through the Requirements action, which works with every tab closed; not from SysML.' }),
  e({ id: 'sysml.open-in-requirements', module: 'sysml', surface: 'inspector', label: 'Open a referenced requirement in Requirements; show a requirement’s SysML usage', effect: 'view', status: 'experimental', coverage: 'partial', aiOperations: ['open_tool', 'select_objects'], note: 'The assistant can open the tool and select the object; there is no single navigation operation.' }),
  e({ id: 'sysml.pan-zoom', module: 'sysml', surface: 'panel', label: 'Pan and zoom the diagram', effect: 'view', status: 'experimental', coverage: 'none' }),
]

export const CAD_CAPABILITIES: CapabilityEntry[] = [
  e({ id: 'cad.read', module: 'cad', surface: 'panel', label: 'Read a representation and its dimensions', effect: 'query', status: 'mock', coverage: 'equivalent', aiOperations: ['cad.read_representation'], note: 'Mock geometry; no CAD kernel.' }),
  e({ id: 'cad.select', module: 'cad', surface: 'toolbar', toolbarItem: 'select', label: 'Select mode', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.pan', module: 'cad', surface: 'toolbar', toolbarItem: 'pan', label: 'Pan mode', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.zoom-in', module: 'cad', surface: 'toolbar', toolbarItem: 'zoom-in', label: 'Zoom in', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.zoom-out', module: 'cad', surface: 'toolbar', toolbarItem: 'zoom-out', label: 'Zoom out', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.fit', module: 'cad', surface: 'toolbar', toolbarItem: 'fit', label: 'Fit', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.dimensions', module: 'cad', surface: 'toolbar', toolbarItem: 'dimensions', label: 'Edit dimensions (also updates the mapped component property)', effect: 'mutation', status: 'mock', coverage: 'equivalent', aiOperations: ['cad.set_dimension'], note: 'Same unit/range validation and CAD delegation in both paths; geometry is a mock drawing.' }),
  e({ id: 'cad.visibility', module: 'cad', surface: 'toolbar', toolbarItem: 'visibility', label: 'Hide or show parts in a view', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.snapshot', module: 'cad', surface: 'panel', label: 'Save a representation snapshot', effect: 'mutation', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.export', module: 'cad', surface: 'panel', label: 'Native CAD model, geometric checks, STL export', effect: 'export', status: 'restricted', coverage: 'restricted', note: 'Not implemented: needs a real CAD kernel (development plan sprints 8–9). Listed so it is never presented as available.' }),
]
