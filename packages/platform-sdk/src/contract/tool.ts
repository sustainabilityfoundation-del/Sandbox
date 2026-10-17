import type { PlatformServices } from './requirements'
import type { CurrentProject } from './projects'
import type { SettingsService } from './settings'
import type { IconName } from '@ews/design-system/icon-names'
import type { CommandMode } from './capabilities'
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

export type ToolCategory = 'Conceptual design' | 'Requirements' | 'Systems engineering' | 'Design'

export const TOOL_CATEGORIES: ToolCategory[] = ['Conceptual design', 'Requirements', 'Systems engineering', 'Design']

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
  /** The open project as Project Management knows it (SDK 1.7); absent in hosts without Project Management. `projectId` stays authoritative. */
  project?: CurrentProject
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
  /**
   * Platform services available to this view (SDK 1.2), for example the Requirements
   * service. A service is absent when the host does not provide it or the user is
   * not entitled; never fall back to another data source silently.
   */
  readonly services: PlatformServices
  /**
   * Effective setting values (SDK 1.6): from the settings service, clamped to project ceilings, else
   * defaults. Read-only here; people change settings in the Settings centre.
   */
  readonly settings: SettingsService
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
      /** Why the item is disabled now (SDK 1.13); the command bar shows it when the item is activated. */
      unavailableReason?: string
      /** Rendered as pressed (for modes and toggles). */
      active?: boolean
      /** Filled call-to-action button. Always visible. */
      primary?: boolean
      busy?: boolean
      /** Mock-only control; the platform marks it as illustrative. */
      illustrative?: boolean
      /** 'primary' actions stay visible; others move into the overflow menu when the toolbar is narrow. */
      priority?: 'primary' | 'secondary'
      /** Action, toggle or armed tool (SDK 1.14); defaults to the registry entry's `mode`. */
      mode?: CommandMode
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
  /** A numeric input with a unit (SDK 1.14): a dimension, an angle, a count. Committed on Enter and on blur. */
  | {
      type: 'number'
      id: string
      label: string
      value: number
      unit?: string
      min?: number
      max?: number
      step?: number
      onChange: (value: number) => void
      disabled?: boolean
    }

export interface ToolbarContext<VS> {
  api: ToolApi<VS>
  viewState: VS
  context: SharedContext
  model: ModelIndex
  selection: EngineeringObject[]
}

/**
 * An open edit of one command (SDK 1.14): a feature edit such as Extrude with its fields, Preview, OK and Cancel. The host
 * replaces the ribbon with the session strip while it is open and refuses a session for a planned entry.
 */
export interface CommandSession {
  /** The capability being edited; must be a bound (not planned) entry. */
  capabilityId: string
  title: string
  /** Number, select and text items; other item types are ignored by the strip. */
  fields: ToolbarItem[]
  preview?: { on: boolean; onChange: (on: boolean) => void }
  onOk: () => void
  /** Why OK cannot be pressed now; OK stays focusable and does nothing while set. */
  okUnavailableReason?: string
  onCancel: () => void
}

/** What a tool reports about its runtime state (SDK 1.14, `ToolDefinition.runtime`), on every render like `toolbar`. */
export interface ToolRuntime {
  /** Context IDs that hold now ('diagram:general', 'sketch', 'selection:edge'); they satisfy `context` prerequisites. */
  contexts?: string[]
  /** The open command session, or null. */
  session?: CommandSession | null
  /** Panel state by `PanelDef.id`; a panel the tool does not report cannot be toggled by the host. */
  panels?: Record<string, { open: boolean; toggle: () => void }>
}
