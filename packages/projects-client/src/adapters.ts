import { PROJECTS_CONTRACT_VERSION, ProjectsServiceError, type ArtifactSummary, type NativeRef, type ProjectSummary, type ProjectsEvent, type ProjectsService } from '@ews/platform-sdk'
import { ProjectsClient } from './client'
import { ProjectsApiError, type HttpConfig, type StreamHandle } from './transport'
import type { Artifact, Project } from './types'

export const toProjectSummary = (p: Project): ProjectSummary => ({ id: p.id, key: p.key, name: p.name, status: p.status, state: p.state, role: (p.role ?? 'reader') as ProjectSummary['role'], updatedAt: p.updatedAt, revision: p.revision })

export const toArtifactSummary = (a: Artifact): ArtifactSummary => ({
  artifactId: a.artifactId,
  ref: a.ref,
  key: a.key,
  title: a.title,
  category: a.category,
  lifecycle: a.lifecycle,
  version: { value: a.version.value, ...(a.version.label ? { label: a.version.label } : {}) },
  availability: a.availability,
  ...(a.open ? { open: a.open } : {}),
})

const clients = new WeakMap<ProjectsService, ProjectsClient>()

/** The full typed client behind an HTTP `ProjectsService` (workspace project screens and `projects.*` actions only). */
export function getProjectsClient(service: ProjectsService): ProjectsClient | undefined {
  return clients.get(service)
}

export type HttpServiceConfig = HttpConfig & {
  onStreamStatus?: (projectId: string, status: 'connecting' | 'open' | 'retrying', error?: string) => void
}

/**
 * SDK `ProjectsService` over HTTP (mode 'api'). Failures are thrown as ProjectsServiceError, never replaced by demo data.
 * One event stream per project, shared by every subscriber.
 */
export function createHttpProjectsService(config: HttpServiceConfig): ProjectsService {
  const client = new ProjectsClient(config)
  const streams = new Map<string, { handle: StreamHandle; listeners: Set<(e: ProjectsEvent) => void> }>()
  const service: ProjectsService = {
    contractVersion: PROJECTS_CONTRACT_VERSION,
    mode: 'api',
    async list(query = {}) {
      const page = await client.listProjects({ q: query.q, state: query.state, limit: query.limit, cursor: query.cursor })
      return { items: page.items.map(toProjectSummary), ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) }
    },
    async get(projectId) {
      try {
        return toProjectSummary(await client.getProject(projectId))
      } catch (e) {
        // Unknown, or not visible to the caller (not a member, deleted): absent either way.
        if (e instanceof ProjectsApiError && (e.code === 'not-found' || e.code === 'forbidden')) return undefined
        throw e
      }
    },
    async resolve(projectId, refs: NativeRef[]) {
      const res = await client.transport.request<Artifact[]>('POST', `/projects/${encodeURIComponent(projectId)}/artifacts/resolve`, { body: { refs } })
      return res.data.map(toArtifactSummary)
    },
    async artifacts(projectId, query = {}) {
      const page = await client.artifacts(projectId, { q: query.q, module: query.module, category: query.category, limit: query.limit, cursor: query.cursor })
      return { items: page.items.map(toArtifactSummary), ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) }
    },
    subscribe(projectId, listener) {
      let entry = streams.get(projectId)
      if (!entry) {
        const listeners = new Set<(e: ProjectsEvent) => void>()
        const handle = client.events(projectId, { onEvent: (e) => listeners.forEach((l) => l(e)), onStatus: (s, err) => config.onStreamStatus?.(projectId, s, err) })
        entry = { handle, listeners }
        streams.set(projectId, entry)
      }
      entry.listeners.add(listener)
      return () => {
        const e = streams.get(projectId)
        if (!e) return
        e.listeners.delete(listener)
        if (!e.listeners.size) {
          e.handle.close()
          streams.delete(projectId)
        }
      }
    },
  }
  clients.set(service, client)
  return service
}

/**
 * Contract-test adapter (mode 'demo'): an in-memory `ProjectsService` with explicit data, for tool harnesses and
 * tests. Never a fallback for the API; the workspace labels it as demo data.
 */
export function createMemoryProjectsService(data: { projects: ProjectSummary[]; artifacts?: Record<string, ArtifactSummary[]> }): ProjectsService & { emit: (e: ProjectsEvent) => void } {
  const listeners = new Map<string, Set<(e: ProjectsEvent) => void>>()
  const artifacts = data.artifacts ?? {}
  const paged = <T>(items: T[], limit = 50, cursor?: string) => {
    const offset = cursor ? Number(cursor) : 0
    const page = items.slice(offset, offset + limit)
    return { items: page, ...(offset + limit < items.length ? { nextCursor: String(offset + limit) } : {}) }
  }
  return {
    contractVersion: PROJECTS_CONTRACT_VERSION,
    mode: 'demo',
    async list(query = {}) {
      const q = query.q?.toLowerCase()
      const state = query.state ?? 'active'
      const items = data.projects.filter((p) => (state === 'all' || p.state === state) && (!q || p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)))
      return paged(items, query.limit, query.cursor)
    },
    async get(projectId) {
      return data.projects.find((p) => p.id === projectId)
    },
    async resolve(projectId, refs) {
      if (!data.projects.some((p) => p.id === projectId)) throw new ProjectsServiceError('forbidden', `You are not a member of project ${projectId}.`)
      return (artifacts[projectId] ?? []).filter((a) => refs.some((r) => r.module === a.ref.module && r.kind === a.ref.kind && r.id === a.ref.id))
    },
    async artifacts(projectId, query = {}) {
      const q = query.q?.toLowerCase()
      const items = (artifacts[projectId] ?? []).filter((a) => (!query.module || a.ref.module === query.module) && (!query.category || a.category === query.category) && (!q || a.key.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)))
      return paged(items, query.limit, query.cursor)
    },
    subscribe(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(listener)
      listeners.set(projectId, set)
      return () => set.delete(listener)
    },
    emit(e) {
      listeners.get(e.projectId)?.forEach((l) => l(e))
    },
  }
}
