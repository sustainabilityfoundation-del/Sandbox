import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { ensureDatabase, startEmbedded, type EmbeddedHandle } from '../../api/src/database'
import { buildServer, prepareDatabase, type ApiServer } from '../../api/src/server'
import { memoryObjectStorage } from '@ews/requirements-service'
import { localBlobStore } from '../src/blob/blobStore'

/**
 * Integration milestone 1, increment I1: acceptance workflow steps 1, 2, 5 and 6 (docs/specifications/
 * integration-milestone-1.md §2) against the real services hosted by the API (Project Management, Requirements,
 * Conceptualize, SysML) on a real PostgreSQL that is stopped and started again between steps 2 and 6.
 *
 * Step 2's function is a first-class Conceptualize Function (C1, on main since the I1 merge).
 * The database starts empty apart from the development identities and the preserved PRJ-ACT100 fixture.
 */
const dir = mkdtempSync(join(tmpdir(), 'ews-i1-'))
const port = 59000 + Math.floor(Math.random() * 900)
const cfg = { port, dataDir: join(dir, 'pg'), user: 'postgres', password: 'test-only', persistent: true }
const dbUrl = `postgres://postgres:test-only@127.0.0.1:${port}/ews_test_i1`

let handle: EmbeddedHandle | undefined
let pool: pg.Pool | undefined
let server: ApiServer | undefined

async function up() {
  handle = await startEmbedded(cfg, () => undefined)
  await ensureDatabase(handle.adminUrl, 'ews_test_i1')
  pool = new pg.Pool({ connectionString: dbUrl, max: 10 })
  await prepareDatabase(pool, { seed: true })
  server = await buildServer({ pool, storage: memoryObjectStorage(), production: false, eventPollMs: 200, blobs: localBlobStore(join(dir, 'objects')) })
}

async function down() {
  await server?.close()
  await pool?.end()
  await handle?.stop()
  server = undefined
  pool = undefined
  handle = undefined
}

let seq = 0
async function call(user: string, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await server!.app.inject({
    method: method as 'GET',
    url,
    headers: { 'x-dev-user': user, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method === 'POST' ? { 'idempotency-key': `i1-${seq++}` } : {}), ...headers },
    payload: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined }
}
const ok = <T = any>(r: { status: number; body: T }, status = 200): T => {
  if (r.status !== status) throw new Error(`expected ${status}, got ${r.status}: ${JSON.stringify(r.body)}`)
  return r.body
}

afterAll(async () => {
  await down().catch(() => undefined)
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
})

