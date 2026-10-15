/**
 * @ews/sysml-client: the browser client of the SysML Modeler.
 *
 * - `createHttpSysmlClient(config)`: SysmlClient over /api/sysml/v1 (mode 'api').
 * - `createLocalSysmlClient(options)`: explicit in-browser repository on the same core (mode 'local'),
 *   for the standalone harness, demos and offline experiments; never a silent fallback.
 * - `applyOutcome(model, outcome)`: incremental model update after a transaction.
 * - Contract test suite for adapters: '@ews/sysml-client/contract-tests'.
 */
export { createHttpSysmlClient, newIdempotencyKey, type HttpSysmlConfig } from './http'
export { createLocalSysmlClient, LOCAL_SEED_PROJECT_ID, type LocalOptions, type StorageLike } from './local'
export { applyOutcome } from './apply'
export * from './types'
