import { getToolApi } from '../sdk/api'
import { useWorkspaceStore } from '../sdk/store'
import { captureRun, executeRun, type AnalysisViewState } from '../tools/analysis/run'
import { getTools } from '../tools/registry'
import type { AssistantEnvironment } from './executor'

/**
 * Binds the assistant's operations to the existing workspace services: the
 * repository-backed workspace store, the tool registry and the Analysis tool's
 * run logic. The assistant keeps no copy of the model.
 */
export function createWorkspaceEnvironment(
  proposals: Pick<AssistantEnvironment, 'createProposal' | 'getProposal'>,
): AssistantEnvironment {
  const workspace = useWorkspaceStore.getState
  return {
    getModel: () => {
      const model = workspace().model
      if (!model) throw new Error('The model is not loaded.')
      return model
    },
    getOutputs: () => workspace().outputs,
    select: (ids) => workspace().select(ids),
    listTools: () => getTools().map((t) => ({ id: t.id, name: t.name })),
    openTool: (toolId) => workspace().activateTool(toolId),
    runAnalysis: async (request, source) => {
      // Same capture, calculation and save path as the Analysis toolbar.
      const api = getToolApi<AnalysisViewState>('analysis')
      const capture = captureRun(api, request)
      if (capture.error !== undefined) throw new Error(capture.error)
      return executeRun(api, capture.captured, { autoSave: true, source })
    },
    ...proposals,
  }
}
