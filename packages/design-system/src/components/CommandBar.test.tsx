import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { CommandBar, commandAccessibleName, type CommandBarCommand, type CommandBarTab, type CommandState } from './CommandBar'

const noop = () => {}

const command = (state: CommandState, over: Partial<CommandBarCommand> = {}): CommandBarCommand => ({ id: 'c', label: 'Save', description: 'Saves the thing.', state, ...over })

const bar = (commands: CommandBarCommand[], extraTabs: CommandBarTab[] = []) =>
  renderToStaticMarkup(
    <CommandBar ariaLabel="Demo toolbar" layout="desktop" tabs={[{ id: 'home', label: 'Home', groups: [{ id: 'g', label: 'Group', commands }] }, ...extraTabs]} />,
  )

describe('CommandBar accessible names', () => {
  it('announces the state in words', () => {
    expect(commandAccessibleName(command({ kind: 'ready', onInvoke: noop }))).toBe('Save')
    expect(commandAccessibleName(command({ kind: 'planned', info: { status: 'Planned', backlog: [] } }, { label: 'Fillet' }))).toBe('Fillet, planned')
    expect(commandAccessibleName(command({ kind: 'partial', onInvoke: noop, limitation: 'geometry only' }, { label: 'Export STEP' }))).toBe('Export STEP, partial: geometry only')
    expect(commandAccessibleName(command({ kind: 'unavailable', reason: 'open a document first' }))).toBe('Save, unavailable: open a document first')
  })

  it('puts the state names on the rendered buttons', () => {
    const html = bar([
      command({ kind: 'ready', onInvoke: noop }, { id: 'a', label: 'Ready one' }),
      command({ kind: 'planned', info: { status: 'Planned', backlog: ['BL-1'] } }, { id: 'b', label: 'Fillet' }),
      command({ kind: 'partial', onInvoke: noop, limitation: 'geometry only' }, { id: 'c', label: 'Export STEP' }),
      command({ kind: 'unavailable', reason: 'open a document first' }, { id: 'd', label: 'Save' }),
    ])
    expect(html).toContain('aria-label="Fillet, planned"')
    expect(html).toContain('aria-label="Export STEP, partial: geometry only"')
    expect(html).toContain('aria-label="Save, unavailable: open a document first"')
    expect(html).not.toContain('aria-label="Ready one')
  })

  it('keeps planned and unavailable commands focusable: aria-disabled, never disabled', () => {
    const html = bar([command({ kind: 'planned', info: { status: 'Planned', backlog: [] } }), command({ kind: 'unavailable', reason: 'no' }, { id: 'u' })])
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2)
    expect(html).not.toMatch(/<button[^>]*\sdisabled/)
  })

  it('describes each command through aria-describedby', () => {
    const html = bar([command({ kind: 'ready', onInvoke: noop }, { id: 'save' })])
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1]
    expect(id).toBe('cmd-desc-save')
    expect(html).toContain('id="cmd-desc-save"')
    expect(html).toContain('Saves the thing.')
  })

  it('marks partial with a filled dot and planned with a ring, both hidden from assistive technology', () => {
    const html = bar([
      command({ kind: 'partial', onInvoke: noop, limitation: 'x' }, { id: 'p' }),
      command({ kind: 'planned', info: { status: 'Planned', backlog: [] } }, { id: 'q' }),
    ])
    expect(html).toMatch(/aria-hidden="true"[^>]*data-marker="partial"/)
    expect(html).toMatch(/aria-hidden="true"[^>]*data-marker="planned"/)
  })

  it('shows no tab strip for one tab and a tab list for several', () => {
    const one = bar([command({ kind: 'ready', onInvoke: noop })])
    expect(one).not.toContain('role="tablist"')
    const two = bar([command({ kind: 'ready', onInvoke: noop })], [{ id: 'view', label: 'View', groups: [] }])
    expect(two).toContain('role="tablist"')
    expect(two).toContain('Demo toolbar sections')
  })

  it('labels each group and the toolbar', () => {
    const html = bar([command({ kind: 'ready', onInvoke: noop })])
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('aria-label="Demo toolbar"')
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Group"')
  })

  it('renders an unlabelled group flat, without a group wrapper', () => {
    const html = renderToStaticMarkup(
      <CommandBar ariaLabel="Flat" layout="desktop" tabs={[{ id: 'm', label: 'M', groups: [{ id: 'm', label: '', commands: [command({ kind: 'ready', onInvoke: noop })] }] }]} />,
    )
    expect(html).not.toContain('role="group"')
  })
})

describe('CommandState types', () => {
  it('lets ready and partial commands carry onInvoke', () => {
    expectTypeOf<Extract<CommandState, { kind: 'ready' }>>().toHaveProperty('onInvoke')
    expectTypeOf<Extract<CommandState, { kind: 'partial' }>>().toHaveProperty('onInvoke')
  })

  it('refuses onInvoke on a planned or unavailable state at compile time', () => {
    // @ts-expect-error a planned command cannot have onInvoke
    const planned: CommandState = { kind: 'planned', info: { status: 'Planned', backlog: [] }, onInvoke: noop }
    // @ts-expect-error an unavailable command cannot have onInvoke
    const unavailable: CommandState = { kind: 'unavailable', reason: 'no', onInvoke: noop }
    // A spread that smuggles a handler in is refused too.
    const ready: CommandState = { kind: 'ready', onInvoke: noop }
    // @ts-expect-error the handler of a ready state cannot move onto a planned one
    const smuggled: CommandState = { ...ready, kind: 'planned', info: { status: 'Planned', backlog: [] } }
    expect([planned, unavailable, smuggled]).toHaveLength(3)
    expectTypeOf<Extract<CommandState, { kind: 'planned' }>['onInvoke']>().toEqualTypeOf<undefined>()
  })
})
