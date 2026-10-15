import { ProjectsServiceError, type ProjectsErrorCode, type ProjectsEvent } from '@ews/platform-sdk'

/** An API error with the HTTP status and the full `details` object of the error body. */
export class ProjectsApiError extends ProjectsServiceError {
  constructor(
    code: ProjectsErrorCode,
    message: string,
    readonly status: number,
    readonly rawDetails: Record<string, unknown> = {},
  ) {
    super(code, message, rawDetails)
    this.name = 'ProjectsApiError'
  }
}

export interface HttpConfig {
  /** Origin plus base path, e.g. "/api/projects/v1" (same origin) or "http://127.0.0.1:8787/api/projects/v1". */
  baseUrl: string
  /** Development identity sent as X-Dev-User (refused by production servers). */
  devUser?: string | (() => string | undefined)
  /** Production: bearer token provider. */
  token?: () => string | undefined | Promise<string | undefined>
  fetch?: typeof fetch
  /** Request timeout in ms (default 20 000). */
  timeoutMs?: number
}

/** How a change came about; assistant changes name their conversation and proposal. */
export interface Provenance {
  sourceKind: 'user' | 'assistant' | 'import'
  conversationId?: string
  proposalId?: string
  messageId?: string
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined | null>
  body?: unknown
  rawBody?: Uint8Array | Blob
  contentType?: string
  idempotencyKey?: string
  ifMatch?: number | string
  signal?: AbortSignal
  /** Origin of a write: sent as X-Source-Kind, X-Conversation-Id, X-Proposal-Id, X-Message-Id. */
  provenance?: Provenance
  accept?: 'json' | 'bytes'
  /** Further request headers (X-Confirm, X-File-Name …). */
  headers?: Record<string, string>
}

const CODES: ProjectsErrorCode[] = ['not-found', 'conflict', 'invalid', 'forbidden', 'unauthenticated', 'unavailable']

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class HttpTransport {
  constructor(readonly config: HttpConfig) {}

  async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra }
    const dev = typeof this.config.devUser === 'function' ? this.config.devUser() : this.config.devUser
    if (dev) h['X-Dev-User'] = dev
    const token = await this.config.token?.()
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }

  url(path: string, query?: RequestOptions['query']): string {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v))
    }
    const s = qs.toString()
    return `${this.config.baseUrl.replace(/\/$/, '')}${path}${s ? `?${s}` : ''}`
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<{ data: T; etag?: string; status: number; headers: Headers }> {
    const f = this.config.fetch ?? globalThis.fetch.bind(globalThis)
    const extra: Record<string, string> = { ...(opts.headers ?? {}) }
    if (opts.body !== undefined) extra['Content-Type'] = 'application/json'
    if (opts.rawBody) extra['Content-Type'] = opts.contentType ?? 'application/octet-stream'
    if (opts.idempotencyKey) extra['Idempotency-Key'] = opts.idempotencyKey
    if (opts.ifMatch !== undefined) extra['If-Match'] = `"${opts.ifMatch}"`
    if (opts.provenance) {
      extra['X-Source-Kind'] = opts.provenance.sourceKind
      if (opts.provenance.conversationId) extra['X-Conversation-Id'] = opts.provenance.conversationId
      if (opts.provenance.proposalId) extra['X-Proposal-Id'] = opts.provenance.proposalId
      if (opts.provenance.messageId) extra['X-Message-Id'] = opts.provenance.messageId
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20000)
    opts.signal?.addEventListener('abort', () => controller.abort())
    let res: Response
    try {
      res = await f(this.url(path, opts.query), {
        method,
        headers: await this.headers(extra),
        body: opts.rawBody ? (opts.rawBody as BodyInit) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
    } catch (e) {
      throw new ProjectsApiError('unavailable', `The Project Management API is not reachable (${e instanceof Error ? e.message : String(e)}). Nothing was changed by this request, or its outcome is unknown; retrying with the same request is safe.`, 0)
    } finally {
      clearTimeout(timer)
    }
    const etag = res.headers.get('ETag')?.replace(/^W\//, '').replace(/"/g, '') ?? undefined
    if (!res.ok) {
      let body: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {}
      try {
        body = await res.json()
      } catch {
        /* not JSON */
      }
      const code = (CODES.includes(body.error?.code as ProjectsErrorCode) ? body.error!.code : res.status >= 500 ? 'unavailable' : 'invalid') as ProjectsErrorCode
      throw new ProjectsApiError(code, body.error?.message ?? `${res.status} ${res.statusText}`, res.status, body.error?.details ?? {})
    }
    if (res.status === 204) return { data: undefined as T, etag, status: 204, headers: res.headers }
    const data = (opts.accept === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : await res.json()) as T
    return { data, etag, status: res.status, headers: res.headers }
  }
}

export interface StreamHandle {
  close: () => void
}

/**
 * Server-Sent Events over fetch (EventSource cannot send identity headers). Reconnects with
 * Last-Event-ID after a delay; events seen before are skipped (dedupe by eventId). On a `reset`
 * signal the caller should reload everything.
 */
export function openEventStream(
  transport: HttpTransport,
  path: string,
  handlers: { onEvent: (e: ProjectsEvent) => void; onReset?: () => void; onStatus?: (s: 'connecting' | 'open' | 'retrying', error?: string) => void },
  options: { retryMs?: number } = {},
): StreamHandle {
  let closed = false
  let lastEventId: string | undefined
  let controller: AbortController | undefined
  const seen = new Set<string>()
  const f = transport.config.fetch ?? globalThis.fetch.bind(globalThis)

  const connect = async () => {
    while (!closed) {
      controller = new AbortController()
      handlers.onStatus?.('connecting')
      try {
        const headers = await transport.headers({ Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) })
        const res = await f(transport.url(path), { headers, signal: controller.signal })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        handlers.onStatus?.('open')
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
            let id: string | undefined
            for (const line of block.split(/\r?\n/)) {
              if (!line || line.startsWith(':')) continue
              const colon = line.indexOf(':')
              const field = colon < 0 ? line : line.slice(0, colon)
              const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
              if (field === 'event') event = value
              else if (field === 'data') data += (data ? '\n' : '') + value
              else if (field === 'id') id = value
            }
            if (event === 'reset') handlers.onReset?.()
            if (!data || event === 'reset' || event === 'error') continue
            try {
              const e = JSON.parse(data) as ProjectsEvent
              if (id) lastEventId = id
              if (seen.has(e.eventId)) continue
              seen.add(e.eventId)
              if (seen.size > 5000) seen.delete(seen.values().next().value!)
              handlers.onEvent(e)
            } catch {
              /* ignore malformed */
            }
          }
        }
      } catch (e) {
        if (closed) return
        handlers.onStatus?.('retrying', e instanceof Error ? e.message : String(e))
      }
      if (closed) return
      await new Promise((r) => setTimeout(r, options.retryMs ?? 3000))
    }
  }
  void connect()
  return {
    close() {
      closed = true
      controller?.abort()
    },
  }
}
