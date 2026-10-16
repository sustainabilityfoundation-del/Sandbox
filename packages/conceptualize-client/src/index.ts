/**
 * @ews/conceptualize-client: the browser client of the Conceptualize API.
 *
 * - `createHttpConceptsService(config)`: SDK `ConceptsService` over HTTP (mode 'api').
 * - `createDemoConceptsService()`: explicit in-browser demo adapter (mode 'demo', SDK reads only), never a fallback.
 * - `getConceptsModuleClient(service, projectId)`: the module's full typed client behind an HTTP service
 *   (used by the Conceptualize tool and its assistant actions only).
 * - `draftConcept(text)`: deterministic natural-language extraction of a Concept draft.
 * - Contract test suite for adapters: '@ews/conceptualize-client/contract-tests'.
 *
 * Depends only on '@ews/platform-sdk'; never holds database credentials.
 */
export { createHttpConceptsService, getConceptsModuleClient, onConceptsReset, toSummary, toImplementationSummary, ConceptsApiError, newIdempotencyKey, type HttpServiceConfig } from './adapters'
export { createDemoConceptsService, DEMO_CONSTRAINT_IDS, type DemoOptions } from './demo'
export { ConceptsModuleClient, type WriteOpts } from './module'
export { HttpTransport, openEventStream, type HttpConfig, type Provenance, type RequestOptions, type StreamHandle } from './transport'
export { draftConcept, extractFunctions, extractName, extractQuantities, extractRequestedCount, UNIT_DIMENSIONS, type ConceptDraft, type ExtractedQuantity } from './nl'
export type * from './types'
export { EMPTY_DEFINITION, definitionInput } from './visualTypes'
export { createCadServicePort, createRegistryReferencePort, createSysmlModelerReferenceAdapter, createSysmlServicePort, referencePortsFor, isLegacyTwinReference, isRealModuleReference, referenceKind, scopedId, REAL_MODULE_KINDS, type ReferencePort, type ReferenceResolution, type ReferenceTarget } from './references'
