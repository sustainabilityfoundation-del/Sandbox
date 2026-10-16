/**
 * Illustrative tools kept for the example project and as references (integration milestone 1, C12): the
 * illustrative SysML tool and the mock CAD tool. They work on the example's browser twin and are labelled "Demo"
 * wherever tools are listed, so they are not mistaken for the SysML Modeler and the CAD Modeler (the real modules
 * that new projects open). Retirement follows the replacement ADRs with non-destructive migration.
 */
export const DEMO_TOOL_IDS: readonly string[] = ['sysml', 'cad']

export const isDemoTool = (toolId: string | undefined | null) => !!toolId && DEMO_TOOL_IDS.includes(toolId)

export const DEMO_TOOL_EXPLANATION = 'Demo: an illustrative tool on the example project’s browser data. Use the SysML Modeler and the CAD Modeler for engineering work.'
