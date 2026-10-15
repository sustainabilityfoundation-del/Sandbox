/**
 * @ews/requirements-client: the browser client of the Requirements API.
 *
 * - `createHttpRequirementsService(config)`: SDK `RequirementsService` over HTTP (mode 'api').
 * - `createDemoRequirementsService()`: explicit in-browser demo adapter (mode 'demo'), never a fallback.
 * - `getModuleClient(service, projectId)`: the module's full typed client behind an HTTP service
 *   (used by the Requirements tool only).
 * - Contract test suite for adapters: '@ews/requirements-client/contract-tests'.
 *
 * Depends only on '@ews/platform-sdk' types and errors; never holds database credentials.
 */
export { createHttpRequirementsService, getModuleClient, onRequirementsReset, toSummary, RequirementsApiError, newIdempotencyKey, type HttpServiceConfig } from './adapters'
export { createDemoRequirementsService, type DemoOptions } from './demo'
export { RequirementsModuleClient, type WriteOpts } from './module'
export { HttpTransport, openEventStream, type HttpConfig, type RequestOptions, type StreamHandle } from './transport'
export type * from './types'
export { REQUIREMENT_ORIGINS } from './types'
