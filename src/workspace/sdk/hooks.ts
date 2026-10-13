import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { outputFreshness, type Freshness } from '../domain/freshness'
import type { ModelIndex } from '../domain/modelIndex'
import type { EngineeringObject, OutputRecord } from '../domain/types'
import { getToolApi } from './api'
import { useWorkspaceStore } from './store'
import type { SharedContext, ToolApi, ViewStateUpdate } from './toolTypes'

interface ToolScopeValue {
  toolId: string
  active: boolean
}

const ToolScopeContext = createContext<ToolScopeValue | null>(null)

/** Provided by the workspace around each tool; binds SDK hooks to that tool. */
export function ToolScope({ toolId, active, children }: ToolScopeValue & { children: ReactNode }) {
  const value = useMemo(() => ({ toolId, active }), [toolId, active])
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

export function useToolApi<VS = unknown>(): ToolApi<VS> {
  return getToolApi<VS>(useScope().toolId)
}

export function useSharedContext(): SharedContext {
  return useWorkspaceStore(
    useShallow((s) => ({
      projectId: s.context.projectId,
      configurationId: s.context.configurationId,
      scenarioId: s.context.scenarioId,
      selectedIds: s.context.selectedIds,
      modelRevision: s.model?.revision ?? 0,
    })),
  )
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
  const selectedIds = useWorkspaceStore((s) => s.context.selectedIds)
  const model = useModel()
  const select = useWorkspaceStore((s) => s.select)
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
 * Saved outputs for the active configuration only, newest first, each with a
 * freshness assessment against the current model.
 */
export function useOutputs(filter: OutputFilter = {}): OutputView[] {
  const outputs = useWorkspaceStore((s) => s.outputs)
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
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

/** The tool's private view state, restored when the user returns to the tool. */
export function useToolViewState<VS>(): [VS, (update: ViewStateUpdate<VS>) => void] {
  const { toolId } = useScope()
  const state = useWorkspaceStore((s) => (s.viewStates[toolId] ?? s.initialViewStates[toolId]) as VS)
  const update = useCallback(
    (u: ViewStateUpdate<VS>) => useWorkspaceStore.getState().updateViewState(toolId, u as ViewStateUpdate<unknown>),
    [toolId],
  )
  return [state, update]
}

/** Remembers and restores the scroll position of a scrollable element. */
export function useRestoredScroll<T extends HTMLElement>(key: string): (element: T | null) => void {
  const { toolId } = useScope()
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  return useCallback(
    (element: T | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!element) return
      const saved = useWorkspaceStore.getState().scrollStates[toolId]?.[key]
      if (saved) requestAnimationFrame(() => (element.scrollTop = saved))
      let timer: ReturnType<typeof setTimeout> | undefined
      const onScroll = () => {
        clearTimeout(timer)
        timer = setTimeout(() => useWorkspaceStore.getState().setScroll(toolId, key, element.scrollTop), 100)
      }
      element.addEventListener('scroll', onScroll, { passive: true })
      cleanup.current = () => {
        clearTimeout(timer)
        element.removeEventListener('scroll', onScroll)
        useWorkspaceStore.getState().setScroll(toolId, key, element.scrollTop)
      }
    },
    [toolId, key],
  )
}
