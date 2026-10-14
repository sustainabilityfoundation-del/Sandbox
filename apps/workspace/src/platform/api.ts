import type { ModelIndex } from '@ews/model-service'
import type { PlatformHost, SharedContext, ToolApi } from '@ews/platform-sdk'
import { useToasts } from '@ews/design-system'
import { useWorkspaceStore } from './store'
import { workspaceServices } from './services'
import { toolIdOfView } from './views'


type State = ReturnType<typeof useWorkspaceStore.getState>

/** The context as a particular view instance sees it (pinned views keep their objects and configuration). */
export function sharedContextOf(state: State, viewId?: string): SharedContext {
  const pin = viewId ? state.views[viewId]?.pin : null
  return {
    projectId: state.context.projectId,
    configurationId: pin?.configurationId ?? state.context.configurationId,
    scenarioId: state.context.scenarioId,
    selectedIds: pin?.ids ?? state.context.selectedIds,
    modelRevision: state.model?.revision ?? 0,
    pinned: !!pin,
    workspaceConfigurationId: state.context.configurationId,
  }
}

/** Selects in a view: updates the workspace selection, or the pin if the view is pinned. */
export function selectInView(viewId: string | undefined, ids: string[]): void {
  const state = useWorkspaceStore.getState()
  const pin = viewId ? state.views[viewId]?.pin : null
  if (viewId && pin) state.setPin(viewId, { ...pin, ids: [...new Set(ids)] })
  else state.select(ids)
}

/** Opens a tool through the platform; explains (and does nothing) when the subscription excludes it. */
export function openToolOrExplain(toolId: string): boolean {
  const access = useWorkspaceStore.getState().activateTool(toolId)
  if (!access.ok) useToasts.getState().push({ tone: 'warning', title: 'Tool not available', body: access.reason })
  return access.ok
}

const apis = new Map<string, ToolApi<unknown>>()

/**
 * One stable API object per view instance, bound to its tool ID (for artifact
 * provenance) and its private state. The main view of a tool uses the tool ID.
 */
export function getToolApi<VS>(toolId: string, viewId: string = toolId): ToolApi<VS> {
  let api = apis.get(viewId)
  if (!api) {
    const store = useWorkspaceStore.getState
    if (toolIdOfView(viewId) !== toolId) throw new Error(`View ${viewId} does not belong to tool ${toolId}`)
    api = {
      toolId,
      viewId,
      services: workspaceServices,
      getContext: () => sharedContextOf(store(), viewId),
      getModel: (): ModelIndex => {
        const model = store().model
        if (!model) throw new Error('Model not loaded')
        return model
      },
      select: (ids) => selectInView(viewId, ids),
      setScenario: (id) => store().setScenario(id),
      submitChanges: (changes, summary, options) => store().submitChanges(toolId, changes, summary, options),
      saveArtifact: (artifact, options) =>
        store().saveArtifact(
          toolId,
          { ...artifact, configurationId: artifact.configurationId ?? sharedContextOf(store(), viewId).configurationId },
          options,
        ),
      getArtifacts: (filter = {}) => {
        const { configurationId } = sharedContextOf(store(), viewId)
        return store()
          .outputs.filter(
            (o) =>
              o.configurationId === configurationId &&
              (!filter.objectId || o.objectIds.includes(filter.objectId)) &&
              (!filter.toolId || o.toolId === filter.toolId) &&
              (!filter.kind || o.kind === filter.kind),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },
      setReviewStatus: (id, status) => store().setReviewStatus(toolId, id, status),
      getActivity: (objectId) => (objectId ? store().activity.filter((a) => a.objectIds.includes(objectId)) : store().activity),
      log: (message, options) => store().log(toolId, message, options?.kind, options?.objectIds, options?.source),
      getObjectRevision: (id, revision) => store().readRevision(id, revision),
      getBaselines: () => store().baselines,
      registerCommand: (command) => store().registerCommand(viewId, command),
      openTool: (id) => {
        const access = store().activateTool(id)
        return access.ok ? { ok: true } : { ok: false, reason: access.reason }
      },
      getViewState: () => store().viewStates[viewId] ?? store().initialViewStates[toolId],
      updateViewState: (update) => store().updateViewState(viewId, update),
    }
    apis.set(viewId, api)
  }
  return api as ToolApi<VS>
}

// ---- PlatformHost over the workspace store ------------------------------------------------

const contextCache = new Map<string, { state: State; value: SharedContext }>()

function cachedContext(viewId: string): SharedContext {
  const state = useWorkspaceStore.getState()
  const cached = contextCache.get(viewId)
  if (cached && cached.state.context === state.context && cached.state.views === state.views && cached.state.model === state.model) {
    return cached.value
  }
  const value = sharedContextOf(state, viewId || undefined)
  contextCache.set(viewId, { state, value })
  return value
}

/** How tool views (and SDK UI helpers in the shell) reach the workspace. */
export const workspaceHost: PlatformHost = {
  kind: 'workspace',
  subscribe: (listener) => useWorkspaceStore.subscribe(listener),
  getModel: () => useWorkspaceStore.getState().model,
  getArtifacts: () => useWorkspaceStore.getState().outputs,
  getActivity: () => useWorkspaceStore.getState().activity,
  getBaselines: () => useWorkspaceStore.getState().baselines,
  getServices: () => workspaceServices,
  getContext: cachedContext,
  select: (ids, viewId) => selectInView(viewId || undefined, ids),
  getViewState: (viewId, toolId) => {
    const s = useWorkspaceStore.getState()
    return s.viewStates[viewId] ?? s.initialViewStates[toolId]
  },
  updateViewState: (viewId, _toolId, update) => useWorkspaceStore.getState().updateViewState(viewId, update),
  getScroll: (viewId, key) => useWorkspaceStore.getState().scrollStates[viewId]?.[key],
  setScroll: (viewId, key, top) => useWorkspaceStore.getState().setScroll(viewId, key, top),
  getToolApi: (toolId, viewId) => getToolApi(toolId, viewId),
}
