import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import pkg from '../package.json'

/**
 * Help manifest of the SysML Modeler (SDK 1.4, docs/modules/help.md), built from ../help/*.md.
 * Keep help IDs stable when the interface changes.
 */
const files = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const sysmlModelerHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'sysml-modeler',
  displayName: 'SysML Modeler',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'sysml-modeler.overview',
  topics: Object.entries(files)
    .map(([path, raw]) => parseHelpMarkdown(raw, `packages/tool-sysml-modeler/help/${path.split('/').pop()}`))
    .sort((a, b) => a.id.localeCompare(b.id)),
  contextMappings: [
    // Toolbar (the platform marks each item with its help ID).
    { toolbarItem: 'add', helpId: 'sysml-modeler.properties' },
    { toolbarItem: 'connect', helpId: 'sysml-modeler.views' },
    { toolbarItem: 'general', helpId: 'sysml-modeler.views' },
    { toolbarItem: 'interconnection', helpId: 'sysml-modeler.views' },
    { toolbarItem: 'text', helpId: 'sysml-modeler.text' },
    { toolbarItem: 'validate', helpId: 'sysml-modeler.validation' },
    { toolbarItem: 'history', helpId: 'sysml-modeler.history' },
    { toolbarItem: 'undo', helpId: 'sysml-modeler.history' },
    { toolbarItem: 'action-flow', helpId: 'sysml-modeler.behavior-views' },
    { toolbarItem: 'state-transition', helpId: 'sysml-modeler.behavior-views' },
    { control: 'sysml-modeler.views.action-flow', helpId: 'sysml-modeler.behavior-views' },
    { control: 'sysml-modeler.views.state-transition', helpId: 'sysml-modeler.behavior-views' },
    { operation: 'sysml-modeler.behavior', helpId: 'sysml-modeler.behavior-views' },
    { toolbarItem: 'matrix', helpId: 'sysml-modeler.matrix' },
    { toolbarItem: 'coverage', helpId: 'sysml-modeler.coverage' },
    { control: 'sysml-modeler.matrix', helpId: 'sysml-modeler.matrix' },
    { control: 'sysml-modeler.coverage', helpId: 'sysml-modeler.coverage' },
    { operation: 'sysml-modeler.matrix', helpId: 'sysml-modeler.matrix' },
    { operation: 'sysml-modeler.coverage', helpId: 'sysml-modeler.coverage' },
    // Controls inside the view (data-help-id).
    { control: 'sysml-modeler.browser', helpId: 'sysml-modeler.browser' },
    { control: 'sysml-modeler.views.general', helpId: 'sysml-modeler.views' },
    { control: 'sysml-modeler.views.interconnection', helpId: 'sysml-modeler.views' },
    { control: 'sysml-modeler.text', helpId: 'sysml-modeler.text' },
    { control: 'sysml-modeler.text.preview', helpId: 'sysml-modeler.text' },
    { control: 'sysml-modeler.text.editor', helpId: 'sysml-modeler.text' },
    { control: 'sysml-modeler.text.apply', helpId: 'sysml-modeler.text' },
    { control: 'sysml-modeler.properties', helpId: 'sysml-modeler.properties' },
    { control: 'sysml-modeler.properties.rename', helpId: 'sysml-modeler.properties' },
    { control: 'sysml-modeler.properties.value', helpId: 'sysml-modeler.properties' },
    { control: 'sysml-modeler.properties.delete', helpId: 'sysml-modeler.troubleshooting' },
    { control: 'sysml-modeler.validation', helpId: 'sysml-modeler.validation' },
    { control: 'sysml-modeler.history', helpId: 'sysml-modeler.history' },
    { control: 'sysml-modeler.create', helpId: 'sysml-modeler.tutorial.first-model' },
    { control: 'sysml-modeler.start', helpId: 'sysml-modeler.getting-started' },
    { control: 'sysml-modeler.create.confirm', helpId: 'sysml-modeler.tutorial.first-model' },
    { control: 'sysml-modeler.connect', helpId: 'sysml-modeler.views' },
    // Assistant operations (the registry stays authoritative for what runs).
    { operation: 'sysml-modeler.describe_commands', helpId: 'sysml-modeler.commands' },
    { operation: 'sysml-modeler.find_elements', helpId: 'sysml-modeler.ai' },
    { operation: 'sysml-modeler.read_element', helpId: 'sysml-modeler.ai' },
    { operation: 'sysml-modeler.validate', helpId: 'sysml-modeler.validation' },
    { operation: 'sysml-modeler.impact', helpId: 'sysml-modeler.ai' },
    { operation: 'sysml-modeler.explain_commit', helpId: 'sysml-modeler.history' },
    { operation: 'sysml-modeler.propose_commands', helpId: 'sysml-modeler.commands' },
    { operation: 'sysml-modeler.propose_text', helpId: 'sysml-modeler.text' },
    { operation: 'sysml-modeler.link_requirement', helpId: 'sysml-modeler.requirements' },
    { control: 'sysml-modeler.requirements', helpId: 'sysml-modeler.requirements' },
    { control: 'sysml-modeler.represents', helpId: 'sysml-modeler.represents' },
  ],
  tutorials: [
    {
      id: 'sysml-modeler.tutorial.first',
      title: 'Model a battery and connect it',
      summary: 'Add a part definition, use it in the system and connect it, then undo.',
      topic: 'sysml-modeler.tutorial.first-model',
      steps: [
        { control: 'sysml-modeler.browser', title: 'Choose where', text: 'Select ActuatorSystem › Electrical in the model browser.' },
        { control: 'sysml-modeler.create', title: 'Add a definition', text: 'Choose Add, kind part def, name Battery, and Create.' },
        { control: 'sysml-modeler.properties', title: 'Edit its properties', text: 'Add members (an attribute capacity = 7200 [C], a port powerOut) with Add member.' },
        { control: 'sysml-modeler.views.interconnection', title: 'Connect', text: 'Add a battery part to LinearActuator, open the Interconnection View and choose Connect.' },
        { control: 'sysml-modeler.history', title: 'Review and undo', text: 'Open History: every change is a commit with its author. Undo restores the previous versions.' },
      ],
    },
  ],
  shortcuts: [
    { keys: 'Up / Down', action: 'Move in the model browser', helpId: 'sysml-modeler.shortcuts' },
    { keys: 'Right / Left', action: 'Expand / collapse in the model browser', helpId: 'sysml-modeler.shortcuts' },
    { keys: 'Enter', action: 'Select the focused element (browser, diagram, problems)', helpId: 'sysml-modeler.shortcuts' },
    { keys: 'Ctrl+Space', action: 'Show completions in the text editor', helpId: 'sysml-modeler.text' },
    { keys: 'Ctrl+Z / Ctrl+Shift+Z', action: 'Undo / redo typing in the text editor (before Apply)', helpId: 'sysml-modeler.text' },
    { keys: 'F1', action: 'Help for the focused control', helpId: 'sysml-modeler.shortcuts' },
  ],
  apiReferences: [
    { title: 'SysML Modeler HTTP API (interactive)', url: '/api/sysml/v1/docs', kind: 'openapi', helpId: 'sysml-modeler.api' },
    { title: 'OpenAPI document', url: '/api/sysml/v1/openapi.json', kind: 'openapi', helpId: 'sysml-modeler.api' },
    { title: 'Command reference', helpId: 'sysml-modeler.commands', kind: 'guide' },
  ],
  keywords: ['sysml', 'sysml v2', 'mbse', 'systems engineering', 'model', 'architecture'],
}
