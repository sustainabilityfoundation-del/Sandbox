import { describe, expect, it } from 'vitest'
import type { CapabilityEntry, ModuleManifest } from '../index'
import { defaultMenus, menuReachable, normalizeShortcut, reachabilityProblems, referenceProblems, shortcutProblems, splitProblems, surfaceProblems } from './layoutChecks'

const entry = (over: Partial<CapabilityEntry> & { id: string }): CapabilityEntry => ({ module: 'demo', surface: 'toolbar', label: over.id, effect: 'view', status: 'implemented', coverage: 'none', ...over })

const layout: NonNullable<ModuleManifest['commandLayout']> = {
  tabs: [
    { id: 'home', label: 'Home', groups: [{ id: 'edit', label: 'Edit' }, { id: 'view', label: 'View', exclusive: true }] },
    { id: 'sketch', label: 'Sketch', groups: [{ id: 'draw', label: 'Draw' }] },
  ],
  palettes: [{ id: 'tools', label: 'Tools', groups: [{ id: 'lines', label: 'Lines' }] }],
  contextSets: [{ id: 'edge', label: 'Edge', when: [{ kind: 'context', id: 'selection:edge' }] }],
  panels: [{ id: 'browser', role: 'browser', label: 'Browser', side: 'start' }],
}

const manifest = (over: Partial<ModuleManifest> = {}): ModuleManifest => ({ schemaVersion: 1, id: 'demo', name: 'Demo', commandLayout: layout, ...over })

describe('normalizeShortcut', () => {
  it('compares chords regardless of modifier order, case and Ctrl spelling', () => {
    expect(normalizeShortcut('Ctrl+Shift+E')).toBe(normalizeShortcut('shift+Control+e'))
    expect(normalizeShortcut('Control+K')).toBe('control+k')
    expect(normalizeShortcut('F10')).toBe('f10')
  })
})

describe('referenceProblems', () => {
  it('passes a consistent manifest', () => {
    const m = manifest({
      capabilities: [
        entry({ id: 'demo.a', placement: { tab: 'home', group: 'edit', order: 1 }, placements: [{ surface: 'palette', palette: 'tools', group: 'lines', order: 1 }, { surface: 'context', set: 'edge', order: 1 }, { surface: 'quick', order: 1 }] }),
        entry({ id: 'demo.b', placement: { tab: 'home', group: 'edit', order: 2, splitOf: 'demo.a' } }),
      ],
      commandLayout: { ...layout, menus: [{ id: 'file', label: 'File', items: [{ kind: 'group', tab: 'home', group: 'edit' }, { kind: 'separator' }, { kind: 'submenu', label: 'More', items: [{ kind: 'palette', palette: 'tools' }, { kind: 'context', set: 'edge' }, { kind: 'command', id: 'demo.b' }, { kind: 'panels' }] }] }] },
    })
    expect(referenceProblems(m)).toEqual([])
  })

  it('reports dangling ribbon, surface, split and menu references', () => {
    const m = manifest({
      capabilities: [
        entry({ id: 'demo.a', placement: { tab: 'home', group: 'nope', order: 1 } }),
        entry({ id: 'demo.b', placement: { tab: 'home', group: 'edit', order: 1, splitOf: 'demo.zz' }, placements: [{ surface: 'palette', palette: 'nope', group: 'x', order: 1 }, { surface: 'palette', palette: 'tools', group: 'nope', order: 1 }, { surface: 'context', set: 'nope', order: 1 }] }),
        entry({ id: 'demo.c', placement: { tab: 'sketch', group: 'draw', order: 1, splitOf: 'demo.b' } }),
      ],
      commandLayout: {
        ...layout,
        menus: [
          { id: 'm', label: 'M', items: [{ kind: 'group', tab: 'home', group: 'nope' }, { kind: 'submenu', label: 'S', items: [{ kind: 'palette', palette: 'nope' }, { kind: 'context', set: 'nope' }, { kind: 'command', id: 'demo.nope' }] }] },
          { id: 'm', label: 'Again', items: [] },
        ],
      },
    })
    const problems = referenceProblems(m)
    expect(problems).toEqual([
      'demo: demo.a is placed in unknown group "home/nope"',
      'demo: demo.b is a split child of unknown entry "demo.zz"',
      'demo: demo.b is placed on unknown palette "nope"',
      'demo: demo.b is placed in unknown group "nope" of palette "tools"',
      'demo: demo.b is placed in unknown context set "nope"',
      'demo: demo.c is a split child of "demo.b", which is not in group "sketch/draw"',
      'demo: menu "m"/0 names unknown group "home/nope"',
      'demo: menu "m"/1/0 names unknown palette "nope"',
      'demo: menu "m"/1/1 names unknown context set "nope"',
      'demo: menu "m"/1/2 names unknown entry "demo.nope"',
      'demo: menu "m" is defined twice',
    ])
  })

  it('reports placements without a layout', () => {
    const m = manifest({ commandLayout: undefined, capabilities: [entry({ id: 'demo.a', placement: { tab: 'home', group: 'edit', order: 1 } }), entry({ id: 'demo.b', placements: [{ surface: 'quick', order: 1 }] })] })
    expect(referenceProblems(m)).toHaveLength(2)
  })
})

