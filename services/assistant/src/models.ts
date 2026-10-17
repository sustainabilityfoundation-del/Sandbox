import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProviderCapabilities, ProviderModel } from './providers/types'

/**
 * Model registry: versioned JSON under config/models/<provider>.json. Model IDs live there and nowhere in code.
 * At run time the registry is intersected with what the account's `listModels` returns (`intersectModels`).
 * Specification: docs/modules/ai-interface/metering-and-pricing.md, plan docs/specifications/ai-infrastructure-plan.md §2.
 */

export const MODEL_REGISTRY_SCHEMA_VERSION = 1
export const MODEL_CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'models')

export type ModelStatus = 'active' | 'preview' | 'deprecated'
export type LatencyClass = 'fast' | 'standard' | 'slow'

export interface RegistryModel {
  /** Exact model ID, or a pattern with `*` wildcards (patterns cannot be the default). */
  id: string
  label: string
  default?: boolean
  status: ModelStatus
  /** 1 (lowest) to 3 (highest); absent until sourced. */
  qualityTier?: 1 | 2 | 3
  latencyClass?: LatencyClass
  capabilities: Partial<ProviderCapabilities>
  limits?: { contextTokens?: number; maxOutputTokens?: number }
  sourceUrl?: string
}

export interface ModelRegistryFile {
  schemaVersion: 1
  provider: string
  registryVersion: string
  /** False until a person has reviewed the entries against the provider's documentation. */
  verified: boolean
  note?: string
  models: RegistryModel[]
}

const CAPABILITY_KEYS = ['streaming', 'tools', 'structuredOutput', 'imageInput', 'reasoningEffort', 'promptCaching', 'modelDiscovery'] as const

