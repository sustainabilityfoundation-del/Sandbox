import { beforeAll, describe, expect, it } from 'vitest'
import { mergeConversations } from '../assistant/conversation'
import { DemoRepository, type StorageLike } from '@ews/model-service'
import { PROJECT_ID } from '@ews/model-service'
import { getToolApi, selectInView, sharedContextOf } from '../platform/api'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from '../platform/store'
import { detachedViewId, splitViewId, toolIdOfView } from '../platform/views'
import { saveSession } from '../platform/session'
import { clampLayout, modeFor } from '../shell/layout/viewport'
import '../platform/tools'
import { getTools } from '../platform/registry'

function sharedStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const meta = { toolId: 'cad', configurationId: 'CFG-BASE', summary: 'edit' }

describe('two windows sharing the demo repository', () => {
  it('rereads data written by the other window, so revision checks still catch conflicts', async () => {
    const storage = sharedStorage()
    const windowA = new DemoRepository({ storage, latencyMs: [0, 0] })
    const windowB = new DemoRepository({ storage, latencyMs: [0, 0] }) // loaded before A's edit
    const edit = (value: number) => ({
      kind: 'update-properties' as const,
      targetId: 'ROD-120',
      baseRevision: 2,
      properties: { diameter: { value, unit: 'mm' } },
    })

    await windowA.submitChanges(PROJECT_ID, [edit(2.5)], meta)
    // B still believes the rod is at rev 2; the write must be rejected, not overwrite A's edit.
    await expect(windowB.submitChanges(PROJECT_ID, [edit(3)], meta)).rejects.toMatchObject({ code: 'conflict' })
    const model = await windowB.loadModel(PROJECT_ID)
    expect(model.objects.find((o) => o.id === 'ROD-120')!.properties.diameter).toEqual({ value: 2.5, unit: 'mm' })
  })

  it('sees outputs saved in the other window and never duplicates them', async () => {
    const storage = sharedStorage()
    const a = new DemoRepository({ storage, latencyMs: [0, 0] })
    const b = new DemoRepository({ storage, latencyMs: [0, 0] })
    const saved = await a.saveOutput({
      toolId: 'cad',
      kind: 'cad-representation',
      title: 'Rod representation snapshot',
      projectId: PROJECT_ID,
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-MAX',
      objectIds: ['ROD-120'],
      inputRevision: 6,
      inputs: [{ id: 'ROD-120', revision: 2 }],
      completion: 'complete',
      result: [],
      summary: 'x',
    })
    const outputs = await b.listOutputs(PROJECT_ID)
    expect(outputs.filter((o) => o.id === saved.id)).toHaveLength(1)
    // B's next save gets a new ID rather than reusing A's.
    const next = await b.saveOutput({ ...outputs.find((o) => o.id === saved.id)!, toolId: 'cad' })
    expect(next.id).not.toBe(saved.id)
  })
})

describe('conversation merge between windows', () => {
  const base = { conversationId: 'C-1', startedAt: '2026-10-13T08:00:00Z', proposals: {} }
  const user = (id: string, at: string, text: string) =>
    ({ id, role: 'event', at, updatedAt: at, text, tone: 'info' }) as const

  it('keeps messages from both windows and the newest version of each', () => {
    const local = { ...base, messages: [user('M1', '2026-10-13T08:01:00Z', 'a'), user('M2', '2026-10-13T08:02:00Z', 'old')] }
    const remote = {
      ...base,
      messages: [user('M2', '2026-10-13T08:03:00Z', 'new'), user('M1-w12', '2026-10-13T08:02:30Z', 'from detached')],
    }
    const merged = mergeConversations(local, remote)
    expect(merged.messages.map((m) => m.id)).toEqual(['M1', 'M1-w12', 'M2'])
    expect(merged.messages.find((m) => m.id === 'M2')).toMatchObject({ text: 'new' })
  })

  it('switches to a newer conversation started in another window', () => {
    const local = { ...base, messages: [user('M1', '2026-10-13T08:01:00Z', 'a')] }
    const remote = { conversationId: 'C-2', startedAt: '2026-10-13T09:00:00Z', proposals: {}, messages: [] }
    expect(mergeConversations(local, remote).conversationId).toBe('C-2')
  })
})

