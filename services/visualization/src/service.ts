import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type {
  AdapterInfo,
  AdaptersResponse,
  Asset,
  BatchCreated,
  BatchItemOutcome,
  GenerationJob,
  GenerationRequest,
  ImageQuality,
  ImageSize,
  JobCreated,
  JobState,
  RequestProvenance,
  UnavailableReason,
} from '@ews/visualization-client'
import { AdapterError, composePrompt, pngSize, sniffMediaType, type ConnectionInfo, type ImageAdapter, type ImageCredential } from './adapters/types'
import type { AdapterRegistry } from './adapters/registry'
import { VisualizationError, conflict, invalid, notFound } from './errors'
import { emitJobChanged, type VisualizationEventHub } from './events'
import { BASE } from './paths'

/** Content-addressed bytes (the Project Management blob store, passed in by the host). */
export interface BlobPort {
  put(bytes: Uint8Array): Promise<{ key: string; sha256: string; byteSize: number }>
  get(key: string, options?: { verify?: boolean }): Promise<Uint8Array>
}

/** What the person may use for image generation in a project (implemented by the host with the assistant service). */
export interface ImageAccess {
  /** The connection to use, without its secret; null when nothing is connected. */
  connection: ConnectionInfo | null
  /** `ai.images.enabled`: the person's opt-in to paid image generation (within the project limit). */
  enabled: boolean
  /** `ai.images.quality`. */
  quality: ImageQuality
  /** `ai.images.daily-limit`: paid generations per person and 24 hours (0: none). */
  dailyLimit: number
  /** Decrypts the connection's credential for one call. Never stored, logged or returned by this service. */
  credential(): Promise<ImageCredential>
}

export interface ImageAccessPort {
  resolve(userId: string, projectId: string): Promise<ImageAccess>
}

export interface VisualizationServiceOptions {
  pool: Pool
  blobs: BlobPort
  adapters: AdapterRegistry
  access: ImageAccessPort
  events: VisualizationEventHub
  /** Jobs run at the same time in this process (default 2). */
  concurrency?: number
  /** Poll for pending jobs written by other processes (default 1000 ms). */
  pollMs?: number
  /** A running job whose heartbeat is older than this is marked interrupted (default 90 s). */
  staleAfterMs?: number
  log?: { error: (obj: unknown, msg?: string) => void }
}

const SIZES: ImageSize[] = ['1024x1024', '1536x1024', '1024x1536']
const QUALITIES: ImageQuality[] = ['low', 'medium', 'high']
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface JobRow {
  id: string
  project_id: string
  batch_id: string | null
  idempotency_key: string
  state: JobState
  kind: 'illustration'
  subject: GenerationJob['subject']
  instruction: string
  adapter: string
  provider_id: string
  provider_name: string
  provider_method: string | null
  model: string
  options: GenerationJob['options']
  reference_assets: GenerationJob['referenceAssets']
  purpose: string | null
  client_ref: string | null
  provenance: RequestProvenance
  attempt: number
  cancel_requested: boolean
  error: GenerationJob['error']
  output_asset_id: string | null
  revised_prompt: string | null
  usage: GenerationJob['usage']
  test_asset: boolean
  created_by: string
  created_at: Date
  updated_at: Date
  started_at: Date | null
  finished_at: Date | null
}

interface AssetRow {
  id: string
  project_id: string
  blob_key: string
  sha256: string
  media_type: Asset['mediaType']
  byte_size: number
  width: number | null
  height: number | null
  origin: Asset['origin']
  job_id: string | null
  test_asset: boolean
  created_by: string
  created_at: Date
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)

export function toAsset(r: AssetRow): Asset {
  return {
    id: r.id,
    projectId: r.project_id,
    sha256: r.sha256,
    mediaType: r.media_type,
    byteSize: r.byte_size,
    width: r.width,
    height: r.height,
    origin: r.origin,
    jobId: r.job_id,
    testAsset: r.test_asset,
    createdBy: r.created_by,
    createdAt: iso(r.created_at)!,
    contentUrl: `${BASE}/projects/${encodeURIComponent(r.project_id)}/assets/${r.id}/content`,
  }
}

