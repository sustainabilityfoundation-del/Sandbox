import { CadClientError, type CadClient, type CadClientErrorCode, type CadEvent, type CadProvenance } from './types'

export interface HttpCadConfig {
  /** e.g. '/api/cad/v1' (same origin) or 'http://127.0.0.1:8799/api/cad/v1'. */
  baseUrl: string
  /** Development identity sent as X-Dev-User (refused by production servers). */
  devUser?: string
  token?: () => Promise<string | undefined>
  fetch?: typeof fetch
  onStreamStatus?: (status: 'connecting' | 'open' | 'retrying', error?: string) => void
}

const provenanceHeaders = (p?: CadProvenance): Record<string, string> =>
  p
    ? {
        'X-Source-Kind': p.sourceKind === 'system' ? 'user' : p.sourceKind,
        ...(p.conversationId ? { 'X-Conversation-Id': p.conversationId } : {}),
        ...(p.proposalId ? { 'X-Proposal-Id': p.proposalId } : {}),
        ...(p.messageId ? { 'X-Message-Id': p.messageId } : {}),
      }
    : {}

/** CadClient over the HTTP API (mode 'api'). Never falls back to other data when the API fails. */
export function createHttpCadClient(config: HttpCadConfig): CadClient {
  const f = config.fetch ?? globalThis.fetch.bind(globalThis)

  async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra }
    if (config.devUser) h['X-Dev-User'] = config.devUser
    const token = await config.token?.()
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }

  async function request<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    let res: Response
    try {
      res = await f(`${config.baseUrl}${path}`, { method, headers: await headers({ ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }), body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      throw new CadClientError('unavailable', `The CAD service is not reachable (${e instanceof Error ? e.message : String(e)}). Nothing was changed by this request unless a retry with the same idempotency key says otherwise.`)
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
      throw new CadClientError((err?.code as CadClientErrorCode) ?? (res.status === 404 ? 'not-found' : res.status >= 500 ? 'unavailable' : 'invalid'), err?.message ?? `HTTP ${res.status}`, err?.details, res.status)
    }
    return parsed as T
  }
  const docs = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/documents`

  return {
    mode: 'api',
    list: (projectId, options) => request('GET', `${docs(projectId)}${options?.includeArchived ? '?includeArchived=true' : ''}`),
    get: (projectId, id, revision) => request('GET', `${docs(projectId)}/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ''}`),
    create: (projectId, document, o) => request('POST', docs(projectId), { document, ...(o.message ? { message: o.message } : {}) }, { 'Idempotency-Key': o.idempotencyKey, ...provenanceHeaders(o.provenance) }),
    save: (projectId, id, document, o) =>
      request('PUT', `${docs(projectId)}/${encodeURIComponent(id)}`, { document, expectedRevision: o.expectedRevision, ...(o.message ? { message: o.message } : {}) }, { 'Idempotency-Key': o.idempotencyKey, ...provenanceHeaders(o.provenance) }),
    revisions: (projectId, id) => request('GET', `${docs(projectId)}/${encodeURIComponent(id)}/revisions`),
    archive: (projectId, id, archived, o) => request('POST', `${docs(projectId)}/${encodeURIComponent(id)}/archive`, { archived, expectedRevision: o.expectedRevision }, o.idempotencyKey ? { 'Idempotency-Key': o.idempotencyKey } : {}),
    resolveEntity: (projectId, id, entityId, revision) => request('GET', `${docs(projectId)}/${encodeURIComponent(id)}/entities/${encodeURIComponent(entityId)}${revision ? `?revision=${revision}` : ''}`),
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
            const res = await f(`${config.baseUrl}/projects/${encodeURIComponent(projectId)}/events`, { headers: await headers({ Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) }), signal: controller.signal })
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
                if (event.startsWith('cad.') && data) {
                  const e = JSON.parse(data) as CadEvent
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
}
