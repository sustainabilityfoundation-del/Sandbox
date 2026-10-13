import { useWorkspaceStore } from '../platform/store'
import { useToasts } from '@ews/design-system'
import { getTool } from '../platform/registry'
import { toolAccess } from '../platform/entitlements'
import {
  detachedUrl,
  isWindowOpen,
  newWindowId,
  openDetachedWindow,
  placementOnOtherScreen,
  type DetachedKind,
  type DetachedViewDef,
  type Placement,
} from './windowSession'

/**
 * "Open in separate window" and "Restore workspace windows". Every call must
 * come from a user action; popups are never opened automatically on load.
 */

function titleFor(kind: DetachedKind, toolId?: string): string {
  if (kind === 'tool') return getTool(toolId)?.name ?? toolId ?? 'Tool'
  return kind === 'inspector' ? 'Inspector' : 'ChatGPT'
}

function reportBlocked(defs: DetachedViewDef[]) {
  const push = useToasts.getState().push
  for (const def of defs) {
    push({
      tone: 'warning',
      title: `The browser blocked the “${def.title}” window`,
      body: 'Allow pop-ups for this site, or open it with the link. Your work is not affected.',
      link: { label: `Open ${def.title} window`, href: detachedUrl(def), target: `ews-${def.windowId}` },
    })
  }
}

function open(def: DetachedViewDef, placement?: Placement): boolean {
  useWorkspaceStore.getState().rememberDetached(def)
  const ok = openDetachedWindow(def, placement)
  if (!ok) reportBlocked([def])
  return ok
}

/** Tool windows follow the same subscription rule as every other entry point. */
function allowed(kind: DetachedKind, toolId?: string): boolean {
  if (kind !== 'tool') return true
  const access = toolAccess(toolId)
  if (!access.ok) useToasts.getState().push({ tone: 'warning', title: 'Tool not available', body: access.reason })
  return access.ok
}

/** Opens a tool, the inspector or ChatGPT in a new window (a new view instance). */
export function openInSeparateWindow(kind: DetachedKind, toolId?: string): boolean {
  if (!allowed(kind, toolId)) return false
  return open({ windowId: newWindowId(), kind, toolId, title: titleFor(kind, toolId) })
}

/**
 * Optional enhancement: asks for screen-placement permission and opens the
 * window on another monitor. Falls back to a normal window.
 */
export async function openOnAnotherScreen(kind: DetachedKind, toolId?: string): Promise<void> {
  if (!allowed(kind, toolId)) return
  const def = { windowId: newWindowId(), kind, toolId, title: titleFor(kind, toolId) }
  const { placement, message } = await placementOnOtherScreen()
  useToasts.getState().push({ tone: placement ? 'info' : 'warning', title: 'Screen placement', body: message })
  open(def, placement)
}

/** Reopens remembered windows that are not open. Browsers may allow only one popup per click. */
export function restoreWorkspaceWindows(): { opened: number; blocked: number; alreadyOpen: number } {
  const defs = useWorkspaceStore.getState().detachedViews
  // Remembered windows of tools the subscription no longer includes stay remembered but are not opened.
  const toOpen = defs.filter((d) => !isWindowOpen(d.windowId) && (d.kind !== 'tool' || toolAccess(d.toolId).ok))
  const blocked: DetachedViewDef[] = []
  let opened = 0
  for (const def of toOpen) {
    if (openDetachedWindow(def)) opened++
    else blocked.push(def)
  }
  if (blocked.length) reportBlocked(blocked)
  return { opened, blocked: blocked.length, alreadyOpen: defs.length - toOpen.length }
}