describe('shortcutProblems', () => {
  it('refuses duplicates (in any spelling) and the reserved Ctrl+K, F1 and F10', () => {
    const m = manifest({
      capabilities: [
        entry({ id: 'demo.a', shortcut: 'Control+Shift+E' }),
        entry({ id: 'demo.b', shortcut: 'shift+ctrl+e' }),
        entry({ id: 'demo.c', shortcut: 'Ctrl+K' }),
        entry({ id: 'demo.d', shortcut: 'F1' }),
        entry({ id: 'demo.e', shortcut: 'f10' }),
        entry({ id: 'demo.f', shortcut: 'Control+S' }),
        entry({ id: 'demo.g' }),
      ],
    })
    expect(shortcutProblems(m)).toEqual([
      'demo: demo.b and demo.a share the shortcut "shift+ctrl+e"',
      'demo: demo.c uses the reserved shortcut "Ctrl+K"',
      'demo: demo.d uses the reserved shortcut "F1"',
      'demo: demo.e uses the reserved shortcut "f10"',
    ])
  })
})

describe('splitProblems', () => {
  const placed = (id: string, splitOf?: string) => entry({ id, placement: { tab: 'home', group: 'edit', order: 1, splitOf } })

  it('passes a parent with children', () => {
    expect(splitProblems(manifest({ capabilities: [placed('demo.p'), placed('demo.c1', 'demo.p'), placed('demo.c2', 'demo.p')] }))).toEqual([])
  })

  it('reports a self reference, a two-entry cycle once, a longer cycle and nesting', () => {
    const m = manifest({
      capabilities: [
        placed('demo.self', 'demo.self'),
        placed('demo.a', 'demo.b'),
        placed('demo.b', 'demo.a'),
        placed('demo.x', 'demo.y'),
        placed('demo.y', 'demo.z'),
        placed('demo.z', 'demo.x'),
        placed('demo.root'),
        placed('demo.child', 'demo.root'),
        placed('demo.grandchild', 'demo.child'),
      ],
    })
    const problems = splitProblems(m)
    expect(problems).toContain('demo: demo.self is a split child of itself')
    expect(problems.filter((p) => /cycle demo\.(a|b)/.test(p))).toHaveLength(1)
    expect(problems.filter((p) => /cycle demo\.(x|y|z)/.test(p))).toHaveLength(1)
    expect(problems).toContain('demo: demo.grandchild is a split child of demo.child, which is itself a split child (children do not nest)')
    expect(problems).toHaveLength(4)
  })
})

describe('reachability', () => {
  const caps = [
    entry({ id: 'demo.a', placement: { tab: 'home', group: 'edit', order: 1 } }),
    entry({ id: 'demo.b', placement: { tab: 'home', group: 'edit', order: 2, splitOf: 'demo.a' } }),
    entry({ id: 'demo.p', placements: [{ surface: 'palette', palette: 'tools', group: 'lines', order: 1 }] }),
    entry({ id: 'demo.s', placements: [{ surface: 'context', set: 'edge', order: 1 }] }),
    entry({ id: 'demo.q', placements: [{ surface: 'quick', order: 1 }] }),
    entry({ id: 'demo.none' }),
  ]

  it('builds default menus from tabs and reaches every ribbon-placed entry through them', () => {
    expect(defaultMenus(layout).map((m) => [m.id, m.items])).toEqual([
      ['home', [{ kind: 'group', tab: 'home', group: 'edit' }, { kind: 'group', tab: 'home', group: 'view' }]],
      ['sketch', [{ kind: 'group', tab: 'sketch', group: 'draw' }]],
    ])
    expect([...menuReachable(manifest({ capabilities: caps }))].sort()).toEqual(['demo.a', 'demo.b'])
  })

  it('reaches palette, context-set and command nodes through explicit menus', () => {
    const m = manifest({ capabilities: caps, commandLayout: { ...layout, menus: [{ id: 'm', label: 'M', items: [{ kind: 'group', tab: 'home', group: 'edit' }, { kind: 'submenu', label: 'S', items: [{ kind: 'palette', palette: 'tools' }, { kind: 'context', set: 'edge' }, { kind: 'command', id: 'demo.q' }] }] }] } })
    expect([...menuReachable(m)].sort()).toEqual(['demo.a', 'demo.b', 'demo.p', 'demo.q', 'demo.s'])
  })

  it('reports unreachable entries only for inventory modules', () => {
    expect(reachabilityProblems(manifest({ capabilities: caps }))).toEqual([])
    expect(reachabilityProblems(manifest({ capabilities: caps, inventory: 1 }))).toEqual([
      'demo: demo.p is not reachable from any menu',
      'demo: demo.s is not reachable from any menu',
      'demo: demo.q is not reachable from any menu',
      'demo: demo.none is not reachable from any menu',
    ])
    expect(reachabilityProblems(manifest({ capabilities: caps, inventory: 1, commandLayout: undefined }))).toEqual(['demo: inventory 1 but no commandLayout, so no entry is reachable from a menu'])
  })

  it('surfaceProblems combines every check and passes a module without registry data', () => {
    expect(surfaceProblems({ id: 'plain', capabilities: [entry({ id: 'plain.a', module: 'plain' })] })).toEqual([])
    expect(surfaceProblems(manifest({ capabilities: [...caps, entry({ id: 'demo.k', shortcut: 'F10' })], inventory: 1 })).length).toBeGreaterThan(4)
  })
})
