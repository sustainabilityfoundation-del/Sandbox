import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from '../../platform/store'
import { visibleWithAncestors } from './explorerFilter'
import { PRESETS, PRESET_IDS, applyPreset, assistantOnRight, currentPreset, dockAssistant, restoreDefaultLayout, showAssistant, showDockTab } from './presets'
import { clampLayout } from './viewport'

const layout = () => useWorkspaceStore.getState().layout

describe('workspace presets and docking (layout preferences only)', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ layoutClass: 'spacious', layouts: DEFAULT_LAYOUTS, layout: DEFAULT_LAYOUTS.spacious })
  })

  it('offers the three presets of the brief and the default layout is Engineering', () => {
    expect(PRESET_IDS).toEqual(['engineering', 'ai-assisted', 'review'])
    expect(currentPreset(DEFAULT_LAYOUTS.spacious)).toBe('engineering')
  })

  it('applies each preset and recognises it; sizes keep the person’s values', () => {
    useWorkspaceStore.getState().setLayout({ treeWidth: 333 })
    for (const id of PRESET_IDS) {
      applyPreset(id)
      expect(currentPreset(layout())).toBe(id)
      expect(layout().treeWidth).toBe(333)
    }
    applyPreset('ai-assisted')
    expect(layout()).toMatchObject({ treeOpen: true, assistantOpen: true, assistantDock: 'right' })
    applyPreset('review')
    expect(layout()).toMatchObject({ treeOpen: false, inspectorOpen: true, activityOpen: true, dockTab: 'validation' })
    // A manual change makes the layout custom.
    useWorkspaceStore.getState().setLayout({ treeOpen: true })
    expect(currentPreset(layout())).toBeNull()
    expect(PRESETS.review.label).toBe('Review')
  })

  it('shows the assistant where it is docked and never closes it', () => {
    showAssistant()
    expect(layout()).toMatchObject({ assistantOpen: true, assistantDock: 'right' })
    showAssistant()
    expect(layout().assistantOpen).toBe(true)
    dockAssistant('bottom')
    expect(layout()).toMatchObject({ assistantDock: 'bottom', activityOpen: true, dockTab: 'assistant' })
    expect(assistantOnRight(layout(), true)).toBe(false)
    useWorkspaceStore.getState().setLayout({ activityOpen: false })
    showAssistant()
    expect(layout()).toMatchObject({ activityOpen: true, dockTab: 'assistant' })
    dockAssistant('right')
    expect(assistantOnRight(layout(), true)).toBe(true)
    expect(assistantOnRight(layout(), false)).toBe(false)
  })

  it('maximizing hides panels without losing their settings; restore brings the defaults back', () => {
    useWorkspaceStore.getState().setLayout({ canvasMaximized: true })
    expect(layout()).toMatchObject({ canvasMaximized: true, treeOpen: true, inspectorOpen: true })
    showDockTab('validation')
    expect(layout()).toMatchObject({ canvasMaximized: false, activityOpen: true, dockTab: 'validation' })
    useWorkspaceStore.getState().setLayout({ treeWidth: 400, assistantWidth: 500, railExpanded: false })
    restoreDefaultLayout()
    expect(layout()).toEqual(DEFAULT_LAYOUTS.spacious)
  })

  it('restores layouts saved before the docking fields existed and clamps the assistant width', () => {
    const { assistantDock: _d, assistantOpen: _o, assistantWidth: _w, railExpanded: _r, canvasMaximized: _m, ...old } = DEFAULT_LAYOUTS.spacious
    const restored = { ...DEFAULT_LAYOUTS.spacious, ...old }
    expect(restored.assistantDock).toBe('right')
    expect(clampLayout({ ...restored, assistantWidth: 2000 }, 1366, 768).assistantWidth).toBeLessThanOrEqual(1366 * 0.4)
    expect(clampLayout({ ...restored, assistantWidth: 10 }, 1920, 1080).assistantWidth).toBe(300)
  })
})

describe('explorer filter', () => {
  const items = [
    { id: 'A', name: 'Actuator', parent: undefined },
    { id: 'B', name: 'Housing', parent: 'A' },
    { id: 'C', name: 'Rod', parent: 'A' },
    { id: 'D', name: 'Motor', parent: 'C' },
    { id: 'E', name: 'Other', parent: undefined },
  ]
  const run = (q: string) => visibleWithAncestors(items, q, (i) => [i.id, i.name], (i) => i.parent)

  it('shows everything without a query', () => {
    expect(run('  ')).toBeNull()
  })

  it('keeps matches with their ancestors, case-insensitively, by ID or name', () => {
    expect([...run('motor')!].sort()).toEqual(['A', 'C', 'D'])
    expect([...run('b')!].sort()).toEqual(['A', 'B'])
    expect(run('nothing')!.size).toBe(0)
  })

  it('handles thousands of objects quickly', () => {
    const many = Array.from({ length: 20000 }, (_, i) => ({ id: `OBJ-${i}`, name: `Object ${i}`, parent: i ? `OBJ-${Math.floor(i / 10)}` : undefined }))
    const start = performance.now()
    const visible = visibleWithAncestors(many, 'OBJ-19999', (i) => [i.id, i.name], (i) => i.parent)!
    expect(visible.has('OBJ-0') && visible.has('OBJ-1999') && visible.has('OBJ-19999')).toBe(true)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
