import type { AssistantContribution, EntitlementId } from '@ews/platform-sdk'
import { getPlatformModules, platformModuleIncluded } from '../platform/platformModules'
import { getTools } from '../platform/registry'
import { useEntitlements } from '../platform/entitlements'

/**
 * The single read path for assistant contributions: registered tools and headless platform modules
 * (`registerPlatformModule`, SDK 1.8). Operations, the executor, the demo planner, editable-field rules
 * and the capability inventory all read contributions here, so a module without a view is handled
 * exactly like a tool.
 */
export interface AssistantContributor {
  /** Tool or module ID; its operations are named `<id>.<action>`. */
  id: string
  name: string
  kind: 'tool' | 'platform-module'
  entitlement?: EntitlementId
  assistant: AssistantContribution
}

export function assistantContributions(): AssistantContributor[] {
  const tools = getTools()
    .filter((t) => t.assistant)
    .map((t): AssistantContributor => ({ id: t.id, name: t.name, kind: 'tool', entitlement: t.entitlement, assistant: t.assistant! }))
  const modules = getPlatformModules()
    .filter((m) => m.assistant)
    .map((m): AssistantContributor => ({ id: m.id, name: m.name, kind: 'platform-module', entitlement: m.entitlement as EntitlementId | undefined, assistant: m.assistant! }))
  return [...tools, ...modules]
}

/** Whether the (demo) subscription includes a contributor (UX; the server checks again). */
export function contributorIncluded(c: AssistantContributor): boolean {
  if (c.kind === 'platform-module') {
    const m = getPlatformModules().find((x) => x.id === c.id)
    return m ? platformModuleIncluded(m) : false
  }
  return !c.entitlement || useEntitlements.getState().has(c.entitlement)
}
