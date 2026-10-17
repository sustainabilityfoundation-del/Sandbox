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
import type { HelpId } from './help'
import type { CapabilityEntry } from './modules'
import type { PlatformServices } from './requirements'
import type { SharedContext } from './tool'
import type { IconName } from '@ews/design-system/icon-names'

/** How much of a capability exists: planned (no binding), partial (bound, limited or unverified), implemented. */
export type ImplementationState = 'implemented' | 'partial' | 'planned'

/** A test that proves a capability: repository path of a test file, `::`, and a substring of an `it()` or `test()` title. */
export type TestRef = `${string}.test.${'ts' | 'tsx'}::${string}`

/**
 * How a command behaves (SDK 1.14): `action` runs once; `toggle` switches a setting on and off; `tool` arms a tool
 * that stays armed until it is used or Escape disarms it. The pressed state is the runtime item's `active`.
 */
export type CommandMode = 'action' | 'toggle' | 'tool'

/** A group of a ribbon tab. `exclusive`: choose-one toggles (the module keeps exactly one active). */
export interface CommandLayoutGroup {
  id: string
  label: string
  icon?: IconName
  exclusive?: boolean
}

export interface CommandLayoutTab {
  id: string
  label: string
  /** The tab shows only while this holds (for example a tab for the selected object type). */
  contextual?: Prerequisite
  groups: CommandLayoutGroup[]
}

/**
 * A node of a main menu (SDK 1.14). `group` lists a whole ribbon group (no double declaration), `palette` a palette,
 * `context` a context set, `command` one entry, `submenu` a nested menu and `panels` the module's panel toggles.
 */
export type MenuNode =
  | { kind: 'group'; tab: string; group: string }
  | { kind: 'palette'; palette: string }
  | { kind: 'context'; set: string }
  | { kind: 'command'; id: string }
  | { kind: 'submenu'; label: string; mnemonic?: string; items: MenuNode[] }
  | { kind: 'panels' }
  | { kind: 'separator' }

/** One menu of the main menu bar. Without `menus`, the host builds one menu per tab with its groups as sections. */
export interface MenuDef {
  id: string
  label: string
  /** Letter that opens the menu while key tips are shown (F10 or a lone Alt tap). */
  mnemonic?: string
  items: MenuNode[]
}

/** A vertical or floating palette of tool groups, rendered by the tool through `usePalette`. */
export interface PaletteDef {
  id: string
  label: string
  /** The palette applies only while this holds (for example a `context` prerequisite). */
  when?: Prerequisite
  groups: { id: string; label: string; icon?: IconName; collapsed?: boolean }[]
}

/** Commands for a selection or view: a floating toolbar, a context menu and the Edit menu. All of `when` must hold. */
export interface ContextSetDef {
  id: string
  label: string
  when: Prerequisite[]
}

/** A panel the module can open beside, under or over its canvas (declarative hint; docking is the host's). */
export interface PanelDef {
  id: string
  role: 'browser' | 'specification' | 'properties' | 'diagnostics' | 'other'
  label: string
  side: 'start' | 'end' | 'bottom'
  defaultOpen?: boolean
  helpId?: HelpId
}

/** Where commands sit: module, then tab, then group, then command (`Placement`); plus menus, palettes, context sets and panels (SDK 1.14). */
export interface CommandLayout {
  tabs: CommandLayoutTab[]
  /** Main menus. Absent: one menu per tab with its groups as sections. */
  menus?: MenuDef[]
  /** The module shows a quick-access segment (entries with a `quick` surface placement). */
  quick?: true
  palettes?: PaletteDef[]
  contextSets?: ContextSetDef[]
  panels?: PanelDef[]
}

/** A capability's position in a module's `CommandLayout`. */
export interface Placement {
  tab: string
  group: string
  /** Order within the group; unique per group. */
  order: number
  /** 'secondary' commands move into a menu on narrow screens. */
  priority?: 'primary' | 'secondary'
  /** Split button (SDK 1.14): this command opens from the arrow beside the named entry of the same group. Children do not nest. */
  splitOf?: string
}

/** A position on a surface other than the ribbon (SDK 1.14): a palette group, a context set or the quick-access segment. */
export type SurfacePlacement =
  | { surface: 'palette'; palette: string; group: string; order: number }
  | { surface: 'context'; set: string; order: number }
  | { surface: 'quick'; order: number }

/** A condition for a capability to be usable now (evaluated by `availability`). */
export type Prerequisite =
  | { kind: 'project' }
  | { kind: 'entitlement'; id?: string }
  | { kind: 'service'; service: keyof PlatformServices }
  | { kind: 'connection'; to: 'ai-account' | 'api' }
  | { kind: 'selection'; types?: ObjectType[]; min?: number; max?: number }
  /** Supplied by the module at runtime through `AvailabilityContext.moduleState`; `text` is the reason when unmet. */
  | { kind: 'module-state'; id: string; text: string }
  /** A context the tool reports at runtime (`ToolRuntime.contexts`, `AvailabilityContext.contexts`): 'diagram:general', 'sketch', 'selection:edge'. */
  | { kind: 'context'; id: string }

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
  /** Context IDs the tool reports now (SDK 1.14, `ToolRuntime.contexts`); a `context` prerequisite needs its id listed. */
  contexts?: string[]
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
    case 'context':
      return ctx.contexts?.includes(p.id) ? { available: true } : no('Not available in the current context')
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
