import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { outputFreshness, type Freshness } from '../domain/freshness'
import type { ModelIndex } from '../domain/modelIndex'
import type { EngineeringObject, OutputRecord } from '../domain/types'
import { getToolApi, selectInView, sharedContextOf } from './api'
import { useWorkspaceStore } from './store'
import type { SharedContext, ToolApi, ViewStateUpdate } from './toolTypes'

interface ToolScopeValue {
  toolId: string
  /** View instance (see views.ts); defaults to the tool ID for the main pane. */
  viewId: string
  active: boolean
}

const ToolScopeContext = createContext<ToolScopeValue | null>(null)

/** Provided by the workspace around each tool view; binds SDK hooks to that view instance. */
export function ToolScope({
  toolId,
  viewId = toolId,
  active,
  children,
}: { toolId: string; viewId?: string; active: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ toolId, viewId, active }), [toolId, viewId, active])
  return createElement(ToolScopeContext.Provider, { value }, children)
}

function useScope(): ToolScopeValue {
  const scope = useContext(ToolScopeContext)
  if (!scope) throw new Error('Workspace SDK hooks must be used inside a tool view.')
  return scope
}

/** Whether this tool is the visible one (relevant for tools kept mounted in the background). */
export function useIsActiveTool(): boolean {
  return useScope().active
}

/** The view instance this tool view is rendered in. */
export function useViewId(): string {
  return useScope().viewId
}

export function useToolApi<VS = unknown>(): ToolApi<VS> {
  const { toolId, viewId } = useScope()
  return getToolApi<VS>(toolId, viewId)
}

/** Shared context as this view sees it; a pinned view keeps its objects and configuration. */
export function useSharedContext(): SharedContext {
  const viewId = useContext(ToolScopeContext)?.viewId
  return useWorkspaceStore(useShallow((s) => sharedContextOf(s, viewId)))
}

export function useModel(): ModelIndex {
  const model = useWorkspaceStore((s) => s.model)
  if (!model) throw new Error('Model not loaded')
  return model
}

export function useSelection(): {
  selectedIds: string[]
  selectedObjects: EngineeringObject[]
  select: (ids: string[]) => void
} {
  const viewId = useContext(ToolScopeContext)?.viewId
  const selectedIds = useWorkspaceStore((s) => (viewId && s.views[viewId]?.pin?.ids) || s.context.selectedIds)
  const model = useModel()
  const select = useCallback((ids: string[]) => selectInView(viewId, ids), [viewId])
  const selectedObjects = useMemo(
    () => selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => o !== undefined),
    [selectedIds, model],
  )
  return { selectedIds, selectedObjects, select }
}

export interface OutputView extends OutputRecord {
  freshness: Freshness
}

export interface OutputFilter {
  objectId?: string
  scenarioId?: string | null
  toolId?: string
  kind?: string
}

/**
 * Saved outputs for the view's configuration only, newest first, each with a
 * freshness assessment against the current model.
 */
export function useOutputs(filter: OutputFilter = {}): OutputView[] {
  const viewId = useContext(ToolScopeContext)?.viewId
  const outputs = useWorkspaceStore((s) => s.outputs)
  const configurationId = useWorkspaceStore((s) => sharedContextOf(s, viewId).configurationId)
  const model = useModel()
  const { objectId, scenarioId, toolId, kind } = filter
  return useMemo(
    () =>
      outputs
        .filter(
          (o) =>
            o.configurationId === configurationId &&
            (objectId === undefined || o.objectIds.includes(objectId)) &&
            (scenarioId === undefined || o.scenarioId === scenarioId) &&
            (toolId === undefined || o.toolId === toolId) &&
            (kind === undefined || o.kind === kind),
        )
        .map((o) => ({ ...o, freshness: outputFreshness(o, model) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [outputs, configurationId, model, objectId, scenarioId, toolId, kind],
  )
}

/** A single output by ID, regardless of configuration (for traceability views). */
export function useOutput(id: string | undefined): OutputView | undefined {
  const output = useWorkspaceStore((s) => (id ? s.outputs.find((o) => o.id === id) : undefined))
  const model = useModel()
  return useMemo(() => (output ? { ...output, freshness: outputFreshness(output, model) } : undefined), [output, model])
}

/** This view instance's private state, restored when the user returns to it. */
export function useToolViewState<VS>(): [VS, (update: ViewStateUpdate<VS>) => void] {
  const { toolId, viewId } = useScope()
  const state = useWorkspaceStore((s) => (s.viewStates[viewId] ?? s.initialViewStates[toolId]) as VS)
  const update = useCallback(
    (u: ViewStateUpdate<VS>) => useWorkspaceStore.getState().updateViewState(viewId, u as ViewStateUpdate<unknown>),
    [viewId],
  )
  return [state, update]
}

/** Remembers and restores the scroll position of a scrollable element, per view instance. */
export function useRestoredScroll<T extends HTMLElement>(key: string): (element: T | null) => void {
  const { viewId } = useScope()
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  return useCallback(
    (element: T | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!element) return
      const saved = useWorkspaceStore.getState().scrollStates[viewId]?.[key]
      if (saved) requestAnimationFrame(() => (element.scrollTop = saved))
      let timer: ReturnType<typeof setTimeout> | undefined
      const onScroll = () => {
        clearTimeout(timer)
        timer = setTimeout(() => useWorkspaceStore.getState().setScroll(viewId, key, element.scrollTop), 100)
      }
      element.addEventListener('scroll', onScroll, { passive: true })
      cleanup.current = () => {
        clearTimeout(timer)
        element.removeEventListener('scroll', onScroll)
        useWorkspaceStore.getState().setScroll(viewId, key, element.scrollTop)
      }
    },
    [viewId, key],
  )
}

// ---- unsaved edits --------------------------------------------------------------------

const dirtySources = new Set<symbol>()
let beforeUnloadInstalled = false

function installBeforeUnload() {
  if (beforeUnloadInstalled || typeof window === 'undefined') return
  beforeUnloadInstalled = true
  window.addEventListener('beforeunload', (event) => {
    if (dirtySources.size === 0) return
    event.preventDefault()
    event.returnValue = '' // asks the browser to confirm closing a window with unsaved edits
  })
}

/**
 * Declares that a form has unsaved edits. Closing or reloading the window then
 * asks for confirmation. Saved work is always in the repository.
 */
export function useUnsavedChanges(dirty: boolean): void {
  const token = useRef(Symbol('unsaved'))
  useEffect(() => {
    installBeforeUnload()
    const id = token.current
    if (dirty) dirtySources.add(id)
    else dirtySources.delete(id)
    return () => {
      dirtySources.delete(id)
    }
  }, [dirty])
}

export function hasUnsavedChanges(): boolean {
  return dirtySources.size > 0
}
