import type { ComponentType, LazyExoticComponent, SVGProps } from 'react'
import type { ModelIndex } from '../domain/modelIndex'
import type {
  ActivityKind,
  EngineeringObject,
  ModelChange,
  ObjectType,
  OutputDraft,
  OutputRecord,
  ReviewStatus,
} from '../domain/types'

/** The context shared by every tool. Survives tool switches and page reloads. */
export interface SharedContext {
  projectId: string
  configurationId: string
  /** Current model revision (read-only; changes when the model changes). */
  modelRevision: number
  selectedIds: string[]
  scenarioId: string
}

export type ToolCategory = 'Design' | 'Requirements' | 'Analysis' | 'Verification' | 'Data'

export const TOOL_CATEGORIES: ToolCategory[] = ['Design', 'Requirements', 'Analysis', 'Verification', 'Data']

/** Fields a tool supplies when saving; the SDK fills in project, configuration and scenario. */
export type OutputInput = Omit<OutputDraft, 'projectId' | 'configurationId' | 'scenarioId' | 'inputRevision'> & {
  /** Override the captured context, e.g. for an analysis started under another scenario. */
  configurationId?: string
  scenarioId?: string | null
  inputRevision?: number
}

export type ViewStateUpdate<VS> = Partial<VS> | ((current: VS) => VS)

/**
 * Imperative API for a single tool. Safe to call from toolbar actions and from
 * async work that outlives the tool's view (e.g. a long analysis run).
 */
export interface ToolApi<VS = unknown> {
  readonly toolId: string
  getContext: () => SharedContext
  getModel: () => ModelIndex
  select: (ids: string[]) => void
  setScenario: (scenarioId: string) => void
  submitChanges: (changes: ModelChange[], summary: string) => Promise<{ createdIds: string[] }>
  saveOutput: (output: OutputInput) => Promise<OutputRecord>
  setReviewStatus: (outputId: string, status: ReviewStatus) => Promise<OutputRecord>
  getViewState: () => VS
  updateViewState: (update: ViewStateUpdate<VS>) => void
  log: (message: string, options?: { kind?: ActivityKind; objectIds?: string[] }) => void
  openTool: (toolId: string) => void
}

export type ToolbarItem =
  | {
      type: 'button'
      id: string
      label: string
      icon?: ComponentType<SVGProps<SVGSVGElement>>
      onClick: () => void
      title?: string
      disabled?: boolean
      /** Rendered as pressed (for modes and toggles). */
      active?: boolean
      primary?: boolean
      busy?: boolean
      /** Mock-only control; the shell marks it as illustrative. */
      illustrative?: boolean
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

export interface ToolDefinition<VS = unknown> {
  /** Stable ID; used for persistence and output provenance. Never change it. */
  id: string
  name: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  category: ToolCategory
  /** Object types the tool can display. Other selections are kept and explained. */
  supportedObjectTypes: ObjectType[]
  /** The tool view, loaded on demand. */
  view: LazyExoticComponent<ComponentType>
  /** Toolbar contribution; called on every render with the current state. */
  toolbar: (ctx: ToolbarContext<VS>) => ToolbarItem[]
  initialViewState: VS
  /** Keep the view mounted (hidden) after first use, for views that are expensive to rebuild. */
  keepMounted?: boolean
}

/** Identity helper that keeps the view-state type linked across the definition. */
export function defineTool<VS>(definition: ToolDefinition<VS>): ToolDefinition<VS> {
  return definition
}
