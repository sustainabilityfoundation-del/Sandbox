import type { PlatformServices } from '../contract/requirements'
import {
  DemoRepository,
  PROJECT_ID,
  buildModelIndex,
  browserStorage,
  type ActivityEntry,
  type Baseline,
  type ModelIndex,
  type OutputRecord,
} from '@ews/model-service'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { PlatformHost } from '../contract/host'
import type { SharedContext, ToolApi, ToolCommand, ViewStateUpdate } from '../contract/tool'
import type { AnyToolDefinition } from '../react/defineTool'

export interface MockState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  model: ModelIndex | null
  artifacts: OutputRecord[]
  activity: ActivityEntry[]
  baselines: Baseline[]
  context: { projectId: string; configurationId: string; scenarioId: string; selectedIds: string[] }
  viewStates: Record<string, unknown>
  scroll: Record<string, number>
  commands: Record<string, ToolCommand[]>
  /** Requests to open other tools; the harness hosts only one. */
  openRequests: string[]
}

export interface MockHost extends PlatformHost {
  readonly store: StoreApi<MockState>
  readonly repository: DemoRepository
  load: () => Promise<void>
  resetSampleData: () => Promise<void>
  setConfiguration: (id: string) => void
  setScenario: (id: string) => void
}

/**
 * A mock platform host for developing a tool on its own. It runs the same
 * demo repository and sample digital twin as the workspace, in a separate
 * storage key, with no shell, subscriptions or windows. Everything a tool can
 * do through the SDK works here the same way.
 */
export interface MockHostOptions {
  storageKey?: string
  latencyMs?: [number, number]
  /** Platform services the harness provides (SDK 1.2), e.g. a Requirements service adapter. */
  services?: PlatformServices
}

