/**
 * @ews/projects-client: the browser client of the Project Management API.
 *
 * - `createHttpProjectsService(config)`: SDK `ProjectsService` over HTTP (mode 'api').
 * - `createMemoryProjectsService(data)`: in-memory contract-test adapter (mode 'demo'), never a fallback.
 * - `getProjectsClient(service)` / `ProjectsClient`: the full typed client for the workspace's project screens and
 *   the `projects.*` assistant actions.
 * - Contract test suite: '@ews/projects-client/contract-tests'.
 *
 * Depends only on '@ews/platform-sdk'; never holds database credentials.
 */
export { createHttpProjectsService, createMemoryProjectsService, getProjectsClient, toArtifactSummary, toProjectSummary, type HttpServiceConfig } from './adapters'
export { ProjectsClient, type WriteOpts } from './client'
export { HttpTransport, ProjectsApiError, newIdempotencyKey, openEventStream, type HttpConfig, type Provenance, type RequestOptions, type StreamHandle } from './transport'
export type * from './types'
export { projectsModule, PROJECTS_MANIFEST, type ProjectsClientModule } from './module'
export { projectsAssistant, type ProjectsModuleHost } from './assistant'
export { projectsHelp } from './help'
export { PROJECTS_CAPABILITIES } from './capabilities'
