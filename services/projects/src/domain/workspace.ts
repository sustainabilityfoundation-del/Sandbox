/**
 * Per-project workspace defaults (integration milestone 1, C12). New projects open the real modules: Requirements,
 * Conceptualize, SysML Modeler and CAD Modeler. The legacy example project PRJ-ACT100 keeps the defaults it always
 * had (including the illustrative SysML tool and the mock CAD tool, which the workspace labels "Demo").
 * Tool IDs are the workspace tool registry's IDs; tools of a module disabled for the project are left out.
 */
export const NEW_PROJECT_TOOLS = ['requirements', 'conceptualize', 'sysml-modeler', 'cad-modeler'] as const
export const LEGACY_PROJECT_TOOLS = ['requirements', 'sysml', 'cad', 'conceptualize'] as const

/** Registry module → the workspace tools that belong to it (for module enablement). */
const TOOLS_OF_MODULE: Record<string, string[]> = { requirements: ['requirements'], conceptualize: ['conceptualize'], sysml: ['sysml-modeler', 'sysml'], cad: ['cad-modeler', 'cad'] }

export function workspaceDefaults(input: { legacy: boolean; modules: { module: string; enabled: boolean }[] }) {
  const disabled = new Set(input.modules.filter((m) => !m.enabled).flatMap((m) => TOOLS_OF_MODULE[m.module] ?? []))
  const tools = (input.legacy ? LEGACY_PROJECT_TOOLS : NEW_PROJECT_TOOLS).filter((t) => !disabled.has(t))
  return { defaultTools: [...tools], demoToolsLabelled: true }
}
