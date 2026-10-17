import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { CAD_ICON_NAMES } from '../icons/names/cad'
import { CORE_ICON_NAMES } from '../icons/names/core'
import { GLYPH_ICON_NAMES } from '../icons/names/glyphs'
import { SYSML_ICON_NAMES } from '../icons/names/sysml'
import { ICON_NAMES } from '../icons/names'
import { ICON_REGISTRY } from '../icons/registry'
import { CommandBar, QuickBar, commandAccessibleName, fitTabs, type CommandBarCommand, type CommandBarTab, type CommandState } from './CommandBar'
import { CommandSessionStrip } from './CommandSessionStrip'
import { ContextCommands } from './ContextCommands'
import { DockPanel } from './DockPanel'
import { MenuBar, flattenMenuNodes, type MenuBarMenu, type MenuBarNode } from './MenuBar'
import { ToolPalette, armedTools } from './ToolPalette'
import { activateCommand, groupCountText, groupCounts, isAllPlanned, withAfterInvoke } from './commandCore'

const noop = () => {}
const ready = (id: string, label = id, over: Partial<CommandBarCommand> = {}): CommandBarCommand => ({ id, label, description: `${label}.`, state: { kind: 'ready', onInvoke: noop }, ...over })
const partial = (id: string, label = id): CommandBarCommand => ({ id, label, description: `${label}.`, state: { kind: 'partial', limitation: 'geometry only', onInvoke: noop } })
const planned = (id: string, label = id, over: Partial<CommandBarCommand> = {}): CommandBarCommand => ({ id, label, description: `${label}.`, state: { kind: 'planned', info: { status: 'Planned', backlog: ['BL-1'] } }, ...over })
const unavailable = (id: string, label = id): CommandBarCommand => ({ id, label, description: `${label}.`, state: { kind: 'unavailable', reason: 'open a document first' } })
const four = [ready('a', 'Ready one'), partial('b', 'Partial one'), planned('c', 'Planned one'), unavailable('d', 'Blocked one')]

describe('the four command states on every surface', () => {
  const names = ['Ready one', 'Partial one, partial: geometry only', 'Planned one, planned', 'Blocked one, unavailable: open a document first']
  const expectNames = (html: string) => {
    for (const name of names) expect(html, name).toContain(`aria-label="${name}"`.replace('aria-label="Ready one"', 'Ready one'))
  }

  it('MenuBar (menu items are rendered when open; the model flattens to the same names)', () => {
    const menus: MenuBarMenu[] = [{ id: 'm', label: 'Menu one', items: four.map((command): MenuBarNode => ({ kind: 'command', command })) }]
    expect(flattenMenuNodes(menus[0].items).map((e) => commandAccessibleName(e.command))).toEqual(names)
    const html = renderToStaticMarkup(<MenuBar ariaLabel="Main menu" menus={menus} layout="desktop" />)
    expect(html).toContain('role="menubar"')
    expect(html).toContain('aria-label="Menu one"')
  })

  it('ToolPalette', () => {
    const html = renderToStaticMarkup(<ToolPalette ariaLabel="Tools" layout="desktop" groups={[{ id: 'g', label: 'Group', commands: four }]} />)
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('aria-orientation="vertical"')
    expectNames(html)
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2)
  })

  it('ContextCommands floating', () => {
    const html = renderToStaticMarkup(<ContextCommands ariaLabel="Selection" rendering="floating" commands={four} />)
    expectNames(html)
  })

  it('QuickBar', () => {
    const html = renderToStaticMarkup(<QuickBar commands={four.map((c) => ({ ...c, icon: 'save' as const }))} />)
    expect(html).toContain('aria-label="Quick access"')
    // Icon-only controls always carry the full accessible name.
    expectNames(html)
    expect(html).toContain('aria-label="Ready one"')
  })

  it('DockPanel', () => {
    const html = renderToStaticMarkup(
      <DockPanel title="Browser" side="start" isOpen onOpenChange={noop} layout="desktop" role="browser">
        <p>Tree</p>
      </DockPanel>,
    )
    expect(html).toContain('<aside')
    expect(html).toContain('aria-label="Browser"')
    expect(html).toContain('data-panel-role="browser"')
    expect(html).toContain('aria-label="Close browser"')
  })
})

