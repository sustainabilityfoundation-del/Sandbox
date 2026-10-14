import type { IconName } from '@ews/design-system/icon-names'
import type {
  ActivityEntry,
  Baseline,
  ObjectRevision,
  ActivityKind,
  ActivitySource,
  EngineeringObject,
  ModelChange,
  ModelIndex,
  ObjectType,
  OutputDraft,
  OutputRecord,
  ReviewStatus,
} from '@ews/model-service'

/**
 * Framework-free tool contract: what a tool declares and the API it may call.
 * React-specific parts (the lazy view) are in '@ews/platform-sdk/react'.
 */

/** A subscription entitlement, e.g. 'tool:requirements'. Tools declare one; the platform checks it. */
export type EntitlementId = `tool:${string}`

export type ToolCategory = 'Requirements' | 'Systems engineering' | 'Design'

export const TOOL_CATEGORIES: ToolCategory[] = ['Requirements', 'Systems engineering', 'Design']

/** Static description of a tool, readable without loading its view. */
export interface ToolManifest {
  /** Stable ID; used for persistence, routing and artifact provenance. Never change it. */
  id: string
  name: string
  description: string
  category: ToolCategory
  /** Semantic icon name; the design system maps it to a glyph. */
  icon: IconName
  /** The tool's own version (semver). Recorded with artifacts it saves. */
  version: string
  /** SDK range the tool was built against, e.g. '^1.0.0'. Incompatible tools are not loaded. */
  sdkVersion: string
  /** Subscription entitlement required to open the tool. */
  entitlement: EntitlementId
  /** Object types the tool can display. Other selections are kept and explained. */
  supportedObjectTypes: ObjectType[]
}

/** The context shared by every tool. Survives tool switches and page reloads. */
export interface SharedContext {
  projectId: string
  /** The configuration this view shows (a pinned view keeps the one it was pinned in). */
  configurationId: string
  /** Current model revision (read-only; changes when the model changes). */
  modelRevision: number
  /** The view's selection: the workspace selection, or the pinned objects. */
  selectedIds: string[]
  scenarioId: string
  /** True when this view is pinned to particular objects instead of following the workspace. */
  pinned: boolean
  /** The workspace's configuration, which may differ from a pinned view's. */
  workspaceConfigurationId: string
}

/** Fields a tool supplies when saving an artifact; the SDK fills in project, configuration and scenario. */
export type ArtifactInput = Omit<OutputDraft, 'toolId' | 'projectId' | 'configurationId' | 'scenarioId' | 'inputRevision'> & {
  configurationId?: string
  scenarioId?: string | null
  inputRevision?: number
}

export interface ArtifactFilter {
  objectId?: string
  toolId?: string
  kind?: string
}

export type ViewStateUpdate<VS> = Partial<VS> | ((current: VS) => VS)

/** Provenance for writes made on behalf of another part of the platform (e.g. ChatGPT). */
export interface WriteOptions {
  source?: ActivitySource
  /** Configuration to record against, when it was captured earlier. */
  configurationId?: string
}

/** A command a tool view registers while it is mounted; listed in the command palette. */
export interface ToolCommand {
  id: string
  label: string
  icon?: IconName
  description?: string
  disabled?: boolean
  run: () => void
}

export type OpenToolResult = { ok: true } | { ok: false; reason: string }

/**
 * Imperative API for one view instance of a tool. Safe to call from toolbar
 * actions and from async work that outlives the view.
 */
export interface ToolApi<VS = unknown> {
  readonly toolId: string
  readonly viewId: string
  getContext: () => SharedContext
  getModel: () => ModelIndex
  select: (ids: string[]) => void
  setScenario: (scenarioId: string) => void
  /** Validated by the repository; edits carry base revisions and stale ones are rejected. */
  submitChanges: (changes: ModelChange[], summary: string, options?: WriteOptions) => Promise<{ createdIds: string[]; modelRevision: number }>
  /** Saves an immutable artifact with provenance (tool, objects, configuration, input revision, schema version). */
  saveArtifact: (artifact: ArtifactInput, options?: WriteOptions) => Promise<OutputRecord>
  /** Saved artifacts in the view's configuration, newest first. */
  getArtifacts: (filter?: ArtifactFilter) => OutputRecord[]
  setReviewStatus: (artifactId: string, status: ReviewStatus) => Promise<OutputRecord>
  /** Activity entries, newest first, optionally only those about one object. */
  getActivity: (objectId?: string) => ActivityEntry[]
  log: (message: string, options?: { kind?: ActivityKind; objectIds?: string[]; source?: ActivitySource }) => void
  /** Registers a command for this view; returns a function that removes it. */
  registerCommand: (command: ToolCommand) => () => void
  /**
   * One exact revision of an object or scenario, e.g. the requirement revision a
   * verification record pinned. Undefined if that revision was never recorded. (SDK 1.1)
   */
  getObjectRevision: (id: string, revision: number) => Promise<ObjectRevision | undefined>
  /** Baselines of the project, newest last. (SDK 1.1) */
  getBaselines: () => Baseline[]
  /** Opens another tool through the platform (subject to subscription). Never imports the tool. */
  openTool: (toolId: string) => OpenToolResult
  getViewState: () => VS
  updateViewState: (update: ViewStateUpdate<VS>) => void
}

export type ToolbarItem =
  | {
      type: 'button'
      id: string
      label: string
      icon?: IconName
      onClick: () => void
      title?: string
      disabled?: boolean
      /** Rendered as pressed (for modes and toggles). */
      active?: boolean
      /** Filled call-to-action button. Always visible. */
      primary?: boolean
      busy?: boolean
      /** Mock-only control; the platform marks it as illustrative. */
      illustrative?: boolean
      /** 'primary' actions stay visible; others move into the overflow menu when the toolbar is narrow. */
      priority?: 'primary' | 'secondary'
    }
  | {
      type: 'select'
      id: string
      label: string
      value: string
      options: { value: string; label: string }[]
      onChange: (value: string) => void
      disabled?: boolean
      title?: string
    }
  | { type: 'separator'; id: string }
  | { type: 'text'; id: string; text: string; tone?: 'muted' | 'warning' }

export interface ToolbarContext<VS> {
  api: ToolApi<VS>
  viewState: VS
  context: SharedContext
  model: ModelIndex
  selection: EngineeringObject[]
}
