/**
 * The tool catalogue. Adding a tool = add its package as a dependency of this
 * app and register it here. Tools are separate packages; the workspace never
 * imports their internals, only the exported definition.
 */
import { cadTool } from '@ews/tool-cad'
import { cadModelerTool } from '@ews/tool-cad-modeler'
import { requirementsTool } from '@ews/tool-requirements'
import { sysmlTool } from '@ews/tool-sysml'
import { registerTool } from './registry'

registerTool(requirementsTool)
registerTool(sysmlTool)
registerTool(cadTool)
// CAD Modeler (CAD program Phase 1), separate from the mock CAD tool (cad-program-contracts.md §1).
registerTool(cadModelerTool)

/** Tools opened as tabs in a fresh session (only those the subscription includes are opened). */
export const DEFAULT_OPEN_TOOLS = ['requirements', 'sysml', 'cad']
