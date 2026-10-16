import type { PlatformModuleContribution } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import type { HelpModuleSource } from '../help/helpService'
import { canOpenTool } from './entitlements'
import { platformModuleIncluded } from './platformModules'

/**
 * The one place a module's help source is built. `collect()` (installedModules.ts) and the Help Centre
 * (help/workspaceHelp.ts, which lists what is registered) both call these, so the two cannot drift.
 * Sources are cached per tool or module object.
 */
const toolSources = new WeakMap<AnyToolDefinition, HelpModuleSource>()
/** A tool's help source: installed (in the registry, compatible SDK), enabled, and in the user's subscription. */
export function toolHelpSource(tool: AnyToolDefinition): HelpModuleSource {
  let s = toolSources.get(tool)
  if (!s) {
    s = { moduleId: tool.id, displayName: tool.name, moduleVersion: tool.version, manifest: tool.help, available: () => canOpenTool(tool.id) }
    toolSources.set(tool, s)
  }
  return s
}

const moduleSources = new WeakMap<PlatformModuleContribution, HelpModuleSource>()
/** A headless platform module's help source (SDK 1.8): listed like tools, filtered by its entitlement. */
export function platformModuleHelpSource(m: PlatformModuleContribution): HelpModuleSource {
  let s = moduleSources.get(m)
  if (!s) {
    s = { moduleId: m.id, displayName: m.name, moduleVersion: m.help?.moduleVersion ?? '0.0.0', manifest: m.help, available: () => platformModuleIncluded(m) }
    moduleSources.set(m, s)
  }
  return s
}
