import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import pkg from '../package.json'

/**
 * Help manifest of the CAD Modeler (SDK 1.4, docs/modules/help.md). Topics are the Markdown files
 * in ../help; help IDs (`cad-modeler.*`) are stable across redesigns.
 */
const files = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const cadModelerHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'cad-modeler',
  displayName: 'CAD Modeler',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'cad-modeler.overview',
  keywords: ['cad', 'modeler', 'parametric', 'solid', 'sketch', 'step', 'b-rep'],
  topics: Object.entries(files)
    .map(([path, raw]) => parseHelpMarkdown(raw, `packages/tool-cad-modeler/help/${path.split('/').pop()}`))
    .sort((a, b) => a.id.localeCompare(b.id)),
  contextMappings: [
    // Toolbar.
    { toolbarItem: 'new', helpId: 'cad-modeler.document' },
    { toolbarItem: 'open', helpId: 'cad-modeler.document' },
    { toolbarItem: 'save', helpId: 'cad-modeler.document' },
    { toolbarItem: 'sketch', helpId: 'cad-modeler.sketch' },
    { toolbarItem: 'extrude', helpId: 'cad-modeler.features' },
    { toolbarItem: 'revolve', helpId: 'cad-modeler.features' },
    { toolbarItem: 'undo', helpId: 'cad-modeler.history' },
    { toolbarItem: 'redo', helpId: 'cad-modeler.history' },
    { toolbarItem: 'fit', helpId: 'cad-modeler.viewport' },
    { toolbarItem: 'export-step', helpId: 'cad-modeler.export-step' },
    // Controls inside the view (data-help-id).
    { control: 'cad-modeler.viewport', helpId: 'cad-modeler.viewport' },
    { control: 'cad-modeler.feature-tree', helpId: 'cad-modeler.regeneration' },
    { control: 'cad-modeler.parameters', helpId: 'cad-modeler.parameters' },
    { control: 'cad-modeler.document.title', helpId: 'cad-modeler.document' },
    { control: 'cad-modeler.sketch.create', helpId: 'cad-modeler.sketch' },
    { control: 'cad-modeler.sketch.edit', helpId: 'cad-modeler.sketch' },
    { control: 'cad-modeler.sketch.canvas', helpId: 'cad-modeler.sketch' },
    { control: 'cad-modeler.sketch.geometry', helpId: 'cad-modeler.sketch' },
    { control: 'cad-modeler.sketch.constrain', helpId: 'cad-modeler.constraints' },
    { control: 'cad-modeler.sketch.dimensions', helpId: 'cad-modeler.constraints' },
    { control: 'cad-modeler.feature.extrude', helpId: 'cad-modeler.features' },
    { control: 'cad-modeler.feature.revolve', helpId: 'cad-modeler.features' },
    { control: 'cad-modeler.inspect', helpId: 'cad-modeler.viewport' },
    { control: 'cad-modeler.part.material', helpId: 'cad-modeler.references' },
    { control: 'cad-modeler.references', helpId: 'cad-modeler.references' },
    { control: 'cad-modeler.diagnostics', helpId: 'cad-modeler.regeneration' },
    // Assistant operations (the registry stays authoritative for what runs).
    { operation: 'cad-modeler.describe_model', helpId: 'cad-modeler.ai' },
    { operation: 'cad-modeler.query', helpId: 'cad-modeler.ai' },
    { operation: 'cad-modeler.run_commands', helpId: 'cad-modeler.commands' },
    { operation: 'cad-modeler.undo', helpId: 'cad-modeler.history' },
    { operation: 'cad-modeler.new_document', helpId: 'cad-modeler.document' },
    { operation: 'cad-modeler.open_document', helpId: 'cad-modeler.document' },
    { operation: 'cad-modeler.export', helpId: 'cad-modeler.export-step' },
    // Objects that can be linked from CAD parts.
    { objectType: 'part', helpId: 'cad-modeler.references' },
  ],
  tutorials: [
    {
      id: 'cad-modeler.tutorial.first-part',
      title: 'Your first part',
      summary: 'Create a sketch, constrain a rectangle and extrude it into a plate.',
      topic: 'cad-modeler.getting-started',
      steps: [
        { control: 'cad-modeler.sketch.create', title: 'Create a sketch', text: 'Choose the XY plane and Create sketch.' },
        { control: 'cad-modeler.sketch.geometry', title: 'Add a rectangle', text: 'Choose Rectangle, enter width 80 and height 40, and Add rectangle. The badge shows Fully constrained.' },
        { control: 'cad-modeler.sketch.edit', title: 'Extrude', text: 'Choose Extrude this sketch, enter 10 and Create.' },
        { control: 'cad-modeler.viewport', title: 'Look at the result', text: 'Orbit with the pointer or arrow keys; click a face to inspect its stable name.' },
      ],
    },
  ],
  shortcuts: [
    { keys: 'Ctrl+Z', action: 'Undo', helpId: 'cad-modeler.shortcuts' },
    { keys: 'Ctrl+Y', action: 'Redo', helpId: 'cad-modeler.shortcuts' },
    { keys: 'Arrow keys', action: 'Orbit the 3D view', helpId: 'cad-modeler.shortcuts' },
    { keys: '+ / −', action: 'Zoom', helpId: 'cad-modeler.shortcuts' },
    { keys: 'F', action: 'Fit the model', helpId: 'cad-modeler.shortcuts' },
  ],
  apiReferences: [
    { title: 'CAD commands and queries', helpId: 'cad-modeler.commands', kind: 'guide' },
    { title: 'Assistant operations', helpId: 'cad-modeler.ai', kind: 'guide' },
  ],
}
