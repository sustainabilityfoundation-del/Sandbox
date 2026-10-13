import type { ComponentType, LazyExoticComponent } from 'react'
import type { AssistantContribution } from '../contract/assistant'
import type { ToolManifest, ToolbarContext, ToolbarItem } from '../contract/tool'

/**
 * Everything a tool contributes to the platform. The manifest fields are plain
 * data; `view` is loaded on first use.
 */
export interface ToolDefinition<VS = unknown> extends ToolManifest {
  /** The tool view, loaded on demand (React.lazy). */
  view: LazyExoticComponent<ComponentType>
  /** Initial private state of each new view instance. */
  initialViewState: VS
  /** Toolbar contribution; called on every render with the current state. */
  toolbar: (ctx: ToolbarContext<VS>) => ToolbarItem[]
  /** Operations ChatGPT may request for this tool; executed and validated by the platform. */
  assistant?: AssistantContribution
  /** Keep the view mounted (hidden) after first use, for views that are expensive to rebuild. */
  keepMounted?: boolean
  /** Only one instance per window (excludes the tool from the split pane). */
  singleInstance?: boolean
}

/** Identity helper that keeps the view-state type linked across the definition. */
export function defineTool<VS>(definition: ToolDefinition<VS>): ToolDefinition<VS> {
  return definition
}

/** A tool definition of any view-state type, as hosts and registries store them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any>
