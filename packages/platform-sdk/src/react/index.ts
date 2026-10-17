/**
 * '@ews/platform-sdk/react': the React side of the tool contract. Tool views
 * use these hooks; the platform (workspace or harness) provides the host.
 */
export {
  buildCommandModel,
  EMPTY_COMMAND_MODEL,
  EVIDENCE_GAP_TEXT,
  FALLBACK_GROUP_ID,
  SESSION_OPEN_TEXT,
  type CommandModel,
  type CommandModelContextSet,
  type CommandModelPalette,
  type CommandModelPanel,
  type CommandModelSession,
} from './commandModel'
export { CommandModelProvider, useCommandModel, useContextSet, usePalette } from './commandHooks'
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
