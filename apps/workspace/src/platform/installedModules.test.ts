import { HELP_SCHEMA_VERSION, validateHelpManifest, type CapabilityEntry } from '@ews/platform-sdk'
import { defineTool, type ClientModule } from '@ews/platform-sdk/react'
import { lazy } from 'react'
import { describe, expect, it } from 'vitest'
import { PLATFORM_CAPABILITIES, mergeCapabilities } from '../assistant/capabilities'
import { honestyProblems, operationProblems, toolbarProblems } from '../assistant/capabilityChecks'
import { PLATFORM_TOOLS } from '../assistant/toolSpecs'
import { helpSources } from '../help/workspaceHelp'
import { INSTALLED_MODULES, collect, hostEnv } from './installedModules'
import { registerPlatformModule } from './platformModules'
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

describe('collect()', () => {
  it('collects the installed modules in list order', () => {
    const c = collect()
    expect(c.tools.map((t) => t.id)).toEqual(['requirements', 'conceptualize', 'cad-modeler', 'sysml-modeler'])
    expect(c.platformModules.map((m) => m.id)).toEqual(['projects'])
    expect(c.help.map((s) => s.moduleId)).toEqual(['requirements', 'conceptualize', 'cad-modeler', 'sysml-modeler', 'projects'])
    expect(c.defaultOpen).toEqual(['requirements', 'conceptualize'])
    // ADR-0076: the illustrative SysML and mock CAD tools are not installed, so no tool, help source, capability, AI operation or default tab exists for them.
    for (const retired of ['sysml', 'cad']) {
      expect(c.tools.map((t) => t.id)).not.toContain(retired)
      expect(c.help.map((h) => h.moduleId)).not.toContain(retired)
      expect(c.defaultOpen).not.toContain(retired)
      expect(c.capabilities.filter((cap) => cap.module === retired)).toEqual([])
    }
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


  it('passes the real inventory checks on the collected list: unique IDs, every toolbar item and assistant action listed, honest coverage', () => {
    const ids = inventory.map((e) => e.id)
    expect(ids.length).toBe(new Set(ids).size)
    expect(toolbarProblems(c.tools, inventory)).toEqual([])
    const existing = [...PLATFORM_TOOLS.map((t) => t.name), ...c.tools.flatMap((t) => t.assistant?.actions.map((a) => a.name) ?? []), ...c.platformModules.flatMap((m) => m.assistant?.actions.map((a) => a.name) ?? [])]
    expect(existing).toContain('fixture.ping')
    expect(operationProblems(existing, inventory)).toEqual([])
    expect(honestyProblems(inventory)).toEqual([])
    // The checks are not vacuous: an entry the fixture does not back is reported.
    expect(toolbarProblems(c.tools, [...inventory, { ...fixtureCapabilities[0], id: 'fixture.ghost', toolbarItem: 'ghost' }])).toEqual(['fixture: inventory lists toolbar item "ghost" that does not exist'])
  })

  it('passes the help checks: schema, order and source, and the Help Centre lists exactly what collect() builds', () => {
    expect(validateHelpManifest(fixtureTool.help!)).toEqual([])
    const ids = c.help.map((s) => s.moduleId)
    expect(ids).toEqual([...collect().help.map((s) => s.moduleId), 'fixture'])
    expect(c.help.find((s) => s.moduleId === 'fixture')?.manifest?.topics.every((t) => /\.md$/.test(t.source ?? ''))).toBe(true)
    // The fixture is in the registry (registered above); the Help Centre builds its sources with the same functions as collect().
    for (const module of c.platformModules) registerPlatformModule(module)
    const listed = helpSources()
    // The registry keeps tools and headless modules apart, so the Help Centre lists tools first, then platform modules.
    expect(listed.map((s) => s.moduleId)).toEqual(['platform', ...c.tools.map((t) => t.id), ...c.platformModules.filter((m) => m.help).map((m) => m.id), 'ai'])
    expect([...ids].sort()).toEqual(listed.slice(1, -1).map((s) => s.moduleId).sort())
    expect(listed.find((s) => s.moduleId === 'fixture')).toBe(c.help.find((s) => s.moduleId === 'fixture'))
  })
})

describe('legacy entries and manifests', () => {
  it('fails when a legacy entry and a manifest define the same ID', () => {
    const clash: CapabilityEntry[] = [{ ...fixtureCapabilities[0], id: PLATFORM_CAPABILITIES[0].id }]
    expect(() => mergeCapabilities(PLATFORM_CAPABILITIES, clash)).toThrow(PLATFORM_CAPABILITIES[0].id)
    expect(() => mergeCapabilities(PLATFORM_CAPABILITIES, fixtureCapabilities)).not.toThrow()
  })
})
