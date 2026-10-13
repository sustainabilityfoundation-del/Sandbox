import { create } from 'zustand'
import { buildModelIndex, type ModelIndex } from '../domain/modelIndex'
import type {
  ActivityEntry,
  ActivityKind,
  ActivitySource,
  ModelChange,
  OutputRecord,
  ReviewStatus,
} from '../domain/types'
import type { EngineeringRepository } from '../repository/EngineeringRepository'
import { loadSession, saveSession, type SessionState } from './session'
import type { OutputInput, ViewStateUpdate } from './toolTypes'

/**
 * Internal workspace state. Tools never import this module; they use the SDK
 * hooks and ToolApi, which keeps private view state per tool and routes all
 * engineering data through the repository interface.
 */

export interface ContextState {
  projectId: string
  configurationId: string
  scenarioId: string
  selectedIds: string[]
}

export interface Layout {
  treeOpen: boolean
  inspectorOpen: boolean
  /** Whether the bottom dock (Activity / ChatGPT) is expanded. */
  activityOpen: boolean
  dockTab: 'activity' | 'assistant'
  /** Height of the expanded bottom dock body, in pixels. */
  dockHeight: number
}

/** Optional provenance for writes made on behalf of another part of the workspace. */
export interface WriteOptions {
  source?: ActivitySource
  /** Configuration to record against, when it was captured earlier (e.g. at message send). */
  configurationId?: string
}

interface ToolSeed {
  id: string
  initialViewState: unknown
}

interface WorkspaceState {
  repository: EngineeringRepository | null
  status: 'loading' | 'ready' | 'error'
  loadError: string | null
  model: ModelIndex | null
  outputs: OutputRecord[]
  activity: ActivityEntry[]
  pendingWrites: number
  lastWriteError: string | null

  context: ContextState
  activeToolId: string | null
  openToolIds: string[]
  favorites: string[]
  recents: string[]
  viewStates: Record<string, unknown>
  scrollStates: Record<string, Record<string, number>>
  layout: Layout
  initialViewStates: Record<string, unknown>

  initialize: (options: {
    repository: EngineeringRepository
    projectId: string
    tools: ToolSeed[]
    defaultOpenToolIds: string[]
  }) => Promise<void>
  select: (ids: string[]) => void
  setConfiguration: (id: string) => void
  setScenario: (id: string) => void
  activateTool: (id: string) => void
  closeTool: (id: string) => void
  toggleFavorite: (id: string) => void
  setLayout: (patch: Partial<Layout>) => void
  updateViewState: (toolId: string, update: ViewStateUpdate<unknown>) => void
  setScroll: (toolId: string, key: string, top: number) => void

  submitChanges: (
    toolId: string,
    changes: ModelChange[],
    summary: string,
    options?: WriteOptions,
  ) => Promise<{ createdIds: string[]; modelRevision: number }>
  saveOutput: (toolId: string, output: OutputInput, options?: WriteOptions) => Promise<OutputRecord>
  setReviewStatus: (toolId: string, outputId: string, status: ReviewStatus) => Promise<OutputRecord>
  log: (
    toolId: string | undefined,
    message: string,
    kind?: ActivityKind,
    objectIds?: string[],
    source?: ActivitySource,
  ) => void
  dismissWriteError: () => void
}

