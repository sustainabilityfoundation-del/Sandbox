import type { CommandBarCommand, MenuBarNode } from '@ews/design-system'
import { describe, expect, it, vi } from 'vitest'
import type { AvailabilityContext, CapabilityEntry, ModuleManifest, ToolRuntime, ToolbarItem } from '../index'
import { SESSION_OPEN_TEXT, buildCommandModel, type CommandModel } from './commandModel'

/*
 * SDK 1.14 projections of `buildCommandModel` (capability-registry.md, Amendment CT-2c): menus, quick segment, palettes,
 * context sets, session and panels. The 1.13 ribbon behaviour is covered by commandModel.test.ts.
 */

const ctx: AvailabilityContext = {
  context: { projectId: 'P1', configurationId: 'c', modelRevision: 1, selectedIds: [], scenarioId: 's', pinned: false, workspaceConfigurationId: 'c' },
  selection: [],
  services: {},
  entitlements: [],
  connections: { aiAccount: true, api: true },
}

const entry = (over: Partial<CapabilityEntry> & { id: string }): CapabilityEntry => ({ module: 'cad', surface: 'toolbar', label: over.id, effect: 'view', status: 'implemented', coverage: 'none', ...over })
const button = (id: string, over: Partial<Extract<ToolbarItem, { type: 'button' }>> = {}): ToolbarItem => ({ type: 'button', id, label: id.toUpperCase(), onClick: vi.fn(), ...over })
const verified = ['packages/x/src/a.test.ts::a'] as CapabilityEntry['verifiedBy']

const structured: Pick<ModuleManifest, 'id' | 'name' | 'commandLayout'> = {
  id: 'cad',
  name: 'CAD',
  commandLayout: {
    tabs: [
      { id: 'home', label: 'Home', groups: [{ id: 'features', label: 'Features' }, { id: 'display', label: 'Display', exclusive: true }, { id: 'future', label: 'Future' }] },
      { id: 'sketch', label: 'Sketch', contextual: { kind: 'context', id: 'sketch' }, groups: [{ id: 'draw', label: 'Draw' }] },
    ],
    quick: true,
    palettes: [{ id: 'sketch-tools', label: 'Sketch tools', when: { kind: 'context', id: 'sketch' }, groups: [{ id: 'lines', label: 'Lines', icon: 'cmd-draw' }, { id: 'arcs', label: 'Arcs', collapsed: true }] }],
    contextSets: [{ id: 'edge', label: 'Edge', when: [{ kind: 'context', id: 'selection:edge' }] }],
    panels: [
      { id: 'browser', role: 'browser', label: 'Model browser', side: 'start', defaultOpen: true },
      { id: 'props', role: 'properties', label: 'Properties', side: 'end' },
    ],
  },
}

const structuredEntries: CapabilityEntry[] = [
  entry({ id: 'cad.features.extrude', label: 'Extrude', toolbarItem: 'extrude', verifiedBy: verified, placement: { tab: 'home', group: 'features', order: 1 }, placements: [{ surface: 'quick', order: 2 }], shortcut: 'E', description: 'Extrude a profile' }),
  entry({ id: 'cad.features.extrude-cut', label: 'Extrude cut', toolbarItem: 'extrude-cut', verifiedBy: verified, placement: { tab: 'home', group: 'features', order: 2, splitOf: 'cad.features.extrude' } }),
  entry({ id: 'cad.features.loft', label: 'Loft', placement: { tab: 'home', group: 'features', order: 3, splitOf: 'cad.features.extrude' }, backlog: ['BL-3'], placements: [{ surface: 'quick', order: 1 }, { surface: 'context', set: 'edge', order: 2 }, { surface: 'palette', palette: 'sketch-tools', group: 'lines', order: 2 }] }),
  entry({ id: 'cad.display.shaded', label: 'Shaded', toolbarItem: 'shaded', verifiedBy: verified, mode: 'toggle', placement: { tab: 'home', group: 'display', order: 1 } }),
  entry({ id: 'cad.display.wire', label: 'Wireframe', toolbarItem: 'wire', verifiedBy: verified, mode: 'toggle', placement: { tab: 'home', group: 'display', order: 2 } }),
  entry({ id: 'cad.future.sweep', label: 'Sweep', placement: { tab: 'home', group: 'future', order: 1 }, backlog: ['BL-4'] }),
  entry({ id: 'cad.future.shell', label: 'Shell', placement: { tab: 'home', group: 'future', order: 2 }, backlog: ['BL-5'] }),
  entry({ id: 'cad.sketch.line', label: 'Line', toolbarItem: 'line', verifiedBy: verified, mode: 'tool', placement: { tab: 'sketch', group: 'draw', order: 1 }, placements: [{ surface: 'palette', palette: 'sketch-tools', group: 'lines', order: 1 }] }),
  entry({ id: 'cad.sketch.arc', label: 'Arc', toolbarItem: 'arc', verifiedBy: verified, mode: 'tool', placements: [{ surface: 'palette', palette: 'sketch-tools', group: 'arcs', order: 1 }] }),
  entry({ id: 'cad.edge.fillet', label: 'Fillet', toolbarItem: 'fillet', verifiedBy: verified, placements: [{ surface: 'context', set: 'edge', order: 1 }], prerequisites: [{ kind: 'context', id: 'selection:edge' }] }),
]

