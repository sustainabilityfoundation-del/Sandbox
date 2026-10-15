import { clampToCeiling, type SettingDefinition, type SettingValue, type SettingsService } from '@ews/platform-sdk'
import { create } from 'zustand'

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
