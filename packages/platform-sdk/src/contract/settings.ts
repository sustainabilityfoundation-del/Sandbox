/**
 * Settings contract (SDK 1.6, additive). A module declares typed setting definitions; the platform
 * renders its page in the Settings centre with design-system controls, stores values in the settings
 * service (user or project scope) and validates every write on the server with `checkSettingValue`.
 * Tools read values through `ToolApi.settings` or `useSetting(id)`; they never store settings themselves.
 *
 * Secrets are never setting values: a `secret-reference` holds only a reference (for example a
 * connection ID) owned by the service that keeps the secret.
 */

export type SettingScope = 'user' | 'project'

/** Project role a person needs to change a setting (project-scoped settings usually need 'administrator'). */
export type SettingPermission = 'editor' | 'reviewer' | 'administrator'

export type SettingValue = boolean | number | string | null

interface BaseSettingDefinition {
  /** Stable, namespaced `<module>.<area>.<item>` (for example `requirements.table.page-size`). Never change it. */
  id: string
  label: string
  description: string
  /** Help topic that explains the setting (`<module>.<area>.<item>`). */
  helpId?: string
  scope: SettingScope
  /** Role needed to change it (checked by the server); everyone who can read the module can read it. */
  requiresPermission?: SettingPermission
  /**
   * ID of a project-scoped setting of the same type that bounds this one: a person can choose this
   * setting only up to the ceiling (enum: options are ordered from narrowest to widest; number: not
   * above; boolean: true only when the ceiling is true). The effective value is clamped to the ceiling.
   */
  ceiling?: string
  /** Heading the setting is listed under on its page. */
  group?: string
}

export interface SettingOption {
  value: string
  label: string
  description?: string
}

export type SettingDefinition =
  | (BaseSettingDefinition & { type: 'boolean'; default: boolean })
  | (BaseSettingDefinition & { type: 'enum'; options: SettingOption[]; default: string })
  | (BaseSettingDefinition & { type: 'number'; unit?: string; min: number; max: number; step?: number; integer?: boolean; default: number })
  | (BaseSettingDefinition & { type: 'string'; maxLength: number; pattern?: string; default: string })
  /** A reference to a secret held by its owning service; set by that service, never by a form. */
  | (BaseSettingDefinition & { type: 'secret-reference'; owner: string; default: null })

export type SettingType = SettingDefinition['type']

/** A module's settings page: one page per module, listed under the module's name. */
export interface SettingsContribution {
  page: {
    /** Page ID used in deep links (`?settings=<page-id>`); usually the module ID. */
    id: string
    title: string
    description?: string
  }
  definitions: SettingDefinition[]
}

/** Read access to effective setting values (user value, clamped to its project ceiling, else default). */
export interface SettingsService {
  /** Effective value, or the definition's default; undefined for an unknown ID. */
  get: (id: string) => SettingValue | undefined
  /** Called when any value changes (in this or another window). Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/** `<module>.<area>.<item>`: lowercase words separated by dots, at least three segments. */
export const SETTING_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){2,}$/

/**
 * Namespaces reserved for a module that has not delivered its settings yet. `ai.reasoning.*` belongs to
 * the design reasoning layer (docs/specifications/design-reasoning.md); only its owner registers it.
 */
export const RESERVED_SETTING_NAMESPACES = ['ai.reasoning.'] as const

