import type { ModelIndex } from '../domain/modelIndex'
import { useWorkspaceStore } from './store'
import type { SharedContext, ToolApi } from './toolTypes'
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

const apis = new Map<string, ToolApi<unknown>>()

/**
 * One stable API object per view instance, bound to its tool ID (for output
 * provenance) and its private state. The main view of a tool uses the tool ID.
 */
export function getToolApi<VS>(toolId: string, viewId: string = toolId): ToolApi<VS> {
  let api = apis.get(viewId)
  if (!api) {
    const store = useWorkspaceStore.getState
    if (toolIdOfView(viewId) !== toolId) throw new Error(`View ${viewId} does not belong to tool ${toolId}`)
    api = {
      toolId,
      getContext: () => sharedContextOf(store(), viewId),
      getModel: (): ModelIndex => {
        const model = store().model
        if (!model) throw new Error('Model not loaded')
        return model
      },
      select: (ids) => selectInView(viewId, ids),
      setScenario: (id) => store().setScenario(id),
      submitChanges: (changes, summary, options) => store().submitChanges(toolId, changes, summary, options),
      saveOutput: (output, options) =>
        store().saveOutput(
          toolId,
          { ...output, configurationId: output.configurationId ?? sharedContextOf(store(), viewId).configurationId },
          options,
        ),
      setReviewStatus: (outputId, status) => store().setReviewStatus(toolId, outputId, status),
      getViewState: () => store().viewStates[viewId] ?? store().initialViewStates[toolId],
      updateViewState: (update) => store().updateViewState(viewId, update),
      log: (message, options) => store().log(toolId, message, options?.kind, options?.objectIds, options?.source),
      openTool: (id) => store().activateTool(id),
    }
    apis.set(viewId, api)
  }
  return api as ToolApi<VS>
}
