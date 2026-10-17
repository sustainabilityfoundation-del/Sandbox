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
import { cadModelerModule } from '@ews/tool-cad-modeler'
import { conceptualizeModule } from '@ews/tool-conceptualize'
import { requirementsModule } from '@ews/tool-requirements'
import { sysmlModelerModule } from '@ews/tool-sysml-modeler'
import type { HelpModuleSource } from '../help/helpService'
import { projectsModule } from '@ews/projects-client'
import { switchProject } from '../projects/currentProject'
import { platformModuleHelpSource, toolHelpSource } from './helpSources'
import { serviceSettings } from './services'

/**
 * Installed modules in registry, rail and help order. The CAD and System Model share the CAD and SysML
 * subscriptions during development (cad-program-contracts.md §1, sysml-program-contracts.md §1).
 *
 * The illustrative SysML (`sysml`) and mock CAD (`cad`) tools are retired from the interface (ADR-0077): they are not
 * installed, so no rail entry, tab, command, help, coverage row or AI operation exists for them. Their packages
 * (`@ews/tool-sysml`, `@ews/tool-cad`) stay in the repository; stored data and the stable IDs are untouched.
 */
export const INSTALLED_MODULES: ClientModule[] = [
  requirementsModule(),
  conceptualizeModule(),
  // CAD (cad-program-contracts.md §1): API → /api/cad/v1; demo → files only. Lives in @ews/tool-cad-modeler (M4).
  cadModelerModule(),
  // System Model (sysml-program-contracts.md §1, §7): API → /api/sysml/v1; demo → explicit in-browser repository. Lives in @ews/tool-sysml-modeler (M3).
  sysmlModelerModule(),
  // Project Management is a platform module, not a tool: its assistant operations work headless (milestone C9). It lives in
  // @ews/projects-client (M1); the window supplies how to switch project.
  projectsModule({ switchProject }),
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
      out.help.push(toolHelpSource(tool))
      if (m.manifest.defaultOpen) out.defaultOpen.push(tool.id)
    }
    if (m.platformModule) {
      const pm = m.platformModule()
      if (pm.id !== id) throw new Error(`Module "${id}" provides a platform module with ID "${pm.id}".`)
      out.platformModules.push(pm)
      if (pm.help) out.help.push(platformModuleHelpSource(pm))
    }
  }
  return out
}
