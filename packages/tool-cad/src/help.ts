import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import pkg from '../package.json'

const files = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const cadHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'cad',
  displayName: 'CAD demo',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'cad.overview',
  topics: Object.entries(files).map(([path, raw]) => parseHelpMarkdown(raw, `packages/tool-cad/help/${path.split('/').pop()}`)).sort((a, b) => a.id.localeCompare(b.id)),
  contextMappings: [
    { toolbarItem: 'select', helpId: 'cad.features' },
    { toolbarItem: 'pan', helpId: 'cad.features' },
    { toolbarItem: 'zoom-in', helpId: 'cad.features' },
    { toolbarItem: 'zoom-out', helpId: 'cad.features' },
    { toolbarItem: 'fit', helpId: 'cad.features' },
    { toolbarItem: 'dimensions', helpId: 'cad.features' },
    { toolbarItem: 'visibility', helpId: 'cad.features' },
    { operation: 'cad.read_representation', helpId: 'cad.api' },
    { operation: 'cad.set_dimension', helpId: 'cad.api' },
  ],
  tutorials: [{ id: 'cad.tutorial.first', title: 'Explore the CAD demo', summary: 'Follow the written example.', topic: 'cad.tutorial', steps: [{ control: 'cad.features', title: 'Open the toolbar', text: 'Follow the written tutorial to inspect and edit the demo.' }] }],
  shortcuts: [{ keys: 'Enter / Space', action: 'Select a focused diagram element', helpId: 'cad.shortcuts' }, { keys: 'F1', action: 'Contextual help', helpId: 'cad.shortcuts' }],
  apiReferences: [],
}
