/**
 * @ews/cad-service: the CAD Modeler document store and API (schema `cad`), a Fastify plugin hosted
 * by @ews/api at /api/cad/v1 (CR-CAD-2, approved). Other modules use the HTTP API or, later, the
 * SDK's PlatformServices.cad; never these tables.
 */
export { cadServerManifest } from './manifest'
export { cadPlugin, buildCadOpenApi, CAD_BASE_PATH, CAD_API_VERSION, type CadPluginOptions } from './http/plugin'
export { entityRef } from './http/routes'
export { migrateCad, CAD_MIGRATIONS } from './db/migrate'
export { createCadEventHub, type CadEvent, type CadEventHub, type CadEventType, type CadPartDescriptor } from './events'
export { createCadArtifactSource, CAD_ARTIFACT_KINDS, toChanges } from './artifacts'
export { validateContent, type DocumentSummary, type RevisionInfo } from './store'
export { CadServiceError, errorBody } from './errors'
export type { Principal, Role, CadHost } from './http/route'
/** CAD Modeler settings definitions, for registration with the settings service by the API host. */
export { CAD_SETTINGS } from '@ews/cad-client'
