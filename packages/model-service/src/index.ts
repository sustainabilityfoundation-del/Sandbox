/**
 * @ews/model-service: the shared digital twin. Domain types, typed entity
 * readers, representation resolution, artifact freshness and the repository
 * contract. Framework-free: no React, no browser UI.
 */
export * from './domain/types'
export * from './domain/entities'
export { buildModelIndex, type ModelIndex } from './domain/modelIndex'
export { outputFreshness, type Freshness } from './domain/freshness'
export { formatNumber, formatQuantity, formatValue, isQuantity, propertyLabel } from './domain/units'
export { RepositoryError, type EngineeringRepository, type RepositoryErrorCode } from './repository/EngineeringRepository'
export { DemoRepository, LEGACY_STORAGE_KEY, STORAGE_KEY, browserStorage, type StorageLike } from './repository/DemoRepository'
export { PROJECT_ID, seedModel } from './repository/seed'
