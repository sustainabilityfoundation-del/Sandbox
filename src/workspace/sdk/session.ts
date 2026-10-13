import type { ContextState, Layout } from './store'

/** Workspace UI session (not engineering data), kept in browser storage. */
export interface SessionState {
  context: ContextState
  activeToolId: string | null
  openToolIds: string[]
  favorites: string[]
  recents: string[]
  viewStates: Record<string, unknown>
  scrollStates: Record<string, Record<string, number>>
  layout: Layout
}

const KEY = 'ews.session.v1'

export function loadSession(): SessionState | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SessionState) : null
  } catch {
    return null
  }
}

export function saveSession(session: SessionState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable: the session simply won't survive a reload.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