const structuredItems = (): ToolbarItem[] => [button('extrude'), button('extrude-cut'), button('shaded', { active: true }), button('wire'), button('line'), button('arc'), button('fillet')]

function commandsOf(nodes: MenuBarNode[]): CommandBarCommand[] {
  return nodes.flatMap((n) => (n.kind === 'command' ? [n.command] : n.kind === 'submenu' || n.kind === 'section' ? commandsOf(n.items) : []))
}

/** Every command object on every surface of a model, with the surface it came from. */
function everyCommand(m: CommandModel): { surface: string; command: CommandBarCommand }[] {
  const isCommand = (e: { type?: string }): e is CommandBarCommand => e.type === undefined || e.type === 'command'
  const withSplit = (surface: string, c: CommandBarCommand) => [{ surface, command: c }, ...(c.split ?? []).map((s) => ({ surface: `${surface}/split`, command: s }))]
  return [
    ...m.tabs.flatMap((t) => t.groups.flatMap((g) => g.commands.filter(isCommand).flatMap((c) => withSplit('ribbon', c)))),
    ...m.menus.flatMap((menu) => commandsOf(menu.items).flatMap((c) => withSplit('menu', c))),
    ...m.quick.flatMap((c) => withSplit('quick', c)),
    ...m.palettes.flatMap((p) => p.groups.flatMap((g) => g.commands.flatMap((c) => withSplit('palette', c)))),
    ...m.contextSets.flatMap((s) => s.commands.filter(isCommand).flatMap((c) => withSplit('context', c))),
  ]
}

