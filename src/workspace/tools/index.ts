/**
 * Tool registrations. Adding a tool = create its module + add one line here.
 * The workspace renders whatever is registered; it has no tool-specific code.
 */
import { registerTool } from './registry'
import { geometryTool } from './geometry'
import { requirementsTool } from './requirements'
import { analysisTool } from './analysis'
import { verificationTool } from './verification'
import { modelViewerTool } from './model-viewer'

registerTool(geometryTool)
registerTool(requirementsTool)
registerTool(analysisTool)
registerTool(verificationTool)
registerTool(modelViewerTool)

/** Tools opened as tabs in a fresh session. */
export const DEFAULT_OPEN_TOOLS = ['geometry', 'requirements', 'analysis', 'verification']
