import { describe, expect, it } from 'vitest'
import {
  SDK_VERSION,
  availability,
  checkPrerequisite,
  isSdkCompatible,
  type AvailabilityContext,
  type CapabilityEntry,
  type CommandLayout,
  type CommandMode,
  type CommandSession,
  type MenuNode,
  type ModuleManifest,
  type Placement,
  type Prerequisite,
  type SurfacePlacement,
  type ToolRuntime,
  type ToolbarItem,
} from '../index'
import type { ToolDefinition } from '../react/defineTool'

/*
 * Type-level tests of the SDK 1.14 additions (capability-registry.md Amendment CT-2c). Most assertions are the
 * assignments themselves: if a shape changes, this file stops compiling under `npm run typecheck`.
 */

const ctx: AvailabilityContext = {
  context: { projectId: 'P1', configurationId: 'c', modelRevision: 1, selectedIds: [], scenarioId: 's', pinned: false, workspaceConfigurationId: 'c' },
  selection: [],
  services: {},
  entitlements: [],
  connections: { aiAccount: true, api: true },
}

describe('SDK 1.14 additive contract', () => {
  it('is an additive minor version', () => {
    expect(SDK_VERSION).toBe('1.14.0')
    expect(isSdkCompatible('^1.13.0')).toBe(true)
    expect(isSdkCompatible('^1.14.0')).toBe(true)
    expect(isSdkCompatible('^1.15.0')).toBe(false)
  })

  it('keeps a 1.13 entry, layout and tool definition valid unchanged', () => {
    const entry: CapabilityEntry = { id: 'demo.a', module: 'demo', surface: 'toolbar', label: 'A', effect: 'view', status: 'implemented', coverage: 'none', placement: { tab: 't', group: 'g', order: 1 } }
    const layout: CommandLayout = { tabs: [{ id: 't', label: 'T', groups: [{ id: 'g', label: 'G' }] }] }
    const manifest: ModuleManifest = { schemaVersion: 1, id: 'demo', name: 'Demo', capabilities: [entry], commandLayout: layout }
    expect(manifest.commandLayout?.menus).toBeUndefined()
    expect(entry.placements).toBeUndefined()
    expect(entry.mode).toBeUndefined()
    expect(entry.shortcut).toBeUndefined()
    const tool: Pick<ToolDefinition<{ n: number }>, 'toolbar' | 'runtime'> = { toolbar: () => [] }
    expect(tool.runtime).toBeUndefined()
  })

  it('types the context prerequisite and evaluates it from the runtime contexts', () => {
    const p: Prerequisite = { kind: 'context', id: 'sketch' }
    expect(checkPrerequisite(p, ctx)).toEqual({ available: false, reason: 'Not available in the current context' })
    expect(checkPrerequisite(p, { ...ctx, contexts: ['diagram:general', 'sketch'] })).toEqual({ available: true })
    const entry: CapabilityEntry = { id: 'demo.line', module: 'demo', surface: 'toolbar', label: 'Line', effect: 'mutation', status: 'implemented', coverage: 'none', toolbarItem: 'line', prerequisites: [p], mode: 'tool', shortcut: 'L' }
    expect(availability(entry, { ...ctx, contexts: ['sketch'] })).toEqual({ available: true })
    expect(availability(entry, ctx).available).toBe(false)
  })

  it('types modes, split placements, surface placements, menu nodes and the layout additions', () => {
    const modes: CommandMode[] = ['action', 'toggle', 'tool']
    expect(modes).toHaveLength(3)
    const placement: Placement = { tab: 't', group: 'g', order: 2, splitOf: 'demo.a' }
    const surfaces: SurfacePlacement[] = [
      { surface: 'palette', palette: 'tools', group: 'lines', order: 1 },
      { surface: 'context', set: 'edge', order: 1 },
      { surface: 'quick', order: 1 },
    ]
    const nodes: MenuNode[] = [
      { kind: 'group', tab: 't', group: 'g' },
      { kind: 'palette', palette: 'tools' },
      { kind: 'context', set: 'edge' },
      { kind: 'command', id: 'demo.a' },
      { kind: 'submenu', label: 'More', mnemonic: 'm', items: [{ kind: 'panels' }, { kind: 'separator' }] },
    ]
    const layout: CommandLayout = {
      tabs: [{ id: 't', label: 'T', groups: [{ id: 'g', label: 'G', exclusive: true }] }],
      menus: [{ id: 'file', label: 'File', mnemonic: 'f', items: nodes }],
      quick: true,
      palettes: [{ id: 'tools', label: 'Tools', when: { kind: 'context', id: 'sketch' }, groups: [{ id: 'lines', label: 'Lines', icon: 'cmd-draw', collapsed: false }] }],
      contextSets: [{ id: 'edge', label: 'Edge', when: [{ kind: 'context', id: 'selection:edge' }, { kind: 'selection', min: 1 }] }],
      panels: [{ id: 'browser', role: 'browser', label: 'Browser', side: 'start', defaultOpen: true, helpId: 'demo.panels.browser' }],
    }
    const entry: CapabilityEntry = { id: 'demo.b', module: 'demo', surface: 'toolbar', label: 'B', effect: 'view', status: 'implemented', coverage: 'none', placement, placements: surfaces, mode: 'toggle', shortcut: 'Control+Shift+B' }
    expect(layout.menus?.[0].items).toHaveLength(5)
    expect(entry.placements).toHaveLength(3)
  })

  it('types the number toolbar item, the button mode, the command session and the tool runtime', () => {
    const number: ToolbarItem = { type: 'number', id: 'depth', label: 'Depth', value: 10, unit: 'mm', min: 0, max: 100, step: 0.5, onChange: () => undefined }
    const button: ToolbarItem = { type: 'button', id: 'line', label: 'Line', onClick: () => undefined, mode: 'tool', active: true }
    const session: CommandSession = { capabilityId: 'demo.extrude', title: 'Extrude', fields: [number], preview: { on: true, onChange: () => undefined }, onOk: () => undefined, okUnavailableReason: 'Choose a profile first', onCancel: () => undefined }
    const runtime: ToolRuntime = { contexts: ['sketch'], session, panels: { browser: { open: true, toggle: () => undefined } } }
    const tool: Pick<ToolDefinition<{ n: number }>, 'toolbar' | 'runtime'> = { toolbar: () => [button], runtime: (c) => ({ ...runtime, contexts: c.viewState.n > 0 ? ['sketch'] : [] }) }
    expect(tool.runtime).toBeDefined()
    expect(button.type === 'button' && button.mode).toBe('tool')
    expect(runtime.session?.fields[0].type).toBe('number')
  })
})