describe('buildCommandModel projections (SDK 1.14)', () => {
  it('leaves every other surface empty without registry data, so a flat bar renders as before', () => {
    const m = buildCommandModel(undefined, [], [button('a')], ctx)
    expect(m).toMatchObject({ registry: false, menus: [], quick: [], palettes: [], contextSets: [], session: null, panels: [] })
    expect(m.sessionRefused).toBeUndefined()
  })

  it('projects the ribbon with split children, modes, shortcuts, exclusive groups and counts', () => {
    const m = buildCommandModel(structured, structuredEntries, structuredItems(), ctx)
    expect(m.registry).toBe(true)
    expect(m.unregistered).toEqual([])
    expect(m.tabs.map((t) => t.id)).toEqual(['home'])
    const [features, display, future] = m.tabs[0].groups
    expect(features.commands.map((c) => c.id)).toEqual(['cad.features.extrude'])
    const extrude = features.commands[0] as CommandBarCommand
    expect(extrude).toMatchObject({ shortcut: 'E', state: { kind: 'ready' } })
    expect(extrude.split?.map((c) => [c.id, c.state.kind])).toEqual([
      ['cad.features.extrude-cut', 'ready'],
      ['cad.features.loft', 'planned'],
    ])
    expect(display).toMatchObject({ exclusive: true, counts: true })
    expect(display.commands.map((c) => (c as CommandBarCommand).mode)).toEqual(['toggle', 'toggle'])
    expect(future.commands.map((c) => (c as CommandBarCommand).state.kind)).toEqual(['planned', 'planned'])
    expect(future.counts).toBe(true)
  })

  it('builds default menus, one per tab with its groups as sections, listing every entry with "n of m available" headers', () => {
    const m = buildCommandModel(structured, structuredEntries, structuredItems(), ctx)
    expect(m.menus.map((menu) => menu.label)).toEqual(['Home', 'Sketch'])
    const home = m.menus[0]
    expect(home.items.map((n) => n.kind === 'section' && n.title)).toEqual(['Features (2 of 3 available)', 'Display (2 of 2 available)', 'Future (0 of 2 available)'])
    expect(commandsOf(home.items).map((c) => c.id)).toEqual(['cad.features.extrude', 'cad.features.extrude-cut', 'cad.features.loft', 'cad.display.shaded', 'cad.display.wire', 'cad.future.sweep', 'cad.future.shell'])
    // The contextual Sketch tab is hidden in the ribbon now, but its menu lists its entries all the same.
    expect(commandsOf(m.menus[1].items).map((c) => c.id)).toEqual(['cad.sketch.line'])
  })

  it('projects explicit menus with group, palette, context, command, submenu, panels and separator nodes', () => {
    const manifest: typeof structured = {
      ...structured,
      commandLayout: {
        ...structured.commandLayout!,
        menus: [
          { id: 'file', label: 'File', mnemonic: 'f', items: [{ kind: 'command', id: 'cad.features.extrude' }, { kind: 'separator' }, { kind: 'submenu', label: 'Insert', mnemonic: 'i', items: [{ kind: 'palette', palette: 'sketch-tools' }] }] },
          { id: 'edit', label: 'Edit', items: [{ kind: 'context', set: 'edge' }, { kind: 'group', tab: 'home', group: 'nope' }, { kind: 'command', id: 'cad.nope' }] },
          { id: 'view', label: 'View', items: [{ kind: 'group', tab: 'home', group: 'display' }, { kind: 'panels' }] },
        ],
      },
    }
    const toggle = vi.fn()
    const m = buildCommandModel(manifest, structuredEntries, structuredItems(), ctx, undefined, { panels: { browser: { open: false, toggle } } })
    expect(m.menus.map((menu) => [menu.id, menu.mnemonic])).toEqual([
      ['file', 'f'],
      ['edit', undefined],
      ['view', undefined],
    ])
    const file = m.menus[0].items
    expect(file.map((n) => n.kind)).toEqual(['command', 'separator', 'submenu'])
    const insert = file[2]
    if (insert.kind !== 'submenu') throw new Error('expected a submenu')
    expect(insert.mnemonic).toBe('i')
    expect(insert.items.map((n) => n.kind === 'submenu' && n.label)).toEqual(['Sketch tools'])
    expect(commandsOf(insert.items).map((c) => c.id)).toEqual(['cad.sketch.line', 'cad.features.loft', 'cad.sketch.arc'])
    // Dangling references are skipped here (the checks report them).
    const edit = m.menus[1].items
    expect(edit).toHaveLength(1)
    // Fillet needs the edge context (unavailable now) and Loft is planned: 0 of 2.
    expect(edit[0].kind === 'section' && edit[0].title).toBe('Edge (0 of 2 available)')
    const view = m.menus[2].items
    expect(view[1].kind === 'section' && view[1].title).toBe('Panels')
    const panels = view[1].kind === 'section' ? view[1].items : []
    expect(panels.map((n) => n.kind === 'command' && [n.command.id, n.checked, n.command.state.kind])).toEqual([
      ['panel:browser', false, 'ready'],
      ['panel:props', false, 'unavailable'],
    ])
    const browser = panels[0].kind === 'command' ? panels[0].command : null
    if (browser?.state.kind !== 'ready') throw new Error('expected ready')
    browser.state.onInvoke()
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('projects the quick segment, palettes and context sets from surface placements in order, with their prerequisites', () => {
    const idle = buildCommandModel(structured, structuredEntries, structuredItems(), ctx)
    expect(idle.quick.map((c) => [c.id, c.state.kind])).toEqual([
      ['cad.features.loft', 'planned'],
      ['cad.features.extrude', 'ready'],
    ])
    expect(idle.palettes).toHaveLength(1)
    expect(idle.palettes[0]).toMatchObject({ id: 'sketch-tools', active: false, reason: 'Not available in the current context' })
    expect(idle.palettes[0].groups.map((g) => [g.id, g.icon, g.collapsed, g.commands.map((c) => c.id)])).toEqual([
      ['lines', 'cmd-draw', undefined, ['cad.sketch.line', 'cad.features.loft']],
      ['arcs', undefined, true, ['cad.sketch.arc']],
    ])
    expect(idle.contextSets[0]).toMatchObject({ id: 'edge', active: false })
    expect(idle.contextSets[0].commands.map((c) => [c.id, (c as CommandBarCommand).state.kind])).toEqual([
      ['cad.edge.fillet', 'unavailable'],
      ['cad.features.loft', 'planned'],
    ])

    const sketching = buildCommandModel(structured, structuredEntries, structuredItems(), ctx, undefined, { contexts: ['sketch', 'selection:edge'] })
    expect(sketching.tabs.map((t) => t.id)).toEqual(['home', 'sketch'])
    expect(sketching.palettes[0]).toMatchObject({ id: 'sketch-tools', active: true })
    expect(sketching.palettes[0].groups[0].commands[0]).toMatchObject({ id: 'cad.sketch.line', mode: 'tool', state: { kind: 'ready' } })
    expect(sketching.contextSets[0]).toMatchObject({ id: 'edge', active: true })
    expect(sketching.contextSets[0].commands[0]).toMatchObject({ state: { kind: 'ready' } })
    expect(sketching.unregistered).toEqual([])
  })

  it('keeps an item whose entry is placed only on a palette or set out of the fallback group', () => {
    const m = buildCommandModel(structured, structuredEntries, structuredItems(), ctx)
    expect(m.tabs[0].groups.find((g) => g.id === 'unregistered')).toBeUndefined()
    expect(m.unregistered).toEqual([])
  })

  it('never yields onInvoke for a planned entry on any surface, even with a stray runtime item of the same ID', () => {
    const items = [...structuredItems(), button('loft'), button('sweep')]
    const m = buildCommandModel(structured, structuredEntries, items, ctx, undefined, { contexts: ['sketch', 'selection:edge'] })
    const all = everyCommand(m)
    const planned = all.filter(({ command }) => command.state.kind === 'planned')
    // Extrude's split children (Loft among them) travel with it onto the quick segment too.
    expect(new Set(planned.map((p) => p.surface))).toEqual(new Set(['ribbon', 'ribbon/split', 'menu', 'menu/split', 'quick', 'quick/split', 'palette', 'context']))
    expect(planned.map((p) => p.command.id).filter((id) => id === 'cad.features.loft').length).toBeGreaterThanOrEqual(5)
    for (const { command } of planned) expect('onInvoke' in command.state).toBe(false)
    // One command object per entry: every surface shares it.
    const lofts = all.filter((c) => c.command.id === 'cad.features.loft').map((c) => c.command)
    expect(new Set(lofts).size).toBe(1)
    // The stray items are unregistered extras, not handlers for the planned entries.
    expect(m.unregistered).toEqual(['loft', 'sweep'])
  })

  it('projects an accepted session to the strip, with number, select and text fields, and blocks other commands meanwhile', () => {
    const onOk = vi.fn()
    const onCancel = vi.fn()
    const onChange = vi.fn()
    const runtime: ToolRuntime = {
      session: {
        capabilityId: 'cad.features.extrude',
        title: 'Extrude',
        fields: [
          { type: 'number', id: 'depth', label: 'Depth', value: 10, unit: 'mm', min: 0, onChange },
          { type: 'select', id: 'dir', label: 'Direction', value: 'up', options: [{ value: 'up', label: 'Up' }], onChange: () => undefined },
          { type: 'text', id: 'hint', text: 'Pick a face' },
          button('ignored'),
          { type: 'separator', id: 'sep' },
        ],
        preview: { on: true, onChange: () => undefined },
        onOk,
        okUnavailableReason: 'Choose a profile first',
        onCancel,
      },
    }
    const m = buildCommandModel(structured, structuredEntries, structuredItems(), ctx, undefined, runtime)
    expect(m.sessionRefused).toBeUndefined()
    expect(m.session).toMatchObject({ capabilityId: 'cad.features.extrude', title: 'Extrude', okUnavailableReason: 'Choose a profile first', preview: { on: true } })
    expect(m.session?.fields.map((f) => f.type)).toEqual(['number', 'select', 'text'])
    expect(m.session?.fields[0]).toMatchObject({ type: 'number', unit: 'mm', min: 0, value: 10 })
    m.session?.onOk()
    m.session?.onCancel()
    expect(onOk).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    for (const { command } of everyCommand(m)) {
      expect(command.state.kind === 'ready' || command.state.kind === 'partial').toBe(false)
      if (command.state.kind === 'unavailable') expect(command.state.reason).toBe(SESSION_OPEN_TEXT)
    }
    // The pressed state of a toggle survives the block.
    const shaded = m.tabs[0].groups[1].commands[0] as CommandBarCommand
    expect(shaded.state).toMatchObject({ kind: 'unavailable', active: true })
  })

  it('projects the quick segment only when the layout enables it', () => {
    const off = { ...structured, commandLayout: { ...structured.commandLayout!, quick: undefined } }
    expect(buildCommandModel(structured, structuredEntries, structuredItems(), ctx).quick.length).toBeGreaterThan(0)
    expect(buildCommandModel(off, structuredEntries, structuredItems(), ctx).quick).toEqual([])
  })

  it('renders the split children of a select or number parent as normal commands in its group instead of losing them', () => {
    const items = structuredItems().map((i) => (i.id === 'extrude' ? ({ type: 'number', id: 'extrude', label: 'Depth', value: 5, onChange: () => undefined } as ToolbarItem) : i))
    const m = buildCommandModel(structured, structuredEntries, items, ctx)
    const ids = m.tabs[0].groups[0].commands.map((c) => c.id)
    expect(ids.slice(0, 3)).toEqual(['extrude', 'cad.features.extrude-cut', 'cad.features.loft'])
    expect(m.tabs[0].groups[0].commands[0]).toMatchObject({ type: 'number' })
    expect(m.unregistered).toEqual([])
  })

  it('refuses a session for a planned entry (and for an unregistered one when there is a registry) and keeps the other commands usable', () => {
    const session = { capabilityId: 'cad.features.loft', title: 'Loft', fields: [], onOk: vi.fn(), onCancel: vi.fn() }
    const m = buildCommandModel(structured, structuredEntries, structuredItems(), ctx, undefined, { session })
    expect(m.session).toBeNull()
    expect(m.sessionRefused).toEqual({ capabilityId: 'cad.features.loft', reason: 'Planned: not implemented yet' })
    expect((m.tabs[0].groups[0].commands[0] as CommandBarCommand).state.kind).toBe('ready')

    const unknown = buildCommandModel(structured, structuredEntries, structuredItems(), ctx, undefined, { session: { ...session, capabilityId: 'cad.nope' } })
    expect(unknown.session).toBeNull()
    expect(unknown.sessionRefused?.reason).toBe('Not a registered capability')

    // Without registry data a planned entry is still refused; an unknown ID is accepted (nothing to check it against).
    const flatPlanned = buildCommandModel(undefined, [entry({ id: 'x.planned' })], [], ctx, undefined, { session: { ...session, capabilityId: 'x.planned' } })
    expect(flatPlanned.sessionRefused?.reason).toBe('Planned: not implemented yet')
    const flatUnknown = buildCommandModel(undefined, [], [button('a')], ctx, undefined, { session: { ...session, capabilityId: 'anything' } })
    expect(flatUnknown.session?.title).toBe('Loft')
    expect((flatUnknown.tabs[0].groups[0].commands[0] as CommandBarCommand).state).toMatchObject({ kind: 'unavailable', reason: SESSION_OPEN_TEXT })
  })

  it('projects panels from the layout with the runtime state, or closed and untoggleable when the tool does not report them', () => {
    const toggle = vi.fn()
    const m = buildCommandModel(structured, structuredEntries, structuredItems(), ctx, undefined, { panels: { props: { open: true, toggle } } })
    expect(m.panels.map((p) => [p.id, p.role, p.side, p.open, !!p.toggle])).toEqual([
      ['browser', 'browser', 'start', true, false],
      ['props', 'properties', 'end', true, true],
    ])
    m.panels[1].toggle?.()
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('takes the runtime contexts unless the availability context already has them', () => {
    const fromRuntime = buildCommandModel(structured, structuredEntries, structuredItems(), ctx, undefined, { contexts: ['sketch'] })
    expect(fromRuntime.tabs.map((t) => t.id)).toEqual(['home', 'sketch'])
    const fromCtx = buildCommandModel(structured, structuredEntries, structuredItems(), { ...ctx, contexts: [] }, undefined, { contexts: ['sketch'] })
    expect(fromCtx.tabs.map((t) => t.id)).toEqual(['home'])
  })

  it('builds the static index once per manifest and entry list, and touches each entry a bounded number of times per build (250 entries)', () => {
    const N = 250
    // Operation counts, not time: reads of the static data (`layout.tabs`, `entry.placement`) happen only when the index is
    // built; reads of `entry.prerequisites` happen once per bound entry per build.
    const reads = { layout: 0, prerequisites: 0, placement: 0 }
    const tabs = Array.from({ length: 5 }, (_, t) => ({ id: `t${t}`, label: `Tab ${t}`, groups: Array.from({ length: 5 }, (_, g) => ({ id: `g${g}`, label: `Group ${g}` })) }))
    const layout = {
      palettes: [{ id: 'p', label: 'P', groups: [{ id: 'pg', label: 'PG' }] }],
      contextSets: [{ id: 's', label: 'S', when: [{ kind: 'selection', min: 1 }] }],
      panels: [{ id: 'b', role: 'browser', label: 'B', side: 'start' }],
      quick: true,
    } as NonNullable<ModuleManifest['commandLayout']>
    Object.defineProperty(layout, 'tabs', { get: () => (reads.layout += 1, tabs), enumerable: true })
    const manifest: Pick<ModuleManifest, 'id' | 'name' | 'commandLayout'> = { id: 'big', name: 'Big', commandLayout: layout }
    const entries: CapabilityEntry[] = []
    const items: ToolbarItem[] = []
    for (let i = 0; i < N; i += 1) {
      const bound = i % 4 !== 3
      const parent = i % 10 === 1 ? `big.${i - 1}` : undefined
      const e = entry({ id: `big.${i}`, module: 'big', toolbarItem: bound ? `i${i}` : undefined, verifiedBy: bound ? verified : undefined, backlog: bound ? undefined : ['BL'] })
      const placement = { tab: `t${i % 5}`, group: `g${Math.floor(i / 5) % 5}`, order: i, splitOf: parent }
      Object.defineProperty(e, 'placement', { get: () => (reads.placement += 1, placement), enumerable: true })
      Object.defineProperty(e, 'prerequisites', { get: () => (reads.prerequisites += 1, [{ kind: 'project' as const }]), enumerable: true })
      if (i % 7 === 0) e.placements = [{ surface: 'palette', palette: 'p', group: 'pg', order: i }, { surface: 'context', set: 's', order: i }, { surface: 'quick', order: i }]
      entries.push(e)
      if (bound) items.push(button(`i${i}`))
    }

    const first = buildCommandModel(manifest, entries, items, ctx)
    expect(first.registry).toBe(true)
    const count = (m: CommandModel) => m.tabs.flatMap((t) => t.groups.flatMap((g) => g.commands.flatMap((c) => [c, ...((c as CommandBarCommand).split ?? [])]))).length
    expect(count(first)).toBe(N)
    expect(first.menus).toHaveLength(5)
    expect(first.menus.flatMap((m) => commandsOf(m.items))).toHaveLength(N)
    expect(first.quick.length + first.palettes[0].groups[0].commands.length + first.contextSets[0].commands.length).toBe(3 * Math.ceil(N / 7))
    const afterFirst = { ...reads }
    expect(afterFirst.layout).toBeGreaterThan(0)
    expect(afterFirst.layout).toBeLessThanOrEqual(3)
    // The index reads each placement once; the build itself reads `placement.priority` once per placed command.
    expect(afterFirst.placement).toBeLessThanOrEqual(2 * N)

    // The second build with the same manifest and entries reads no static data again and evaluates prerequisites once per bound entry.
    const second = buildCommandModel(manifest, entries, items, ctx)
    expect(reads.layout).toBe(afterFirst.layout)
    expect(reads.placement - afterFirst.placement).toBeLessThanOrEqual(N)
    const bound = entries.filter((e) => e.toolbarItem).length
    expect(reads.prerequisites - afterFirst.prerequisites).toBe(bound)
    expect(count(second)).toBe(N)

    // A different entry list rebuilds the index; repeating that list keeps it.
    const copy = [...entries]
    buildCommandModel(manifest, copy, items, ctx)
    expect(reads.layout).toBe(2 * afterFirst.layout)
    buildCommandModel(manifest, copy, items, ctx)
    expect(reads.layout).toBe(2 * afterFirst.layout)
  })
})
