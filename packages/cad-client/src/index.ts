/**
 * @ews/cad-client: client of the CAD document service (CR-CAD-2).
 *
 * - `createHttpCadClient(config)`: CadClient over /api/cad/v1 (mode 'api').
 * - `createLocalCadClient()`: explicit in-browser store (mode 'local') for the harness and tests;
 *   never a silent fallback.
 * - `entityRef(documentId, entityId, revision)`: platform reference to a CAD Modeler entity (CR-CAD-1).
 * - Contract test suite: '@ews/cad-client/contract-tests'.
 */
export { createHttpCadClient, type HttpCadConfig } from './http'
export { createLocalCadClient } from './local'
export * from './types'
export { createCadReadService, type CadReadService, type CadReadResult, type CadEntitySummary, type CadMassPropertiesResult, type CadArtifactRefInput } from './read'
export { CAD_SETTINGS, CAD_SETTING_DEFINITIONS, CAD_SETTING_IDS } from './settings'
