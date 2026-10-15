/**
 * @ews/sysml-service: the SysML Modeler repository and API (schema `sysml`), a Fastify plugin
 * hosted by @ews/api at /api/sysml/v1. Other modules use the HTTP API (or a future SDK service,
 * CR-SYSML-01), never these tables.
 */
export { sysmlPlugin, buildSysmlOpenApi, SYSML_BASE_PATH, SYSML_API_VERSION, type SysmlPluginOptions } from './http/plugin'
export { SysmlRepository, type CommitSource, type TransactionOutcome, type TransactionRequest } from './repository'
export { migrateSysml, SYSML_MIGRATIONS } from './db/migrate'
export { createSysmlEventHub, type SysmlEvent, type SysmlEventHub } from './events'
export { createSysmlArtifactSource, isRegisteredElement, SYSML_ARTIFACT_KINDS } from './artifacts'
export { seedSysml, SEED_PROJECT_ID, SEED_PLATFORM_PROJECT } from './seed'
export { SysmlServiceError, errorBody } from './errors'
export type { Principal, Role, SysmlHost } from './http/route'
