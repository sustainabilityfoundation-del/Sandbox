import { create } from 'zustand'
import { buildModelIndex, composeSnapshot, mergeProjections, type ExternalProjection, type ModelIndex, type ModelSnapshot } from '@ews/model-service'
import type {
  ActivityEntry,
  ActivityKind,
  ActivitySource,
  Baseline,
  ModelChange,
  ObjectRevision,
  OutputRecord,
  ReviewStatus,
} from '@ews/model-service'
import type { EngineeringRepository } from '@ews/model-service'
import { broadcast, windowInfo, type DetachedViewDef } from '../session/windowSession'
import { loadMainSession, loadSession, saveSession, type SessionState } from './session'
import type { ArtifactInput, RequirementsService, ToolCommand, ViewStateUpdate } from '@ews/platform-sdk'
import { onRequirementsReset } from '@ews/requirements-client'
import { loadRequirementsProjection, requirementObject } from './requirementsProjection'
import { workspaceServices } from './services'
import { loadProductProjection } from '../projects/productProjection'
import { isLegacyProject } from '../projects/currentProject'
import { canOpenTool, toolAccess, type ToolAccess } from './entitlements'
import { toolIdOfView, type ViewMeta, type ViewPin } from './views'

/**
 * Internal workspace state. Tools never import this module; they use the SDK
 * hooks and ToolApi, which keep private view state per view instance and route
 * all engineering data through the repository interface.
 */

export interface ContextState {
  projectId: string
  configurationId: string
  scenarioId: string
  selectedIds: string[]
}

/** Drawer-based layouts (phones, tablets) and panel-based layouts (desktops) keep separate preferences. */
export type LayoutClass = 'compact' | 'spacious'

export interface Layout {
  treeOpen: boolean
  inspectorOpen: boolean
  /** Whether the bottom dock (Activity / ChatGPT) is expanded. */
  activityOpen: boolean
  dockTab: 'activity' | 'assistant'
  /** Height of the expanded bottom dock body, in pixels. */
  dockHeight: number
  treeWidth: number
  inspectorWidth: number
  /** Optional second tool view beside the main one (spacious layouts only). */
  split: { toolId: string; ratio: number } | null
}

export const DEFAULT_LAYOUTS: Record<LayoutClass, Layout> = {
  spacious: {
    treeOpen: true,
    inspectorOpen: true,
    activityOpen: true,
    dockTab: 'activity',
    dockHeight: 280,
    treeWidth: 248,
    inspectorWidth: 320,
    split: null,
  },
  compact: {
    treeOpen: false,
    inspectorOpen: false,
    activityOpen: false,
    dockTab: 'activity',
    dockHeight: 300,
    treeWidth: 320,
    inspectorWidth: 360,
    split: null,
  },
}

/** Optional provenance for writes made on behalf of another part of the workspace. */
export interface WriteOptions {
  source?: ActivitySource
  /** For assistant writes: the modules whose rules allowed the change (checked by the repository). */
  onBehalfOf?: string[]
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
  /** The twin as stored; `model` is this plus the projection of externally owned objects. */
  twinSnapshot: ModelSnapshot | null
  /** Requirements from the Requirements service, composed into `model` (contracts §10.2). */
  projection: ExternalProjection | null
  /** Why the Requirements service could not be read; nothing is substituted. */
  projectionError: string | null
  requirementsService: RequirementsService | null
  outputs: OutputRecord[]
  activity: ActivityEntry[]
  /** Baselines pinning exact revisions (configuration control). */
  baselines: Baseline[]
  pendingWrites: number
  lastWriteError: string | null

  context: ContextState
  activeToolId: string | null
  openToolIds: string[]
  favorites: string[]
  recents: string[]
  /** Private state per view instance (see views.ts). */
  viewStates: Record<string, unknown>
  scrollStates: Record<string, Record<string, number>>
  views: Record<string, ViewMeta>
  layoutClass: LayoutClass
  layouts: Record<LayoutClass, Layout>
  /** The layout for the current layout class. */
  layout: Layout
  detachedViews: DetachedViewDef[]
  initialViewStates: Record<string, unknown>

