import '../../api/test/providedContext'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { inject } from 'vitest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { memoryObjectStorage } from '@ews/requirements-service'
import { dropDatabase, ensureDatabase } from '../../api/src/database'
import { buildServer, prepareDatabase, type ApiServer } from '../../api/src/server'
import { AdapterRegistry, createFakeImageAdapter, createOpenAIImageAdapter, type ImageAdapter } from '../src/index'

/**
 * Visualization service on a real PostgreSQL, hosted by the API server (contracts §1, §4): idempotency, retry,
 * cancel, partial failure keeping successes, refusals without a job, credential handling through the assistant
 * service. The OpenAI adapter talks to a stubbed fetch; no real provider is ever called.
 */

const PROJECT = 'PRJ-ACT100'
const V = `/api/visualization/v1/projects/${PROJECT}`
const A = '/api/assistant/v1'
const KEY = `sk-proj-${randomBytes(16).toString('hex')}`
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const concept = (revision = 1, id = 'c0ffee00-0000-4000-8000-000000000001') => ({ module: 'conceptualize', type: 'concept', id, revision })
const req = (instruction: string, over: Record<string, unknown> = {}) => ({ kind: 'illustration', subject: concept(), instruction, adapter: 'fake-test', ...over })

let name: string
let pool: pg.Pool
let server: ApiServer
let fakeCalls = 0
const imageCalls: { url: string; auth: string | null; body: string }[] = []

