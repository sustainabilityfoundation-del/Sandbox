/**
 * Window session: lets several browser windows of the same workspace act as
 * one session (main window + detached tool, inspector and ChatGPT windows).
 *
 * BroadcastChannel only carries *notifications* ("the repository changed",
 * "the selection changed"). Receivers always reread authoritative data from
 * the repository, which keeps its own revision checks. This is a local
 * prototype mechanism; a cloud deployment would use server push instead.
 */

export type DetachedKind = 'tool' | 'inspector' | 'assistant'

export interface WindowInfo {
  /** Stable ID of the window definition ('main' for the main workspace window). */
  windowId: string
  role: 'main' | 'detached'
  kind?: DetachedKind
  toolId?: string
}

/** A remembered detached view, reopened with "Restore workspace windows". */
export interface DetachedViewDef {
  windowId: string
  kind: DetachedKind
  toolId?: string
  title: string
}

export type SessionMessage =
  | { type: 'repository-updated'; parts: ('model' | 'outputs' | 'activity')[] }
  | { type: 'context'; context: unknown }
  | { type: 'preferences' }
  | { type: 'conversation' }

interface Envelope {
  origin: string
  seq: number
  message: SessionMessage
}

function parseWindowInfo(): WindowInfo {
  if (typeof location === 'undefined') return { windowId: 'main', role: 'main' }
  const params = new URLSearchParams(location.search)
  const windowId = params.get('window')
  const kind = params.get('kind') as DetachedKind | null
  if (!windowId || !kind || !['tool', 'inspector', 'assistant'].includes(kind)) return { windowId: 'main', role: 'main' }
  return { windowId, role: 'detached', kind, toolId: params.get('tool') ?? undefined }
}

export const windowInfo: WindowInfo = parseWindowInfo()

/** Unique per page load; used to ignore our own broadcasts. */
export const instanceId = `${windowInfo.windowId}-${Math.random().toString(36).slice(2, 8)}`

/** Short tag for IDs created in this window (e.g. conversation messages). */
export const windowTag = windowInfo.role === 'main' ? '' : windowInfo.windowId.slice(-3)

// ---- messaging ------------------------------------------------------------------------

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ews-session-v1') : null
const handlers = new Set<(message: SessionMessage) => void>()
const seen = new Set<string>()
let seq = 0

channel?.addEventListener('message', (event: MessageEvent<Envelope>) => {
  const envelope = event.data
  if (!envelope || envelope.origin === instanceId) return // never react to our own messages
  const key = `${envelope.origin}:${envelope.seq}`
  if (seen.has(key)) return // duplicate delivery
  seen.add(key)
  if (seen.size > 500) seen.clear()
  handlers.forEach((h) => h(envelope.message))
})

export function broadcast(message: SessionMessage): void {
  channel?.postMessage({ origin: instanceId, seq: ++seq, message } satisfies Envelope)
}

export function onSessionMessage(handler: (message: SessionMessage) => void): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

// ---- presence (which windows are open) -------------------------------------------------

const PRESENCE_KEY = 'ews.windows.v1'
const HEARTBEAT_MS = 3000
const STALE_MS = 9000

interface PresenceEntry {
  windowId: string
  kind?: DetachedKind
  lastSeen: number
}

function readPresence(): Record<string, PresenceEntry> {
  try {
    return JSON.parse(localStorage.getItem(PRESENCE_KEY) ?? '{}') as Record<string, PresenceEntry>
  } catch {
    return {}
  }
}

function writePresence(entries: Record<string, PresenceEntry>) {
  try {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(entries))
  } catch {
    // ignore
  }
}

function heartbeat() {
  const entries = readPresence()
  const now = Date.now()
  for (const [id, entry] of Object.entries(entries)) if (now - entry.lastSeen > STALE_MS * 4) delete entries[id]
  entries[instanceId] = { windowId: windowInfo.windowId, kind: windowInfo.kind, lastSeen: now }
  writePresence(entries)
}

export function startPresence(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  heartbeat()
  const timer = setInterval(heartbeat, HEARTBEAT_MS)
  window.addEventListener('pagehide', () => {
    clearInterval(timer)
    const entries = readPresence()
    delete entries[instanceId]
    writePresence(entries)
  })
}

/** Whether a window for this definition currently appears to be open. */
export function isWindowOpen(windowId: string): boolean {
  const now = Date.now()
  return Object.values(readPresence()).some((e) => e.windowId === windowId && now - e.lastSeen < STALE_MS)
}

/** Whether a specific page instance (e.g. the owner of a running chat turn) is still alive. */
export function isInstanceAlive(id: string): boolean {
  if (id === instanceId) return true
  const entry = readPresence()[id]
  return !!entry && Date.now() - entry.lastSeen < STALE_MS
}

// ---- detached windows ---------------------------------------------------------------

export function newWindowId(): string {
  return `w${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`
}

export function detachedUrl(def: DetachedViewDef): string {
  const params = new URLSearchParams({ window: def.windowId, kind: def.kind })
  if (def.toolId) params.set('tool', def.toolId)
  return `${location.pathname}?${params.toString()}`
}

export interface Placement {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Opens (or focuses) a detached window. Must be called from a user action.
 * Returns false if the browser blocked the popup.
 */
export function openDetachedWindow(def: DetachedViewDef, placement?: Placement): boolean {
  const size = placement ?? { width: 960, height: 720, left: window.screenX + 60, top: window.screenY + 60 }
  const features = `popup=yes,width=${Math.round(size.width)},height=${Math.round(size.height)},left=${Math.round(size.left)},top=${Math.round(size.top)}`
  const opened = window.open(detachedUrl(def), `ews-${def.windowId}`, features)
  if (!opened) return false
  try {
    opened.focus()
  } catch {
    // ignore
  }
  return true
}

/** Optional enhancement: the Window Management API (Chromium), behind a permission prompt. */
export function screenPlacementSupported(): boolean {
  return typeof window !== 'undefined' && 'getScreenDetails' in window
}

interface ScreenDetailed {
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
  label?: string
}

/**
 * Asks the browser (with the user's permission) for the connected screens and
 * returns a placement on a screen other than the current one, if there is one.
 */
export async function placementOnOtherScreen(): Promise<{ placement?: Placement; message: string }> {
  if (!screenPlacementSupported()) {
    return { message: 'This browser cannot place windows on other screens. Drag the window to another monitor instead.' }
  }
  try {
    const details = (await (window as unknown as { getScreenDetails: () => Promise<{ screens: ScreenDetailed[]; currentScreen: ScreenDetailed }> }).getScreenDetails())
    const other = details.screens.find((s) => s !== details.currentScreen)
    if (!other) return { message: 'Only one screen was reported. The window opens on this screen; you can move it manually.' }
    return {
      placement: { left: other.availLeft + 40, top: other.availTop + 40, width: other.availWidth * 0.6, height: other.availHeight * 0.7 },
      message: `Placing the window on ${other.label || 'another screen'}.`,
    }
  } catch {
    return { message: 'Screen placement permission was not granted. The window opens normally; you can move it manually.' }
  }
}
