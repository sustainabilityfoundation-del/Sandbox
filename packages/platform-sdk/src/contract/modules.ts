/**
 * Per-module registration manifests (docs/specifications/module-registration.md, SDK 1.10).
 *
 * A module package exports one manifest describing what it contributes to shared inventories: its
 * capability-coverage entries and AI operation classes. The shapes of `CapabilityEntry` and its
 * unions match apps/workspace/src/assistant/capabilities.ts, and `OperationClass` and
 * `AiModuleDescriptor` match services/assistant/src/policy.ts (`AiModule`); those files adopt these
 * types in later increments. Framework-free: no React, Fastify or service imports.
 */

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
}

/**
 * What a server module may use when it registers. Structural, so the SDK needs no Fastify
 * dependency: the API host passes its own objects, which satisfy these shapes.
 */
export interface ServerModuleHost {
  /** The server application, typed by the host (a Fastify instance). */
  app: unknown
  /** Host configuration and services the module may read (database, settings), typed by the host. */
  context?: Record<string, unknown>
}

/** What a server module's `register` may return. */
export interface ServerModuleRegistration {
  /** Source of saved artifacts for the assistant, typed by the host. */
  artifactSource?: unknown
}

export interface ServerModuleManifest {
  id: string
  name: string
  /** URL base path (for example `/api/cad/v1`); it serves `/openapi.json`. */
  basePath: string
  /** Documentation page for the API, if any. */
  docs?: string
  operations?: Record<string, OperationClass>
  aiModule?: AiModuleDescriptor
  /** Settings the module contributes (typed by the host). */
  settings?: unknown
  provisioning?: unknown
  migrate?: (host: ServerModuleHost) => void | Promise<void>
  seed?: (host: ServerModuleHost) => void | Promise<void>
  /** Registers the module's routes; may return an artifact source for the assistant. */
  register(host: ServerModuleHost): ServerModuleRegistration | void | Promise<ServerModuleRegistration | void>
}