/** Stubbed OpenAI: model listing (connection validation) and image generation. */
const openaiFetch = (async (url: string, init: RequestInit = {}) => {
  const auth = new Headers(init.headers).get('authorization')
  if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  if (String(url).includes('/images/')) {
    imageCalls.push({ url: String(url), auth, body: typeof init.body === 'string' ? init.body : '' })
    return new Response(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }], usage: { input_tokens: 40, output_tokens: 1200, input_tokens_details: { text_tokens: 40, image_tokens: 0 } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response('{}', { status: 404 })
}) as unknown as typeof fetch

async function call(user: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await server.app.inject({ method: method as 'GET', url: path, headers: { 'x-dev-user': user, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, payload: body === undefined ? undefined : JSON.stringify(body) })
  let parsed: any = res.body
  try {
    parsed = res.body ? JSON.parse(res.body) : undefined
  } catch {
    /* not JSON */
  }
  return { status: res.statusCode, body: parsed, headers: res.headers, raw: res.rawPayload }
}

async function settle(jobId: string, ms = 15000) {
  const end = Date.now() + ms
  for (;;) {
    const j = (await call('eli', 'GET', `${V}/jobs/${jobId}`)).body
    if (['succeeded', 'failed', 'cancelled'].includes(j.state)) return j
    if (Date.now() > end) throw new Error(`job ${jobId} still ${j.state}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}
async function until(cond: () => Promise<boolean>, ms = 10000) {
  const end = Date.now() + ms
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 30))
  }
}

beforeAll(async () => {
  name = `ews_test_${randomBytes(5).toString('hex')}`
  const admin = inject('pgAdminUrl')
  await ensureDatabase(admin, name)
  const u = new URL(admin)
  u.pathname = `/${name}`
  pool = new pg.Pool({ connectionString: u.toString(), max: 15 })
  await prepareDatabase(pool, { seed: true })
  const fake = createFakeImageAdapter({ slowMs: 4000 })
  const counted: ImageAdapter = { ...fake, generate: (i) => (fakeCalls++, fake.generate(i)) }
  const adapters = new AdapterRegistry({ production: false }).register(createOpenAIImageAdapter({ fetch: openaiFetch })).register(counted)
  server = await buildServer({ pool, storage: memoryObjectStorage(), production: false, eventPollMs: 50, assistant: { fetch: openaiFetch }, visualization: { adapters, runner: { concurrency: 2, pollMs: 100, staleAfterMs: 1000 } } })
}, 180_000)
afterAll(async () => {
  await server?.close()
  await pool?.end()
  if (name) await dropDatabase(inject('pgAdminUrl'), name)
})

describe('visualization: jobs with the fake test adapter', () => {
  it('creates a job, runs it in the background and stores a labelled test asset in the blob store', async () => {
    const r = await call('eli', 'POST', `${V}/jobs`, req('Concept A: a hinged clip that holds the bits', { purpose: 'Alternative A', clientRef: 'visual-a' }))
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ created: true, job: { state: 'pending', adapter: 'fake-test', provider: { id: 'fake', model: 'fake-image-1', method: null }, subject: concept(), attempt: 1, testAsset: true, purpose: 'Alternative A', clientRef: 'visual-a', provenance: { sourceKind: 'user' } } })
    const job = await settle(r.body.job.id)
    expect(job.state).toBe('succeeded')
    expect(job.output.asset).toMatchObject({ mediaType: 'image/svg+xml', origin: 'generated', testAsset: true, jobId: job.id, width: 1536, height: 1024 })
    const content = await call('eli', 'GET', job.output.asset.contentUrl)
    expect(content.headers['content-type']).toBe('image/svg+xml')
    expect(content.headers['x-test-asset']).toBe('true')
    expect(content.headers['content-security-policy']).toMatch(/sandbox/)
    expect(String(content.raw)).toContain('TEST ASSET')
    // The bytes are in the Project Management blob store (content-addressed).
    expect(await server.projectBlobs.has(`sha256/${job.output.asset.sha256.slice(0, 2)}/${job.output.asset.sha256}`)).toBe(true)
    // Events for every state change, in order.
    await until(async () => (await call('eli', 'GET', `${V}/jobs?clientRef=visual-a`)).body.items.length === 1)
    const { rows } = await pool.query(`SELECT state FROM visualization.outbox WHERE job_id = $1 ORDER BY seq`, [job.id])
    expect(rows.map((x) => x.state)).toEqual(['pending', 'running', 'succeeded'])
  })

  it('is idempotent: identical requests return the same job and generate once', async () => {
    const body = req('Concept B: a magnetic strip   holder', { purpose: 'first' })
    const first = await call('eli', 'POST', `${V}/jobs`, body)
    const before = fakeCalls
    const again = await call('eli', 'POST', `${V}/jobs`, { ...body, instruction: ' Concept B:  a magnetic strip holder ', purpose: 'second label', clientRef: 'other' })
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ created: false, job: { id: first.body.job.id, purpose: 'first' } })
    await settle(first.body.job.id)
    // After success a repeat still returns the finished job: no second generation, no second charge.
    const third = await call('ada', 'POST', `${V}/jobs`, body)
    expect(third.body).toMatchObject({ created: false, job: { id: first.body.job.id, state: 'succeeded' } })
    expect(fakeCalls - before).toBeLessThanOrEqual(1)
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM visualization.jobs WHERE idempotency_key = $1`, [first.body.job.idempotencyKey])
    expect(rows[0].n).toBe(1)
    // A different revision of the concept is a different request.
    const rev2 = await call('eli', 'POST', `${V}/jobs`, { ...body, subject: concept(2) })
    expect(rev2.body.created).toBe(true)
    // Concurrent identical requests also yield one job.
    const burst = await Promise.all([1, 2, 3, 4].map(() => call('eli', 'POST', `${V}/jobs`, req('Concept C: concurrent request'))))
    expect(new Set(burst.map((b) => b.body.job.id)).size).toBe(1)
    expect(burst.filter((b) => b.body.created)).toHaveLength(1)
  })

  it('retries a failed job as the same job with the next attempt', async () => {
    const r = await call('eli', 'POST', `${V}/jobs`, req('Concept D [fake:fail-once]'))
    const failed = await settle(r.body.job.id)
    expect(failed).toMatchObject({ state: 'failed', attempt: 1, error: { code: 'provider-unavailable', retryable: true }, output: null })
    const retried = await call('eli', 'POST', `${V}/jobs/${failed.id}/retry`)
    expect(retried.body).toMatchObject({ id: failed.id, state: 'pending', attempt: 2, error: null })
    expect(await settle(failed.id)).toMatchObject({ state: 'succeeded', attempt: 2 })
    expect((await call('eli', 'POST', `${V}/jobs/${failed.id}/retry`)).status).toBe(409)
  })

  it('cancels a running job (late output discarded) and a pending one; cancelled jobs can be retried', async () => {
    const slow = await call('eli', 'POST', `${V}/jobs`, req('Concept E [fake:slow]'))
    await until(async () => (await call('eli', 'GET', `${V}/jobs/${slow.body.job.id}`)).body.state === 'running')
    const c = await call('eli', 'POST', `${V}/jobs/${slow.body.job.id}/cancel`)
    expect(c.body).toMatchObject({ cancelRequested: true })
    const done = await settle(slow.body.job.id)
    expect(done).toMatchObject({ state: 'cancelled', output: null })
    // Pending: block both runner slots with slow jobs first.
    const blockers = await Promise.all([1, 2].map((i) => call('eli', 'POST', `${V}/jobs`, req(`Blocker ${i} [fake:slow]`))))
    await until(async () => (await Promise.all(blockers.map((b) => call('eli', 'GET', `${V}/jobs/${b.body.job.id}`)))).every((x) => x.body.state === 'running'))
    const queued = await call('eli', 'POST', `${V}/jobs`, req('Concept F queued'))
    const cancelled = await call('eli', 'POST', `${V}/jobs/${queued.body.job.id}/cancel`)
    expect(cancelled.body).toMatchObject({ state: 'cancelled', cancelRequested: false })
    for (const b of blockers) await call('eli', 'POST', `${V}/jobs/${b.body.job.id}/cancel`)
    expect((await call('eli', 'POST', `${V}/jobs/${queued.body.job.id}/retry`)).body.state).toBe('pending')
    expect(await settle(queued.body.job.id)).toMatchObject({ state: 'succeeded', attempt: 2 })
    // A succeeded job cannot be cancelled; its image is kept.
    expect((await call('eli', 'POST', `${V}/jobs/${queued.body.job.id}/cancel`)).status).toBe(409)
  })

  it('keeps successful items of a batch when another item fails or is refused', async () => {
    const r = await call('eli', 'POST', `${V}/batches`, { items: [req('Batch option 1'), req('Batch option 2 [fake:fail]'), req('Batch option 3', { adapter: 'no-such-adapter' }), req('Batch option 4')] })
    expect(r.status).toBe(200)
    expect(r.body.items.map((i: { outcome: string }) => i.outcome)).toEqual(['created', 'created', 'refused', 'created'])
    expect(r.body.items[2].error).toMatchObject({ code: 'generation-unavailable', details: { reason: 'provider-missing' } })
    const states = await Promise.all([0, 1, 3].map((i) => settle(r.body.items[i].job.id)))
    expect(states.map((s) => s.state)).toEqual(['succeeded', 'failed', 'succeeded'])
    const listed = (await call('eli', 'GET', `${V}/jobs?batchId=${r.body.batchId}`)).body.items
    expect(listed).toHaveLength(3)
    expect(listed.filter((j: { output: unknown }) => j.output)).toHaveLength(2)
  })

  it('marks a job interrupted when its process stopped mid-run, and never re-runs it automatically', async () => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO visualization.jobs (id, project_id, idempotency_key, state, kind, subject, subject_id, subject_revision, instruction, adapter, provider_id, provider_name, model, options, provenance, test_asset, created_by, updated_at, started_at)
       VALUES ($1,$2,$3,'running','illustration',$4,$5,1,'orphan','fake-test','fake','Test','fake-image-1','{"size":"1024x1024","quality":"low","background":"opaque"}','{"sourceKind":"user"}',true,'eli', now() - interval '1 hour', now() - interval '1 hour')`,
      [id, PROJECT, randomBytes(32).toString('hex'), JSON.stringify(concept()), concept().id],
    )
    const job = await settle(id)
    expect(job).toMatchObject({ state: 'failed', error: { code: 'interrupted', retryable: true } })
  })

  it('validates requests, references and access', async () => {
    expect((await call('eli', 'POST', `${V}/jobs`, { ...req('x'), subject: { ...concept(), revision: 0 } })).status).toBe(400)
    expect((await call('eli', 'POST', `${V}/jobs`, req('x', { referenceAssetIds: [randomUUID()] }))).status).toBe(422)
    expect((await call('rho', 'POST', `${V}/jobs`, req('reader request'))).status).toBe(403)
    expect((await call('rho', 'GET', `${V}/jobs`)).status).toBe(200)
    expect((await call('nia', 'GET', `${V}/jobs`)).status).toBe(403)
    const svgUpload = await call('eli', 'POST', `${V}/assets`, { mediaType: 'image/png', contentBase64: Buffer.from('<svg/>').toString('base64') })
    expect(svgUpload.status).toBe(422)
    const up = await call('eli', 'POST', `${V}/assets`, { fileName: 'ref.png', mediaType: 'image/png', contentBase64: PNG.toString('base64') })
    expect(up.status).toBe(201)
    expect(up.body).toMatchObject({ origin: 'upload', mediaType: 'image/png', width: 1, height: 1, testAsset: false })
    expect((await call('eli', 'POST', `${V}/assets`, { mediaType: 'image/png', contentBase64: PNG.toString('base64') })).body.id).toBe(up.body.id)
    const withRef = await call('eli', 'POST', `${V}/jobs`, req('With a reference', { referenceAssetIds: [up.body.id] }))
    expect(withRef.body.job.referenceAssets).toEqual([{ id: up.body.id, sha256: up.body.sha256, mediaType: 'image/png' }])
    const openapi = await server.app.inject({ method: 'GET', url: '/api/visualization/v1/openapi.json' })
    expect(Object.keys(JSON.parse(openapi.body).paths)).toEqual(expect.arrayContaining(['/projects/{projectId}/jobs', '/projects/{projectId}/batches', '/projects/{projectId}/jobs/{jobId}/retry', '/projects/{projectId}/events']))
  })
})

describe('visualization: real adapter availability and credentials (stubbed OpenAI)', () => {
  const real = (instruction: string) => req(instruction, { adapter: 'openai-images' })

  it('refuses clearly without a job when nothing is connected or image generation is off', async () => {
    const notConnected = await call('ada', 'POST', `${V}/jobs`, real('No connection'))
    expect(notConnected.status).toBe(409)
    expect(notConnected.body.error).toMatchObject({ code: 'generation-unavailable', details: { reason: 'not-connected' } })
    const adapters = (await call('ada', 'GET', `/api/visualization/v1/adapters?projectId=${PROJECT}`)).body
    expect(adapters.adapters.find((a: { id: string }) => a.id === 'openai-images')).toMatchObject({ available: false, unavailableCode: 'not-connected', testOnly: false })
    expect(adapters.defaultAdapter).toBe('fake-test')
    // Connected with an API key, but the Image generation setting is off by default.
    expect((await call('eli', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'openai', apiKey: KEY })).status).toBe(201)
    const disabled = await call('eli', 'POST', `${V}/jobs`, real('Setting off'))
    expect(disabled.body.error).toMatchObject({ code: 'generation-unavailable', details: { reason: 'images-disabled' } })
    expect(disabled.body.error.message).toMatch(/Image generation is off/)
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM visualization.jobs WHERE instruction IN ('No connection', 'Setting off')`)
    expect(rows[0].n).toBe(0)
  })

  it('generates with the key held by the assistant service; the key never appears in responses, events or the database', async () => {
    const values = (await call('eli', 'GET', `/api/settings/v1/values?projectId=${PROJECT}`)).body
    const put = await call('eli', 'PUT', `/api/settings/v1/users/me/values?projectId=${PROJECT}`, { values: { 'ai.images.enabled': true, 'ai.images.quality': 'low' } }, { 'if-match': values.user.etag })
    expect(put.status).toBe(200)
    const created = await call('eli', 'POST', `${V}/jobs`, real('A compact holder block with six hexagonal pockets'))
    expect(created.status).toBe(201)
    const job = await settle(created.body.job.id)
    expect(job).toMatchObject({ state: 'succeeded', provider: { id: 'openai', model: 'gpt-image-2.5-flare', method: 'api-key' }, options: { quality: 'low' }, testAsset: false, usage: { outputTokens: 1200, estimatedCostUsd: 0.0362 } })
    expect(job.output.asset).toMatchObject({ mediaType: 'image/png', testAsset: false })
    expect(imageCalls.at(-1)).toMatchObject({ url: 'https://api.openai.com/v1/images/generations', auth: `Bearer ${KEY}` })
    // Only the instruction and the fixed preface were sent: no project, user or concept identifiers.
    const sent = JSON.parse(imageCalls.at(-1)!.body)
    expect(Object.keys(sent).sort()).toEqual(['background', 'model', 'n', 'output_format', 'prompt', 'quality', 'size'])
    expect(sent.prompt).not.toContain(PROJECT)
    expect(sent.prompt).not.toContain(concept().id)
    const everything = JSON.stringify([
      job,
      (await call('eli', 'GET', `${V}/jobs`)).body,
      (await call('eli', 'GET', `/api/visualization/v1/adapters?projectId=${PROJECT}`)).body,
      (await pool.query('SELECT * FROM visualization.jobs')).rows,
      (await pool.query('SELECT * FROM visualization.outbox')).rows,
      (await pool.query('SELECT * FROM visualization.assets')).rows,
    ])
    expect(everything).not.toContain(KEY)
    expect(everything).not.toContain(KEY.slice(8))
  })
})
