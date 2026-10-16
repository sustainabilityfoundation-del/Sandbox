import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import pkg from '../package.json'

const files = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const sysmlHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'sysml',
  displayName: 'SysML demo',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'sysml.overview',
  topics: Object.entries(files).map(([path, raw]) => parseHelpMarkdown(raw, `packages/tool-sysml/help/${path.split('/').pop()}`)).sort((a, b) => a.id.localeCompare(b.id)),
  contextMappings: [
    { toolbarItem: 'select', helpId: 'sysml.features' },
    { toolbarItem: 'add-part', helpId: 'sysml.features' },
    { toolbarItem: 'add-requirement', helpId: 'sysml.features' },
    { toolbarItem: 'connect', helpId: 'sysml.features' },
    { toolbarItem: 'fit', helpId: 'sysml.features' },
    { toolbarItem: 'text', helpId: 'sysml.features' },
    { operation: 'sysml.read_model', helpId: 'sysml.api' },
    { operation: 'sysml.create_part', helpId: 'sysml.api' },
    { operation: 'sysml.add_requirement_reference', helpId: 'sysml.api' },
    { operation: 'sysml.connect', helpId: 'sysml.api' },
  ],
  tutorials: [{ id: 'sysml.tutorial.first', title: 'Explore the SysML demo', summary: 'Follow the written example.', topic: 'sysml.tutorial', steps: [{ control: 'sysml.features', title: 'Open the toolbar', text: 'Follow the written tutorial to inspect and edit the demo.' }] }],
  shortcuts: [{ keys: 'Enter / Space', action: 'Select a focused diagram element', helpId: 'sysml.shortcuts' }, { keys: 'F1', action: 'Contextual help', helpId: 'sysml.shortcuts' }],
  apiReferences: [],
}