export class RegistryValidationError extends Error {
  constructor(readonly file: string, readonly problems: string[]) {
    super(`${file}: ${problems.join('; ')}`)
    this.name = 'RegistryValidationError'
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validates a parsed model registry file. Throws RegistryValidationError listing every problem. */
export function validateModelRegistry(raw: unknown, file = 'model registry'): ModelRegistryFile {
  const problems: string[] = []
  if (!isObject(raw)) throw new RegistryValidationError(file, ['not an object'])
  if (raw.schemaVersion !== MODEL_REGISTRY_SCHEMA_VERSION) problems.push(`schemaVersion must be ${MODEL_REGISTRY_SCHEMA_VERSION}`)
  if (typeof raw.provider !== 'string' || !/^[a-z0-9-]+$/.test(raw.provider)) problems.push('provider must be a lower-case ID')
  if (typeof raw.registryVersion !== 'string' || !raw.registryVersion) problems.push('registryVersion is required')
  if (typeof raw.verified !== 'boolean') problems.push('verified must be a boolean')
  if (!Array.isArray(raw.models) || raw.models.length === 0) problems.push('models must be a non-empty array')
  else {
    const ids = new Set<string>()
    let defaults = 0
    raw.models.forEach((m, i) => {
      const at = `models[${i}]`
      if (!isObject(m)) return void problems.push(`${at} is not an object`)
      if (typeof m.id !== 'string' || !m.id) problems.push(`${at}.id is required`)
      else {
        if (ids.has(m.id)) problems.push(`${at}.id "${m.id}" is duplicated`)
        ids.add(m.id)
      }
      if (typeof m.label !== 'string' || !m.label) problems.push(`${at}.label is required`)
      if (!['active', 'preview', 'deprecated'].includes(m.status as string)) problems.push(`${at}.status must be active, preview or deprecated`)
      if (m.qualityTier !== undefined && ![1, 2, 3].includes(m.qualityTier as number)) problems.push(`${at}.qualityTier must be 1, 2 or 3`)
      if (m.latencyClass !== undefined && !['fast', 'standard', 'slow'].includes(m.latencyClass as string)) problems.push(`${at}.latencyClass must be fast, standard or slow`)
      if (!isObject(m.capabilities)) problems.push(`${at}.capabilities is required (use {} when none are known)`)
      else
        for (const [k, v] of Object.entries(m.capabilities)) {
          if (!(CAPABILITY_KEYS as readonly string[]).includes(k)) problems.push(`${at}.capabilities.${k} is not a known capability`)
          else if (typeof v !== 'boolean') problems.push(`${at}.capabilities.${k} must be a boolean`)
        }
      if (m.limits !== undefined) {
        if (!isObject(m.limits)) problems.push(`${at}.limits must be an object`)
        else
          for (const k of ['contextTokens', 'maxOutputTokens'])
            if (m.limits[k] !== undefined && !(Number.isInteger(m.limits[k]) && (m.limits[k] as number) > 0)) problems.push(`${at}.limits.${k} must be a positive integer`)
      }
      if (m.sourceUrl !== undefined && !(typeof m.sourceUrl === 'string' && /^https?:\/\//.test(m.sourceUrl))) problems.push(`${at}.sourceUrl must be an http(s) URL`)
      if (m.default === true) {
        defaults++
        if (typeof m.id === 'string' && m.id.includes('*')) problems.push(`${at}: a pattern cannot be the default`)
      }
    })
    if (defaults !== 1) problems.push(`exactly one model must have default: true (found ${defaults})`)
  }
  if (problems.length) throw new RegistryValidationError(file, problems)
  return raw as unknown as ModelRegistryFile
}

const cache = new Map<string, ModelRegistryFile>()

/** Loads and validates config/models/<provider>.json (cached per directory and provider). */
export function loadModelRegistry(provider: string, directory = MODEL_CONFIG_DIR): ModelRegistryFile {
  const key = `${directory}|${provider}`
  const hit = cache.get(key)
  if (hit) return hit
  const path = join(directory, `${provider}.json`)
  if (!existsSync(path)) throw new RegistryValidationError(path, ['no model registry file for this provider'])
  const parsed = validateModelRegistry(JSON.parse(readFileSync(path, 'utf8')), path)
  if (parsed.provider !== provider) throw new RegistryValidationError(path, [`provider "${parsed.provider}" does not match the file name`])
  cache.set(key, parsed)
  return parsed
}

export function listRegistryProviders(directory = MODEL_CONFIG_DIR): string[] {
  return readdirSync(directory).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
}

/** The registry's default model ID for a provider. */
export function defaultModelId(provider: string, directory = MODEL_CONFIG_DIR): string {
  return loadModelRegistry(provider, directory).models.find((m) => m.default)!.id
}

/** `*` wildcard match; a pattern without `*` is an exact match. */
export function matchesModel(pattern: string, id: string): boolean {
  if (!pattern.includes('*')) return pattern === id
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return re.test(id)
}

/** The registry entry for a model ID: an exact entry wins over a pattern. */
export function findRegistryModel(registry: ModelRegistryFile, id: string): RegistryModel | undefined {
  return registry.models.find((m) => m.id === id) ?? registry.models.find((m) => m.id.includes('*') && matchesModel(m.id, id))
}

export interface AvailableModel extends ProviderModel {
  /** The registry entry (capabilities, limits, tier) that applies. */
  entry: RegistryModel
}

export interface ModelIntersection {
  /** Registry models the account can use (discovered, and known to the registry). */
  available: AvailableModel[]
  /** Discovered models the registry does not know: Manual selection only, "capabilities unknown". */
  unknown: ProviderModel[]
  /** Registry models the account's list did not offer (disabled, with the reason "not available on this account"). */
  unavailable: RegistryModel[]
}

/**
 * Intersects the registry with the models the account lists. When discovery is unavailable (`discovered` is
 * undefined) every active registry entry counts as available.
 */
export function intersectModels(registry: ModelRegistryFile, discovered: ProviderModel[] | undefined): ModelIntersection {
  if (!discovered) {
    return { available: registry.models.filter((m) => !m.id.includes('*')).map((m) => ({ id: m.id, label: m.label, entry: m })), unknown: [], unavailable: [] }
  }
  const available: AvailableModel[] = []
  const unknown: ProviderModel[] = []
  const seen = new Set<RegistryModel>()
  for (const d of discovered) {
    const entry = findRegistryModel(registry, d.id)
    if (entry) {
      seen.add(entry)
      available.push({ id: d.id, label: entry.id === d.id ? entry.label : d.label, entry })
    } else unknown.push(d)
  }
  return { available, unknown, unavailable: registry.models.filter((m) => !seen.has(m)) }
}
