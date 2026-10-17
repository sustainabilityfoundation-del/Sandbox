/**
 * Per-module registration manifests (docs/specifications/module-registration.md, SDK 1.10, host typing SDK 1.11).
 *
 * A module package exports one manifest describing what it contributes to shared inventories: its
 * capability-coverage entries and AI operation classes. The shapes of `CapabilityEntry` and its
 * unions match apps/workspace/src/assistant/capabilities.ts, and `OperationClass` and
 * `AiModuleDescriptor` match services/assistant/src/policy.ts (`AiModule`); those files adopt these
 * types in later increments. Framework-free: no React, Fastify or service imports.
 */
import type { ArtifactSource } from './artifacts'
import type { SettingDefinition } from './settings'
import type { CommandLayout, CommandMode, Placement, Prerequisite, SurfacePlacement, TestRef } from './capabilities'
import type { HelpId } from './help'
import type { IconName } from '@ews/design-system/icon-names'

/** Where the capability is reached by a person. */
export type CapabilitySurface = 'toolbar' | 'panel' | 'field' | 'header' | 'palette' | 'tree' | 'inspector' | 'dialog' | 'api'

/** What it does (ai-interface.md §4). */
export type CapabilityEffect = 'query' | 'view' | 'mutation' | 'job' | 'export' | 'import' | 'external'

/** How real the capability is. Mock features are never labelled implemented. */
export type CapabilityStatus = 'implemented' | 'mock' | 'experimental' | 'restricted'

/** Whether the assistant can do the same thing (shared, equivalent, partial, none, restricted). */
export type AiCoverage = 'shared' | 'equivalent' | 'partial' | 'none' | 'restricted'

/** Module identifier used by capability entries (the owning module's manifest `id`). */
export type CapabilityModule = string

export interface CapabilityEntry {
  id: string
  module: CapabilityModule
  surface: CapabilitySurface
  label: string
  effect: CapabilityEffect
  status: CapabilityStatus
  coverage: AiCoverage
  /** Assistant operations (platform operation names or tool action names) that provide the coverage. */
  aiOperations?: string[]
  /** Toolbar item ID within the tool, for toolbar entries (checked against the tool definitions). */
  toolbarItem?: string
  /** Requirements API operationIds behind the capability. */
  apiOperations?: string[]
  note?: string
  // ---- Capability registry (SDK 1.13, docs/specifications/capability-registry.md); all optional ----
  /** Position in the module's `commandLayout`. */
  placement?: Placement
  /** What the capability does, in a sentence or two (shown for planned commands). */
  description?: string
  icon?: IconName
  /** How it behaves in detail (help and the assistant). */
  behaviour?: string
  /** Inputs, outputs and a reference: an OpenAPI operationId, an SDK type or a documentation anchor. */
  contract?: { inputs?: string; outputs?: string; ref?: string }
  /** Known limits; non-empty makes a bound entry partial. */
  limitations?: string[]
  prerequisites?: Prerequisite[]
  helpId?: HelpId
  /** Requirement IDs this capability satisfies. */
  requirements?: string[]
  /** Backlog item IDs (a planned entry needs at least one). */
  backlog?: string[]
  /** Tests that prove the capability; without them a bound entry is partial. */
  verifiedBy?: TestRef[]
  /** Server-side entitlement the person needs (client evaluation is UX only). */
  entitlement?: string
  /** IDs of implemented capabilities that serve the same need (offered when this one is planned). */
  alternatives?: string[]
  // ---- Professional structure (SDK 1.14, capability-registry.md Amendment CT-2c); all optional ----
  /** Positions on palettes, context sets and the quick-access segment (the ribbon position is `placement`). */
  placements?: SurfacePlacement[]
  /** How the command behaves: a one-off action (default), a toggle or an armed tool. */
  mode?: CommandMode
  /** Keyboard shortcut in `aria-keyshortcuts` form ("Control+Shift+E"), bound while the module is the active tool. Ctrl+K, F1 and F10 are reserved. */
  shortcut?: string
}

export type OperationClass = 'read' | 'search' | 'calculate' | 'propose' | 'export' | 'external-generation'

