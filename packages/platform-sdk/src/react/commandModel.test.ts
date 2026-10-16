import { describe, expect, it, vi } from 'vitest'
import type { AvailabilityContext, CapabilityEntry, ModuleManifest, ToolbarItem } from '../index'
import { buildCommandModel } from './commandModel'

const ctx: AvailabilityContext = {
  context: { projectId: 'P1', configurationId: 'c', modelRevision: 1, selectedIds: [], scenarioId: 's', pinned: false, workspaceConfigurationId: 'c' },
  selection: [],
  services: {},
  entitlements: [],
  connections: { aiAccount: true, api: true },
}

const manifest: Pick<ModuleManifest, 'id' | 'name' | 'commandLayout'> = {
  id: 'demo',
  name: 'Demo',
  commandLayout: {
    tabs: [
      { id: 'home', label: 'Home', groups: [{ id: 'edit', label: 'Edit' }, { id: 'view', label: 'View' }] },
      { id: 'sel', label: 'Selection', contextual: { kind: 'selection', min: 1 }, groups: [{ id: 'sel-g', label: 'Selected' }] },
    ],
  },
}

const entry = (over: Partial<CapabilityEntry> & { id: string }): CapabilityEntry => ({ module: 'demo', surface: 'toolbar', label: over.id, effect: 'view', status: 'implemented', coverage: 'none', ...over })
const button = (id: string, over: Partial<Extract<ToolbarItem, { type: 'button' }>> = {}): ToolbarItem => ({ type: 'button', id, label: id.toUpperCase(), onClick: vi.fn(), ...over })

const verified = ['packages/x/src/a.test.ts::a'] as CapabilityEntry['verifiedBy']

