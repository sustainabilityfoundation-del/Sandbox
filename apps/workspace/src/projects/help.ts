import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import { projectsAssistant } from './assistant'

/**
 * Help manifest for Project Management (docs/modules/help.md). Topics are the Markdown files in ./help, the one
 * source for the Help Centre, F1 and the assistant's read_help. Every assistant operation and significant control
 * is mapped; keep help IDs stable when the interface changes.
 */
const files = import.meta.glob('./help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Assistant operation → topic. Operations not listed here fall back to the operations reference. */
const OPERATION_TOPICS: Record<string, string> = {
  'projects.create': 'projects.wizard',
  'projects.open': 'projects.home',
  'projects.list_projects': 'projects.home',
  'projects.get_context': 'projects.overview-panel',
  'projects.create_product_element': 'projects.product-structure',
  'projects.add_breakdown_edge': 'projects.product-structure',
}

export const projectsHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'projects',
  displayName: 'Project Management',
  moduleVersion: '0.1.0',
  docsVersion: '0.1.0',
  landingTopic: 'projects.overview',
  topics: Object.entries(files)
    .map(([path, raw]) => parseHelpMarkdown(raw, `apps/workspace/src/projects/help/${path.split('/').pop()}`))
    .sort((a, b) => a.id.localeCompare(b.id)),
  contextMappings: [
    // Controls (marked with data-help-id).
    { control: 'projects.switcher', helpId: 'projects.home' },
    { control: 'projects.home.project', helpId: 'projects.home' },
    { control: 'projects.wizard', helpId: 'projects.wizard' },
    { control: 'projects.overview', helpId: 'projects.overview-panel' },
    { control: 'projects.explorer', helpId: 'projects.explorer' },
    // Every assistant operation.
    ...projectsAssistant().actions.map((a) => ({ operation: a.name, helpId: OPERATION_TOPICS[a.name] ?? 'projects.assistant' })),
  ],
  tutorials: [
    {
      id: 'projects.tutorial.new-project',
      title: 'Create your first project',
      summary: 'Open Project Home, create an empty project and open it.',
      topic: 'projects.wizard',
      steps: [
        { control: 'projects.switcher', title: 'Open Project Home', text: 'The header shows the open project. Choose it to open Project Home.' },
        { title: 'New project', text: 'Choose the New project tab.' },
        { control: 'projects.wizard', title: 'Name and key', text: 'Give the project a name; the key is suggested from it. Choose disciplines, unit system and template, then Create and open.' },
        { control: 'projects.switcher', title: 'Your project is open', text: 'The header now shows your project. It is empty in every module; Requirements, Conceptualize, SysML Modeler and CAD Modeler are open.' },
      ],
    },
  ],
  shortcuts: [],
  apiReferences: [
    { title: 'Project Management HTTP API (interactive)', url: '/api/projects/v1/docs', kind: 'openapi', helpId: 'projects.overview' },
    { title: 'OpenAPI document', url: '/api/projects/v1/openapi.json', kind: 'openapi', helpId: 'projects.overview' },
  ],
  keywords: ['project', 'projects', 'project home', 'product structure', 'registry'],
}
