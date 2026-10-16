/**
 * '@ews/platform-sdk/react': the React side of the tool contract. Tool views
 * use these hooks; the platform (workspace or harness) provides the host.
 */
export { defineTool, type AnyToolDefinition, type ToolDefinition } from './defineTool'
export type { ClientModule, ModuleHostEnv } from './modules'
export { PlatformHostProvider, ToolScope, shallowEqual, useHostValue, usePlatformHost, useToolScope } from './host'
export {
  hasUnsavedChanges,
  useActivity,
  useArtifacts,
  useBaselines,
  usePlatformServices,
  useIsActiveTool,
  useModel,
  useResolvedSelection,
  useRestoredScroll,
  useSelection,
  useSetting,
  useSharedContext,
  useToolApi,
  useToolCommand,
  useToolViewState,
  useUnsavedChanges,
  useViewId,
  type ArtifactView,
} from './hooks'
export {
  FreshnessBadge,
  MockTag,
  OBJECT_TYPE_LABEL,
  ObjectRef,
  RefChip,
  RequirementStatusBadge,
  ReviewBadge,
  formatTime,
  iconForType,
} from './ui'
