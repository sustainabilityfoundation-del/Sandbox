import { HELP_SCHEMA_VERSION, parseHelpMarkdown, validateHelpManifest, type HelpManifest, type ToolApi } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEntitlements } from '../platform/entitlements'
import { getTools } from '../platform/registry'
import '../platform/tools'
import { createHelpService, type HelpModuleSource } from './helpService'
import { aiHelp, platformHelp } from './manifests'
import { helpSources, useHelpCentre, workspaceHelp } from './workspaceHelp'

/**
 * Modules that do not ship help yet. Each is a known, incomplete feature (AGENTS.md definition of
 * done): the list may only shrink. Adding a tool without help fails this test.
 */
const KNOWN_DOCUMENTATION_GAPS = ['sysml', 'cad']

const manifests = (): HelpManifest[] => [platformHelp, aiHelp, ...getTools().flatMap((t) => (t.help ? [t.help] : []))]

function stubApi(): ToolApi<unknown> {
  return new Proxy({ services: {}, toolId: 'stub', viewId: 'stub' } as unknown as ToolApi<unknown>, {
    get: (target, key) => (key in target ? (target as unknown as Record<string | symbol, unknown>)[key] : () => undefined),
  })
}

function manifest(overrides: Partial<HelpManifest> = {}): HelpManifest {
  return {
    schemaVersion: HELP_SCHEMA_VERSION,
    moduleId: 'demo',
    displayName: 'Demo',
    moduleVersion: '2.1.0',
    docsVersion: '2.0.0',
    landingTopic: 'demo.overview',
    topics: [
      { id: 'demo.overview', title: 'Demo overview', kind: 'overview', summary: 'What demo does.', body: 'Demo module. See [the widget](help:demo.widget.create).', keywords: ['demo'] },
      { id: 'demo.widget.create', title: 'Create a widget', kind: 'guide', summary: 'Make a widget.', body: 'Press Add widget. Widgets have a torque rating.', keywords: ['widget', 'add'] },
    ],
    contextMappings: [{ toolbarItem: 'add', helpId: 'demo.widget.create' }, { objectType: 'part', helpId: 'demo.overview' }],
    tutorials: [{ id: 'demo.tutorial.first', title: 'First widget', summary: 's', topic: 'demo.widget.create', steps: [{ title: 'Add', text: 'Press Add' }] }],
    shortcuts: [],
    apiReferences: [],
    ...overrides,
  }
}

beforeEach(() => useEntitlements.getState().setPlan('all'))