/** Checks a value against its definition. Returns an explanation, or null when the value is valid. */
export function checkSettingValue(def: SettingDefinition, value: unknown): string | null {
  switch (def.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `${def.label} must be on or off (true or false).`
    case 'enum':
      return typeof value === 'string' && def.options.some((o) => o.value === value) ? null : `${def.label} must be one of ${def.options.map((o) => o.value).join(', ')}.`
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${def.label} must be a number.`
      if (def.integer && !Number.isInteger(value)) return `${def.label} must be a whole number.`
      const unit = def.unit ? ` ${def.unit}` : ''
      if (value < def.min || value > def.max) return `${def.label} must be between ${def.min} and ${def.max}${unit}.`
      return null
    }
    case 'string':
      if (typeof value !== 'string') return `${def.label} must be text.`
      if (value.length > def.maxLength) return `${def.label} must be at most ${def.maxLength} characters.`
      if (def.pattern && !new RegExp(def.pattern).test(value)) return `${def.label} has an invalid format.`
      return null
    case 'secret-reference':
      return value === null || (typeof value === 'string' && /^[a-z][a-z0-9-]*:[A-Za-z0-9_.:-]{1,200}$/.test(value)) ? null : `${def.label} must be a reference such as "${def.owner}:<id>", never a secret.`
  }
}

/** Order of a value for ceiling comparisons (enum: option index; boolean: 0/1; number: itself). */
function rank(def: SettingDefinition, value: SettingValue): number {
  if (def.type === 'enum') return def.options.findIndex((o) => o.value === value)
  if (def.type === 'boolean') return value ? 1 : 0
  if (def.type === 'number') return typeof value === 'number' ? value : Number.NaN
  return 0
}

/** Whether `value` stays within `ceiling` (same definition type). Strings and references have no order. */
export function withinCeiling(def: SettingDefinition, value: SettingValue, ceiling: SettingValue): boolean {
  if (def.type === 'string' || def.type === 'secret-reference') return true
  return rank(def, value) <= rank(def, ceiling)
}

/** The narrower of a value and its ceiling. */
export function clampToCeiling(def: SettingDefinition, value: SettingValue, ceiling: SettingValue): SettingValue {
  return withinCeiling(def, value, ceiling) ? value : ceiling
}

/**
 * Validates definitions before they are registered: namespaced unique IDs, defaults within range,
 * ceilings that exist with the same type and project scope, reserved namespaces. Returns problems.
 */
export function validateSettingDefinitions(definitions: SettingDefinition[], options: { allowReserved?: boolean } = {}): string[] {
  const problems: string[] = []
  const byId = new Map<string, SettingDefinition>()
  for (const d of definitions) {
    if (!SETTING_ID_PATTERN.test(d.id)) problems.push(`${d.id}: the ID must be namespaced as <module>.<area>.<item> (lowercase).`)
    if (byId.has(d.id)) problems.push(`${d.id}: duplicate ID.`)
    byId.set(d.id, d)
    if (!options.allowReserved && RESERVED_SETTING_NAMESPACES.some((ns) => d.id.startsWith(ns))) problems.push(`${d.id}: the namespace is reserved for another module.`)
    if (!d.label.trim() || !d.description.trim()) problems.push(`${d.id}: a label and a description are required.`)
    if (d.type === 'enum' && (!d.options.length || new Set(d.options.map((o) => o.value)).size !== d.options.length)) problems.push(`${d.id}: enum options must be present and unique.`)
    if (d.type === 'number' && !(d.min <= d.max)) problems.push(`${d.id}: min must not exceed max.`)
    if (d.type === 'secret-reference' && d.scope !== 'user' && d.scope !== 'project') problems.push(`${d.id}: invalid scope.`)
    const defaultProblem = checkSettingValue(d, d.default)
    if (defaultProblem) problems.push(`${d.id}: the default is invalid (${defaultProblem})`)
  }
  for (const d of definitions) {
    if (!d.ceiling) continue
    const c = byId.get(d.ceiling)
    if (!c) problems.push(`${d.id}: ceiling ${d.ceiling} is not defined.`)
    else if (c.type !== d.type || c.scope !== 'project') problems.push(`${d.id}: ceiling ${d.ceiling} must be a project-scoped ${d.type} setting.`)
    else if (c.type === 'enum' && d.type === 'enum' && c.options.map((o) => o.value).join('|') !== d.options.map((o) => o.value).join('|')) problems.push(`${d.id}: ceiling ${d.ceiling} must have the same options in the same order.`)
  }
  return problems
}

/**
 * A settings service over fixed definitions and values, with set() for hosts that keep values in memory
 * (the standalone harness, tests). Values are checked with `checkSettingValue`; invalid ones are refused.
 */
export function createMemorySettingsService(definitions: SettingDefinition[], initial: Record<string, SettingValue> = {}): SettingsService & { set: (id: string, value: SettingValue) => void } {
  const byId = new Map(definitions.map((d) => [d.id, d]))
  const values = new Map<string, SettingValue>()
  const listeners = new Set<() => void>()
  const set = (id: string, value: SettingValue) => {
    const def = byId.get(id)
    if (!def) throw new Error(`Unknown setting ${id}.`)
    const problem = checkSettingValue(def, value)
    if (problem) throw new Error(problem)
    values.set(id, value)
    listeners.forEach((l) => l())
  }
  for (const [id, value] of Object.entries(initial)) set(id, value)
  return {
    get: (id) => {
      const def = byId.get(id)
      if (!def) return undefined
      const value = values.has(id) ? values.get(id)! : def.default
      const ceiling = def.ceiling ? byId.get(def.ceiling) : undefined
      return ceiling ? clampToCeiling(def, value, values.has(ceiling.id) ? values.get(ceiling.id)! : ceiling.default) : value
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set,
  }
}
