import { useWorkspaceStore } from '../sdk/store'
import { useToasts } from '../shell/primitives'
import { getTool } from '../tools/registry'
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

/** Opens a tool, the inspector or ChatGPT in a new window (a new view instance). */
export function openInSeparateWindow(kind: DetachedKind, toolId?: string): boolean {
  return open({ windowId: newWindowId(), kind, toolId, title: titleFor(kind, toolId) })
}

/**
 * Optional enhancement: asks for screen-placement permission and opens the
 * window on another monitor. Falls back to a normal window.
 */
export async function openOnAnotherScreen(kind: DetachedKind, toolId?: string): Promise<void> {
  const def = { windowId: newWindowId(), kind, toolId, title: titleFor(kind, toolId) }
  const { placement, message } = await placementOnOtherScreen()
  useToasts.getState().push({ tone: placement ? 'info' : 'warning', title: 'Screen placement', body: message })
  open(def, placement)
}

/** Reopens remembered windows that are not open. Browsers may allow only one popup per click. */
export function restoreWorkspaceWindows(): { opened: number; blocked: number; alreadyOpen: number } {
  const defs = useWorkspaceStore.getState().detachedViews
  const toOpen = defs.filter((d) => !isWindowOpen(d.windowId))
  const blocked: DetachedViewDef[] = []
  let opened = 0
  for (const def of toOpen) {
    if (openDetachedWindow(def)) opened++
    else blocked.push(def)
  }
  if (blocked.length) reportBlocked(blocked)
  return { opened, blocked: blocked.length, alreadyOpen: defs.length - toOpen.length }
}
