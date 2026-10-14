import type { ActivityEntry, Baseline, ModelIndex, OutputRecord } from '@ews/model-service'
import type { PlatformServices } from './requirements'
import type { SharedContext, ToolApi, ViewStateUpdate } from './tool'

/**
 * What a platform host provides to tool views. The workspace implements it
 * over its store; the standalone harness implements it with a mock host and
 * sample data. Tools never see which one they run in.
 *
 * Snapshot getters must return the same object while nothing changed, so
 * React can compare them cheaply.
 */
export interface PlatformHost {
  readonly kind: 'workspace' | 'harness'
  /** Called on every change of any value below. */
  subscribe: (listener: () => void) => () => void
  getModel: () => ModelIndex | null
  getArtifacts: () => OutputRecord[]
  getActivity: () => ActivityEntry[]
  /** Platform services (SDK 1.2); the same object while nothing changed. */
  getServices: () => PlatformServices
  /** Baselines (SDK 1.1). */
  getBaselines: () => Baseline[]
  /** Context as a view sees it; pass "" for the workspace context. */
  getContext: (viewId: string) => SharedContext
  /** Selects objects for a view (its pin, if pinned) or for the workspace (""). */
  select: (ids: string[], viewId: string) => void
  getViewState: (viewId: string, toolId: string) => unknown
  updateViewState: (viewId: string, toolId: string, update: ViewStateUpdate<unknown>) => void
  getScroll: (viewId: string, key: string) => number | undefined
  setScroll: (viewId: string, key: string, top: number) => void
  getToolApi: (toolId: string, viewId: string) => ToolApi<unknown>
}
