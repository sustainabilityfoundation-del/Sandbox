/**
 * @ews/platform-sdk: the versioned contract between the workspace platform and
 * its tools. This entry point is framework-free; React hooks and the tool
 * definition are in '@ews/platform-sdk/react', the standalone development
 * harness in '@ews/platform-sdk/harness'.
 *
 * The domain model (types, typed entity readers, representation resolution)
 * comes from @ews/model-service and is re-exported here so tools need only
 * this package and the design system.
 */
export { SDK_VERSION, isSdkCompatible } from './contract/version'
export * from './contract/tool'
export * from './contract/assistant'
export type { PlatformHost } from './contract/host'
// Domain model only. Tools never get the repository itself: every read and write goes through the host.
export type * from '@ews/model-service'
export {
  PHYSICAL_COMPONENT_TYPES,
  REQUIREMENT_STATUSES,
  RepositoryError,
  ARTIFACT_OWNER,
  DELEGATIONS,
  RELATIONSHIP_RULES,
  changeImpact,
  compareWithBaseline,
  componentOf,
  formatNumber,
  formatQuantity,
  formatValue,
  isComponent,
  isOfType,
  isQuantity,
  outputFreshness,
  propertyLabel,
  readCadRepresentation,
  readComponent,
  readRequirement,
  readSysmlElement,
  representationsOf,
  requirementsFor,
  resolveRepresentation,
} from '@ews/model-service'