describe('mode: toggle and tool announce aria-pressed', () => {
  const bar = (commands: CommandBarCommand[]) =>
    renderToStaticMarkup(<CommandBar ariaLabel="Bar" layout="desktop" tabs={[{ id: 't', label: 'T', groups: [{ id: 'g', label: 'G', commands }] }]} />)

  it('pressed for an active toggle and an armed tool, not pressed otherwise', () => {
    const html = bar([
      ready('on', 'Grid on', { mode: 'toggle', state: { kind: 'ready', onInvoke: noop, active: true } }),
      ready('off', 'Grid off', { mode: 'toggle', state: { kind: 'ready', onInvoke: noop } }),
      ready('tool', 'Line', { mode: 'tool', state: { kind: 'ready', onInvoke: noop, active: true } }),
      ready('act', 'Save'),
    ])
    expect(html).toMatch(/aria-pressed="true"[^>]*data-toolbar-id="on"|data-toolbar-id="on"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/data-toolbar-id="off"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-toolbar-id="off"/)
    expect(html).toMatch(/data-mode="tool"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-mode="tool"/)
    expect(html.match(/data-toolbar-id="act"[^>]*>/)?.[0]).not.toContain('aria-pressed')
  })

  it('a planned toggle or tool is never pressed', () => {
    const html = bar([planned('p', 'Spline', { mode: 'tool' }), ready('r', 'Save')])
    expect(html).not.toContain('aria-pressed')
    expect(html).toContain('aria-label="Spline, planned"')
  })

  it('an unavailable toggle keeps its pressed state', () => {
    const html = bar([{ ...unavailable('u', 'Grid'), mode: 'toggle', state: { kind: 'unavailable', reason: 'no', active: true } }])
    expect(html).toContain('aria-pressed="true"')
  })

  it('armedTools lists only armed tool commands', () => {
    const armed = ready('l', 'Line', { mode: 'tool', state: { kind: 'ready', onInvoke: noop, active: true } })
    expect(armedTools([{ id: 'g', label: 'G', commands: [armed, ready('c', 'Circle', { mode: 'tool' }), ready('t', 'Grid', { mode: 'toggle', state: { kind: 'ready', onInvoke: noop, active: true } })] }]).map((c) => c.id)).toEqual(['l'])
  })
})

describe('CommandBar: split, exclusive groups, group buttons with counts, quick bar', () => {
  const render = (groups: CommandBarTab['groups'], extra: Partial<Parameters<typeof CommandBar>[0]> = {}) =>
    renderToStaticMarkup(<CommandBar ariaLabel="Bar" layout="desktop" tabs={[{ id: 't', label: 'T', groups }]} {...extra} />)

  it('renders a split button as the main part plus a drop-down of the children', () => {
    const html = render([{ id: 'g', label: 'G', commands: [ready('ex', 'Extrude', { split: [ready('cut', 'Cut'), planned('thin', 'Thin')] })] }])
    expect(html).toContain('data-split="ex"')
    expect(html).toContain('aria-label="Extrude: more options"')
  })

  it('an all-planned group is one muted group button with a count', () => {
    const group = { id: 'sim', label: 'Simulation', commands: [planned('1'), planned('2'), planned('3')] }
    expect(isAllPlanned(group)).toBe(true)
    const html = render([group])
    expect(html).toContain('data-group-button="planned"')
    expect(html).toContain('aria-label="Simulation: 0 of 3 available, planned"')
    expect(html).toContain('0 of 3')
    expect(html).not.toContain('aria-label="1, planned"')
    // A group with one ready command is an ordinary group.
    expect(isAllPlanned({ ...group, commands: [planned('1'), ready('2')] })).toBe(false)
  })

  it('counts go in the group description', () => {
    const group = { id: 'g', label: 'Create', counts: true, commands: [ready('a'), partial('b'), planned('c'), unavailable('d')] }
    expect(groupCounts(group)).toEqual({ available: 2, total: 4 })
    expect(groupCountText(group)).toBe('2 of 4 available')
    expect(groupCountText({ ...group, counts: undefined })).toBeUndefined()
    expect(groupCountText({ ...group, counts: { available: 1, total: 9 } })).toBe('1 of 9 available')
    const html = render([group])
    expect(html).toContain('2 of 4 available')
    expect(html).toMatch(/aria-describedby="[^"]+"/)
  })

  it('an exclusive group is described as choose one', () => {
    const html = render([{ id: 'g', label: 'Mode', exclusive: true, commands: [ready('a', 'A', { mode: 'toggle' }), ready('b', 'B', { mode: 'toggle' })] }])
    expect(html).toContain('Choose one')
  })

  it('a quick bar leads the bar', () => {
    const html = render([{ id: 'g', label: 'G', commands: [ready('a')] }], { quick: [ready('q', 'Save', { icon: 'save' })] })
    expect(html.indexOf('aria-label="Quick access"')).toBeGreaterThan(-1)
    expect(html.indexOf('aria-label="Quick access"')).toBeLessThan(html.indexOf('aria-label="Bar"'))
  })

  it('renders a number entry with its unit in the name', () => {
    const html = render([{ id: 'g', label: 'G', commands: [{ type: 'number', id: 'n', label: 'Depth', unit: 'mm', value: 5, min: 0, max: 10, step: 1, onChange: noop }] }])
    expect(html).toContain('aria-label="Depth (mm)"')
  })
})

