import type { PlatformServices } from '../contract/requirements'
import {
  outputFreshness,
  resolveRepresentation,
  type ActivityEntry,
  type Baseline,
  type EngineeringObject,
  type Freshness,
  type ModelIndex,
  type OutputRecord,
  type RepresentationKind,
  type Resolution,
} from '@ews/model-service'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { SettingValue } from '../contract/settings'
import type { ArtifactFilter, SharedContext, ToolApi, ToolCommand, ViewStateUpdate } from '../contract/tool'
import { shallowEqual, useHostValue, usePlatformHost, useToolScope } from './host'

/** Whether this view is the visible one (relevant for views kept mounted in the background). */
export function useIsActiveTool(): boolean {
  return useToolScope().active
}

/** The view instance this tool view is rendered in. */
export function useViewId(): string {
  return useToolScope().viewId
}

export function useToolApi<VS = unknown>(): ToolApi<VS> {
  const { toolId, viewId } = useToolScope()
  return usePlatformHost().getToolApi(toolId, viewId) as ToolApi<VS>
}

/** Shared context as this view sees it; a pinned view keeps its objects and configuration. */
export function useSharedContext(): SharedContext {
  const { viewId } = useToolScope()
  return useHostValue((h) => h.getContext(viewId), shallowEqual)
}

export function useModel(): ModelIndex {
  const model = useHostValue((h) => h.getModel())
  if (!model) throw new Error('Model not loaded')
  return model
}

export function useSelection(): { selectedIds: string[]; selectedObjects: EngineeringObject[]; select: (ids: string[]) => void } {
  const api = useToolApi()
  const { selectedIds } = useSharedContext()
  const model = useModel()
  const select = useCallback((ids: string[]) => api.select(ids), [api])
  const selectedObjects = useMemo(
    () => selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => o !== undefined),
    [selectedIds, model],
  )
  return { selectedIds, selectedObjects, select }
}

/**
 * The selection resolved to the representations of one kind (SysML or CAD),
 * through explicit relationships only. The shared selection itself is never
 * changed; when nothing is linked the reason explains the empty view.
 */
export function useResolvedSelection(kind: RepresentationKind): { selectedIds: string[]; resolution: Resolution | null } {
  const { selectedIds } = useSharedContext()
  const model = useModel()
  const resolution = useMemo(() => {
    if (!selectedIds.length) return null
    const results = selectedIds.map((id) => resolveRepresentation(model, id, kind))
    const ids = [...new Set(results.flatMap((r) => (r.status === 'resolved' ? r.ids : [])))]
    if (ids.length) {
      const via = results.find((r) => r.status === 'resolved')
      return { status: 'resolved', ids, via: via && via.status === 'resolved' ? via.via : '' } satisfies Resolution
    }
    const first = results[0]
    return first.status === 'none' ? first : null
  }, [selectedIds, model, kind])
  return { selectedIds, resolution }
}

export interface ArtifactView extends OutputRecord {
  freshness: Freshness
}

/** Saved artifacts in the view's configuration, newest first, each with a freshness assessment. */
export function useArtifacts(filter: ArtifactFilter = {}): ArtifactView[] {
  const { configurationId } = useSharedContext()
  const artifacts = useHostValue((h) => h.getArtifacts())
  const model = useModel()
  const { objectId, toolId, kind } = filter
  return useMemo(
    () =>
      artifacts
        .filter(
          (o) =>
            o.configurationId === configurationId &&
            (objectId === undefined || o.objectIds.includes(objectId)) &&
            (toolId === undefined || o.toolId === toolId) &&
            (kind === undefined || o.kind === kind),
        )
        .map((o) => ({ ...o, freshness: outputFreshness(o, model) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [artifacts, configurationId, model, objectId, toolId, kind],
  )
}

/** Activity entries, newest first; only those about `objectId` when given. */
export function useActivity(objectId?: string): ActivityEntry[] {
  const activity = useHostValue((h) => h.getActivity())
  return useMemo(() => (objectId ? activity.filter((a) => a.objectIds.includes(objectId)) : activity), [activity, objectId])
}

/** Platform services for tools (SDK 1.2). Absent services are undefined; show why instead of substituting data. */
export function usePlatformServices(): PlatformServices {
  return useHostValue((h) => h.getServices())
}

/** Baselines of the project (SDK 1.1). */
export function useBaselines(): Baseline[] {
  return useHostValue((h) => h.getBaselines())
}

/** This view instance's private state, restored when the user returns to it. */
export function useToolViewState<VS>(): [VS, (update: ViewStateUpdate<VS>) => void] {
  const { toolId, viewId } = useToolScope()
  const host = usePlatformHost()
  const state = useHostValue((h) => h.getViewState(viewId, toolId)) as VS
  const update = useCallback(
    (u: ViewStateUpdate<VS>) => host.updateViewState(viewId, toolId, u as ViewStateUpdate<unknown>),
    [host, viewId, toolId],
  )
  return [state, update]
}

/** Registers a command (listed in the command palette) while the view is mounted. */
export function useToolCommand(command: ToolCommand | null): void {
  const api = useToolApi()
  const latest = useRef(command)
  latest.current = command
  const key = command ? `${command.id}|${command.label}|${command.disabled ? 1 : 0}|${command.icon ?? ''}` : ''
  useEffect(() => {
    if (!latest.current) return
    const c = latest.current
    return api.registerCommand({ ...c, run: () => latest.current?.run() })
  }, [api, key])
}

/** Remembers and restores the scroll position of a scrollable element, per view instance. */
export function useRestoredScroll<T extends HTMLElement>(key: string): (element: T | null) => void {
  const { viewId } = useToolScope()
  const host = usePlatformHost()
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  return useCallback(
    (element: T | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!element) return
      const saved = host.getScroll(viewId, key)
      if (saved) requestAnimationFrame(() => (element.scrollTop = saved))
      let timer: ReturnType<typeof setTimeout> | undefined
      const onScroll = () => {
        clearTimeout(timer)
        timer = setTimeout(() => host.setScroll(viewId, key, element.scrollTop), 100)
      }
      element.addEventListener('scroll', onScroll, { passive: true })
      cleanup.current = () => {
        clearTimeout(timer)
        element.removeEventListener('scroll', onScroll)
        host.setScroll(viewId, key, element.scrollTop)
      }
    },
    [host, viewId, key],
  )
}

// ---- unsaved edits ----------------------------------------------------------------------

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

/** Declares that a form has unsaved edits; closing or reloading the window then asks for confirmation. */
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

/**
 * The effective value of a setting (SDK 1.6): the person's value clamped to the project ceiling, else the
 * definition's default; undefined for an unknown ID. Re-renders when the value changes in any window.
 */
export function useSetting<T extends SettingValue = SettingValue>(id: string): T | undefined {
  const api = useToolApi()
  return useSyncExternalStore(api.settings.subscribe, () => api.settings.get(id) as T | undefined)
}
