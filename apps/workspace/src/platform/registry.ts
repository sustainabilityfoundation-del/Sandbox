import { SDK_VERSION, isSdkCompatible } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'

/**
 * Tool registry. The workspace renders whatever is registered here; it has no
 * tool-specific code. A tool built for an incompatible SDK version is not
 * registered and is listed with the reason instead.
 */

const tools: AnyToolDefinition[] = []
const rejected: { id: string; name: string; reason: string }[] = []

export function registerTool(tool: AnyToolDefinition): boolean {
  if (tools.some((t) => t.id === tool.id)) throw new Error(`Tool "${tool.id}" is already registered.`)
  if (!isSdkCompatible(tool.sdkVersion)) {
    rejected.push({ id: tool.id, name: tool.name, reason: `${tool.name} ${tool.version} needs SDK ${tool.sdkVersion}; this workspace provides ${SDK_VERSION}.` })
    return false
  }
  const bad = tool.assistant?.actions.find((a) => !a.name.startsWith(`${tool.id}.`))
  if (bad) throw new Error(`Assistant action "${bad.name}" must be prefixed with "${tool.id}."`)
  tools.push(tool)
  return true
}

export function getTools(): readonly AnyToolDefinition[] {
  return tools
}

export function getTool(id: string | null | undefined): AnyToolDefinition | undefined {
  return tools.find((t) => t.id === id)
}

/** Tools that were not loaded because of an SDK mismatch. */
export function getRejectedTools(): readonly { id: string; name: string; reason: string }[] {
  return rejected
}

/**
 * Tools from earlier versions that are no longer in the catalogue. Their saved
 * artifacts and activity are kept and shown read-only with these names.
 */
export const RETIRED_TOOLS: Record<string, string> = {
  analysis: 'Analysis',
  verification: 'Verification',
  geometry: 'Geometry',
  'model-viewer': '3D Model Viewer',
}

/** Display name for a tool ID, including retired tools and non-tool sources. */
export function toolName(id: string | undefined): string {
  if (!id) return 'Workspace'
  if (id === 'assistant') return 'ChatGPT panel'
  if (id === 'platform') return 'Platform'
  return getTool(id)?.name ?? (RETIRED_TOOLS[id] ? `${RETIRED_TOOLS[id]} (retired)` : id)
}
