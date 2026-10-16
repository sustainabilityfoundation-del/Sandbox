import { VISUALIZATION_BASE_PATH } from './plugin'

/**
 * The Visualization service's server manifest (docs/specifications/module-registration.md, M5): ID, base path and API
 * documentation page. It registers after the host services (`phase: 'after-host'`): the plugin starts its job runner while
 * registering and resumes jobs, which needs the running assistant (image access). It contributes no artifact source,
 * settings, provisioning, proposal API, AI module or operations: its UI is Conceptualize's, and the image-generation
 * settings (`ai.images.*`) belong to the platform AI policy.
 *
 * The plugin needs host objects (pool, auth, options, blob store, assistant), so the host (services/api/src/modules.ts)
 * adds `register` to this descriptor and keeps the registration order.
 *
 * The package does not import `@ews/platform-sdk` (the package boundary test, which M-steps may not change, does not allow
 * it for this service). The object is structurally an SDK `ServerModuleDescriptor`; the host's list type checks that.
 */
export const visualizationServerManifest = {
  id: 'visualization',
  name: 'Visualization',
  basePath: VISUALIZATION_BASE_PATH,
  docs: 'Visualization API',
  phase: 'after-host' as const,
}