const MAX_RECENTS = 6
let localSeq = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  function repo(): EngineeringRepository {
    const repository = get().repository
    if (!repository) throw new Error('Workspace not initialised')
    return repository
  }

  function localActivity(message: string, kind: ActivityKind, toolId?: string): ActivityEntry {
    return {
      id: `local-${++localSeq}`,
      at: new Date().toISOString(),
      kind,
      toolId,
      message,
      objectIds: [],
    }
  }

  function refreshActivity() {
    repo()
      .listActivity(get().context.projectId)
      .then((activity) => set({ activity }))
      .catch(() => undefined)
  }

  /** Tracks pending writes for the status indicator and records failures. */
  async function write<T>(toolId: string | undefined, label: string, run: () => Promise<T>): Promise<T> {
    set((s) => ({ pendingWrites: s.pendingWrites + 1 }))
    try {
      const result = await run()
      set({ lastWriteError: null })
      refreshActivity()
      return result
    } catch (error) {
      const message = `${label} failed: ${errorMessage(error)}`
      set((s) => ({ lastWriteError: message, activity: [localActivity(message, 'error', toolId), ...s.activity] }))
      throw error
    } finally {
      set((s) => ({ pendingWrites: s.pendingWrites - 1 }))
    }
  }

  return {
    repository: null,
    status: 'loading',
    loadError: null,
    model: null,
    outputs: [],
    activity: [],
    pendingWrites: 0,
    lastWriteError: null,
    context: { projectId: '', configurationId: '', scenarioId: '', selectedIds: [] },
    activeToolId: null,
    openToolIds: [],
    favorites: [],
    recents: [],
    viewStates: {},
    scrollStates: {},
    layout: { treeOpen: true, inspectorOpen: true, activityOpen: true, dockTab: 'activity', dockHeight: 280 },
    initialViewStates: {},

    initialize: async ({ repository, projectId, tools, defaultOpenToolIds }) => {
      const initialViewStates = Object.fromEntries(tools.map((t) => [t.id, t.initialViewState]))
      set({ repository, status: 'loading', loadError: null, initialViewStates })
      try {
        const [snapshot, outputs, activity] = await Promise.all([
          repository.loadModel(projectId),
          repository.listOutputs(projectId),
          repository.listActivity(projectId),
        ])
        const model = buildModelIndex(snapshot)
        const session = loadSession()
        const known = new Set(tools.map((t) => t.id))
        const restoredSession = session?.context.projectId === projectId ? session : null

        // Restore the previous session, discarding anything that no longer exists.
        const ctx = restoredSession?.context
        const context: ContextState = {
          projectId,
          configurationId: snapshot.configurations.some((c) => c.id === ctx?.configurationId)
            ? ctx!.configurationId
            : snapshot.configurations[0].id,
          scenarioId: snapshot.scenarios.some((s) => s.id === ctx?.scenarioId)
            ? ctx!.scenarioId
            : snapshot.scenarios[0].id,
          selectedIds: (ctx?.selectedIds ?? []).filter((id) => model.get(id)),
        }
        const openToolIds = (restoredSession?.openToolIds ?? defaultOpenToolIds).filter((id) => known.has(id))
        const activeToolId =
          restoredSession?.activeToolId && openToolIds.includes(restoredSession.activeToolId)
            ? restoredSession.activeToolId
            : (openToolIds[0] ?? null)

        set({
          status: 'ready',
          model,
          outputs,
          activity,
          context,
          openToolIds,
          activeToolId,
          favorites: (restoredSession?.favorites ?? []).filter((id) => known.has(id)),
          recents: (restoredSession?.recents ?? []).filter((id) => known.has(id)),
          viewStates: Object.fromEntries(
            Object.entries(restoredSession?.viewStates ?? {}).filter(([id]) => known.has(id)),
          ),
          scrollStates: restoredSession?.scrollStates ?? {},
          layout: { ...get().layout, ...restoredSession?.layout },
        })
      } catch (error) {
        set({ status: 'error', loadError: errorMessage(error) })
      }
    },

    select: (ids) => set((s) => ({ context: { ...s.context, selectedIds: [...new Set(ids)] } })),
    setConfiguration: (configurationId) => set((s) => ({ context: { ...s.context, configurationId } })),
    setScenario: (scenarioId) => set((s) => ({ context: { ...s.context, scenarioId } })),

    activateTool: (id) =>
      set((s) => ({
        activeToolId: id,
        openToolIds: s.openToolIds.includes(id) ? s.openToolIds : [...s.openToolIds, id],
        recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, MAX_RECENTS),
      })),

    closeTool: (id) =>
      set((s) => {
        const index = s.openToolIds.indexOf(id)
        const openToolIds = s.openToolIds.filter((t) => t !== id)
        const activeToolId =
          s.activeToolId === id ? (openToolIds[Math.min(index, openToolIds.length - 1)] ?? null) : s.activeToolId
        return { openToolIds, activeToolId }
      }),

    toggleFavorite: (id) =>
      set((s) => ({
        favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id],
      })),

    setLayout: (patch) => set((s) => ({ layout: { ...s.layout, ...patch } })),

    updateViewState: (toolId, update) =>
      set((s) => {
        const current = s.viewStates[toolId] ?? s.initialViewStates[toolId]
        const next =
          typeof update === 'function'
            ? update(current)
            : { ...(current as object), ...(update as object) }
        return { viewStates: { ...s.viewStates, [toolId]: next } }
      }),

    setScroll: (toolId, key, top) =>
      set((s) => ({ scrollStates: { ...s.scrollStates, [toolId]: { ...s.scrollStates[toolId], [key]: top } } })),

    submitChanges: (toolId, changes, summary, options = {}) =>
      write(toolId, summary, async () => {
        const { context } = get()
        const result = await repo().submitChanges(context.projectId, changes, {
          toolId,
          configurationId: options.configurationId ?? context.configurationId,
          summary,
          source: options.source,
        })
        set({ model: buildModelIndex(result.snapshot) })
        return { createdIds: result.createdIds, modelRevision: result.modelRevision }
      }),

    saveOutput: (toolId, output, options = {}) =>
      write(toolId, `Saving ${output.title}`, async () => {
        const { context, model } = get()
        const saved = await repo().saveOutput(
          {
            ...output,
            toolId,
            projectId: context.projectId,
            configurationId: output.configurationId ?? context.configurationId,
            scenarioId: output.scenarioId === undefined ? context.scenarioId : output.scenarioId,
            inputRevision: output.inputRevision ?? model?.revision ?? 0,
          },
          { source: options.source },
        )
        set((s) => ({ outputs: [...s.outputs, saved] }))
        return saved
      }),

    setReviewStatus: (toolId, outputId, status) =>
      write(toolId, `Review of ${outputId}`, async () => {
        const { context } = get()
        const updated = await repo().setReviewStatus(outputId, status, {
          toolId,
          configurationId: context.configurationId,
          summary: `${outputId} review status set to ${status}`,
        })
        set((s) => ({ outputs: s.outputs.map((o) => (o.id === outputId ? updated : o)) }))
        return updated
      }),

    log: (toolId, message, kind = 'info', objectIds = [], source) => {
      const { context } = get()
      const optimistic = { ...localActivity(message, kind, toolId), objectIds, source }
      set((s) => ({ activity: [optimistic, ...s.activity] }))
      repo()
        .addActivity(context.projectId, {
          kind,
          toolId,
          message,
          objectIds,
          configurationId: context.configurationId,
          scenarioId: context.scenarioId,
          source,
        })
        .then(refreshActivity)
        .catch(() => {
          set((s) => ({
            activity: s.activity.map((a) =>
              a.id === optimistic.id ? { ...a, message: `${a.message} (not saved to repository)` } : a,
            ),
          }))
        })
    },

    dismissWriteError: () => set({ lastWriteError: null }),
  }
})

// Persist the session (context, open tools, per-tool view state) so a reload
// returns to the same place. Engineering data lives in the repository, not here.
let saveTimer: ReturnType<typeof setTimeout> | undefined
let pendingSession: SessionState | null = null

function flushSession() {
  clearTimeout(saveTimer)
  if (pendingSession) saveSession(pendingSession)
  pendingSession = null
}

useWorkspaceStore.subscribe((state) => {
  if (state.status !== 'ready') return
  pendingSession = {
    context: state.context,
    activeToolId: state.activeToolId,
    openToolIds: state.openToolIds,
    favorites: state.favorites,
    recents: state.recents,
    viewStates: state.viewStates,
    scrollStates: state.scrollStates,
    layout: state.layout,
  }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSession, 150)
})

// Don't lose the last few changes if the page is closed or reloaded mid-debounce.
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushSession)
