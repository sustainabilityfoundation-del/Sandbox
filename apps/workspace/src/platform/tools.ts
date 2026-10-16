/**
 * The tool catalogue. Adding a tool = add its package as a dependency of this
 * app and register it here. Tools are separate packages; the workspace never
 * imports their internals, only the exported definition.
 */
import { cadTool } from '@ews/tool-cad'
import { conceptualizeTool } from '@ews/tool-conceptualize'
import { createCadModelerTool } from '@ews/tool-cad-modeler'
import { requirementsTool } from '@ews/tool-requirements'
import { sysmlTool } from '@ews/tool-sysml'
import { registerTool } from './registry'
import { createSysmlModelerTool } from '@ews/tool-sysml-modeler'
import { serviceSettings } from './services'
import { registerPlatformModule } from './platformModules'
import { projectsAssistant } from '../projects/assistant'
import { projectsHelp } from '../projects/help'

registerTool(requirementsTool)
registerTool(sysmlTool)
registerTool(cadTool)
registerTool(conceptualizeTool)
// CAD Modeler (CAD program), separate from the mock CAD tool (cad-program-contracts.md §1). Until the
// SDK offers PlatformServices.cad (SDK 1.6), the tool builds its client: API mode follows the
// Requirements service mode (API → /api/cad/v1 as the development user; demo → files only).
registerTool(createCadModelerTool(serviceSettings.requirementsMode === 'demo' ? { mode: 'files' } : { mode: 'api', baseUrl: '/api/cad/v1', devUser: serviceSettings.devUser }))

// SysML Modeler (docs/specifications/sysml-program-contracts.md §1, §7). Until the SDK offers a
// SysML service (CR-SYSML-01) the tool builds its client: API mode follows the Requirements service
// mode (API → /api/sysml/v1 as the development user; demo → explicit in-browser repository).
registerTool(createSysmlModelerTool(serviceSettings.requirementsMode === 'demo' ? { mode: 'local' } : { mode: 'api', baseUrl: '/api/sysml/v1', devUser: serviceSettings.devUser }))

// Project Management is a platform module, not a tool: its assistant operations work headless (milestone C9).
registerPlatformModule({ id: 'projects', name: 'Project Management', assistant: projectsAssistant(), help: projectsHelp })

/** Tools opened as tabs in a fresh session (only those the subscription includes are opened). */
export const DEFAULT_OPEN_TOOLS = ['requirements', 'sysml', 'cad', 'conceptualize']
