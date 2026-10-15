import {
  CONCEPTS_CONTRACT_VERSION,
  ConceptsServiceError,
  type ArtifactRef,
  type ConceptImplementationSummary,
  type ConceptPage,
  type ConceptSummary,
  type ConceptsEvent,
  type ConceptsQuery,
  type ConceptsService,
} from '@ews/platform-sdk'
import { ConceptsModuleClient } from './module'
import { ConceptsApiError, newIdempotencyKey, type HttpConfig } from './transport'
import type { Concept, ConceptListItem, Implementation } from './types'

export function toSummary(c: Concept | ConceptListItem): ConceptSummary {
  return {
    id: c.id,
    key: c.key,
    projectId: c.projectId,
    revision: c.revision,
    name: c.name,
    summary: c.summary,
    abstraction: c.abstraction,
    classifications: c.classifications,
    maturity: c.maturity,
    updatedAt: c.updatedAt,
  }
}

export function toImplementationSummary(i: Implementation): ConceptImplementationSummary {
  return {
    id: i.id,
    name: i.name,
    conceptIds: i.conceptIds,
    status: i.status,
    artifacts: i.artifacts.filter((a) => !a.removed).map((a) => ({ module: a.module, id: a.artifactId, ...(a.revision ? { revision: a.revision } : {}), ...(a.kind ? { kind: a.kind } : {}) })),
    updatedAt: i.updatedAt,
  }
}

const modules = new WeakMap<ConceptsService, (projectId: string) => ConceptsModuleClient>()
const resetListeners = new WeakMap<ConceptsService, Map<string, Set<() => void>>>()

/**
 * The module's full client behind an SDK service created by this package, or undefined (demo and
 * foreign adapters). Only the Conceptualize tool uses it; other modules use the SDK contract.
 */
export function getConceptsModuleClient(service: ConceptsService | undefined, projectId: string): ConceptsModuleClient | undefined {
  return service ? modules.get(service)?.(projectId) : undefined
}

/** Registers a callback for stream resets (events may have been missed: reread everything). No-op for other adapters. */
export function onConceptsReset(service: ConceptsService | undefined, projectId: string, callback: () => void): () => void {
  const byProject = service ? resetListeners.get(service) : undefined
  if (!byProject) return () => undefined
  const set = byProject.get(projectId) ?? new Set()
  set.add(callback)
  byProject.set(projectId, set)
  return () => set.delete(callback)
}

export interface HttpServiceConfig extends HttpConfig {
  retryMs?: number
  onStreamStatus?: (projectId: string, status: 'connecting' | 'open' | 'retrying', error?: string) => void
  onReset?: (projectId: string) => void
}

/** SDK `ConceptsService` over the PostgreSQL-backed HTTP API (mode 'api'). Failures are thrown, never replaced by demo data. */
export function createHttpConceptsService(config: HttpServiceConfig): ConceptsService {
  const clients = new Map<string, ConceptsModuleClient>()
  const client = (projectId: string) => {
    let c = clients.get(projectId)
    if (!c) clients.set(projectId, (c = new ConceptsModuleClient(config, projectId)))
    return c
  }
  const notFoundToUndefined = async <T>(p: Promise<T>): Promise<T | undefined> => {
    try {
      return await p
    } catch (e) {
      if (e instanceof ConceptsServiceError && e.code === 'not-found') return undefined
      throw e
    }
  }
  const streams = new Map<string, { listeners: Set<(e: ConceptsEvent) => void>; close: () => void }>()

  const service: ConceptsService = {
    contractVersion: CONCEPTS_CONTRACT_VERSION,
    mode: 'api',
    async get(id, scope) {
      const c = await notFoundToUndefined(client(scope.projectId).concept(id, scope.revision))
      return c && toSummary(c)
    },
    async list(q: ConceptsQuery): Promise<ConceptPage> {
      const page = await client(q.projectId).list({ ids: q.ids, text: q.text, maturity: q.maturity, cursor: q.cursor, limit: q.limit, includeArchived: q.maturity?.some((m) => m === 'archived' || m === 'superseded') })
      return { items: page.items.map(toSummary), nextCursor: page.nextCursor, total: page.total }
    },
    async conceptsForArtifact(artifact: ArtifactRef, scope) {
      const res = await client(scope.projectId).artifactConcepts(artifact.module, artifact.id)
      return res.implementations.map((x) => ({ concept: toSummary(x.concept), implementation: toImplementationSummary(x.implementation) }))
    },
    async implementations(conceptId, scope) {
      const list = await client(scope.projectId).implementations(conceptId)
      return list.map(toImplementationSummary)
    },
    subscribe(projectId, listener) {
      let entry = streams.get(projectId)
      if (!entry) {
        const listeners = new Set<(e: ConceptsEvent) => void>()
        const handle = client(projectId).events(
          {
            onEvent: (e) => listeners.forEach((l) => l(e)),
            onReset: () => {
              config.onReset?.(projectId)
              resetListeners.get(service)?.get(projectId)?.forEach((cb) => cb())
            },
            onStatus: (s, err) => config.onStreamStatus?.(projectId, s, err),
          },
          { retryMs: config.retryMs },
        )
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

export { ConceptsApiError, newIdempotencyKey }
