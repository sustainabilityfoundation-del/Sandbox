import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import pkg from '../package.json'

/**
 * Help manifest for Requirements Management (SDK 1.4, docs/modules/help.md). Topics are the
 * Markdown files in ../help (one source for the in-app Help Centre, the assistant and the
 * documentation portal). Keep help IDs stable when the interface changes.
 */
const files = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const requirementsHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'requirements',
  displayName: 'Requirements Management',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'requirements.overview',
  topics: Object.entries(files)
    .map(([path, raw]) => parseHelpMarkdown(raw, `packages/tool-requirements/help/${path.split('/').pop()}`))
    .sort((a, b) => a.id.localeCompare(b.id)),
  contextMappings: [
    // Toolbar (the platform marks each item with its help ID).
    { toolbarItem: 'add', helpId: 'requirements.requirement.create' },
    { toolbarItem: 'filter', helpId: 'requirements.table' },
    { toolbarItem: 'allocate', helpId: 'requirements.requirement.trace' },
    { toolbarItem: 'trace', helpId: 'requirements.table' },
    // Controls inside the view (marked with data-help-id).
    { control: 'requirements.requirement.statement', helpId: 'requirements.writing' },
    { control: 'requirements.requirement.save', helpId: 'requirements.requirement.edit' },
    // Assistant operations: the registry stays authoritative for what runs.
    { operation: 'requirements.update', helpId: 'requirements.requirement.edit' },
    { operation: 'requirements.create', helpId: 'requirements.requirement.create' },
    { operation: 'requirements.get', helpId: 'requirements.table' },
    { operation: 'requirements.get_conventions', helpId: 'requirements.quality' },
    { operation: 'requirements.allocate', helpId: 'requirements.requirement.trace' },
    { control: 'requirements.requirement.origin', helpId: 'requirements.requirement.create' },
    { operation: 'requirements.search', helpId: 'requirements.table' },
    { operation: 'requirements.read_for_component', helpId: 'requirements.requirement.trace' },
    { operation: 'requirements.explain_quality', helpId: 'requirements.quality' },
    // Objects and fields.
    { objectType: 'requirement', helpId: 'requirements.overview' },
    { objectType: 'requirement', property: 'statement', helpId: 'requirements.writing' },
    { objectType: 'requirement', property: 'status', helpId: 'requirements.lifecycle' },
  ],
  tutorials: [
    {
      id: 'requirements.tutorial.first-requirement',
      title: 'Create your first requirement',
      summary: 'Add a requirement, write its statement and save it as revision 1.',
      topic: 'requirements.requirement.create',
      steps: [
        { control: 'requirements.requirement.create', title: 'Add a requirement', text: 'Choose Add. If a component is selected, the new requirement is allocated to it.' },
        { control: 'requirements.requirement.statement', title: 'Write the statement', text: 'Give a short title and the normative statement: one verifiable obligation, with units.' },
        { control: 'requirements.requirement.save', title: 'Save', text: 'Create the requirement. It is stored as revision 1 and appears in every tool.' },
      ],
    },
  ],
  shortcuts: [
    { keys: 'Enter', action: 'Open the selected requirement', helpId: 'requirements.shortcuts' },
    { keys: 'Escape', action: 'Close the details panel', helpId: 'requirements.shortcuts' },
    { keys: 'F1', action: 'Help for the focused control', helpId: 'requirements.shortcuts' },
  ],
  apiReferences: [
    { title: 'Requirements HTTP API (interactive)', url: '/api/requirements/v1/docs', kind: 'openapi', helpId: 'requirements.api' },
    { title: 'OpenAPI document', url: '/api/requirements/v1/openapi.json', kind: 'openapi', helpId: 'requirements.api' },
  ],
  keywords: ['requirements', 'specification', 'reqif', 'traceability'],
}