describe('tab overflow', () => {
  const tabs: CommandBarTab[] = ['Home', 'Insert', 'Layout', 'Annotate', 'Analyse', 'Inspect', 'Manufacture', 'Collaborate', 'Automation'].map((label) => ({ id: label, label, groups: [] }))

  it('shows every tab when the width is unknown or large', () => {
    expect(fitTabs(tabs, 'Home', 0).overflow).toEqual([])
    expect(fitTabs(tabs, 'Home', 1600).overflow).toEqual([])
  })

  it('moves the tabs that do not fit into the menu and keeps the selected tab visible', () => {
    const narrow = fitTabs(tabs, 'Home', 520)
    expect(narrow.visible.length).toBeGreaterThan(0)
    expect(narrow.overflow.length).toBeGreaterThan(0)
    expect(narrow.visible.length + narrow.overflow.length).toBe(tabs.length)
    const picked = fitTabs(tabs, 'Automation', 520)
    expect(picked.visible.map((t) => t.id)).toContain('Automation')
    expect(picked.visible).toHaveLength(narrow.visible.length)
    expect(fitTabs(tabs, 'Home', 100).visible.length).toBeGreaterThanOrEqual(1)
  })
})

describe('CommandSessionStrip', () => {
  const strip = (over: Partial<Parameters<typeof CommandSessionStrip>[0]> = {}) =>
    renderToStaticMarkup(
      <CommandSessionStrip
        title="Extrude"
        fields={[{ type: 'number', id: 'd', label: 'Depth', unit: 'mm', value: 10, min: 0, max: 100, step: 0.5, onChange: noop }]}
        preview={{ on: true, onChange: noop }}
        onOk={noop}
        onCancel={noop}
        {...over}
      />,
    )

  it('has a title, a number field with unit, a Preview toggle, OK and Cancel', () => {
    const html = strip()
    expect(html).toContain('aria-label="Extrude: edit"')
    expect(html).toContain('Depth (mm)')
    expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*(<[^>]*>)*[^<]*Preview|Preview/)
    expect(html).toContain('aria-label="OK"')
    expect(html).toContain('Cancel')
    expect(html).not.toContain('aria-disabled')
  })

  it('makes OK unavailable with the reason', () => {
    const html = strip({ okUnavailableReason: 'Select a profile first' })
    expect(html).toContain('aria-label="OK, unavailable: Select a profile first"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('Select a profile first')
  })

  it('omits Preview when the command has none', () => {
    expect(strip({ preview: undefined })).not.toContain('Preview')
  })
})

