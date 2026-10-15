import { DemoRepository, PROJECT_ID, type StorageLike } from '@ews/model-service'
import { HELP_SCHEMA_VERSION, type PlatformModuleContribution } from '@ews/platform-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { helpSources, workspaceHelp } from '../help/workspaceHelp'
import { createWorkspaceEnvironment } from '../assistant/environment'
import { executeToolCall } from '../assistant/executor'
import { availableOperations, findToolAction } from '../assistant/toolSpecs'
import { assistantContributions } from '../assistant/contributions'
import { registerToolContributions, useSettingsState } from '../settings/store'
import { getPlatformModules, registerPlatformModule, resetPlatformModules } from './platformModules'
import { getTools } from './registry'
import { useWorkspaceStore } from './store'
import './tools'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

/** A headless module like Project Management or design reasoning: assistant operations, help and settings, no view. */
const headless: PlatformModuleContribution = {
  id: 'headless-test',
  name: 'Headless test module',
  assistant: {
    actions: [
      {
        name: 'headless-test.count',
        label: 'Count things',
        effect: 'read',
        description: 'Counts things without any view.',
        parameters: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false },
        run: (args) => ({ kind: 'data', data: { doubled: Number(args.n) * 2 }, summary: 'Counted' }),
      },
    ],
  },
  help: {
    schemaVersion: HELP_SCHEMA_VERSION,
    moduleId: 'headless-test',
    displayName: 'Headless test module',
    moduleVersion: '1.0.0',
    docsVersion: '1.0.0',
    landingTopic: 'headless-test.overview',
    topics: [{ id: 'headless-test.overview', title: 'Headless overview', kind: 'overview', summary: 'A module without a view.', body: 'It has no view.', keywords: [], source: 'test' }],
    contextMappings: [{ operation: 'headless-test.count', helpId: 'headless-test.overview' }],
    tutorials: [],
    shortcuts: [],
    apiReferences: [],
    keywords: [],
  },
  settings: { page: { id: 'headless-test', title: 'Headless test' }, definitions: [{ id: 'headless-test.counting.limit', label: 'Limit', description: 'd', scope: 'user', type: 'number', min: 1, max: 10, default: 5 }] },
}

beforeAll(async () => {
  await useWorkspaceStore.getState().initialize({
    repository: new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] }),
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: [],
  })
  registerPlatformModule(headless)
})
afterAll(() => resetPlatformModules())

describe('headless platform modules (SDK 1.8 registry)', () => {
  it('registers once, with operations prefixed by the module ID', () => {
    expect(getPlatformModules().map((m) => m.id)).toEqual(['headless-test'])
    expect(() => registerPlatformModule(headless)).toThrow(/already registered/)
    expect(() => registerPlatformModule({ id: 'requirements', name: 'clash' })).toThrow(/already registered/)
    expect(() => registerPlatformModule({ id: 'other', name: 'x', assistant: { actions: [{ ...headless.assistant!.actions[0], name: 'wrong.count' }] } })).toThrow(/prefixed/)
  })

  it('feeds the assistant through the single read path, like a tool', async () => {
    expect(assistantContributions().find((c) => c.id === 'headless-test')?.kind).toBe('platform-module')
    expect(availableOperations().some((o) => o.name === 'headless-test.count')).toBe(true)
    expect(findToolAction('headless-test.count')?.tool.name).toBe('Headless test module')
    const env = createWorkspaceEnvironment({ createProposal: () => { throw new Error('none') }, getProposal: () => undefined })
    const captured = { projectId: PROJECT_ID, configurationId: 'CFG-BASE', configurationName: '', scenarioId: 'SC-NOMINAL', scenarioName: '', scenarios: [], modelRevision: 1, selection: [], attachedSelection: false, capturedAt: '' }
    const outcome = await executeToolCall({ id: 'c1', name: 'headless-test.count', arguments: { n: 21 } }, { captured, source: { kind: 'conversation', conversationId: 'C', messageId: 'M', label: 't' }, env })
    expect(outcome).toMatchObject({ ok: true, data: { doubled: 42 } })
    // No view was opened for it.
    expect(useWorkspaceStore.getState().openToolIds).not.toContain('headless-test')
  })

  it('feeds the Help Service and the settings registry', () => {
    expect(helpSources().some((s) => s.moduleId === 'headless-test')).toBe(true)
    expect(workspaceHelp.topic('headless-test.overview')?.topic.title).toBe('Headless overview')
    registerToolContributions()
    expect(useSettingsState.getState().definitions['headless-test.counting.limit']).toBeDefined()
  })
})
