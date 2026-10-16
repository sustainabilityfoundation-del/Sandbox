/**
 * The workspace's installed modules (docs/specifications/module-registration.md, increment I2).
 *
 * One list of `ClientModule`s: each has a manifest (capability entries, default-open flag) and a tool factory or a
 * platform-module factory. `collect(modules)` builds everything the shared code needs from that list: the tool
 * registry inputs, the capability inventory and the help sources. Adding a module = add its package and one entry
 * here; tools.ts, capabilities.ts and the inventory, help and registry tests derive from the list.
 *
 * For now the ClientModule objects of the existing tools are built here as thin adapters around their factories; each
 * moves into its own package in the later M-steps. Each factory maps the host env to its own options.
 */
import type { ClientModule, ModuleHostEnv } from '@ews/platform-sdk/react'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import type { CapabilityEntry, PlatformModuleContribution } from '@ews/platform-sdk'
import { cadTool } from '@ews/tool-cad'
import { createCadModelerTool } from '@ews/tool-cad-modeler'
import { conceptualizeTool } from '@ews/tool-conceptualize'
import { requirementsTool } from '@ews/tool-requirements'
import { sysmlTool } from '@ews/tool-sysml'
import { createSysmlModelerTool } from '@ews/tool-sysml-modeler'
import type { HelpModuleSource } from '../help/helpService'
import { projectsAssistant } from '../projects/assistant'
import { projectsHelp } from '../projects/help'
import { canOpenTool } from './entitlements'
import {
  CAD_CAPABILITIES,
  CAD_MODELER_CAPABILITIES,
  CONCEPTUALIZE_CAPABILITIES,
  PROJECTS_CAPABILITIES,
  REQUIREMENTS_CAPABILITIES,
  SYSML_CAPABILITIES,
  SYSML_MODELER_CAPABILITIES,
} from './installedCapabilities'
import { platformModuleIncluded } from './platformModules'
import { serviceSettings } from './services'

const manifest = (id: string, name: string, capabilities: CapabilityEntry[], extra: { entitlement?: string; defaultOpen?: boolean } = {}) => ({
  schemaVersion: 1 as const,
  id,
  name,
  capabilities,
  ...extra,
})

/**
 * Installed modules in registry, rail and help order. The CAD Modeler and SysML Modeler share the CAD and SysML
 * subscriptions during development (cad-program-contracts.md §1, sysml-program-contracts.md §1).
 */
export const INSTALLED_MODULES: ClientModule[] = [
  { manifest: manifest('requirements', 'Requirements', REQUIREMENTS_CAPABILITIES, { entitlement: 'tool:requirements', defaultOpen: true }), tool: () => requirementsTool },
  { manifest: manifest('sysml', 'SysML', SYSML_CAPABILITIES, { entitlement: 'tool:sysml', defaultOpen: true }), tool: () => sysmlTool },
  { manifest: manifest('cad', 'CAD', CAD_CAPABILITIES, { entitlement: 'tool:cad', defaultOpen: true }), tool: () => cadTool },
  { manifest: manifest('conceptualize', 'Conceptualize', CONCEPTUALIZE_CAPABILITIES, { entitlement: 'tool:conceptualize', defaultOpen: true }), tool: () => conceptualizeTool },
  {
    // CAD Modeler (CAD program), separate from the mock CAD tool (cad-program-contracts.md §1). Until the SDK offers
    // PlatformServices.cad the tool builds its client: API mode follows the Requirements service mode
    // (API → /api/cad/v1 as the development user; demo → files only).
    manifest: manifest('cad-modeler', 'CAD Modeler', CAD_MODELER_CAPABILITIES, { entitlement: 'tool:cad' }),
    tool: (env) => createCadModelerTool(env.requirementsMode === 'demo' ? { mode: 'files' } : { mode: 'api', baseUrl: '/api/cad/v1', devUser: env.devUser }),
  },
  {
    // SysML Modeler (sysml-program-contracts.md §1, §7): API → /api/sysml/v1; demo → explicit in-browser repository.
    manifest: manifest('sysml-modeler', 'SysML Modeler', SYSML_MODELER_CAPABILITIES, { entitlement: 'tool:sysml' }),
    tool: (env) => createSysmlModelerTool(env.requirementsMode === 'demo' ? { mode: 'local' } : { mode: 'api', baseUrl: '/api/sysml/v1', devUser: env.devUser }),
  },
  {
    // Project Management is a platform module, not a tool: its assistant operations work headless (milestone C9).
    manifest: manifest('projects', 'Project Management', PROJECTS_CAPABILITIES),
    platformModule: () => ({ id: 'projects', name: 'Project Management', assistant: projectsAssistant(), help: projectsHelp }),
  },
]

