import type { AdaptersResponse, Asset, BatchCreated, GenerationJob, GenerationRequest, JobChangedEvent, JobCreated, JobState } from './types'

export interface VisualizationClientOptions {
  /** e.g. '/api/visualization/v1' (same origin) or 'http://127.0.0.1:8801/api/visualization/v1'. */
  baseUrl: string
  /** Development identity sent as X-Dev-User (refused by production servers). */
  devUser?: string
  token?: () => Promise<string | undefined>
  fetch?: typeof fetch
}

export class VisualizationClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'VisualizationClientError'
  }
}

export interface VisualizationClient {
  adapters(projectId: string): Promise<AdaptersResponse>
  /** Idempotent: an identical request returns the existing job (`created: false`). */
  createJob(projectId: string, request: GenerationRequest): Promise<JobCreated>
  /** 1–6 requests; each item has its own outcome. */
  createBatch(projectId: string, items: GenerationRequest[]): Promise<BatchCreated>
  listJobs(projectId: string, filter?: { conceptId?: string; batchId?: string; clientRef?: string; state?: JobState; limit?: number }): Promise<{ items: GenerationJob[] }>
  getJob(projectId: string, jobId: string): Promise<GenerationJob>
  cancel(projectId: string, jobId: string): Promise<GenerationJob>
  retry(projectId: string, jobId: string): Promise<GenerationJob>
  uploadAsset(projectId: string, file: { fileName: string; mediaType: string; contentBase64: string }): Promise<Asset>
  getAsset(projectId: string, assetId: string): Promise<Asset>
  /** Absolute or same-origin URL of the asset bytes (the server checks membership on every read). */
  contentUrl(projectId: string, assetId: string): string
  /** Job changes as server-sent events; reconnects and resumes after the last seen sequence. Returns unsubscribe. */
  subscribe(projectId: string, listener: (e: JobChangedEvent) => void): () => void
}

export function createVisualizationClient(config: VisualizationClientOptions): VisualizationClient {
  const f = config.fetch ?? globalThis.fetch.bind(globalThis)
  async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra }
    if (config.devUser) h['X-Dev-User'] = config.devUser
    const token = await config.token?.()
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await f(`${config.baseUrl}${path}`, { method, headers: await headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}), body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      throw new VisualizationClientError('unavailable', `The visualization service is not reachable (${e instanceof Error ? e.message : String(e)}). Repeating the request is safe: identical requests never generate twice.`)
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
      throw new VisualizationClientError(err?.code ?? (res.status >= 500 ? 'unavailable' : 'invalid'), err?.message ?? `HTTP ${res.status}`, err?.details, res.status)
    }
    return parsed as T
  }
  const p = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`
  const qs = (o: Record<string, unknown>) => {
    const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
    return s ? `?${s}` : ''
  }
  return {
    adapters: (projectId) => request('GET', `/adapters${qs({ projectId })}`),
    createJob: (projectId, body) => request('POST', `${p(projectId)}/jobs`, body),
    createBatch: (projectId, items) => request('POST', `${p(projectId)}/batches`, { items }),
    listJobs: (projectId, filter = {}) => request('GET', `${p(projectId)}/jobs${qs(filter)}`),
    getJob: (projectId, jobId) => request('GET', `${p(projectId)}/jobs/${encodeURIComponent(jobId)}`),
    cancel: (projectId, jobId) => request('POST', `${p(projectId)}/jobs/${encodeURIComponent(jobId)}/cancel`, {}),
    retry: (projectId, jobId) => request('POST', `${p(projectId)}/jobs/${encodeURIComponent(jobId)}/retry`, {}),
    uploadAsset: (projectId, file) => request('POST', `${p(projectId)}/assets`, file),
    getAsset: (projectId, assetId) => request('GET', `${p(projectId)}/assets/${encodeURIComponent(assetId)}`),
    contentUrl: (projectId, assetId) => `${config.baseUrl}${p(projectId)}/assets/${encodeURIComponent(assetId)}/content`,
    subscribe(projectId, listener) {
      let closed = false
      let after = 0
      let controller: AbortController | undefined
      void (async () => {
        while (!closed) {
          controller = new AbortController()
          try {
            const res = await f(`${config.baseUrl}${p(projectId)}/events${after ? `?after=${after}` : ''}`, { headers: await headers({ Accept: 'text/event-stream' }), signal: controller.signal })
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
              const { value, done } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              let end: number
              while ((end = buffer.indexOf('\n\n')) >= 0) {
                const frame = buffer.slice(0, end)
                buffer = buffer.slice(end + 2)
                const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
                if (!data) continue
                try {
                  const e = JSON.parse(data) as JobChangedEvent
                  if (e.seq > after) {
                    after = e.seq
                    listener(e)
                  }
                } catch {
                  // ignore malformed frames
                }
              }
            }
          } catch {
            // reconnect below
          }
          if (!closed) await new Promise((r) => setTimeout(r, 1000))
        }
      })()
      return () => {
        closed = true
        controller?.abort()
      }
    },
  }
}
