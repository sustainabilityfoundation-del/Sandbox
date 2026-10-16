import type { ModuleManifest } from '../contract/modules'
import type { PlatformModuleContribution } from '../contract/assistant'
import type { AnyToolDefinition } from './defineTool'

/**
 * What the host passes to a module's tool factory (the values apps/workspace/src/platform/tools.ts
 * gives its factories today). Structural and minimal.
 */
export interface ModuleHostEnv {
  /** `demo` runs on in-browser data; `api` talks to the backend services. */
  requirementsMode: 'demo' | 'api'
  /** Development user for API mode. */
  devUser: string
}

/** A client-side module: its manifest plus the tool or platform module it registers. */
export interface ClientModule {
  manifest: ModuleManifest
  tool?: (env: ModuleHostEnv) => AnyToolDefinition
  platformModule?: () => PlatformModuleContribution
}