describe('help manifests of installed modules', () => {
  it('conform to the shared schema, and every link and mapping resolves', () => {
    for (const m of manifests()) expect({ module: m.moduleId, issues: validateHelpManifest(m) }).toEqual({ module: m.moduleId, issues: [] })
  })

  it('every tool ships help, except the known gaps (which may only shrink)', () => {
    const missing = getTools().filter((t) => !t.help).map((t) => t.id)
    expect(missing.sort()).toEqual([...KNOWN_DOCUMENTATION_GAPS].sort())
  })

  it('maps every toolbar item and every assistant action of a documented tool to help', () => {
    const model = sampleModel()
    for (const tool of getTools().filter((t) => t.help)) {
      const items = tool.toolbar({ api: stubApi(), viewState: tool.initialViewState, context: { projectId: 'PRJ-ACT100', configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', selectedIds: [] } as never, model, selection: [] })
      const mapped = new Set(tool.help!.contextMappings.map((c) => c.toolbarItem))
      expect({ tool: tool.id, unmapped: items.filter((i) => i.type !== 'separator' && !mapped.has(i.id)).map((i) => i.id) }).toEqual({ tool: tool.id, unmapped: [] })
      const ops = new Set(tool.help!.contextMappings.map((c) => c.operation))
      expect({ tool: tool.id, unmapped: (tool.assistant?.actions ?? []).filter((a) => !ops.has(a.name)).map((a) => a.name) }).toEqual({ tool: tool.id, unmapped: [] })
    }
  })

  it('uses stable namespaced IDs and records the Markdown source', () => {
    for (const m of manifests()) for (const t of m.topics) expect(t.source).toMatch(/\.md$/)
    expect(() => parseHelpMarkdown('no front matter')).toThrow()
  })
})

describe('Help Service', () => {
  it('discovers modules dynamically and forgets removed ones', () => {
    const sources: HelpModuleSource[] = [{ moduleId: 'demo', displayName: 'Demo', moduleVersion: '2.1.0', manifest: manifest(), available: () => true }]
    const help = createHelpService(() => sources)
    expect(help.modules().map((m) => m.moduleId)).toEqual(['demo'])
    expect(help.topic('demo.widget.create')?.topic.title).toBe('Create a widget')
    sources.pop()
    expect(help.modules()).toEqual([])
    expect(help.topic('demo.widget.create')).toBeUndefined()
  })

  it('hides modules the user may not use, in listing, topics, search and context', () => {
    let allowed = true
    const help = createHelpService(() => [{ moduleId: 'demo', displayName: 'Demo', moduleVersion: '2.1.0', manifest: manifest(), available: () => allowed }])
    expect(help.search('widget').length).toBeGreaterThan(0)
    allowed = false
    expect(help.modules()).toEqual([])
    expect(help.search('widget')).toEqual([])
    expect(help.topic('demo.overview')).toBeUndefined()
    expect(help.contextual({ moduleId: 'demo', toolbarItem: 'add' })).toEqual([])
  })

  it('flags documentation written for another major version, and rejects an unknown schema', () => {
    const mismatch = createHelpService(() => [{ moduleId: 'demo', displayName: 'Demo', moduleVersion: '3.0.0', manifest: manifest(), available: () => true }])
    expect(mismatch.modules()[0]).toMatchObject({ versionMismatch: true, topicCount: 2 })
    expect(mismatch.modules()[0].issues.join()).toContain('written for version 2.0.0')
    const future = createHelpService(() => [{ moduleId: 'demo', displayName: 'Demo', moduleVersion: '2.1.0', manifest: { ...manifest(), schemaVersion: 2 as never }, available: () => true }])
    expect(future.modules()[0]).toMatchObject({ topicCount: 0, landingTopic: null })
    expect(future.topic('demo.overview')).toBeUndefined()
  })

  it('lists a module without documentation with a graceful notice', () => {
    const help = createHelpService(() => [{ moduleId: 'bare', displayName: 'Bare', moduleVersion: '1.0.0', available: () => true }])
    expect(help.modules()[0]).toMatchObject({ landingTopic: null, issues: ['No documentation yet.'] })
    expect(help.contextual({ moduleId: 'bare' })).toEqual([])
  })

  it('resolves context from most to least specific, falling back to the landing page', () => {
    const help = createHelpService(() => [{ moduleId: 'demo', displayName: 'Demo', moduleVersion: '2.1.0', manifest: manifest(), available: () => true }])
    expect(help.contextual({ moduleId: 'demo', toolbarItem: 'add' })[0].topic.id).toBe('demo.widget.create')
    expect(help.contextual({ objectType: 'part' })[0].topic.id).toBe('demo.overview')
    expect(help.contextual({ moduleId: 'demo', toolbarItem: 'unknown' })[0].topic.id).toBe('demo.overview')
  })
})

describe('workspace help', () => {
  it('searches across installed modules with provenance for retrieval', () => {
    const hits = workspaceHelp.search('baseline')
    expect(new Set(hits.map((h) => h.moduleId))).toEqual(new Set(['platform', 'requirements']))
    for (const h of hits) expect(h).toMatchObject({ docsVersion: expect.any(String), source: expect.stringMatching(/\.md$/) })
  })

  it('follows the subscription: tools outside it are not listed', () => {
    expect(workspaceHelp.modules().map((m) => m.moduleId)).toEqual(['platform', 'requirements', 'sysml', 'cad', 'conceptualize', 'ai'])
    useEntitlements.getState().setPlan('requirements')
    expect(workspaceHelp.modules().map((m) => m.moduleId)).toEqual(['platform', 'requirements', 'ai'])
    expect(workspaceHelp.contextual({ moduleId: 'cad' }).map((r) => r.topic.id)).toEqual(['platform.getting-started'])
  })

  it('answers F1 on the Requirements Add button and on a selected requirement', () => {
    expect(workspaceHelp.contextual({ moduleId: 'requirements', toolbarItem: 'add' })[0].topic.id).toBe('requirements.requirement.create')
    expect(workspaceHelp.contextual({ control: 'requirements.requirement.statement' })[0].topic.id).toBe('requirements.writing')
    expect(workspaceHelp.contextual({ objectType: 'requirement' })[0].topic.id).toBe('requirements.overview')
  })

  it('opens the Help Centre, and explains when a topic is unavailable', () => {
    workspaceHelp.open('requirements.lifecycle')
    expect(useHelpCentre.getState()).toMatchObject({ isOpen: true, topicId: 'requirements.lifecycle', notice: null })
    workspaceHelp.open('sysml.block.create')
    expect(useHelpCentre.getState()).toMatchObject({ isOpen: true, topicId: null, notice: expect.stringContaining('not available') })
  })

  it('lists every registered tool plus the workspace and AI interface', () => {
    expect(helpSources().map((s) => s.moduleId)).toEqual(['platform', ...getTools().map((t) => t.id), 'ai'])
  })
})
