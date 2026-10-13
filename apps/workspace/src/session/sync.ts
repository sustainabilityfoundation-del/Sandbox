import { reloadConversation } from '../assistant/conversation'
import { useWorkspaceStore, type ContextState } from '../platform/store'
import { usePreferences } from '@ews/design-system/preferences'
import { useEntitlements } from '../platform/entitlements'
import { onSessionMessage, startPresence } from './windowSession'

/**
 * Connects this window to the others in the session. Notifications only trigger
 * rereads of authoritative data; nothing received here is written back or
 * rebroadcast, so messages cannot loop.
 */
export function startWindowSync(): () => void {
  startPresence()

  // Coalesce bursts of repository notifications into one reread.
  let pending = new Set<'model' | 'outputs' | 'activity'>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleRefresh = (parts: ('model' | 'outputs' | 'activity')[]) => {
    parts.forEach((p) => pending.add(p))
    clearTimeout(timer)
    timer = setTimeout(() => {
      const next = [...pending]
      pending = new Set()
      void useWorkspaceStore.getState().refreshFromRepository(next)
    }, 40)
  }

  return onSessionMessage((message) => {
    switch (message.type) {
      case 'repository-updated':
        scheduleRefresh(message.parts)
        break
      case 'context':
        useWorkspaceStore.getState().applyRemoteContext(message.context as ContextState)
        break
      case 'entitlements':
        useEntitlements.getState().reload()
        break
      case 'preferences':
        usePreferences.getState().reload()
        break
      case 'conversation':
        reloadConversation()
        break
    }
  })
}
