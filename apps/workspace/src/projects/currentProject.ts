import { PROJECT_ID } from '@ews/model-service'

/**
 * The project this window works in (CR-PM-WS-1, integration milestone 1 C13).
 *
 * Chosen by `?project=<id>` or remembered from the last opened project; the example project PRJ-ACT100 otherwise,
 * so existing sessions and flows keep working. Switching projects reloads the window: every cache, session,
 * subscription and view state is then built for the new project only, never carried over (C13).
 */
const KEY = 'ews.current-project.v1'

function read(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  } catch {
    return null
  }
}

function remember(projectId: string) {
  try {
    localStorage.setItem(KEY, projectId)
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

const VALID = /^[A-Za-z0-9_.-]{1,100}$/

/**
 * How the window's project was chosen: by the URL, by this browser's memory, or by default (nothing chosen yet; the
 * bootstrap then opens the person's most recently opened project from the server, else the example project).
 */
export let projectChoice: 'url' | 'remembered' | 'default' = 'default'

/** Resolved once per window at start. */
export const currentProjectId: string = (() => {
  if (typeof location === 'undefined') return PROJECT_ID
  const fromUrl = new URLSearchParams(location.search).get('project')
  if (fromUrl && VALID.test(fromUrl)) {
    remember(fromUrl)
    projectChoice = 'url'
    return fromUrl
  }
  const stored = read()
  if (stored && VALID.test(stored)) {
    projectChoice = 'remembered'
    return stored
  }
  return PROJECT_ID
})()

export const isLegacyProject = (projectId: string) => projectId === PROJECT_ID

/** Opens another project in this window (reload: nothing of the current project is kept in memory). */
export function switchProject(projectId: string): void {
  if (!VALID.test(projectId)) return
  remember(projectId)
  const params = new URLSearchParams(location.search)
  params.set('project', projectId)
  for (const p of ['tool', 'settings', 'help']) params.delete(p)
  location.assign(`${location.pathname}?${params}`)
}

/** Forgets the remembered project (after it was deleted or access was removed); the example opens next time. */
export function forgetProject(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
