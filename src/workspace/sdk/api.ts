import type { ModelIndex } from '../domain/modelIndex'
import { useWorkspaceStore } from './store'
import type { SharedContext, ToolApi } from './toolTypes'

export function sharedContextOf(state: ReturnType<typeof useWorkspaceStore.getState>): SharedContext {
  return { ...state.context, modelRevision: state.model?.revision ?? 0 }
}

const apis = new Map<string, ToolApi<unknown>>()

/** One stable API object per tool, bound to that tool's ID and private state. */
export function getToolApi<VS>(toolId: string): ToolApi<VS> {
  let api = apis.get(toolId)
  if (!api) {
    const store = useWorkspaceStore.getState
    api = {
      toolId,
      getContext: () => sharedContextOf(store()),
      getModel: (): ModelIndex => {
        const model = store().model
        if (!model) throw new Error('Model not loaded')
        return model
      },
      select: (ids) => store().select(ids),
      setScenario: (id) => store().setScenario(id),
      submitChanges: (changes, summary, options) => store().submitChanges(toolId, changes, summary, options),
      saveOutput: (output, options) => store().saveOutput(toolId, output, options),
      setReviewStatus: (outputId, status) => store().setReviewStatus(toolId, outputId, status),
      getViewState: () => store().viewStates[toolId] ?? store().initialViewStates[toolId],
      updateViewState: (update) => store().updateViewState(toolId, update),
      log: (message, options) => store().log(toolId, message, options?.kind, options?.objectIds, options?.source),
      openTool: (id) => store().activateTool(id),
    }
    apis.set(toolId, api)
  }
  return api as ToolApi<VS>
}
