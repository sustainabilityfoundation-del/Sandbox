import { COMMAND_SCHEMAS, Model, fromJson, platformLibrary, type JsonElement } from '@ews/sysml-core'
import { SysmlClientError, type BranchInfo, type CommandCatalog, type CommitInfo, type ProjectInfo, type SysmlClient, type SysmlErrorCode, type SysmlEvent, type TagInfo, type TransactionOutcome } from './types'

export interface HttpSysmlConfig {
  /** e.g. '/api/sysml/v1' (same origin) or 'http://127.0.0.1:8800/api/sysml/v1'. */
  baseUrl: string
  /** Development identity sent as X-Dev-User (refused by production servers). */
  devUser?: string
  /** Production: bearer token provider. */
  token?: () => Promise<string | undefined>
  fetch?: typeof fetch
  onStreamStatus?: (status: 'connecting' | 'open' | 'retrying', error?: string) => void
}

export function newIdempotencyKey(): string {
  return `sysml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const ref = (v: unknown) => (v && typeof v === 'object' ? ((v as { '@id'?: string })['@id'] ?? null) : null)

const toProject = (p: Record<string, unknown>): ProjectInfo => ({ id: String(p['@id']), name: String(p.name), description: String(p.description ?? ''), platformProjectId: String(p.platformProjectId), defaultBranchId: String(ref(p.defaultBranch)), rootElementId: String(ref(p.rootElement)), created: String(p.created) })
const toBranch = (b: Record<string, unknown>): BranchInfo => ({ id: String(b['@id']), name: String(b.name), projectId: String(ref(b.owningProject)), headCommitId: ref(b.head), revision: Number(b.revision ?? 0), created: String(b.created) })
const toTag = (t: Record<string, unknown>): TagInfo => ({ id: String(t['@id']), name: String(t.name), commitId: String(ref(t.taggedCommit)), created: String(t.created) })
export const toCommit = (c: Record<string, unknown>): CommitInfo => ({
  id: String(c['@id']),
  projectId: String(ref(c.owningProject)),
  number: Number(c.number),
  parentIds: ((c.previousCommit as unknown[]) ?? []).map((x) => String(ref(x))),
  branchId: ref(c.branch),
  actor: String(c.actor ?? ''),
  source: (c.source as CommitInfo['source']) ?? { kind: 'user' },
  description: String(c.description ?? ''),
  summary: String(c.summary ?? ''),
  changeCount: Number(c.changeCount ?? 0),
  created: String(c.created),
})
const toOutcome = (o: Record<string, unknown>): TransactionOutcome => ({ ...(o as unknown as TransactionOutcome), commit: o.commit ? toCommit(o.commit as Record<string, unknown>) : undefined })

/** SysmlClient over the HTTP API (mode 'api'). Never falls back to other data when the API fails. */
export function createHttpSysmlClient(config: HttpSysmlConfig): SysmlClient {
  const f = config.fetch ?? globalThis.fetch.bind(globalThis)
  const models = new Map<string, Model>()

  async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra }
    if (config.devUser) h['X-Dev-User'] = config.devUser
    const token = await config.token?.()
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }

  async function request<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ data: T; headers: Headers }> {
    let res: Response
    try {
      res = await f(`${config.baseUrl}${path}`, { method, headers: await headers({ ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }), body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      throw new SysmlClientError('unavailable', `The SysML service is not reachable (${e instanceof Error ? e.message : String(e)}). Nothing was changed by this request unless a retry with the same idempotency key says otherwise.`)
    }
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : undefined
    } catch {
      parsed = undefined
    }
    if (!res.ok) {
      const err = (parsed as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error
      throw new SysmlClientError((err?.code as SysmlErrorCode) ?? (res.status === 404 ? 'not-found' : res.status >= 500 ? 'unavailable' : 'invalid'), err?.message ?? `HTTP ${res.status}`, err?.details, res.status)
    }
    return { data: parsed as T, headers: res.headers }
  }
  const get = async <T>(path: string) => (await request<T>('GET', path)).data
  const p = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

  const client: SysmlClient = {
    mode: 'api',
    async listProjects(platformProjectId) {
      return (await get<Record<string, unknown>[]>(`/projects${platformProjectId ? `?platformProjectId=${encodeURIComponent(platformProjectId)}` : ''}`)).map(toProject)
    },
    async createProject(input, options) {
      return toProject((await request<Record<string, unknown>>('POST', '/projects', input, { 'Idempotency-Key': options?.idempotencyKey ?? newIdempotencyKey() })).data)
    },
    async getProject(projectId) {
      return toProject(await get(p(projectId)))
    },
    async listBranches(projectId) {
      return (await get<Record<string, unknown>[]>(`${p(projectId)}/branches`)).map(toBranch)
    },
    async getBranch(projectId, branchId) {
      return toBranch(await get(`${p(projectId)}/branches/${branchId}`))
    },
    async createBranch(projectId, name, headCommitId) {
      return toBranch((await request<Record<string, unknown>>('POST', `${p(projectId)}/branches`, { '@type': 'Branch', name, head: { '@id': headCommitId } }, { 'Idempotency-Key': newIdempotencyKey() })).data)
    },
    async listTags(projectId) {
      return (await get<Record<string, unknown>[]>(`${p(projectId)}/tags`)).map(toTag)
    },
    async createTag(projectId, name, commitId) {
      return toTag((await request<Record<string, unknown>>('POST', `${p(projectId)}/tags`, { '@type': 'Tag', name, taggedCommit: { '@id': commitId } }, { 'Idempotency-Key': newIdempotencyKey() })).data)
    },
    async listCommits(projectId, options = {}) {
      const q = new URLSearchParams()
      if (options.branchId) q.set('branchId', options.branchId)
      if (options.limit) q.set('limit', String(options.limit))
      return (await get<Record<string, unknown>[]>(`${p(projectId)}/commits${q.size ? `?${q}` : ''}`)).map(toCommit)
    },
    async getCommit(projectId, commitId) {
      return toCommit(await get(`${p(projectId)}/commits/${commitId}`))
    },
    async loadModel(projectId, commitId) {
      const hit = models.get(commitId)
      if (hit) return hit
      const elements: JsonElement[] = []
      let cursor: string | undefined
      let rootId = ''
      do {
        const page = await get<{ rootId: string; elements: JsonElement[]; nextCursor?: string }>(`${p(projectId)}/commits/${commitId}/model${cursor ? `?cursor=${cursor}` : ''}`)
        rootId = page.rootId
        elements.push(...page.elements)
        cursor = page.nextCursor
      } while (cursor)
      const model = new Model({ library: platformLibrary(), rootId, elements: elements.map(fromJson) })
      models.set(commitId, model)
      if (models.size > 8) models.delete(models.keys().next().value!)
      return model
    },
    async transact(projectId, branchId, req, options) {
      return toOutcome((await request<Record<string, unknown>>('POST', `${p(projectId)}/branches/${branchId}/transactions`, req, { 'Idempotency-Key': options?.idempotencyKey ?? newIdempotencyKey() })).data)
    },
    async revert(projectId, commitId, branchId, options = {}) {
      const q = new URLSearchParams({ branchId })
      if (options.dryRun) q.set('dryRun', 'true')
      return toOutcome((await request<Record<string, unknown>>('POST', `${p(projectId)}/commits/${commitId}/revert?${q}`, { ...(options.reason ? { reason: options.reason } : {}), ...(options.source ? { source: options.source } : {}) }, { 'Idempotency-Key': options.idempotencyKey ?? newIdempotencyKey() })).data)
    },
    async validation(projectId, commitId) {
      return get(`${p(projectId)}/commits/${commitId}/validation`)
    },
    async describeCommands() {
      try {
        return await get<CommandCatalog>('/commands')
      } catch (e) {
        // The schemas are part of the client too; the service's copy is authoritative when reachable.
        if (e instanceof SysmlClientError && e.code === 'unavailable') return { commands: COMMAND_SCHEMAS, creatableKinds: [], metaclasses: [], notes: 'Offline copy of the command schemas.' }
        throw e
      }
    },
    subscribe(projectId, listener) {
      let closed = false
      let lastEventId: string | undefined
      let controller: AbortController | undefined
      const seen = new Set<string>()
      void (async () => {
        while (!closed) {
          controller = new AbortController()
          config.onStreamStatus?.('connecting')
          try {
            const res = await f(`${config.baseUrl}${p(projectId)}/events`, { headers: await headers({ Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) }), signal: controller.signal })
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
            config.onStreamStatus?.('open')
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buf = ''
            for (;;) {
              const { value, done } = await reader.read()
              if (done) break
              buf += decoder.decode(value, { stream: true })
              let i: number
              while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
                const block = buf.slice(0, i)
                buf = buf.slice(i).replace(/^\r?\n\r?\n/, '')
                let event = 'message'
                let data = ''
                for (const line of block.split(/\r?\n/)) {
                  if (!line || line.startsWith(':')) continue
                  const c = line.indexOf(':')
                  const field = c < 0 ? line : line.slice(0, c)
                  const val = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '')
                  if (field === 'event') event = val
                  else if (field === 'data') data += val
                  else if (field === 'id') lastEventId = val
                }
                if (event.startsWith('sysml.') && data) {
                  const e = JSON.parse(data) as SysmlEvent
                  if (seen.has(e.eventId)) continue
                  seen.add(e.eventId)
                  listener(e)
                } else if (event === 'reset') lastEventId = undefined
              }
            }
          } catch (e) {
            if (closed) return
            config.onStreamStatus?.('retrying', e instanceof Error ? e.message : String(e))
          }
          if (!closed) await new Promise((r) => setTimeout(r, 3000))
        }
      })()
      return () => {
        closed = true
        controller?.abort()
      }
    },
  }
  return client
}