  initialize: (options: {
    repository: EngineeringRepository
    projectId: string
    tools: ToolSeed[]
    defaultOpenToolIds: string[]
    /** When given, requirements are read from this service and projected into the model. */
    requirements?: RequirementsService
  }) => Promise<void>
  /** Rereads the requirements projection (after a committed change in the Requirements service). */
  refreshRequirements: () => Promise<void>
  select: (ids: string[]) => void
  setConfiguration: (id: string) => void
  setScenario: (id: string) => void
  /** Opens a tool if the subscription includes it; returns why not otherwise. */
  activateTool: (id: string) => ToolAccess
  /** Shows an already open tab (a locked one shows its explanation, not the tool). */
  focusTab: (id: string) => void
  /** Commands registered by mounted tool views, per view instance. */
  commands: Record<string, ToolCommand[]>
  registerCommand: (viewId: string, command: ToolCommand) => () => void
  closeTool: (id: string) => void
  toggleFavorite: (id: string) => void
  setLayoutClass: (layoutClass: LayoutClass) => void
  setLayout: (patch: Partial<Layout>) => void
  setPin: (viewId: string, pin: ViewPin | null) => void
  updateViewState: (viewId: string, update: ViewStateUpdate<unknown>) => void
  setScroll: (viewId: string, key: string, top: number) => void
  rememberDetached: (def: DetachedViewDef) => void
  forgetDetached: (windowId: string) => void

  /** Rereads authoritative data after another window committed changes. */
  refreshFromRepository: (parts: ('model' | 'outputs' | 'activity' | 'baselines')[]) => Promise<void>
  /** Applies a context change made in another window, without echoing it back. */
  applyRemoteContext: (context: ContextState) => void

  submitChanges: (
    toolId: string,
    changes: ModelChange[],
    summary: string,
    options?: WriteOptions,
  ) => Promise<{ createdIds: string[]; modelRevision: number }>
  saveArtifact: (toolId: string, artifact: ArtifactInput, options?: WriteOptions) => Promise<OutputRecord>
  setReviewStatus: (toolId: string, outputId: string, status: ReviewStatus) => Promise<OutputRecord>
  log: (
    toolId: string | undefined,
    message: string,
    kind?: ActivityKind,
    objectIds?: string[],
    source?: ActivitySource,
  ) => void
  dismissWriteError: () => void
  /** One exact revision: from the Requirements service for requirements it owns, else from the twin. */
  readRevision: (id: string, revision: number) => Promise<ObjectRevision | undefined>
  /** Pins the current definition of the workspace configuration as a baseline. */
  createBaseline: (name: string, description?: string) => Promise<Baseline>
}

const MAX_RECENTS = 6
let localSeq = 0
let applyingRemoteContext = false

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A view state saved by an earlier version of a tool may lack fields the tool now expects.
 * Restore it on top of the tool's current initial view state, so missing fields get their
 * defaults and saved choices are kept.
 */
export function restoreViewState(saved: unknown, initial: unknown): unknown {
  return isPlainObject(saved) && isPlainObject(initial) ? { ...initial, ...saved } : saved
}

