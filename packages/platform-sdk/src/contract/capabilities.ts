/**
 * Capability registry contract (SDK 1.13, docs/specifications/capability-registry.md, ADR-0074).
 *
 * The registry extends `CapabilityEntry` and `ModuleManifest` (contract/modules.ts) with an optional
 * hierarchy (module, tab, group, command), metadata and evidence references. Two pure functions derive
 * what the user sees from it:
 *
 * - `implementationState(entry)`: planned, partial or implemented. Computed from bindings and evidence,
 *   never stored.
 * - `availability(entry, ctx)`: whether the command can run now, with a reason when it cannot. Separate
 *   from the implementation state; a planned entry is never available.
 *
 * Framework-free: no React, Fastify or service imports.
 */
import type { EngineeringObject, ObjectType } from '@ews/model-service'
import type { CapabilityEntry } from './modules'
import type { PlatformServices } from './requirements'
import type { SharedContext } from './tool'
import type { IconName } from '@ews/design-system/icon-names'

/** How much of a capability exists: planned (no binding), partial (bound, limited or unverified), implemented. */
export type ImplementationState = 'implemented' | 'partial' | 'planned'

/** A test that proves a capability: repository path of a test file, `::`, and a substring of an `it()` or `test()` title. */
export type TestRef = `${string}.test.${'ts' | 'tsx'}::${string}`

/** Where commands sit: module, then tab, then group, then command (`Placement`). */
export interface CommandLayout {
  tabs: {
    id: string
    label: string
    /** The tab shows only while this holds (for example a tab for the selected object type). */
    contextual?: Prerequisite
    groups: { id: string; label: string; icon?: IconName }[]
  }[]
}

/** A capability's position in a module's `CommandLayout`. */
export interface Placement {
  tab: string
  group: string
  /** Order within the group; unique per group. */
  order: number
  /** 'secondary' commands move into a menu on narrow screens. */
  priority?: 'primary' | 'secondary'
}

/** A condition for a capability to be usable now (evaluated by `availability`). */
export type Prerequisite =
  | { kind: 'project' }
  | { kind: 'entitlement'; id?: string }
  | { kind: 'service'; service: keyof PlatformServices }
  | { kind: 'connection'; to: 'ai-account' | 'api' }
  | { kind: 'selection'; types?: ObjectType[]; min?: number; max?: number }
  /** Supplied by the module at runtime through `AvailabilityContext.moduleState`; `text` is the reason when unmet. */
  | { kind: 'module-state'; id: string; text: string }

export interface Availability {
  available: boolean
  /** Why the capability cannot be used now; present when `available` is false. */
  reason?: string
}

/** What the host knows when it evaluates prerequisites. Client-side evaluation is UX only: entitlements stay enforced on the server. */
export interface AvailabilityContext {
  context: SharedContext
  selection: EngineeringObject[]
  services: PlatformServices
  entitlements: string[]
  connections: { aiAccount: boolean; api: boolean }
  /** Module-reported states by `module-state` prerequisite id. An id the module has not reported counts as met. */
  moduleState?: Record<string, Availability>
}

/**
 * The implementation state of an entry. A binding is a toolbar item, an assistant operation or an API operation.
 * No binding: planned. Bound with limitations or without test evidence: partial. Otherwise implemented.
 */
export function implementationState(entry: CapabilityEntry): ImplementationState {
  const bound = !!(entry.toolbarItem || entry.aiOperations?.length || entry.apiOperations?.length)
  if (!bound) return 'planned'
  return entry.limitations?.length || !entry.verifiedBy?.length ? 'partial' : 'implemented'
}

/** Checks one prerequisite. `entry` supplies the default entitlement for `{ kind: 'entitlement' }`. */
export function checkPrerequisite(p: Prerequisite, ctx: AvailabilityContext, entry?: Pick<CapabilityEntry, 'entitlement'>): Availability {
  const no = (reason: string): Availability => ({ available: false, reason })
  switch (p.kind) {
    case 'project':
      return ctx.context.projectId ? { available: true } : no('Open a project first')
    case 'entitlement': {
      const id = p.id ?? entry?.entitlement
      return !id || ctx.entitlements.includes(id) ? { available: true } : no('Your subscription does not include this')
    }
    case 'service':
      return ctx.services[p.service] ? { available: true } : no(`The ${String(p.service)} service is not available here`)
    case 'connection':
      return (p.to === 'ai-account' ? ctx.connections.aiAccount : ctx.connections.api)
        ? { available: true }
        : no(p.to === 'ai-account' ? 'Connect an AI account first' : 'The API is not connected')
    case 'selection': {
      const types = p.types
      const matching = types?.length ? ctx.selection.filter((o) => types.includes(o.type)) : ctx.selection
      const min = p.min ?? 1
      const what = types?.length ? types.join(' or ') : 'object'
      if (matching.length < min) return no(min === 1 ? `Select a ${what} first` : `Select at least ${min} ${what} objects first`)
      if (p.max !== undefined && matching.length > p.max) return no(`Select at most ${p.max} ${what} ${p.max === 1 ? 'object' : 'objects'}`)
      return { available: true }
    }
    case 'module-state': {
      const state = ctx.moduleState?.[p.id]
      return !state || state.available ? { available: true } : no(state.reason ?? p.text)
    }
  }
}

/** Whether an entry can be used now, with the first unmet reason. A planned entry is always unavailable. */
export function availability(entry: CapabilityEntry, ctx: AvailabilityContext): Availability {
  if (implementationState(entry) === 'planned') return { available: false, reason: 'Planned: not implemented yet' }
  for (const p of entry.prerequisites ?? []) {
    const result = checkPrerequisite(p, ctx, entry)
    if (!result.available) return result
  }
  return { available: true }
}
