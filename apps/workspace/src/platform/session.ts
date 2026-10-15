import { windowInfo, type DetachedViewDef } from '../session/windowSession'
import { currentProjectId, isLegacyProject } from '../projects/currentProject'
import type { ContextState, Layout, LayoutClass } from './store'
import type { ViewMeta } from './views'

/**
 * Workspace UI session (not engineering data), kept in browser storage. The
 * main window stores the shared context, open tools, layouts and remembered
 * detached windows; each detached window stores only its own view state.
 */
export interface SessionState {
  context: ContextState
  activeToolId: string | null
  openToolIds: string[]
  favorites: string[]
  recents: string[]
  viewStates: Record<string, unknown>
  scrollStates: Record<string, Record<string, number>>
  layouts?: Partial<Record<LayoutClass, Partial<Layout>>>
  /** Pre-responsive sessions stored a single layout. */
  layout?: Partial<Layout>
  views?: Record<string, ViewMeta>
  detachedViews?: DetachedViewDef[]
}

// Sessions are kept per project (integration milestone 1, C13); the example project keeps its original key.
const MAIN_KEY = isLegacyProject(currentProjectId) ? 'ews.session.v1' : `ews.session.${currentProjectId}.v1`

export const sessionKey = windowInfo.role === 'main' ? MAIN_KEY : `ews.window.${windowInfo.windowId}.v1`

function read(key: string): SessionState | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as SessionState) : null
  } catch {
    return null
  }
}

export function loadSession(): SessionState | null {
  return read(sessionKey)
}

/** The main window's session; detached windows take the shared context from it at start. */
export function loadMainSession(): SessionState | null {
  return read(MAIN_KEY)
}

export function saveSession(session: SessionState): void {
  try {
    window.localStorage.setItem(sessionKey, JSON.stringify(session))
  } catch {
    // Storage unavailable: the session simply won't survive a reload.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(sessionKey)
  } catch {
    // ignore
  }
}