/** The read model: the stored twin with externally owned objects composed in. */
function composeModel(twin: ModelSnapshot, projection: ExternalProjection | null): ModelIndex {
  return buildModelIndex(composeSnapshot(twin, projection), projection?.aliases)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function restoreLayouts(session: SessionState | null): Record<LayoutClass, Layout> {
  const saved = session?.layouts ?? (session?.layout ? { spacious: session.layout } : {})
  return {
    spacious: { ...DEFAULT_LAYOUTS.spacious, ...saved.spacious },
    compact: { ...DEFAULT_LAYOUTS.compact, ...saved.compact },
  }
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

  /** Tracks pending writes for the status indicator, records failures and notifies other windows. */
  async function write<T>(
    toolId: string | undefined,
    label: string,
    parts: ('model' | 'outputs' | 'activity' | 'baselines')[],
    run: () => Promise<T>,
  ): Promise<T> {
    set((s) => ({ pendingWrites: s.pendingWrites + 1 }))
    try {
      const result = await run()
      set({ lastWriteError: null })
      refreshActivity()
      broadcast({ type: 'repository-updated', parts: [...parts, 'activity'] })
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
    twinSnapshot: null,
    projection: null,
    projectionError: null,
    requirementsService: null,
    outputs: [],
    activity: [],
    baselines: [],
    pendingWrites: 0,
    lastWriteError: null,
    context: { projectId: '', configurationId: '', scenarioId: '', selectedIds: [] },
    activeToolId: null,
    openToolIds: [],
    favorites: [],
    recents: [],
    viewStates: {},
    scrollStates: {},
    views: {},
    layoutClass: 'spacious',
    layouts: DEFAULT_LAYOUTS,
    layout: DEFAULT_LAYOUTS.spacious,
    detachedViews: [],
    initialViewStates: {},

    initialize: async ({ repository, projectId, tools, defaultOpenToolIds, requirements }) => {
      const initialViewStates = Object.fromEntries(tools.map((t) => [t.id, t.initialViewState]))
      set({ repository, status: 'loading', loadError: null, initialViewStates, requirementsService: requirements ?? null })
      try {
        const [snapshot, outputs, activity, baselines] = await Promise.all([
          repository.loadModel(projectId),
          repository.listOutputs(projectId),
          repository.listActivity(projectId),
          repository.listBaselines(projectId),
        ])
        const model = composeModel(snapshot, null)
        const loaded = loadSession()
        const restored = loaded?.context?.projectId === projectId || windowInfo.role === 'detached' ? loaded : null
        // Detached windows join the main window's session context.
        const contextSource = windowInfo.role === 'detached' ? loadMainSession() : restored
        const known = new Set(tools.map((t) => t.id))

        // Restore the previous session, discarding anything that no longer exists.
        const ctx = contextSource?.context?.projectId === projectId ? contextSource.context : undefined
        const context: ContextState = {
          projectId,
          configurationId: snapshot.configurations.some((c) => c.id === ctx?.configurationId)
            ? ctx!.configurationId
            : snapshot.configurations[0].id,
          // A new project has no scenarios yet (its twin starts empty).
          scenarioId: snapshot.scenarios.some((s) => s.id === ctx?.scenarioId) ? ctx!.scenarioId : (snapshot.scenarios[0]?.id ?? ''),
          selectedIds: (ctx?.selectedIds ?? []).filter((id) => model.get(id)),
        }
        // Restored tabs are kept even if the subscription no longer includes them (they show why);
        // a fresh session opens only the tools the subscription includes.
        const openToolIds = (restored?.openToolIds ?? defaultOpenToolIds.filter(canOpenTool)).filter((id) => known.has(id))
        const activeToolId =
          restored?.activeToolId && openToolIds.includes(restored.activeToolId)
            ? restored.activeToolId
            : (openToolIds[0] ?? null)
        const layouts = restoreLayouts(restored)

        set({
          status: 'ready',
          model,
          twinSnapshot: snapshot,
          outputs,
          activity,
          baselines,
          context,
          openToolIds,
          activeToolId,
          favorites: (restored?.favorites ?? []).filter((id) => known.has(id)),
          recents: (restored?.recents ?? []).filter((id) => known.has(id)),
          viewStates: Object.fromEntries(
            Object.entries(restored?.viewStates ?? {})
              .filter(([viewId]) => known.has(toolIdOfView(viewId)))
              .map(([viewId, saved]) => [viewId, restoreViewState(saved, initialViewStates[toolIdOfView(viewId)])]),
          ),
          scrollStates: restored?.scrollStates ?? {},
          views: restored?.views ?? {},
          layouts,
          layout: layouts[get().layoutClass],
          detachedViews: restored?.detachedViews ?? [],
        })
      } catch (error) {
        set({ status: 'error', loadError: errorMessage(error) })
        return
      }
      if (requirements) {
        await get().refreshRequirements()
        // Committed changes in the Requirements service (any window, any user) refresh the projection.
        let timer: ReturnType<typeof setTimeout> | undefined
        const refresh = () => {
          clearTimeout(timer)
          timer = setTimeout(() => void get().refreshRequirements(), 150)
        }
        requirements.subscribe(projectId, refresh)
        // After reconnecting from an event the server no longer keeps, nothing was missed only if we
        // reread everything (contract request 5; adapter hook until the SDK carries the signal).
        onRequirementsReset(requirements, projectId, refresh)
      }
    },

    refreshRequirements: async () => {
      const { requirementsService: service, twinSnapshot, context, repository } = get()
      if (!service || !twinSnapshot) return
      try {
        const legacyIds = twinSnapshot.objects.filter((o) => o.type === 'requirement').map((o) => o.id)
        // Product elements from the product registry for projects other than the example (CR-PM-MS-2).
        const projects = workspaceServices.projects
        const [requirementsProjection, productProjection] = await Promise.all([
          loadRequirementsProjection(service, context.projectId, context.configurationId, legacyIds),
          projects && !isLegacyProject(context.projectId) ? loadProductProjection(projects, context.projectId) : Promise.resolve(null),
        ])
        const projection = mergeProjections(requirementsProjection, productProjection)!
        repository?.registerExternalObjects?.(projection.objects.map((o) => ({ id: o.id, type: o.type, revision: o.revision })))
        const model = composeModel(get().twinSnapshot!, projection)
        set((s) => ({
          projection,
          projectionError: null,
          model,
          // Selections made with a legacy ID now name the canonical object.
          context: { ...s.context, selectedIds: [...new Set(s.context.selectedIds.map(model.canonical))] },
        }))
      } catch (error) {
        set({ projectionError: errorMessage(error) })
      }
    },

    select: (ids) => set((s) => ({ context: { ...s.context, selectedIds: [...new Set(s.model ? ids.map(s.model.canonical) : ids)] } })),
    setConfiguration: (configurationId) => set((s) => ({ context: { ...s.context, configurationId } })),
    setScenario: (scenarioId) => set((s) => ({ context: { ...s.context, scenarioId } })),

    activateTool: (id) => {
      // Every entry point (tabs, palette, search, ChatGPT, deep links, other tools) comes through here.
      const access = toolAccess(id)
      if (!access.ok) return access
      set((s) => ({
        activeToolId: id,
        openToolIds: s.openToolIds.includes(id) ? s.openToolIds : [...s.openToolIds, id],
        recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, MAX_RECENTS),
      }))
      return access
    },

    focusTab: (id) => set((s) => (s.openToolIds.includes(id) ? { activeToolId: id } : {})),

    commands: {},
    registerCommand: (viewId, command) => {
      set((s) => ({ commands: { ...s.commands, [viewId]: [...(s.commands[viewId] ?? []).filter((c) => c.id !== command.id), command] } }))
      return () => set((s) => ({ commands: { ...s.commands, [viewId]: (s.commands[viewId] ?? []).filter((c) => c !== command) } }))
    },

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

    setLayoutClass: (layoutClass) =>
      set((s) => (s.layoutClass === layoutClass ? {} : { layoutClass, layout: s.layouts[layoutClass] })),

    setLayout: (patch) =>
      set((s) => {
        const layout = { ...s.layouts[s.layoutClass], ...patch }
        return { layout, layouts: { ...s.layouts, [s.layoutClass]: layout } }
      }),

    setPin: (viewId, pin) => set((s) => ({ views: { ...s.views, [viewId]: { ...s.views[viewId], pin } } })),

    updateViewState: (viewId, update) =>
      set((s) => {
        const current = s.viewStates[viewId] ?? s.initialViewStates[toolIdOfView(viewId)]
        const next = typeof update === 'function' ? update(current) : { ...(current as object), ...(update as object) }
        return { viewStates: { ...s.viewStates, [viewId]: next } }
      }),

    setScroll: (viewId, key, top) =>
      set((s) => ({ scrollStates: { ...s.scrollStates, [viewId]: { ...s.scrollStates[viewId], [key]: top } } })),

    rememberDetached: (def) =>
      set((s) => ({ detachedViews: [...s.detachedViews.filter((d) => d.windowId !== def.windowId), def] })),

    forgetDetached: (windowId) => set((s) => ({ detachedViews: s.detachedViews.filter((d) => d.windowId !== windowId) })),

    refreshFromRepository: async (parts) => {
      const { repository, context, status } = get()
      if (!repository || status !== 'ready') return
      try {
        const [snapshot, outputs, activity, baselines] = await Promise.all([
          parts.includes('model') ? repository.loadModel(context.projectId) : null,
          parts.includes('outputs') ? repository.listOutputs(context.projectId) : null,
          parts.includes('activity') ? repository.listActivity(context.projectId) : null,
          parts.includes('baselines') ? repository.listBaselines(context.projectId) : null,
        ])
        set({
          ...(snapshot ? { twinSnapshot: snapshot, model: composeModel(snapshot, get().projection) } : {}),
          ...(outputs ? { outputs } : {}),
          ...(activity ? { activity } : {}),
          ...(baselines ? { baselines } : {}),
        })
      } catch {
        // The next notification or local action will retry.
      }
    },

    applyRemoteContext: (context) => {
      applyingRemoteContext = true
      try {
        const model = get().model
        set({ context: { ...context, selectedIds: context.selectedIds.filter((id) => !model || model.get(id)) } })
      } finally {
        applyingRemoteContext = false
      }
    },

    submitChanges: (toolId, changes, summary, options = {}) =>
      write(toolId, summary, ['model'], async () => {
        const { context } = get()
        const result = await repo().submitChanges(context.projectId, changes, {
          toolId,
          onBehalfOf: options.onBehalfOf,
          configurationId: options.configurationId ?? context.configurationId,
          summary,
          source: options.source,
        })
        set({ twinSnapshot: result.snapshot, model: composeModel(result.snapshot, get().projection) })
        return { createdIds: result.createdIds, modelRevision: result.modelRevision }
      }),

    saveArtifact: (toolId, output, options = {}) =>
      write(toolId, `Saving ${output.title}`, ['outputs'], async () => {
        const { context, model } = get()
        const saved = await repo().saveOutput(
          {
            ...output,
            toolId,
            projectId: context.projectId,
            configurationId: output.configurationId ?? options.configurationId ?? context.configurationId,
            scenarioId: output.scenarioId === undefined ? context.scenarioId : output.scenarioId,
            inputRevision: output.inputRevision ?? model?.revision ?? 0,
          },
          { source: options.source },
        )
        set((s) => ({ outputs: [...s.outputs.filter((o) => o.id !== saved.id), saved] }))
        return saved
      }),

    setReviewStatus: (toolId, outputId, status) =>
      write(toolId, `Review of ${outputId}`, ['outputs'], async () => {
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
        .then(() => {
          refreshActivity()
          broadcast({ type: 'repository-updated', parts: ['activity'] })
        })
        .catch(() => {
          set((s) => ({
            activity: s.activity.map((a) =>
              a.id === optimistic.id ? { ...a, message: `${a.message} (not saved to repository)` } : a,
            ),
          }))
        })
    },

    dismissWriteError: () => set({ lastWriteError: null }),

    readRevision: async (id, revision) => {
      const { repository, context, projection, requirementsService } = get()
      if (requirementsService && projection?.objects.some((o) => o.id === id)) {
        const r = await requirementsService.get(id, { projectId: context.projectId, revision }).catch(() => undefined)
        return r && { id, kind: 'object', revision: r.revision, snapshot: requirementObject(r), changedAt: r.updatedAt, changedBy: 'requirements', summary: '' }
      }
      return repository ? repository.getRevision(context.projectId, id, revision).catch(() => undefined) : undefined
    },

    createBaseline: (name, description) =>
      write('platform', `Baseline ${name}`, ['baselines'], async () => {
        const { context } = get()
        const { projection, model } = get()
        // Requirements live in the Requirements service: pin their exact revisions too.
        const external = projection && model
          ? { objects: projection.objects.map((o) => ({ id: o.id, revision: o.revision })), replaces: [...projection.aliases.keys()], relationships: [...model.relationships] }
          : undefined
        const baseline = await repo().createBaseline(context.projectId, { name, description, configurationId: context.configurationId, external }, { toolId: 'platform' })
        set((s) => ({ baselines: [...s.baselines.filter((b) => b.id !== baseline.id), baseline] }))
        return baseline
      }),
  }
})

// Share context changes made in this window with the other workspace windows.
useWorkspaceStore.subscribe((state, previous) => {
  if (state.status !== 'ready' || state.context === previous.context || applyingRemoteContext) return
  if (previous.status !== 'ready') return
  broadcast({ type: 'context', context: state.context })
})

// Persist the session (context, open tools, per-view state, layouts) so a reload
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
    layouts: state.layouts,
    views: state.views,
    detachedViews: state.detachedViews,
  }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSession, 150)
})

// Don't lose the last few changes if the page is closed or reloaded mid-debounce.
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushSession)
