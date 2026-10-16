/**
 * @ews/model-service: the shared digital twin. Domain types, typed entity
 * readers, representation resolution, artifact freshness and the repository
 * contract. Framework-free: no React, no browser UI.
 */
export * from './domain/types'
export * from './domain/entities'
export { buildModelIndex, type ModelIndex } from './domain/modelIndex'
export { composeSnapshot, mergeProjections, type ExternalProjection } from './domain/projection'
export { outputFreshness, type Freshness } from './domain/freshness'
export { changeImpact, compareWithBaseline, pinBaseline, type BaselineComparison, type ChangeImpact } from './domain/configuration'
export {
  ARTIFACT_OWNER,
  DELEGATIONS,
  RELATIONSHIP_RULES,
  RETIRED_MODULES,
  actingModules,
  canCreate,
  canWriteProperties,
  validateRelationship,
  type Delegation,
  type ModuleId,
} from './domain/ownership'
export { formatNumber, formatQuantity, formatValue, isQuantity, propertyLabel } from './domain/units'
export { RepositoryError, type EngineeringRepository, type RepositoryErrorCode } from './repository/EngineeringRepository'
export { DemoRepository, LEGACY_STORAGE_KEY, STORAGE_KEY, browserStorage, type StorageLike } from './repository/DemoRepository'
export { PROJECT_ID, seedModel } from './repository/seed'