describe('I1 acceptance (steps 1, 2, 5, 6) on real services', () => {
  it('creates a genuinely empty project, populates it through the modules, survives a full restart and recovers everything', { timeout: 300_000 }, async () => {
    await up()
    const PM = '/api/projects/v1/projects'
    // ---- Step 1: a genuinely empty project (Project Management, real) ------------------------------------
    const project = ok(await call('ada', 'POST', `/api/projects/v1/projects`, { key: 'EEP', name: 'Example Engineering Product', description: 'Developed from first principles', disciplines: ['mechanical', 'systems'] }), 201)
    const id = project.id as string
    const REQ = `/api/requirements/v1/projects/${id}`
    const CON = `/api/concepts/v1/projects/${id}`
    expect(ok(await call('ada', 'GET', `${PM}/${id}/artifacts`)).total).toBe(0)
    expect(ok(await call('ada', 'GET', `${REQ}/requirements`)).items).toEqual([])
    expect(ok(await call('ada', 'GET', `${CON}/concepts`)).items).toEqual([])
    expect(ok(await call('ada', 'GET', `/api/sysml/v1/projects?platformProjectId=${id}`))).toEqual([])
    const states = ok(await call('ada', 'GET', `${PM}/${id}/context`)).modules
    const hosted = states.filter((m: { module: string }) => m.module !== 'settings')
    expect(hosted.map((m: { module: string }) => m.module).sort()).toEqual(['cad', 'conceptualize', 'requirements', 'sysml'])
    expect(hosted.every((m: { status: string }) => m.status === 'not-needed' || m.status === 'ready')).toBe(true)

    // ---- Step 2: requirement (Requirements, real), function and candidate concepts and a decision (Conceptualize, real)
    const requirement = ok(await call('ada', 'POST', `${REQ}/requirements`, { title: 'Bracket stiffness', statement: 'The bracket shall deflect less than 0.5 mm under a 200 N load.', type: 'performance' }), 201)
    const fn = ok(await call('ada', 'POST', `${CON}/functions`, { name: 'Hold the drive unit', verbPhrase: 'hold drive unit' }), 201)
    const parent = ok(await call('ada', 'POST', `${CON}/concepts`, { name: 'Drive mount', abstraction: 'component' }), 201)
    const candidates = []
    for (const name of ['Welded steel bracket', 'Machined aluminium bracket', 'Cast bracket']) candidates.push(ok(await call('ada', 'POST', `${CON}/concepts`, { name, abstraction: 'component' }), 201))
    const set = ok(await call('ada', 'POST', `${CON}/alternative-sets`, { parentId: parent.id, name: 'Bracket options', question: 'How is the drive unit held?', memberIds: candidates.map((c) => c.id) }), 201)
    const decision = ok(
      await call('ada', 'POST', `${CON}/decisions`, {
        title: 'Machined aluminium bracket',
        rationale: 'Meets the stiffness requirement with the lowest mass; welding distortion risk avoided.',
        setId: set.id,
        record: true,
        outcomes: [
          { conceptId: candidates[1].id, outcome: 'accepted' },
          { conceptId: candidates[0].id, outcome: 'rejected', rationale: 'Distortion after welding' },
          { conceptId: candidates[2].id, outcome: 'deferred' },
        ],
      }),
      201,
    )
    // Product structure (Project Management product registry, real) and allocation through it (Requirements, real).
    const breakdown = ok(await call('ada', 'POST', `${PM}/${id}/breakdowns`, { name: 'Product breakdown', purpose: 'product-breakdown' }), 201)
    const product = ok(await call('ada', 'POST', `${PM}/${id}/product-elements`, { name: 'Example product', elementKind: 'product', placement: { breakdownId: breakdown.id, parentId: null } }), 201)
    const bracket = ok(await call('ada', 'POST', `${PM}/${id}/product-elements`, { name: 'Bracket', elementKind: 'part', properties: { mass: { value: 0.35, unit: 'kg' } }, placement: { breakdownId: breakdown.id, parentId: product.id } }), 201)
    const allocation = ok(await call('ada', 'POST', `${REQ}/relationships`, { type: 'allocated-to', fromId: requirement.id, toTwinId: bracket.id }), 201)
    const task = ok(await call('ada', 'POST', `${PM}/${id}/work-items`, { kind: 'task', title: 'Verify bracket stiffness by analysis', subjects: [bracket.artifactId] }), 201)
    // A second revision, so the history has something to keep.
    const reqV2 = ok(await call('ada', 'PATCH', `${REQ}/requirements/${requirement.id}`, { statement: 'The bracket shall deflect less than 0.4 mm under a 200 N load.' }, { 'if-match': `"${requirement.revision}"` }))

    // The artifact registry is eventually consistent by design (ADR-0062): module events are polled and applied by the
    // registry consumer. Wait for the documented eventual state (every artifact registered at its latest revision)
    // before taking the reference snapshot; otherwise `project.counts.artifacts` and the artifact list depend on how far
    // the consumer has got when the snapshot is taken (observed under load). The comparison itself stays strict.
    const expectedArtifacts = new Map<string, number | undefined>([
      [requirement.id, reqV2.revision],
      [fn.id, undefined],
      [parent.id, undefined],
      ...candidates.map((c) => [c.id, undefined] as [string, undefined]),
      [decision.id, decision.revision],
      [product.id, undefined],
      [bracket.id, undefined],
      [task.id, undefined],
    ])
    let registered = 0
    for (let i = 0; i < 150; i++) {
      await server!.events.flush()
      await server!.projectsRegistry()?.idle()
      const listed = ok(await call('ada', 'GET', `${PM}/${id}/artifacts?limit=200`)).items as { ref: { id: string }; version: { value: number } }[]
      registered = listed.filter((a) => expectedArtifacts.has(a.ref.id) && (expectedArtifacts.get(a.ref.id) === undefined || expectedArtifacts.get(a.ref.id) === a.version.value)).length
      if (registered === expectedArtifacts.size && listed.length === expectedArtifacts.size) break
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(registered).toBe(expectedArtifacts.size)

    const snapshot = async () => ({
      project: ok(await call('ada', 'GET', `${PM}/${id}`)),
      requirement: ok(await call('ada', 'GET', `${REQ}/requirements/${requirement.id}`)),
      requirementRevisions: ok(await call('ada', 'GET', `${REQ}/requirements/${requirement.id}/revisions`)),
      allocations: ok(await call('ada', 'GET', `${REQ}/relationships?type=allocated-to`)),
      fn: ok(await call('ada', 'GET', `${CON}/functions/${fn.id}`)),
      concepts: ok(await call('ada', 'GET', `${CON}/concepts?limit=200`)).items.map((c: { id: string; name: string; abstraction: string; revision: number }) => ({ id: c.id, name: c.name, abstraction: c.abstraction, revision: c.revision })),
      set: ok(await call('ada', 'GET', `${CON}/alternative-sets/${set.id}`)),
      decision: ok(await call('ada', 'GET', `${CON}/decisions/${decision.id}`)),
      elements: ok(await call('ada', 'GET', `${PM}/${id}/product-elements`)),
      tree: ok(await call('ada', 'GET', `${PM}/${id}/breakdowns/${breakdown.id}/tree`)),
      workItems: ok(await call('ada', 'GET', `${PM}/${id}/work-items`)),
      links: ok(await call('ada', 'GET', `${PM}/${id}/links`)),
      artifacts: ok(await call('ada', 'GET', `${PM}/${id}/artifacts?sort=key`)),
      activity: ok(await call('ada', 'GET', `${PM}/${id}/activity?limit=200`)),
    })
    const before = await snapshot()
    expect(before.decision).toMatchObject({ status: 'recorded', recordedBy: 'ada', title: 'Machined aluminium bracket' })
    expect(before.decision.outcomes).toHaveLength(3)
    expect(before.concepts.map((c: { name: string }) => c.name).sort()).toEqual(['Cast bracket', 'Drive mount', 'Machined aluminium bracket', 'Welded steel bracket'])
    expect(before.fn).toMatchObject({ id: fn.id, name: 'Hold the drive unit' })
    expect(before.allocations.some((r: { id: string; toTwinId: string }) => r.id === allocation.id && r.toTwinId === bracket.id)).toBe(true)
    expect(before.requirement.revision).toBe(reqV2.revision)

    // ---- Step 5: save, close, restart the services and PostgreSQL --------------------------------------------
    await down()
    await up()

    // ---- Step 6: recover every committed artifact, relationship, revision and decision ------------------------
    const after = await snapshot()
    expect(after).toEqual(before)
    expect(after.requirement.statement).toContain('0.4 mm')
    expect(after.requirementRevisions.length).toBeGreaterThanOrEqual(2)
    expect(after.decision.outcomes).toContainEqual({ conceptId: candidates[0].id, outcome: 'rejected', rationale: 'Distortion after welding' })
    expect(after.decision.rationale).toContain('lowest mass')
    expect(after.tree.roots[0].children[0].element.id).toBe(bracket.id)
    expect(after.workItems.items[0]).toMatchObject({ id: task.id, subjects: [bracket.artifactId] })
    expect(after.fn).toMatchObject({ id: fn.id, name: 'Hold the drive unit', revision: fn.revision })
  })
})
