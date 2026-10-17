import { HELP_SCHEMA_VERSION, parseHelpMarkdown, type HelpManifest } from '@ews/platform-sdk'
import pkg from '../../package.json'

/** Help manifests the platform itself owns: the workspace shell and the AI interface. */

function topicsFrom(files: Record<string, string>, folder: string) {
  return Object.entries(files)
    .map(([path, raw]) => parseHelpMarkdown(raw, `apps/workspace/help/${folder}/${path.split('/').pop()}`))
    .sort((a, b) => a.id.localeCompare(b.id))
}

const platformFiles = import.meta.glob('../../help/platform/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const aiFiles = import.meta.glob('../../help/ai/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const platformHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'platform',
  displayName: 'Workspace',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'platform.getting-started',
  topics: topicsFrom(platformFiles, 'platform'),
  contextMappings: [
    { control: 'platform.header.baselines', helpId: 'platform.baselines' },
    { control: 'platform.header.subscription', helpId: 'platform.subscriptions' },
    { control: 'platform.header.services', helpId: 'platform.subscriptions' },
    { control: 'platform.header.help', helpId: 'platform.help' },
    { control: 'platform.header.settings', helpId: 'platform.settings' },
    { control: 'platform.rail', helpId: 'platform.layout' },
    { control: 'platform.panels', helpId: 'platform.layout' },
    { control: 'platform.statusbar', helpId: 'platform.layout' },
    { operation: 'select_objects', helpId: 'platform.getting-started' },
    { operation: 'open_tool', helpId: 'platform.getting-started' },
  ],
  tutorials: [],
  shortcuts: [
    { keys: 'Ctrl+K', action: 'Commands and tools', helpId: 'platform.shortcuts' },
    { keys: '/', action: 'Focus search', helpId: 'platform.shortcuts' },
    { keys: 'F1', action: 'Contextual help', helpId: 'platform.help' },
  ],
  apiReferences: [],
  keywords: ['workspace', 'platform', 'help'],
}

export const aiHelp: HelpManifest = {
  schemaVersion: HELP_SCHEMA_VERSION,
  moduleId: 'ai',
  displayName: 'AI Interface',
  moduleVersion: pkg.version,
  docsVersion: pkg.version,
  landingTopic: 'ai.overview',
  topics: topicsFrom(aiFiles, 'ai'),
  contextMappings: [
    { control: 'ai.panel', helpId: 'ai.overview' },
    { operation: 'propose_changes', helpId: 'ai.preview' },
    { operation: 'context.assemble', helpId: 'ai.context' },
    { operation: 'context.retrieve', helpId: 'ai.context' },
  ],
  tutorials: [],
  shortcuts: [
    { keys: 'Enter', action: 'Send a message', helpId: 'ai.overview' },
    { keys: 'Shift+Enter', action: 'New line in a message', helpId: 'ai.overview' },
  ],
  apiReferences: [],
  keywords: ['assistant', 'ai', 'chatgpt'],
}