describe('planned entries can never be invoked', () => {
  it('activateCommand invokes ready and partial commands only', () => {
    const run = vi.fn()
    const explain = vi.fn()
    expect(activateCommand({ ...ready('a'), state: { kind: 'ready', onInvoke: run } }, explain)).toBe(true)
    expect(activateCommand({ ...partial('b'), state: { kind: 'partial', limitation: 'x', onInvoke: run } }, explain)).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
    expect(explain).not.toHaveBeenCalled()
  })

  it('does not invoke a planned or unavailable command even if a handler was smuggled in past the type', () => {
    const run = vi.fn()
    const explain = vi.fn()
    const smuggledPlanned = { ...planned('p'), state: { kind: 'planned', info: { status: 'Planned', backlog: [] }, onInvoke: run } } as unknown as CommandBarCommand
    const smuggledBlocked = { ...unavailable('u'), state: { kind: 'unavailable', reason: 'no', onInvoke: run } } as unknown as CommandBarCommand
    expect(activateCommand(smuggledPlanned, explain)).toBe(false)
    expect(activateCommand(smuggledBlocked, explain)).toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect(explain).toHaveBeenCalledTimes(2)
  })

  it('withAfterInvoke never gives a planned command a handler', () => {
    const after = vi.fn()
    const wrapped = withAfterInvoke(planned('p'), after)
    expect(wrapped.state.kind).toBe('planned')
    expect(wrapped.state).not.toHaveProperty('onInvoke')
    const run = vi.fn()
    const ok = withAfterInvoke({ ...ready('a'), state: { kind: 'ready', onInvoke: run } }, after)
    if (ok.state.kind === 'ready') ok.state.onInvoke()
    expect(run).toHaveBeenCalledOnce()
    expect(after).toHaveBeenCalledOnce()
  })

  it('every surface model takes CommandBarCommand, whose planned state has no onInvoke', () => {
    type Planned = Extract<CommandState, { kind: 'planned' }>
    expectTypeOf<Planned['onInvoke']>().toEqualTypeOf<undefined>()
    // @ts-expect-error a planned menu entry cannot carry a handler
    const menuNode: MenuBarNode = { kind: 'command', command: { id: 'x', label: 'X', description: '', state: { kind: 'planned', info: { status: 'Planned', backlog: [] }, onInvoke: noop } } }
    // @ts-expect-error a planned split child cannot carry a handler
    const split: CommandBarCommand = { id: 'x', label: 'X', description: '', state: { kind: 'ready', onInvoke: noop }, split: [{ id: 'y', label: 'Y', description: '', state: { kind: 'planned', info: { status: 'Planned', backlog: [] }, onInvoke: noop } }] }
    expect([menuNode, split]).toHaveLength(2)
  })
})

describe('icon names split by domain', () => {
  const generic = ['cmd-create', 'cmd-modify', 'cmd-draw', 'cmd-constrain', 'cmd-pattern', 'cmd-measure', 'cmd-exchange', 'cmd-view', 'sysml-definition', 'sysml-usage', 'sysml-relation', 'diagram-tool']

  it('ICON_NAMES is the domain files joined in order, without duplicates', () => {
    expect(ICON_NAMES).toEqual([...CORE_ICON_NAMES, ...GLYPH_ICON_NAMES, ...CAD_ICON_NAMES, ...SYSML_ICON_NAMES])
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
  })

  it('keeps the existing names first, in their order, with the custom glyphs after them', () => {
    expect(ICON_NAMES.slice(0, 3)).toEqual(['requirements', 'sysml', 'cad'])
    expect(CORE_ICON_NAMES[CORE_ICON_NAMES.length - 1]).toBe('voice')
    expect(GLYPH_ICON_NAMES).toEqual(['sysml-port', 'cad-sketch', 'cad-extrude', 'constraint', 'trace-derive', 'trace-satisfy'])
  })

  it('adds the generic family names and maps each to a glyph', () => {
    for (const name of generic) {
      expect(ICON_NAMES as readonly string[], name).toContain(name)
      expect(ICON_REGISTRY[name as keyof typeof ICON_REGISTRY], name).toBeDefined()
    }
    expect([...CAD_ICON_NAMES, ...SYSML_ICON_NAMES]).toEqual(generic)
  })
})
