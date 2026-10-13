/**
 * Workspace SDK: the only module tools import from the workspace.
 *
 * Tools read and change the shared context, read the model, submit changes,
 * save outputs and keep private view state through these hooks and the
 * ToolApi. They never touch browser storage or another tool's state.
 */
export {
  hasUnsavedChanges,
  useIsActiveTool,
  useModel,
  useOutput,
  useOutputs,
  useRestoredScroll,
  useSelection,
  useSharedContext,
  useToolApi,
  useToolViewState,
  useUnsavedChanges,
  useViewId,
  type OutputFilter,
  type OutputView,
} from './hooks'
export {
  defineTool,
  type OutputInput,
  type SharedContext,
  type ToolApi,
  type ToolbarContext,
  type ToolbarItem,
  type ToolCategory,
  type ToolDefinition,
} from './toolTypes'
export {
  Button,
  Checkbox,
  Field,
  FieldGroup,
  IconButton,
  SegmentedControl,
  Select,
  Spinner,
  TableContainer,
  TextArea,
  TextInput,
  type ButtonProps,
  type SegmentOption,
} from './controls'
export { Icons, iconForType, type IconComponent } from './icons'
export {
  Badge,
  ComplianceBadge,
  COMPLIANCE_LABEL,
  DemoTag,
  FreshnessBadge,
  Notice,
  ObjectRef,
  Panel,
  ReviewBadge,
  formatTime,
  type Tone,
} from './ui'
export { formatNumber, formatQuantity, formatValue, isQuantity, propertyLabel } from '../domain/units'
export { isComponent, type ModelIndex } from '../domain/modelIndex'
export type * from '../domain/types'