/** What the workspace passes to module factories. */
export function hostEnv(): ModuleHostEnv {
  return { requirementsMode: serviceSettings.requirementsMode, devUser: serviceSettings.devUser }
}

let cached: Collected | undefined
/** The workspace's own collection of `INSTALLED_MODULES`, built once so tools.ts and capabilities.ts share one set of tool objects. */
export function installed(): Collected {
  return (cached ??= collect())
}

export interface Collected {
  /** Tool definitions in list order, for `registerTool`. */
  tools: AnyToolDefinition[]
  /** Headless platform modules in list order, for `registerPlatformModule`. */
  platformModules: PlatformModuleContribution[]
  /** Capability entries of every manifest, in list order. */
  capabilities: CapabilityEntry[]
  /** Help sources of the installed modules in list order (the platform's own and AI help are added by the Help Centre). */
  help: HelpModuleSource[]
  /** IDs of tools opened as tabs in a fresh session. */
  defaultOpen: string[]
}

/**
 * Builds the registry inputs, capability inventory and help sources from a list of modules (pure apart from calling
 * the modules' factories, so tests can pass their own list). Throws on a malformed list: duplicate module or
 * capability IDs, a capability entry for another module, or a tool whose ID differs from its manifest.
 */
export function collect(modules: readonly ClientModule[] = INSTALLED_MODULES, env: ModuleHostEnv = hostEnv()): Collected {
  const out: Collected = { tools: [], platformModules: [], capabilities: [], help: [], defaultOpen: [] }
  const moduleIds = new Set<string>()
  const capabilityIds = new Set<string>()
  for (const m of modules) {
    const { id } = m.manifest
    if (moduleIds.has(id)) throw new Error(`Module "${id}" is installed twice.`)
    moduleIds.add(id)
    for (const c of m.manifest.capabilities ?? []) {
      if (c.module !== id) throw new Error(`Capability "${c.id}" belongs to module "${c.module}" but is declared by the manifest of "${id}".`)
      if (capabilityIds.has(c.id)) throw new Error(`Capability "${c.id}" is defined twice.`)
      capabilityIds.add(c.id)
      out.capabilities.push(c)
    }
    if (m.tool) {
      const tool = m.tool(env)
      if (tool.id !== id) throw new Error(`Module "${id}" provides a tool with ID "${tool.id}".`)
      out.tools.push(tool)
      out.help.push({ moduleId: tool.id, displayName: tool.name, moduleVersion: tool.version, manifest: tool.help, available: () => canOpenTool(tool.id) })
      if (m.manifest.defaultOpen) out.defaultOpen.push(tool.id)
    }
    if (m.platformModule) {
      const pm = m.platformModule()
      if (pm.id !== id) throw new Error(`Module "${id}" provides a platform module with ID "${pm.id}".`)
      out.platformModules.push(pm)
      if (pm.help) out.help.push({ moduleId: pm.id, displayName: pm.name, moduleVersion: pm.help.moduleVersion, manifest: pm.help, available: () => platformModuleIncluded(pm) })
    }
  }
  return out
}
