import type { HelpContext, HelpId } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import { create } from 'zustand'
import { canOpenTool } from '../platform/entitlements'
import { getTools } from '../platform/registry'
import { getPlatformModules, platformModuleIncluded } from '../platform/platformModules'
import type { PlatformModuleContribution } from '@ews/platform-sdk'
import { createHelpService, type HelpModuleSource } from './helpService'
import { aiHelp, platformHelp } from './manifests'

/** Help Centre UI state: open/closed and the topic or query shown. */
export const useHelpCentre = create<{
  isOpen: boolean
  topicId: HelpId | null
  query: string
  /** Set when the request could not be resolved (shown as a graceful fallback). */
  notice: string | null
  show: (topicId: HelpId | null, notice?: string | null) => void
  setQuery: (query: string) => void
  close: () => void
}>()((set) => ({
  isOpen: false,
  topicId: null,
  query: '',
  notice: null,
  show: (topicId, notice = null) => set({ isOpen: true, topicId, notice }),
  setQuery: (query) => set({ query, topicId: null, notice: null }),
  close: () => set({ isOpen: false }),
}))

const platformSources: HelpModuleSource[] = [
  { moduleId: 'platform', displayName: 'Workspace', moduleVersion: platformHelp.moduleVersion, manifest: platformHelp, available: () => true },
  { moduleId: 'ai', displayName: 'AI Interface', moduleVersion: aiHelp.moduleVersion, manifest: aiHelp, available: () => true },
]

const toolSources = new Map<AnyToolDefinition, HelpModuleSource>()
function sourceFor(tool: AnyToolDefinition): HelpModuleSource {
  let s = toolSources.get(tool)
  if (!s) {
    // Installed (in the registry, compatible SDK), enabled, and in the user's subscription.
    s = { moduleId: tool.id, displayName: tool.name, moduleVersion: tool.version, manifest: tool.help, available: () => canOpenTool(tool.id) }
    toolSources.set(tool, s)
  }
  return s
}

const moduleSources = new Map<PlatformModuleContribution, HelpModuleSource>()
function moduleSourceFor(m: PlatformModuleContribution): HelpModuleSource {
  let s = moduleSources.get(m)
  if (!s) {
    // Headless platform modules (SDK 1.8): listed like tools, filtered by their entitlement.
    s = { moduleId: m.id, displayName: m.name, moduleVersion: m.help?.moduleVersion ?? '0.0.0', manifest: m.help, available: () => platformModuleIncluded(m) }
    moduleSources.set(m, s)
  }
  return s
}

/** Modules whose help can be listed: the platform's own, every registered tool, then headless platform modules. */
export function helpSources(): HelpModuleSource[] {
  return [...platformSources.slice(0, 1), ...getTools().map(sourceFor), ...getPlatformModules().filter((m) => m.help).map(moduleSourceFor), ...platformSources.slice(1)]
}

/** Opens the Help Centre at a topic, or at the best topic for a context, with a fallback notice. */
function open(target?: HelpId | HelpContext) {
  const { show } = useHelpCentre.getState()
  if (!target) return show(null)
  if (typeof target === 'string') {
    const found = workspaceHelp.topic(target)
    return found ? show(target) : show(null, `Help topic “${target}” is not available. It may belong to a tool outside your subscription, or its documentation is not written yet.`)
  }
  const best = workspaceHelp.contextual(target)[0]
  return best ? show(best.topic.id) : show(null, 'No help is available for this yet.')
}

export const workspaceHelp = createHelpService(helpSources, open)
