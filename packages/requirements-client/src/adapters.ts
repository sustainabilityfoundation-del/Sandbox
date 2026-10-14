import {
  REQUIREMENTS_CONTRACT_VERSION,
  RequirementsServiceError,
  type Page,
  type RequirementCreateInput,
  type RequirementPatch,
  type RequirementSummary,
  type RequirementTraceLink,
  type RequirementWriteOptions,
  type RequirementsEvent,
  type RequirementsQuery,
  type RequirementsReadScope,
  type RequirementsService,
} from '@ews/platform-sdk'
import { RequirementsModuleClient } from './module'
import { HttpTransport, RequirementsApiError, newIdempotencyKey, type HttpConfig } from './transport'
import type { Requirement } from './types'

export function toSummary(r: Requirement): RequirementSummary {
  return {
    id: r.id,
    key: r.key,
    projectId: r.projectId,
    revision: r.revision,
    title: r.title,
    statement: r.statement,
    type: r.type,
    status: r.status,
    archived: r.archived,
    applicability: r.applicability,
    verificationMethods: r.verificationMethods,
    updatedAt: r.updatedAt,
  }
}

const modules = new WeakMap<RequirementsService, (projectId: string) => RequirementsModuleClient>()

/**
 * The module's full client behind an SDK service created by this package, or undefined (for the
 * demo adapter and foreign adapters). Only the Requirements tool uses it; other modules use the
 * SDK contract.
 */
export function getModuleClient(service: RequirementsService | undefined, projectId: string): RequirementsModuleClient | undefined {
  return service ? modules.get(service)?.(projectId) : undefined
}

export interface HttpServiceConfig extends HttpConfig {
  /** Delay before reconnecting the event stream (ms). */
  retryMs?: number
  onStreamStatus?: (projectId: string, status: 'connecting' | 'open' | 'retrying', error?: string) => void
  /**
   * Called when the server cannot resume the event stream (the last seen event was purged after the
   * retention window, or is unknown): events may have been missed, so reread everything.
   */
  onReset?: (projectId: string) => void
}

const resetListeners = new WeakMap<RequirementsService, Map<string, Set<() => void>>>()

/**
 * Registers a callback for stream resets of an HTTP service created by this package (the SDK
 * `subscribe()` has no reset signal; contract change request 5). Returns an unsubscribe function;
 * a no-op for other adapters.
 */
export function onRequirementsReset(service: RequirementsService | undefined, projectId: string, callback: () => void): () => void {
  const byProject = service ? resetListeners.get(service) : undefined
  if (!byProject) return () => undefined
  const set = byProject.get(projectId) ?? new Set()
  set.add(callback)
  byProject.set(projectId, set)
  return () => set.delete(callback)
}

/** SDK `RequirementsService` over the PostgreSQL-backed HTTP API (mode 'api'). Failures are thrown, never replaced by demo data. */
export function createHttpRequirementsService(config: HttpServiceConfig): RequirementsService {
  const clients = new Map<string, RequirementsModuleClient>()
  const client = (projectId: string) => {
    let c = clients.get(projectId)
    if (!c) clients.set(projectId, (c = new RequirementsModuleClient(config, projectId)))
    return c
  }
  const notFoundToUndefined = async <T>(p: Promise<T>): Promise<T | undefined> => {
    try {
      return await p
    } catch (e) {
      if (e instanceof RequirementsServiceError && e.code === 'not-found') return undefined
      throw e
    }
  }
  const root = new HttpTransport(config)
  const projectOf = new Map<string, string>()
  const remember = (r: Requirement): RequirementSummary => {
    projectOf.set(r.id, r.projectId)
    return toSummary(r)
  }
  const streams = new Map<string, { listeners: Set<(e: RequirementsEvent) => void>; close: () => void }>()

  const service: RequirementsService = {
    contractVersion: REQUIREMENTS_CONTRACT_VERSION,
    mode: 'api',
    async get(id, scope) {
      const r = await notFoundToUndefined(client(scope.projectId).getRequirement(id, { revision: scope.revision, baselineId: scope.baselineId }))
      if (r && scope.configurationId && r.applicability.length && !r.applicability.includes(scope.configurationId)) return undefined
      return r && remember(r)
    },
    async resolve(keyOrLegacyId, scope) {
      const r = await notFoundToUndefined(client(scope.projectId).resolve(keyOrLegacyId, { baselineId: scope.baselineId, configurationId: scope.configurationId }))
      return r && remember(r)
    },
    async list(q: RequirementsQuery): Promise<Page<RequirementSummary>> {
      const page = await client(q.projectId).list({
        ids: q.ids,
        keys: q.keys,
        text: q.text,
        status: q.status,
        includeArchived: q.includeArchived,
        configurationId: q.configurationId,
        baselineId: q.baselineId,
        cursor: q.cursor,
        limit: q.limit,
      })
      return { items: page.items.map(remember), nextCursor: page.nextCursor, total: page.total }
    },
    async create(input: RequirementCreateInput, options) {
      if (!options?.idempotencyKey) throw new RequirementsServiceError('invalid', 'create needs an idempotencyKey so a retry cannot create a duplicate.')
      const { projectId, ...body } = input
      return remember(await client(projectId).create({ ...body, reason: options.reason }, options.idempotencyKey))
    },
    async update(id, patch: RequirementPatch, options: RequirementWriteOptions) {
      // SDK 1.3: use options.projectId when given (no lookup); else the project this adapter has seen
      // the ID in; else look it up.
      const projectId = options.projectId ?? projectOf.get(id) ?? (await root.request<Requirement>('GET', `/requirements/${encodeURIComponent(id)}`)).data.projectId
      return remember(await client(projectId).update(id, patch, { expectedRevision: options.expectedRevision, reason: options.reason, idempotencyKey: options.idempotencyKey }))
    },
    async traceLinks(id, scope: RequirementsReadScope): Promise<RequirementTraceLink[]> {
      return client(scope.projectId).transport.request<RequirementTraceLink[]>('GET', `/projects/${encodeURIComponent(scope.projectId)}/requirements/${id}/trace-links`, { query: { baselineId: scope.baselineId, configurationId: scope.configurationId } }).then((r) => r.data)
    },
    subscribe(projectId, listener) {
      let entry = streams.get(projectId)
      if (!entry) {
        const listeners = new Set<(e: RequirementsEvent) => void>()
        const handle = client(projectId).events({
          onEvent: (e) => listeners.forEach((l) => l(e)),
          onReset: () => {
            config.onReset?.(projectId)
            resetListeners.get(service)?.get(projectId)?.forEach((cb) => cb())
          },
          onStatus: (s, err) => config.onStreamStatus?.(projectId, s, err),
        })
        entry = { listeners, close: handle.close }
        streams.set(projectId, entry)
      }
      entry.listeners.add(listener)
      return () => {
        entry!.listeners.delete(listener)
        if (!entry!.listeners.size) {
          entry!.close()
          streams.delete(projectId)
        }
      }
    },
  }
  modules.set(service, client)
  resetListeners.set(service, new Map())
  return service
}

export { RequirementsApiError, newIdempotencyKey }
