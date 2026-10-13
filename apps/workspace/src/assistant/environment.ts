import { useEntitlements } from '../platform/entitlements'
import { getTools } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import type { AssistantEnvironment } from './executor'

/**
 * Binds the assistant's operations to the workspace services: the
 * repository-backed store, the tool registry and the entitlement service. The
 * assistant keeps no copy of the model.
 */
export function createWorkspaceEnvironment(proposals: Pick<AssistantEnvironment, 'createProposal' | 'getProposal'>): AssistantEnvironment {
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
    isEntitled: (entitlement) => useEntitlements.getState().has(entitlement),
    ...proposals,
  }
}
