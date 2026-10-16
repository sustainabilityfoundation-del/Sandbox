import { HELP_SCHEMA_VERSION, validateHelpManifest, type CapabilityEntry, type ToolApi } from '@ews/platform-sdk'
import { defineTool, type ClientModule } from '@ews/platform-sdk/react'
import { sampleModel } from '@ews/platform-sdk/testing'
import { lazy } from 'react'
import { describe, expect, it } from 'vitest'
import { PLATFORM_CAPABILITIES, mergeCapabilities } from '../assistant/capabilities'
import { INSTALLED_MODULES, collect, hostEnv } from './installedModules'
import { getTools, registerTool } from './registry'

/**
 * Proof for module-registration.md increment I2: a module added to the list passed to `collect()` appears in the
 * inventory, the help sources and the registry, and passes the same checks as the real modules, with no edit to
 * capabilities.ts, tools.ts or the shared tests.
 */

const fixtureTool = defineTool({
  id: 'fixture',
  name: 'Fixture',
  description: 'Test module.',
  category: 'Design',
  icon: 'tools',
  version: '1.0.0',
  sdkVersion: '^1.0.0',
  entitlement: 'tool:fixture',
  supportedObjectTypes: [],
  view: lazy(async () => ({ default: () => null })),
  initialViewState: {},
  toolbar: () => [{ type: 'button', id: 'ping', label: 'Ping', onClick: () => undefined }],
  assistant: {
    actions: [
      {
        name: 'fixture.ping',
        label: 'Ping',
        description: 'Answers.',
        parameters: { type: 'object', properties: {} },
        run: () => ({ kind: 'data', data: 'pong', summary: 'pong' }),
      },
    ],
  },
  help: {
    schemaVersion: HELP_SCHEMA_VERSION,
    moduleId: 'fixture',
    displayName: 'Fixture',
    moduleVersion: '1.0.0',
    docsVersion: '1.0.0',
    landingTopic: 'fixture.overview',
    topics: [{ id: 'fixture.overview', title: 'Fixture overview', kind: 'overview', summary: 'What the fixture does.', body: 'A test module.', keywords: ['fixture'], source: 'packages/fixture/help/overview.md' }],
    contextMappings: [
      { toolbarItem: 'ping', helpId: 'fixture.overview' },
      { operation: 'fixture.ping', helpId: 'fixture.overview' },
    ],
    tutorials: [],
    shortcuts: [],
    apiReferences: [],
  },
})

const fixtureCapabilities: CapabilityEntry[] = [
  { id: 'fixture.ping', module: 'fixture', surface: 'toolbar', toolbarItem: 'ping', label: 'Ping', effect: 'query', status: 'experimental', coverage: 'shared', aiOperations: ['fixture.ping'] },
]

const fixtureModule: ClientModule = {
  manifest: { schemaVersion: 1, id: 'fixture', name: 'Fixture', entitlement: 'tool:fixture', capabilities: fixtureCapabilities },
  tool: () => fixtureTool,
}

function stubApi(): ToolApi<unknown> {
  return new Proxy({ services: {}, toolId: 'stub', viewId: 'stub' } as unknown as ToolApi<unknown>, {
    get: (target, key) => (key in target ? (target as unknown as Record<string | symbol, unknown>)[key] : () => undefined),
  })
}

