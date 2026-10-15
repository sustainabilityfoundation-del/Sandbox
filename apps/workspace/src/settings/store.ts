import { clampToCeiling, type SettingDefinition, type SettingValue, type SettingsService } from '@ews/platform-sdk'
import { create } from 'zustand'
import { getTools } from '../platform/registry'
import { ApiError, SETTINGS_API, api, backendInUse } from './api'

/**
 * Setting values as this window sees them (SDK 1.6). Values come from the settings service
 * (`/api/settings/v1`), which validates every write; definitions come from the server registry and from
 * tool contributions. Nothing here is authoritative: the server checks permissions, ranges, ceilings and
 * stale writes (ETag / If-Match).
 */

export interface ScopedValues {
  values: Record<string, SettingValue>
  etag: string | null
}

export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface SettingsState {
  /** Definitions by ID (server-registered and tool-contributed). */
  definitions: Record<string, SettingDefinition>
  user: ScopedValues
  project: ScopedValues
  projectId: string
  status: SettingsStatus
  error?: string
  /** Whether the current person may change project-scoped values (server-reported). */
  canEditProject: boolean
}

export const useSettingsState = create<SettingsState>()(() => ({
  definitions: {},
  user: { values: {}, etag: null },
  project: { values: {}, etag: null },
  projectId: 'PRJ-ACT100',
  status: 'idle',
  canEditProject: false,
}))

/** Adds definitions (tool contributions or the server registry); existing IDs are replaced. */
export function registerDefinitions(definitions: SettingDefinition[]): void {
  if (!definitions.length) return
  useSettingsState.setState((s) => ({ definitions: { ...s.definitions, ...Object.fromEntries(definitions.map((d) => [d.id, d])) } }))
}

/** Stored value of one scope, else the default; no ceiling applied. */
export function storedValue(state: SettingsState, def: SettingDefinition): SettingValue {
  const scoped = def.scope === 'project' ? state.project.values : state.user.values
  return def.id in scoped ? scoped[def.id] : def.default
}

/** Effective value: stored value clamped to its project ceiling, else the default. */
export function effectiveValue(state: SettingsState, id: string): SettingValue | undefined {
  const def = state.definitions[id]
  if (!def) return undefined
  const value = storedValue(state, def)
  const ceiling = def.ceiling ? state.definitions[def.ceiling] : undefined
  return ceiling ? clampToCeiling(def, value, storedValue(state, ceiling)) : value
}

/** The SDK's read-only settings service for tools (ToolApi.settings, useSetting). */
export const workspaceSettings: SettingsService = {
  get: (id) => effectiveValue(useSettingsState.getState(), id),
  subscribe: (listener) => useSettingsState.subscribe(listener),
}

// ---- loading and saving -------------------------------------------------------------------------

interface ValuesResponse {
  user: ScopedValues
  project: ScopedValues
  canEditProject: boolean
  role: string
}

/** Server pages (definitions registered on the API host), by page ID. */
export const useServerPages = create<{ pages: { id: string; title: string }[]; pageOf: Record<string, string> }>()(() => ({ pages: [], pageOf: {} }))

/** Registers the settings contributions of the registered tools (SDK 1.6 `ToolDefinition.settings`). */
export function registerToolContributions(): void {
  for (const tool of getTools()) if (tool.settings) registerDefinitions(tool.settings.definitions)
}

/** Loads definitions and values from the settings service. Demo mode leaves server pages unavailable. */
export async function loadSettings(): Promise<void> {
  registerToolContributions()
  if (!backendInUse()) {
    useSettingsState.setState({ status: 'unavailable', error: 'The workspace is in demo mode (service settings), so settings stored on the backend are not available.' })
    return
  }
  useSettingsState.setState((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }))
  const projectId = useSettingsState.getState().projectId
  try {
    const [defs, vals] = await Promise.all([
      api<{ pages: { id: string; title: string }[]; definitions: (SettingDefinition & { pageId: string })[] }>('GET', `${SETTINGS_API}/definitions`),
      api<ValuesResponse>('GET', `${SETTINGS_API}/values?projectId=${encodeURIComponent(projectId)}`),
    ])
    registerDefinitions(defs.body.definitions.map(({ pageId: _pageId, ...d }) => d as SettingDefinition))
    useServerPages.setState({ pages: defs.body.pages, pageOf: Object.fromEntries(defs.body.definitions.map((d) => [d.id, d.pageId])) })
    useSettingsState.setState({ user: vals.body.user, project: vals.body.project, canEditProject: vals.body.canEditProject, status: 'ready', error: undefined })
  } catch (e) {
    useSettingsState.setState({ status: 'unavailable', error: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * Saves changed values of one scope (null resets to the default) with If-Match. The server validates
 * everything; on a stale write the values are reloaded and the error explains it.
 */
export async function saveSettings(scope: 'user' | 'project', values: Record<string, SettingValue>): Promise<void> {
  const s = useSettingsState.getState()
  const path = scope === 'user' ? `${SETTINGS_API}/users/me/values?projectId=${encodeURIComponent(s.projectId)}` : `${SETTINGS_API}/projects/${encodeURIComponent(s.projectId)}/values`
  const etag = scope === 'user' ? s.user.etag : s.project.etag
  try {
    const r = await api<ScopedValues>('PUT', path, { values }, etag ? { 'If-Match': etag } : {})
    useSettingsState.setState(scope === 'user' ? { user: r.body } : { project: r.body })
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ews-settings-saved'))
    try {
      localStorage.setItem('ews.settings.saved', String(Date.now()))
    } catch {
      /* other windows reload on focus instead */
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 412) await loadSettings()
    throw e
  }
}

if (typeof window !== 'undefined') {
  // Other windows saved: reload (values are small).
  window.addEventListener('storage', (e) => {
    if (e.key === 'ews.settings.saved') void loadSettings()
  })
}
