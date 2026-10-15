import type { ComponentType, LazyExoticComponent } from 'react'
import type { AssistantContribution } from '../contract/assistant'
import type { HelpManifest } from '../contract/help'
import type { SettingsContribution } from '../contract/settings'
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
  /**
   * Help manifest (SDK 1.4): topics, contextual mappings, tutorials, shortcuts and API references,
   * built from Markdown in the tool's `help/` folder. Required by the definition of done (AGENTS.md).
   */
  help?: HelpManifest
  /**
   * Settings (SDK 1.6): typed definitions the platform renders as this module's page in the Settings
   * centre. Values are stored and validated by the settings service; read them with useSetting(id).
   */
  settings?: SettingsContribution
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