describe('collect()', () => {
  it('collects the installed modules in list order', () => {
    const c = collect()
    expect(c.tools.map((t) => t.id)).toEqual(['requirements', 'sysml', 'cad', 'conceptualize', 'cad-modeler', 'sysml-modeler'])
    expect(c.platformModules.map((m) => m.id)).toEqual(['projects'])
    expect(c.help.map((s) => s.moduleId)).toEqual(['requirements', 'sysml', 'cad', 'conceptualize', 'cad-modeler', 'sysml-modeler', 'projects'])
    expect(c.defaultOpen).toEqual(['requirements', 'sysml', 'cad', 'conceptualize'])
    expect(c.capabilities.length).toBeGreaterThan(100)
  })

  it('maps the host env to each factory (CAD files|api, SysML local|api)', () => {
    const demo = collect(INSTALLED_MODULES, { requirementsMode: 'demo', devUser: 'eli' })
    const api = collect(INSTALLED_MODULES, { requirementsMode: 'api', devUser: 'eli' })
    expect(demo.tools.map((t) => t.id)).toEqual(api.tools.map((t) => t.id))
    expect(hostEnv()).toMatchObject({ requirementsMode: expect.stringMatching(/^(api|demo)$/), devUser: expect.any(String) })
  })

  it('rejects a malformed list', () => {
    expect(() => collect([fixtureModule, fixtureModule])).toThrow(/twice/)
    const stolen: ClientModule = { manifest: { schemaVersion: 1, id: 'other', name: 'Other', capabilities: fixtureCapabilities } }
    expect(() => collect([stolen])).toThrow(/belongs to module "fixture"/)
    const dup: ClientModule = { manifest: { schemaVersion: 1, id: 'fixture2', name: 'F2', capabilities: [{ ...fixtureCapabilities[0], module: 'fixture2' }, { ...fixtureCapabilities[0], module: 'fixture2' }] } }
    expect(() => collect([dup])).toThrow(/defined twice/)
    expect(() => collect([{ manifest: { schemaVersion: 1, id: 'wrong', name: 'W' }, tool: () => fixtureTool }])).toThrow(/provides a tool/)
  })
})

describe('a module added to the list needs no shared-file edit', () => {
  const c = collect([...INSTALLED_MODULES, fixtureModule])
  const inventory = mergeCapabilities(PLATFORM_CAPABILITIES, c.capabilities)

  it('appears last in the registry inputs and registers', () => {
    expect(c.tools.map((t) => t.id).at(-1)).toBe('fixture')
    for (const tool of c.tools) registerTool(tool)
    expect(getTools().map((t) => t.id)).toEqual(c.tools.map((t) => t.id))
  })

  it('passes the inventory checks: unique IDs, every toolbar item and assistant action listed', () => {
    const ids = inventory.map((e) => e.id)
    expect(ids.length).toBe(new Set(ids).size)
    const model = sampleModel()
    const items = fixtureTool.toolbar({ api: stubApi() as never, viewState: {}, context: {} as never, model, selection: [] })
    const listed = inventory.filter((e) => e.module === 'fixture' && e.toolbarItem).map((e) => e.toolbarItem)
    expect(items.filter((i) => i.type !== 'separator').map((i) => i.id)).toEqual(listed)
    const aiOperations = new Set(inventory.flatMap((e) => e.aiOperations ?? []))
    for (const action of fixtureTool.assistant!.actions) expect(aiOperations.has(action.name)).toBe(true)
  })

  it('passes the help checks: schema, order and source', () => {
    expect(validateHelpManifest(fixtureTool.help!)).toEqual([])
    const ids = c.help.map((s) => s.moduleId)
    expect(ids).toEqual([...collect().help.map((s) => s.moduleId), 'fixture'])
    expect(c.help.find((s) => s.moduleId === 'fixture')?.manifest?.topics.every((t) => /\.md$/.test(t.source ?? ''))).toBe(true)
  })
})

describe('legacy entries and manifests', () => {
  it('fails when a legacy entry and a manifest define the same ID', () => {
    const clash: CapabilityEntry[] = [{ ...fixtureCapabilities[0], id: PLATFORM_CAPABILITIES[0].id }]
    expect(() => mergeCapabilities(PLATFORM_CAPABILITIES, clash)).toThrow(PLATFORM_CAPABILITIES[0].id)
    expect(() => mergeCapabilities(PLATFORM_CAPABILITIES, fixtureCapabilities)).not.toThrow()
  })
})