/** A module's place in the AI access policy (policy.ts `AiModule`). */
export interface AiModuleDescriptor {
  id: string
  label: string
  description: string
  /** Server-side entitlement the person needs (platform.entitlements); none for platform functions. */
  entitlement?: string
  /** Operation name prefixes (`<toolId>.`) or exact platform operation names. */
  prefixes: string[]
  names?: string[]
}

/** What every module declares, client or server side. */
export interface ModuleManifest {
  schemaVersion: 1
  /** Stable module ID (also the `module` of its capability entries). */
  id: string
  name: string
  entitlement?: string
  capabilities?: CapabilityEntry[]
  /** Operation name (`<toolId>.<action>`) to its class, merged into the policy catalogue. */
  operations?: Record<string, OperationClass>
  aiModule?: AiModuleDescriptor
  /** Open as a tab in a fresh session. */
  defaultOpen?: boolean
  /** 1 once the module's inventory is complete (SDK 1.13): the strict registry checks then apply to it. */
  inventory?: 1
  /** Tabs and groups of the module's command bar (SDK 1.13). */
  commandLayout?: CommandLayout
}

/**
 * What a server module may use when it registers. Structural, so the SDK needs no Fastify
 * dependency: the API host passes its own object, which extends this shape with its typed services
 * (`ServerModuleManifest<ApiModuleHost>`; SDK 1.11).
 */
export interface ServerModuleHost {
  /** The server application, typed by the host (a Fastify instance). */
  app: unknown
  /** True in production: modules switch off development-only features (seeds, fake adapters). */
  production?: boolean
  /** Poll interval of event hubs in milliseconds (tests shorten it). */
  eventPollMs?: number
  /** Host configuration and services the module may read (database, settings), typed by the host. */
  context?: Record<string, unknown>
}

/** What a server module's `register` may return. */
export interface ServerModuleRegistration {
  /** Source of saved artifacts: the host passes it to the project registry and to provisioning. */
  artifactSource?: ArtifactSource
}

/** Settings a server module contributes: the host registers them with the settings service for validation. */
export interface ServerModuleSettings {
  page: { id: string; title: string }
  definitions: SettingDefinition[]
}

/** How a module takes part in project creation (docs/modules/projects/registration-and-provisioning.md). */
export interface ServerModuleProvisioning {
  /** Module ID in project module states and enablement settings; defaults to the manifest `id`. */
  module?: string
  /** Why no provisioning step is needed (shown in the project context); the module's `ArtifactSource.provision` replaces it. */
  lazyReason: string
}

/** How the assistant may call a module's API for declarative proposals (`ServerModuleManifest.proposals`, SDK 1.12). */
export interface ServerModuleProposals {
  entitlement: string
  projectParam?: string
}

/**
 * What the host reads about a server module without registering it (SDK 1.12): identity, API docs, AI policy, proposal
 * target, settings and provisioning. A module the host composes itself (Project Management) exports only a descriptor.
 */
export interface ServerModuleDescriptor {
  id: string
  name: string
  /** URL base path (for example `/api/cad/v1`); it serves `/openapi.json`. */
  basePath: string
  /** Title of the API documentation page served at `<basePath>/docs`, if the module has one. */
  docs?: string
  /**
   * When the host registers the module: `modules` (default) with the other installed modules, before the host-composed
   * services (projects, settings, assistant); `after-host` after them, for a module that must see them running. An
   * `after-host` module cannot contribute an artifact source, settings or provisioning (those are consumed earlier).
   */
  phase?: 'modules' | 'after-host'
  operations?: Record<string, OperationClass>
  aiModule?: AiModuleDescriptor
  /**
   * The module's API as a target of the assistant's declarative proposals (SDK 1.12): the entitlement the person needs
   * and the name of the project parameter in the module's URLs (omit when the module has none).
   */
  proposals?: ServerModuleProposals
  settings?: ServerModuleSettings
  provisioning?: ServerModuleProvisioning
}

/** A server module with its registration code: the descriptor plus `register` (and optional `migrate`/`seed`), typed by the host object. */
export interface ServerModuleManifest<H extends ServerModuleHost = ServerModuleHost> extends ServerModuleDescriptor {
  migrate?: (host: H) => void | Promise<void>
  seed?: (host: H) => void | Promise<void>
  /** Registers the module's routes; may return an artifact source for the assistant and projects. */
  register(host: H): ServerModuleRegistration | void | Promise<ServerModuleRegistration | void>
}