const stableJson = (v: unknown): string =>
  v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stableJson).join(',')}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`

/** Normalises an instruction for the idempotency key (whitespace only; wording is significant). */
export const normaliseInstruction = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The derived idempotency key of a request (contracts §1): identical requests share one job. */
export function idempotencyKey(input: { projectId: string; kind: string; subject: { id: string; revision: number }; instruction: string; adapter: string; model: string; options: Record<string, unknown>; referenceSha256: string[] }): string {
  return createHash('sha256')
    .update(
      stableJson({
        v: 1,
        projectId: input.projectId,
        kind: input.kind,
        subject: { id: input.subject.id.toLowerCase(), revision: input.subject.revision },
        instruction: normaliseInstruction(input.instruction),
        adapter: input.adapter,
        model: input.model,
        options: input.options,
        references: [...input.referenceSha256].sort(),
      }),
    )
    .digest('hex')
}

/** Refusal when image generation is not available (no job is created, nothing is charged). */
export const unavailable = (reason: UnavailableReason | 'daily-limit', message: string) => new VisualizationError('generation-unavailable', message, reason === 'daily-limit' ? 429 : 409, { reason })

/**
 * Generation jobs, assets and the job runner (contracts §1). Jobs are created idempotently, run in the background
 * (never blocking a request), and every state change is an event. One failed or cancelled job never affects another.
 */
export class VisualizationService {
  private readonly running = new Map<string, AbortController>()
  private active = 0
  private closed = false
  private readonly timers: NodeJS.Timeout[] = []
  private kicking: Promise<void> | null = null

  constructor(private readonly o: VisualizationServiceOptions) {}

  /** Starts the runner: marks stale running jobs interrupted, then polls for pending work. */
  start(): void {
    void this.recover().then(() => this.kick())
    const poll = setInterval(() => void this.recover().then(() => this.kick()), this.o.pollMs ?? 1000)
    poll.unref?.()
    this.timers.push(poll)
  }

  async close(): Promise<void> {
    this.closed = true
    for (const t of this.timers) clearInterval(t)
    for (const c of this.running.values()) c.abort(new Error('shutdown'))
    for (let i = 0; i < 100 && this.active > 0; i++) await new Promise((r) => setTimeout(r, 20))
  }

  // ---- adapters --------------------------------------------------------------------------------------

  private acceptance(adapter: ImageAdapter, access: ImageAccess): { ok: true } | { ok: false; code: UnavailableReason; message: string } {
    const accepted = adapter.accepts(access.connection)
    if (!accepted.ok) return accepted
    if (adapter.paid && !access.enabled)
      return { ok: false, code: 'images-disabled', message: 'Image generation is off in your AI settings (Settings → AI and reasoning → Image generation). It uses your provider account and is billed there; turn it on to generate illustrations. Structured layouts keep working.' }
    return { ok: true }
  }

  async adapters(userId: string, projectId: string): Promise<AdaptersResponse> {
    const access = await this.o.access.resolve(userId, projectId)
    const adapters: AdapterInfo[] = this.o.adapters.list().map((a) => {
      const ok = this.acceptance(a, access)
      return { id: a.id, name: a.name, output: a.output, models: a.models, available: ok.ok, ...(ok.ok ? {} : { unavailableReason: ok.message, unavailableCode: ok.code }), testOnly: a.testOnly, costNote: a.costNote, limitations: a.limitations }
    })
    return { adapters, defaultAdapter: adapters.find((a) => a.available)?.id ?? null }
  }

  private chooseAdapter(requested: string | undefined, access: ImageAccess): ImageAdapter {
    if (requested) {
      const a = this.o.adapters.get(requested)
      if (!a) throw unavailable('provider-missing', `The image adapter ${requested} is not installed on this server.`)
      const ok = this.acceptance(a, access)
      if (!ok.ok) throw unavailable(ok.code, ok.message)
      return a
    }
    const all = this.o.adapters.list()
    const usable = all.find((a) => this.acceptance(a, access).ok)
    if (usable) return usable
    const first = all.find((a) => !a.testOnly) ?? all[0]
    if (!first) throw unavailable('provider-missing', 'No image generation provider is installed on this server. Structured layouts keep working.')
    const why = this.acceptance(first, access)
    throw unavailable(why.ok ? 'provider-missing' : why.code, why.ok ? 'No image generation provider is available.' : why.message)
  }

  // ---- jobs ------------------------------------------------------------------------------------------

  private validate(req: GenerationRequest) {
    const fields: Record<string, string> = {}
    if (req.kind !== 'illustration') fields.kind = 'only illustration is generated (layouts are rendered by Conceptualize)'
    const s = req.subject
    if (!s || s.module !== 'conceptualize' || s.type !== 'concept' || typeof s.id !== 'string' || !UUID.test(s.id) || !Number.isInteger(s.revision) || s.revision < 1) fields.subject = 'a Conceptualize concept { module: "conceptualize", type: "concept", id: UUID, revision ≥ 1 }'
    if (typeof req.instruction !== 'string' || !normaliseInstruction(req.instruction) || req.instruction.length > 4000) fields.instruction = '1–4000 characters'
    if (req.options?.size && !SIZES.includes(req.options.size)) fields['options.size'] = SIZES.join(', ')
    if (req.options?.quality && !QUALITIES.includes(req.options.quality)) fields['options.quality'] = QUALITIES.join(', ')
    if (req.referenceAssetIds && (!Array.isArray(req.referenceAssetIds) || req.referenceAssetIds.length > 4 || req.referenceAssetIds.some((id) => typeof id !== 'string' || !UUID.test(id)))) fields.referenceAssetIds = 'up to 4 asset IDs'
    if (Object.keys(fields).length) throw invalid('The generation request is not valid.', fields)
  }

  /** Creates a job, or returns the existing job of an identical request (`created: false`). */
  async createJob(userId: string, projectId: string, req: GenerationRequest, extra: { batchId?: string; provenance?: RequestProvenance } = {}): Promise<JobCreated> {
    this.validate(req)
    const access = await this.o.access.resolve(userId, projectId)
    const adapter = this.chooseAdapter(req.adapter, access)
    const model = req.model ?? adapter.models.find((m) => m.default)?.id ?? adapter.models[0]?.id
    if (!model || !adapter.models.some((m) => m.id === model)) throw invalid(`Model ${req.model} is not offered by ${adapter.name}.`, { model: adapter.models.map((m) => m.id).join(', ') })
    const options = { size: req.options?.size ?? '1536x1024', quality: req.options?.quality ?? access.quality, background: req.options?.background ?? 'opaque' } as GenerationJob['options']
    const refs = req.referenceAssetIds?.length ? await this.references(projectId, req.referenceAssetIds) : []
    const key = idempotencyKey({ projectId, kind: req.kind, subject: req.subject, instruction: req.instruction, adapter: adapter.id, model, options, referenceSha256: refs.map((r) => r.sha256) })
    const existing = await this.byKey(projectId, key)
    if (existing) return { job: await this.publicJob(existing), created: false }
    if (adapter.paid) {
      const { rows } = await this.o.pool.query<{ n: string }>(`SELECT count(*) AS n FROM visualization.jobs WHERE created_by = $1 AND test_asset = false AND created_at > now() - interval '24 hours'`, [userId])
      if (Number(rows[0].n) >= access.dailyLimit) throw unavailable('daily-limit', `You reached your limit of ${access.dailyLimit} image generation(s) in 24 hours (Settings → AI and reasoning → Image generation).`)
    }
    const provenance = extra.provenance ?? req.provenance ?? { sourceKind: 'user' }
    const conn = access.connection
    const row = await this.tx(async (db) => {
      const { rows } = await db.query<JobRow>(
        `INSERT INTO visualization.jobs (id, project_id, batch_id, idempotency_key, state, kind, subject, subject_id, subject_revision, instruction, adapter, provider_id, provider_name, provider_method, model, options, reference_assets, purpose, client_ref, provenance, test_asset, created_by)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (project_id, idempotency_key) DO NOTHING RETURNING *`,
        [
          randomUUID(),
          projectId,
          extra.batchId ?? null,
          key,
          req.kind,
          JSON.stringify(req.subject),
          req.subject.id.toLowerCase(),
          req.subject.revision,
          req.instruction,
          adapter.id,
          adapter.providerId,
          adapter.name,
          adapter.testOnly ? null : (conn?.method ?? null),
          model,
          JSON.stringify(options),
          JSON.stringify(refs.map((r) => ({ id: r.id, sha256: r.sha256, mediaType: r.media_type }))),
          req.purpose?.slice(0, 200) ?? null,
          req.clientRef?.slice(0, 200) ?? null,
          JSON.stringify(provenance),
          adapter.testOnly,
          userId,
        ],
      )
      if (rows[0]) await emitJobChanged(db, rows[0])
      return rows[0]
    })
    if (!row) {
      // A concurrent identical request won the insert: return its job.
      const winner = await this.byKey(projectId, key)
      return { job: await this.publicJob(winner!), created: false }
    }
    void this.kick()
    return { job: await this.publicJob(row), created: true }
  }

  /** Creates several jobs; each item has its own outcome (one refusal never affects the others). */
  async createBatch(userId: string, projectId: string, items: GenerationRequest[], provenance?: RequestProvenance): Promise<BatchCreated> {
    if (!Array.isArray(items) || items.length < 1 || items.length > 6) throw invalid('A batch has 1–6 items.', { items: '1–6 generation requests' })
    const batchId = randomUUID()
    await this.o.pool.query('INSERT INTO visualization.batches (id, project_id, created_by) VALUES ($1,$2,$3)', [batchId, projectId, userId])
    const out: BatchItemOutcome[] = []
    for (const [index, item] of items.entries()) {
      try {
        const r = await this.createJob(userId, projectId, item, { batchId, ...(provenance ? { provenance } : {}) })
        out.push({ index, outcome: r.created ? 'created' : 'existing', job: r.job })
      } catch (e) {
        const err = e instanceof VisualizationError ? e : new VisualizationError('unavailable', 'This item could not be created.', 500)
        out.push({ index, outcome: 'refused', error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } })
      }
    }
    return { batchId, items: out }
  }

  async listJobs(projectId: string, filter: { conceptId?: string; batchId?: string; clientRef?: string; state?: JobState; limit?: number }): Promise<GenerationJob[]> {
    const where = ['project_id = $1']
    const args: unknown[] = [projectId]
    if (filter.conceptId) (args.push(filter.conceptId.toLowerCase()), where.push(`subject_id = $${args.length}`))
    if (filter.batchId) (args.push(filter.batchId), where.push(`batch_id = $${args.length}`))
    if (filter.clientRef) (args.push(filter.clientRef), where.push(`client_ref = $${args.length}`))
    if (filter.state) (args.push(filter.state), where.push(`state = $${args.length}`))
    args.push(Math.min(Math.max(filter.limit ?? 100, 1), 500))
    const { rows } = await this.o.pool.query<JobRow>(`SELECT * FROM visualization.jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length}`, args)
    return Promise.all(rows.map((r) => this.publicJob(r)))
  }

  async getJob(projectId: string, jobId: string): Promise<GenerationJob> {
    return this.publicJob(await this.jobRow(projectId, jobId))
  }

  async cancel(projectId: string, jobId: string): Promise<GenerationJob> {
    const row = await this.tx(async (db) => {
      const r = await this.lockJob(db, projectId, jobId)
      if (r.state === 'pending') return this.update(db, r.id, { state: 'cancelled', finished_at: 'now' })
      if (r.state === 'running') {
        return r.cancel_requested ? r : this.update(db, r.id, { cancel_requested: true })
      }
      if (r.state === 'succeeded') throw conflict('The job has already succeeded; its image is kept. Nothing was cancelled.', { state: r.state })
      return r
    })
    if (row.state === 'running') this.running.get(row.id)?.abort(new Error('cancel'))
    return this.publicJob(row)
  }

  /** Runs a failed or cancelled job again (same job, attempt + 1). Access is checked again. */
  async retry(userId: string, projectId: string, jobId: string): Promise<GenerationJob> {
    const current = await this.jobRow(projectId, jobId)
    if (current.state !== 'failed' && current.state !== 'cancelled') throw conflict(`Only failed or cancelled jobs can be retried (this one is ${current.state}).`, { state: current.state })
    const adapter = this.o.adapters.get(current.adapter)
    if (!adapter) throw unavailable('provider-missing', `The image adapter ${current.adapter} is not installed on this server any more.`)
    const ok = this.acceptance(adapter, await this.o.access.resolve(userId, projectId))
    if (!ok.ok) throw unavailable(ok.code, ok.message)
    const row = await this.tx(async (db) => {
      const r = await this.lockJob(db, projectId, jobId)
      if (r.state !== 'failed' && r.state !== 'cancelled') throw conflict(`Only failed or cancelled jobs can be retried (this one is ${r.state}).`, { state: r.state })
      return this.update(db, r.id, { state: 'pending', attempt: r.attempt + 1, error: null, cancel_requested: false, started_at: null, finished_at: null })
    })
    void this.kick()
    return this.publicJob(row)
  }

  // ---- assets ----------------------------------------------------------------------------------------

  async uploadAsset(userId: string, projectId: string, input: { fileName?: string; mediaType: string; contentBase64: string }): Promise<Asset> {
    if (typeof input.contentBase64 !== 'string' || !/^[A-Za-z0-9+/\r\n]*={0,2}\s*$/.test(input.contentBase64)) throw invalid('contentBase64 must be base64.', { contentBase64: 'base64' })
    const bytes = new Uint8Array(Buffer.from(input.contentBase64, 'base64'))
    if (!bytes.length || bytes.length > 1_500_000) throw invalid('Reference images are 1 byte to 1.5 MB.', { contentBase64: 'size' })
    const sniffed = sniffMediaType(bytes)
    if (!sniffed) throw invalid('Reference images must be PNG, JPEG or WebP.', { mediaType: 'png, jpeg, webp' })
    if (input.mediaType !== sniffed) throw invalid(`The content is ${sniffed}, not ${input.mediaType}.`, { mediaType: `content is ${sniffed}` })
    return this.storeAsset(userId, projectId, bytes, sniffed, 'upload', pngSize(bytes) ?? { width: null, height: null }, false, null)
  }

  async getAsset(projectId: string, assetId: string): Promise<Asset> {
    return toAsset(await this.assetRow(projectId, assetId))
  }

  async assetContent(projectId: string, assetId: string): Promise<{ asset: Asset; bytes: Uint8Array }> {
    const row = await this.assetRow(projectId, assetId)
    return { asset: toAsset(row), bytes: await this.o.blobs.get(row.blob_key, { verify: true }) }
  }

  private async storeAsset(userId: string, projectId: string, bytes: Uint8Array, mediaType: Asset['mediaType'], origin: Asset['origin'], size: { width: number | null; height: number | null } | null, testAsset: boolean, jobId: string | null): Promise<Asset> {
    const stored = await this.o.blobs.put(bytes)
    const { rows } = await this.o.pool.query<AssetRow>(
      `INSERT INTO visualization.assets (id, project_id, blob_key, sha256, media_type, byte_size, width, height, origin, job_id, test_asset, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (project_id, sha256, origin) DO UPDATE SET project_id = EXCLUDED.project_id RETURNING *`,
      [randomUUID(), projectId, stored.key, stored.sha256, mediaType, stored.byteSize, size?.width ?? null, size?.height ?? null, origin, jobId, testAsset, userId],
    )
    return toAsset(rows[0])
  }

  private async references(projectId: string, ids: string[]): Promise<AssetRow[]> {
    const { rows } = await this.o.pool.query<AssetRow>('SELECT * FROM visualization.assets WHERE project_id = $1 AND id = ANY($2::uuid[])', [projectId, ids])
    const missing = ids.filter((id) => !rows.some((r) => r.id === id))
    if (missing.length) throw invalid(`Reference asset(s) ${missing.join(', ')} do not exist in project ${projectId}.`, { referenceAssetIds: 'unknown asset' })
    if (rows.some((r) => r.media_type === 'image/svg+xml')) throw invalid('Test assets (SVG) cannot be used as references.', { referenceAssetIds: 'test asset' })
    return ids.map((id) => rows.find((r) => r.id === id)!)
  }

  private async assetRow(projectId: string, assetId: string): Promise<AssetRow> {
    if (!UUID.test(assetId)) throw notFound(`No asset ${assetId} in project ${projectId}.`)
    const { rows } = await this.o.pool.query<AssetRow>('SELECT * FROM visualization.assets WHERE project_id = $1 AND id = $2', [projectId, assetId])
    if (!rows[0]) throw notFound(`No asset ${assetId} in project ${projectId}.`)
    return rows[0]
  }

  // ---- runner ----------------------------------------------------------------------------------------

  /** Marks running jobs whose heartbeat stopped (a process ended mid-run) as interrupted; never re-runs them silently. */
  async recover(): Promise<void> {
    if (this.closed) return
    const stale = Math.round((this.o.staleAfterMs ?? 90_000) / 1000)
    try {
      await this.tx(async (db) => {
        const { rows } = await db.query<JobRow>(`SELECT * FROM visualization.jobs WHERE state = 'running' AND updated_at < now() - make_interval(secs => $1) FOR UPDATE SKIP LOCKED`, [stale])
        for (const r of rows) {
          if (this.running.has(r.id)) continue
          await this.update(db, r.id, { state: 'failed', finished_at: 'now', error: { code: 'interrupted', message: 'The server stopped while this image was being generated. The provider may have charged for it, so it is not repeated automatically; retry to generate it again.', retryable: true } })
        }
      })
    } catch (e) {
      this.o.log?.error(e, 'visualization recovery failed')
    }
  }

  /** Starts pending jobs up to the concurrency limit. */
  kick(): Promise<void> {
    if (this.kicking) return this.kicking
    this.kicking = (async () => {
      while (!this.closed && this.active < (this.o.concurrency ?? 2)) {
        const job = await this.claim().catch((e) => (this.o.log?.error(e, 'claiming a job failed'), null))
        if (!job) break
        this.active++
        void this.run(job).finally(() => {
          this.active--
          void this.kick()
        })
      }
    })().finally(() => (this.kicking = null))
    return this.kicking
  }

  private claim(): Promise<JobRow | null> {
    return this.tx(async (db) => {
      const { rows } = await db.query<JobRow>(`SELECT * FROM visualization.jobs WHERE state = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`)
      if (!rows[0]) return null
      return this.update(db, rows[0].id, { state: 'running', started_at: 'now' })
    })
  }

  private async run(job: JobRow): Promise<void> {
    const controller = new AbortController()
    this.running.set(job.id, controller)
    const heartbeat = setInterval(() => void this.o.pool.query(`UPDATE visualization.jobs SET updated_at = now() WHERE id = $1 AND state = 'running'`, [job.id]).catch(() => undefined), 15_000)
    heartbeat.unref?.()
    try {
      const adapter = this.o.adapters.get(job.adapter)
      if (!adapter) throw new AdapterError('provider-unavailable', `The image adapter ${job.adapter} is not installed on this server.`, false)
      const access = await this.o.access.resolve(job.created_by, job.project_id)
      const ok = this.acceptance(adapter, access)
      if (!ok.ok) throw new AdapterError(`unavailable-${ok.code}`, ok.message, false)
      const credential = adapter.testOnly ? ({ kind: 'none' } as ImageCredential) : await access.credential()
      const references = await Promise.all(
        job.reference_assets.map(async (r, i) => {
          const a = await this.assetRow(job.project_id, r.id)
          return { bytes: await this.o.blobs.get(a.blob_key, { verify: true }), mediaType: a.media_type, fileName: `reference-${i + 1}.${a.media_type.split('/')[1]}` }
        }),
      )
      const out = await adapter.generate({ model: job.model, prompt: composePrompt(job.instruction), size: job.options.size, quality: job.options.quality, background: job.options.background, references, credential, attempt: job.attempt, signal: controller.signal })
      if (!out.bytes.length || out.bytes.length > MAX_OUTPUT_BYTES) throw new AdapterError('output-invalid', 'The provider returned an empty or oversized image.', true)
      if (out.mediaType === 'image/svg+xml' && !adapter.testOnly) throw new AdapterError('output-invalid', 'Only test adapters may return SVG.', false)
      // The bytes are stored before the final transaction (content-addressed: storing twice is harmless).
      const stored = await this.o.blobs.put(out.bytes)
      await this.tx(async (db) => {
        const r = await this.lockJob(db, job.project_id, job.id)
        if (r.cancel_requested || r.state !== 'running') {
          if (r.state === 'running') await this.update(db, r.id, { state: 'cancelled', finished_at: 'now', usage: out.usage ?? null })
          return
        }
        const { rows } = await db.query<AssetRow>(
          `INSERT INTO visualization.assets (id, project_id, blob_key, sha256, media_type, byte_size, width, height, origin, job_id, test_asset, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'generated',$9,$10,$11)
           ON CONFLICT (project_id, sha256, origin) DO UPDATE SET project_id = EXCLUDED.project_id RETURNING *`,
          [randomUUID(), job.project_id, stored.key, stored.sha256, out.mediaType, stored.byteSize, out.width, out.height, job.id, adapter.testOnly, job.created_by],
        )
        await this.update(db, r.id, { state: 'succeeded', finished_at: 'now', output_asset_id: rows[0].id, revised_prompt: out.revisedPrompt ?? null, usage: out.usage ?? null, error: null })
      })
    } catch (e) {
      const shutdown = controller.signal.aborted && (controller.signal.reason as Error | undefined)?.message === 'shutdown'
      const err =
        e instanceof AdapterError
          ? e
          : new AdapterError('provider-unavailable', 'The image could not be generated (internal error). Retry later.', true)
      if (!(e instanceof AdapterError)) this.o.log?.error(e, `visualization job ${job.id} failed`)
      await this.tx(async (db) => {
        const r = await this.lockJob(db, job.project_id, job.id)
        if (r.state !== 'running') return
        if (r.cancel_requested || (err.code === 'cancelled' && !shutdown)) await this.update(db, r.id, { state: 'cancelled', finished_at: 'now' })
        else if (shutdown) await this.update(db, r.id, { state: 'failed', finished_at: 'now', error: { code: 'interrupted', message: 'The server stopped while this image was being generated; retry to generate it again.', retryable: true } })
        else await this.update(db, r.id, { state: 'failed', finished_at: 'now', error: { code: err.code, message: err.message, retryable: err.retryable } })
      }).catch((x) => this.o.log?.error(x, `recording the failure of job ${job.id} failed`))
    } finally {
      clearInterval(heartbeat)
      this.running.delete(job.id)
    }
  }

  // ---- persistence helpers ---------------------------------------------------------------------------

  private async tx<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.o.pool.connect()
    try {
      await client.query('BEGIN')
      const out = await fn(client)
      await client.query('COMMIT')
      return out
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }

  private async byKey(projectId: string, key: string): Promise<JobRow | undefined> {
    return (await this.o.pool.query<JobRow>('SELECT * FROM visualization.jobs WHERE project_id = $1 AND idempotency_key = $2', [projectId, key])).rows[0]
  }

  private async jobRow(projectId: string, jobId: string): Promise<JobRow> {
    if (!UUID.test(jobId)) throw notFound(`No generation job ${jobId} in project ${projectId}.`)
    const { rows } = await this.o.pool.query<JobRow>('SELECT * FROM visualization.jobs WHERE project_id = $1 AND id = $2', [projectId, jobId])
    if (!rows[0]) throw notFound(`No generation job ${jobId} in project ${projectId}.`)
    return rows[0]
  }

  private async lockJob(db: PoolClient, projectId: string, jobId: string): Promise<JobRow> {
    if (!UUID.test(jobId)) throw notFound(`No generation job ${jobId} in project ${projectId}.`)
    const { rows } = await db.query<JobRow>('SELECT * FROM visualization.jobs WHERE project_id = $1 AND id = $2 FOR UPDATE', [projectId, jobId])
    if (!rows[0]) throw notFound(`No generation job ${jobId} in project ${projectId}.`)
    return rows[0]
  }

  /** Updates a job (values 'now' for timestamps) and records the event when the state changes. */
  private async update(db: PoolClient, id: string, fields: Record<string, unknown>, emit = true): Promise<JobRow> {
    const sets: string[] = ['updated_at = now()']
    const args: unknown[] = [id]
    for (const [k, v] of Object.entries(fields)) {
      if (v === 'now') sets.push(`${k} = now()`)
      else {
        args.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)
        sets.push(`${k} = $${args.length}`)
      }
    }
    const { rows } = await db.query<JobRow>(`UPDATE visualization.jobs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, args)
    if (emit) await emitJobChanged(db, rows[0])
    return rows[0]
  }

  private async publicJob(r: JobRow): Promise<GenerationJob> {
    let output: GenerationJob['output'] = null
    if (r.output_asset_id) {
      const { rows } = await this.o.pool.query<AssetRow>('SELECT * FROM visualization.assets WHERE id = $1', [r.output_asset_id])
      if (rows[0]) output = { asset: toAsset(rows[0]), ...(r.revised_prompt ? { revisedPrompt: r.revised_prompt } : {}) }
    }
    return {
      id: r.id,
      projectId: r.project_id,
      batchId: r.batch_id,
      state: r.state,
      kind: r.kind,
      subject: r.subject,
      instruction: r.instruction,
      adapter: r.adapter,
      provider: { id: r.provider_id, name: r.provider_name, model: r.model, method: r.provider_method },
      options: r.options,
      referenceAssets: r.reference_assets,
      idempotencyKey: r.idempotency_key,
      attempt: r.attempt,
      purpose: r.purpose,
      clientRef: r.client_ref,
      provenance: r.provenance,
      createdBy: r.created_by,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at),
      cancelRequested: r.cancel_requested,
      error: r.error,
      output,
      usage: r.usage,
      testAsset: r.test_asset,
    }
  }
}