describe('view instances', () => {
  beforeAll(async () => {
    await useWorkspaceStore.getState().initialize({
      repository: new DemoRepository({ storage: sharedStorage(), latencyMs: [0, 0] }),
      projectId: PROJECT_ID,
      tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
      defaultOpenToolIds: ['cad-modeler'],
    })
  })

  it('keeps view state private to each instance of the same tool', () => {
    expect(toolIdOfView(detachedViewId('w1', 'cad-modeler'))).toBe('cad-modeler')
    const main = getToolApi<{ probe?: number }>('cad-modeler')
    const detached = getToolApi<{ probe?: number }>('cad-modeler', detachedViewId('w1', 'cad-modeler'))
    detached.updateViewState((vs) => ({ ...vs, probe: 3 }))
    expect(detached.getViewState().probe).toBe(3)
    expect(main.getViewState().probe).toBeUndefined()
  })

  it('pins a view to its objects and configuration while the workspace selection moves on', () => {
    const store = useWorkspaceStore.getState
    const split = splitViewId('requirements')
    store().select(['ROD-120'])
    store().setPin(split, { ids: ['ROD-120'], configurationId: 'CFG-BASE' })
    store().select(['MTR-130'])
    store().setConfiguration('CFG-HD')

    const pinned = sharedContextOf(store(), split)
    expect(pinned).toMatchObject({ selectedIds: ['ROD-120'], configurationId: 'CFG-BASE', pinned: true, workspaceConfigurationId: 'CFG-HD' })
    expect(sharedContextOf(store(), 'requirements')).toMatchObject({ selectedIds: ['MTR-130'], configurationId: 'CFG-HD', pinned: false })

    // Selecting inside a pinned view changes its pin, not the workspace.
    selectInView(split, ['HSG-110'])
    expect(store().views[split].pin?.ids).toEqual(['HSG-110'])
    expect(store().context.selectedIds).toEqual(['MTR-130'])

    store().setPin(split, null)
    expect(sharedContextOf(store(), split).selectedIds).toEqual(['MTR-130'])
  })

  it('keeps separate layout preferences for compact and spacious layouts', () => {
    const store = useWorkspaceStore.getState
    store().setLayoutClass('spacious')
    store().setLayout({ treeWidth: 400 })
    store().setLayoutClass('compact')
    expect(store().layout.treeOpen).toBe(DEFAULT_LAYOUTS.compact.treeOpen)
    store().setLayout({ dockHeight: 200 })
    store().setLayoutClass('spacious')
    expect(store().layout.treeWidth).toBe(400)
    expect(store().layouts.compact.dockHeight).toBe(200)
  })
})

describe('responsive layout helpers', () => {
  it('chooses modes from available space only', () => {
    expect(modeFor(390, 844)).toBe('phone')
    expect(modeFor(844, 390)).toBe('phone') // phone in landscape: too short for side panels
    expect(modeFor(820, 1180)).toBe('tablet')
    expect(modeFor(1180, 820)).toBe('desktop')
    expect(modeFor(1920, 1080)).toBe('desktop')
  })

  it('clamps restored sizes so panels stay reachable', () => {
    const huge = { ...DEFAULT_LAYOUTS.spacious, treeWidth: 2000, inspectorWidth: 2000, dockHeight: 5000, split: { toolId: 'cad-modeler', ratio: 0.95 } }
    const clamped = clampLayout(huge, 1280, 720)
    expect(clamped.treeWidth).toBeLessThanOrEqual(1280 * 0.4)
    expect(clamped.inspectorWidth).toBeLessThanOrEqual(1280 * 0.45)
    expect(clamped.dockHeight).toBeLessThanOrEqual(720 * 0.7)
    expect(clamped.split?.ratio).toBe(0.75)
  })
})

describe('restoring a session that references retired tools', () => {
  it('drops retired tabs, split views and view states on restore, and keeps all model data', async () => {
    const storage = sharedStorage()
    const init = () =>
      useWorkspaceStore.getState().initialize({
        repository: new DemoRepository({ storage, latencyMs: [0, 0] }),
        projectId: PROJECT_ID,
        tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
        defaultOpenToolIds: ['requirements'],
      })
    await init()
    const before = useWorkspaceStore.getState()
    const counts = { objects: before.model!.objects.length, revision: before.model!.revision }
    saveSession({
      context: before.context,
      activeToolId: 'sysml',
      openToolIds: ['sysml', 'cad', 'requirements'],
      favorites: ['sysml'],
      recents: ['cad'],
      viewStates: { sysml: { zoom: 2 }, requirements: {} },
      scrollStates: {},
      layouts: { spacious: { split: { toolId: 'sysml', ratio: 0.5 } } },
    })
    await init()
    const after = useWorkspaceStore.getState()
    expect(after.openToolIds).toEqual(['requirements'])
    expect(after.activeToolId).toBe('requirements')
    expect(after.layouts.spacious.split).toBeNull()
    expect(after.favorites).not.toContain('sysml')
    expect(Object.keys(after.viewStates)).not.toContain('sysml')
    expect({ objects: after.model!.objects.length, revision: after.model!.revision }).toEqual(counts)
  })
})
