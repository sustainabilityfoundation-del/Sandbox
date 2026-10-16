import type { HelpContext, HelpId } from '@ews/platform-sdk'
import { create } from 'zustand'
import { platformModuleHelpSource, toolHelpSource } from '../platform/helpSources'
import { getTools } from '../platform/registry'
import { getPlatformModules } from '../platform/platformModules'
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

/** Modules whose help can be listed: the platform's own, every registered tool, then headless platform modules. */
export function helpSources(): HelpModuleSource[] {
  return [...platformSources.slice(0, 1), ...getTools().map(toolHelpSource), ...getPlatformModules().filter((m) => m.help).map(platformModuleHelpSource), ...platformSources.slice(1)]
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