export function createMockHost(tool: AnyToolDefinition, options: MockHostOptions = {}): MockHost {
  const services: PlatformServices = options.services ?? {}
  const repository = new DemoRepository({
    storage: browserStorage(),
    storageKey: options.storageKey ?? `ews.harness.${tool.id}.v1`,
    legacyStorageKey: null,
    latencyMs: options.latencyMs ?? [60, 160],
  })
  const store = createStore<MockState>()(() => ({
    status: 'loading',
    error: null,
    model: null,
    artifacts: [],
    activity: [],
    baselines: [],
    context: { projectId: PROJECT_ID, configurationId: '', scenarioId: '', selectedIds: [] },
    viewStates: {},
    scroll: {},
    commands: {},
    openRequests: [],
  }))
  const get = store.getState
  const set = store.setState

  async function reload(parts: ('model' | 'artifacts' | 'activity')[] = ['model', 'artifacts', 'activity']) {
    const [snapshot, artifacts, activity, baselines] = await Promise.all([
      parts.includes('model') ? repository.loadModel(PROJECT_ID) : null,
      parts.includes('artifacts') ? repository.listOutputs(PROJECT_ID) : null,
      parts.includes('activity') ? repository.listActivity(PROJECT_ID) : null,
      parts.includes('model') ? repository.listBaselines(PROJECT_ID) : null,
    ])
    set({
      ...(snapshot ? { model: buildModelIndex(snapshot) } : {}),
      ...(artifacts ? { artifacts } : {}),
      ...(activity ? { activity } : {}),
      ...(baselines ? { baselines } : {}),
    })
  }

  const contexts = new Map<string, { key: string; value: SharedContext }>()
  function getContext(viewId: string): SharedContext {
    const { context, model } = get()
    const key = `${context.configurationId}|${context.scenarioId}|${context.selectedIds.join(',')}|${model?.revision}`
    const cached = contexts.get(viewId)
    if (cached?.key === key) return cached.value
    const value: SharedContext = {
      ...context,
      modelRevision: model?.revision ?? 0,
      pinned: false,
      workspaceConfigurationId: context.configurationId,
    }
    contexts.set(viewId, { key, value })
    return value
  }

  const apis = new Map<string, ToolApi<unknown>>()
  function getToolApi(toolId: string, viewId: string): ToolApi<unknown> {
    let api = apis.get(viewId)
    if (api) return api
    const model = () => {
      const m = get().model
      if (!m) throw new Error('Model not loaded')
      return m
    }
    api = {
      toolId,
      viewId,
      services,
      getContext: () => getContext(viewId),
      getModel: model,
      select: (ids) => host.select(ids, viewId),
      setScenario: (id) => host.setScenario(id),
      submitChanges: async (changes, summary, opts = {}) => {
        const result = await repository.submitChanges(PROJECT_ID, changes, {
          toolId,
          configurationId: opts.configurationId ?? get().context.configurationId,
          summary,
          source: opts.source,
        })
        set({ model: buildModelIndex(result.snapshot) })
        await reload(['activity'])
        return { createdIds: result.createdIds, modelRevision: result.modelRevision }
      },
      saveArtifact: async (artifact, opts = {}) => {
        const { context } = get()
        const saved = await repository.saveOutput(
          {
            ...artifact,
            toolId,
            projectId: context.projectId,
            configurationId: artifact.configurationId ?? opts.configurationId ?? context.configurationId,
            scenarioId: artifact.scenarioId === undefined ? context.scenarioId : artifact.scenarioId,
            inputRevision: artifact.inputRevision ?? model().revision,
          },
          { source: opts.source },
        )
        await reload(['artifacts', 'activity'])
        return saved
      },
      getArtifacts: (filter = {}) =>
        get()
          .artifacts.filter(
            (o) =>
              o.configurationId === get().context.configurationId &&
              (!filter.objectId || o.objectIds.includes(filter.objectId)) &&
              (!filter.toolId || o.toolId === filter.toolId) &&
              (!filter.kind || o.kind === filter.kind),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      setReviewStatus: async (id, status) => {
        const updated = await repository.setReviewStatus(id, status, {
          toolId,
          configurationId: get().context.configurationId,
          summary: `${id} review status set to ${status}`,
        })
        await reload(['artifacts', 'activity'])
        return updated
      },
      getActivity: (objectId) => (objectId ? get().activity.filter((a) => a.objectIds.includes(objectId)) : get().activity),
      log: (message, opts = {}) => {
        void repository
          .addActivity(PROJECT_ID, { kind: opts.kind ?? 'info', toolId, message, objectIds: opts.objectIds ?? [], source: opts.source })
          .then(() => reload(['activity']))
      },
      getObjectRevision: (id, revision) => repository.getRevision(PROJECT_ID, id, revision).catch(() => undefined),
      getBaselines: () => get().baselines,
      registerCommand: (command) => {
        set((s) => ({ commands: { ...s.commands, [viewId]: [...(s.commands[viewId] ?? []).filter((c) => c.id !== command.id), command] } }))
        return () => set((s) => ({ commands: { ...s.commands, [viewId]: (s.commands[viewId] ?? []).filter((c) => c !== command) } }))
      },
      openTool: (id) => {
        if (id === toolId) return { ok: true }
        set((s) => ({ openRequests: [id, ...s.openRequests].slice(0, 5) }))
        return { ok: false, reason: `The standalone harness hosts only ${tool.name}. In the workspace this would open “${id}”.` }
      },
      getViewState: () => host.getViewState(viewId, toolId),
      updateViewState: (update) => host.updateViewState(viewId, toolId, update),
    }
    apis.set(viewId, api)
    return api
  }

  const host: MockHost = {
    kind: 'harness',
    store,
    repository,
    subscribe: (listener) => store.subscribe(listener),
    getModel: () => get().model,
    getArtifacts: () => get().artifacts,
    getServices: () => services,
    getActivity: () => get().activity,
    getBaselines: () => get().baselines,
    getContext,
    select: (ids) => set((s) => ({ context: { ...s.context, selectedIds: [...new Set(ids)] } })),
    getViewState: (viewId) => get().viewStates[viewId] ?? tool.initialViewState,
    updateViewState: (viewId, _toolId, update: ViewStateUpdate<unknown>) =>
      set((s) => {
        const current = s.viewStates[viewId] ?? tool.initialViewState
        const next = typeof update === 'function' ? update(current) : { ...(current as object), ...(update as object) }
        return { viewStates: { ...s.viewStates, [viewId]: next } }
      }),
    getScroll: (viewId, key) => get().scroll[`${viewId}:${key}`],
    setScroll: (viewId, key, top) => set((s) => ({ scroll: { ...s.scroll, [`${viewId}:${key}`]: top } })),
    getToolApi,
    load: async () => {
      try {
        await reload()
        const snapshot = get().model!.snapshot
        set((s) => ({
          status: 'ready',
          context: {
            ...s.context,
            configurationId: s.context.configurationId || snapshot.configurations[0].id,
            scenarioId: s.context.scenarioId || snapshot.scenarios[0].id,
          },
        }))
      } catch (error) {
        set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    },
    resetSampleData: async () => {
      await repository.reset()
      set((s) => ({ context: { ...s.context, selectedIds: [] } }))
      await reload()
    },
    setConfiguration: (configurationId) => set((s) => ({ context: { ...s.context, configurationId } })),
    setScenario: (scenarioId) => set((s) => ({ context: { ...s.context, scenarioId } })),
  }
  return host
}