describe('buildCommandModel', () => {
  it('without registry data returns one flat, unlabelled group in runtime order', () => {
    const items: ToolbarItem[] = [button('a'), { type: 'separator', id: 's' }, { type: 'text', id: 't', text: 'hello' }, button('b', { disabled: true, title: 'Needs a selection' })]
    const m = buildCommandModel(undefined, [], items, ctx)
    expect(m.registry).toBe(false)
    expect(m.tabs).toHaveLength(1)
    expect(m.tabs[0].groups).toHaveLength(1)
    expect(m.tabs[0].groups[0].label).toBe('')
    expect(m.tabs[0].groups[0].commands.map((c) => c.id)).toEqual(['a', 's', 't', 'b'])
    const b = m.tabs[0].groups[0].commands[3]
    expect(b).toMatchObject({ state: { kind: 'unavailable', reason: 'Needs a selection' } })
  })

  it('merges registry hierarchy, order and metadata with runtime handlers', () => {
    const onClick = vi.fn()
    const entries = [
      entry({ id: 'demo.edit.b', toolbarItem: 'b', verifiedBy: verified, description: 'Do B', helpId: 'demo.b', placement: { tab: 'home', group: 'edit', order: 2 } }),
      entry({ id: 'demo.edit.a', toolbarItem: 'a', verifiedBy: verified, placement: { tab: 'home', group: 'edit', order: 1, priority: 'primary' } }),
      entry({ id: 'demo.view.c', toolbarItem: 'c', verifiedBy: verified, placement: { tab: 'home', group: 'view', order: 1 } }),
    ]
    const items = [button('c'), button('b', { onClick, active: true }), button('a')]
    const m = buildCommandModel(manifest, entries, items, ctx)
    expect(m.registry).toBe(true)
    expect(m.unregistered).toEqual([])
    expect(m.tabs.map((t) => t.id)).toEqual(['home'])
    expect(m.tabs[0].groups.map((g) => [g.id, g.commands.map((c) => c.id)])).toEqual([
      ['edit', ['demo.edit.a', 'demo.edit.b']],
      ['view', ['demo.view.c']],
    ])
    const b = m.tabs[0].groups[0].commands[1]
    if (b.type && b.type !== 'command') throw new Error('expected a command')
    expect(b).toMatchObject({ label: 'B', description: 'Do B', helpId: 'demo.b', testId: 'b', state: { kind: 'ready', active: true } })
    if (b.state.kind !== 'ready') throw new Error('expected ready')
    b.state.onInvoke()
    expect(onClick).toHaveBeenCalledOnce()
    const a = m.tabs[0].groups[0].commands[0]
    expect(a).toMatchObject({ priority: 'primary' })
  })

  it('shows a planned command without an invoke function', () => {
    const entries = [entry({ id: 'demo.edit.fillet', label: 'Fillet', description: 'Round an edge', backlog: ['BL-7'], helpId: 'demo.fillet', placement: { tab: 'home', group: 'edit', order: 1 } })]
    const m = buildCommandModel(manifest, entries, [], ctx)
    const c = m.tabs[0].groups[0].commands[0]
    expect(c).toMatchObject({ id: 'demo.edit.fillet', label: 'Fillet', state: { kind: 'planned', info: { status: 'Planned', backlog: ['BL-7'], helpId: 'demo.fillet' } } })
    expect('onInvoke' in (c as { state: object }).state).toBe(false)
  })

  it('does not let a runtime item make a planned entry invokable', () => {
    const entries = [entry({ id: 'demo.edit.x', toolbarItem: undefined, placement: { tab: 'home', group: 'edit', order: 1 } })]
    const m = buildCommandModel(manifest, entries, [button('x')], ctx)
    const planned = m.tabs[0].groups[0].commands[0]
    expect(planned).toMatchObject({ state: { kind: 'planned' } })
    expect('onInvoke' in (planned as { state: object }).state).toBe(false)
  })

  it('places an item without an entry in a fallback group and reports it', () => {
    const entries = [entry({ id: 'demo.edit.a', toolbarItem: 'a', verifiedBy: verified, placement: { tab: 'home', group: 'edit', order: 1 } })]
    const items = [button('a'), button('stray'), { type: 'separator', id: 'sep' } as ToolbarItem]
    const m = buildCommandModel(manifest, entries, items, ctx)
    expect(m.unregistered).toEqual(['stray'])
    const fallback = m.tabs[0].groups.find((g) => g.id === 'unregistered')
    expect(fallback?.commands.map((c) => c.id)).toEqual(['stray'])
    const stray = fallback!.commands[0]
    expect(stray).toMatchObject({ state: { kind: 'ready' } })
  })

  it('marks partial commands with their limitation and keeps the handler', () => {
    const entries = [
      entry({ id: 'demo.edit.a', toolbarItem: 'a', verifiedBy: verified, limitations: ['geometry only'], placement: { tab: 'home', group: 'edit', order: 1 } }),
      entry({ id: 'demo.edit.b', toolbarItem: 'b', placement: { tab: 'home', group: 'edit', order: 2 } }),
    ]
    const m = buildCommandModel(manifest, entries, [button('a'), button('b')], ctx)
    expect(m.tabs[0].groups[0].commands[0]).toMatchObject({ state: { kind: 'partial', limitation: 'geometry only' } })
    expect(m.tabs[0].groups[0].commands[1]).toMatchObject({ state: { kind: 'partial', limitation: expect.stringMatching(/verified/) } })
  })

  it('reports unavailable commands with the prerequisite or module reason', () => {
    const entries = [
      entry({ id: 'demo.edit.a', toolbarItem: 'a', verifiedBy: verified, prerequisites: [{ kind: 'connection', to: 'ai-account' }], placement: { tab: 'home', group: 'edit', order: 1 } }),
      entry({ id: 'demo.edit.b', toolbarItem: 'b', verifiedBy: verified, placement: { tab: 'home', group: 'edit', order: 2 } }),
    ]
    const offline = { ...ctx, connections: { aiAccount: false, api: true } }
    const m = buildCommandModel(manifest, entries, [button('a'), button('b', { disabled: true, unavailableReason: 'Open a document first' })], offline)
    expect(m.tabs[0].groups[0].commands[0]).toMatchObject({ state: { kind: 'unavailable', reason: expect.stringMatching(/AI account/) } })
    expect(m.tabs[0].groups[0].commands[1]).toMatchObject({ state: { kind: 'unavailable', reason: 'Open a document first' } })
  })

  it('shows a registered, bound command whose item is absent as unavailable instead of dropping it', () => {
    const entries = [entry({ id: 'demo.edit.a', toolbarItem: 'a', verifiedBy: verified, placement: { tab: 'home', group: 'edit', order: 1 } })]
    const m = buildCommandModel(manifest, entries, [], ctx)
    expect(m.tabs[0].groups[0].commands[0]).toMatchObject({ id: 'demo.edit.a', state: { kind: 'unavailable' } })
  })

  it('shows contextual tabs only while their prerequisite holds', () => {
    const entries = [
      entry({ id: 'demo.edit.a', toolbarItem: 'a', verifiedBy: verified, placement: { tab: 'home', group: 'edit', order: 1 } }),
      entry({ id: 'demo.sel.s', toolbarItem: 's', verifiedBy: verified, placement: { tab: 'sel', group: 'sel-g', order: 1 } }),
    ]
    const items = [button('a'), button('s')]
    expect(buildCommandModel(manifest, entries, items, ctx).tabs.map((t) => t.id)).toEqual(['home'])
    const selected = { ...ctx, selection: [{ id: 'R', type: 'requirement', name: 'R', revision: 1 }] } as AvailabilityContext
    expect(buildCommandModel(manifest, entries, items, selected).tabs.map((t) => t.id)).toEqual(['home', 'sel'])
  })
})
