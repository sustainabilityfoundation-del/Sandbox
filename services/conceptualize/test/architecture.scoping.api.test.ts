import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE, PROJECT, createTestEnv, idem, type TestEnv } from './helpers'

/**
 * Architecture diversity and readiness (ECII increment 2): scoping, records stored before the increment, a handoff built
 * without an intent, and variants resolved to their parent architecture. A fresh database: no intent exists until a test makes one.
 */
let env: TestEnv
const B = 'PRJ-ARCH-B'
const base = (p: string) => `/api/concepts/v1/projects/${p}`
const post = (path: string, body: unknown, user = 'eli') => env.call(user, 'POST', `${BASE}${path}`, body, idem())
const get = (path: string, user = 'rho') => env.call(user, 'GET', `${BASE}${path}`)

const arch = (extra: Record<string, unknown> = {}) => ({
  level: 'architecture',
  hostInterface: 'Existing threaded boss on the apparatus housing',
  attachmentPrinciple: 'Fastened through the boss with a captive screw',
  loadPath: 'Weight into the boss in shear',
  installationRemoval: 'One tool',
  disadvantages: ['Depends on one feature'],
  evidenceRequired: ['Boss dimensions'],
  ...extra,
})

beforeAll(async () => {
  env = await createTestEnv()
  for (const [u, role] of [['eli', 'editor'], ['rho', 'reader']]) await env.pool.query('INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [B, u, role])
})
afterAll(async () => {
  await env?.close()
})

describe('CAD handoff without an engineering intent', () => {
  it('says readiness was not assessed and adds no provisional entry', async () => {
    const c = (await post('/concepts', { name: 'No intent yet', definition: { intent: 'x', architecture: arch() } })).body
    const h = await post(`/concepts/${c.id}/handoffs`, {})
    expect(h.status, JSON.stringify(h.body)).toBe(201)
    expect(h.body.package.readiness).toMatchObject({ assessed: false, activity: 'cad-handoff', advisory: true })
    expect(h.body.package.unresolved.filter((u: { kind: string }) => u.kind === 'provisional-readiness')).toEqual([])
  })
})

describe('project scoping', () => {
  it('answers 404 for a Concept of another project on /readiness and /diversity', async () => {
    const a = (await post('/concepts', { name: 'Scoped A', definition: { architecture: arch() } })).body
    const b = (await post('/concepts', { name: 'Scoped B', definition: { architecture: arch({ attachmentPrinciple: 'Clamped around the housing' }) } })).body
    expect((await get(`/readiness?conceptId=${a.id}`)).status).toBe(200)
    expect((await env.call('rho', 'GET', `${base(B)}/readiness?conceptId=${a.id}`)).status).toBe(404)
    expect((await get(`/diversity?conceptIds=${a.id},${b.id}`)).status).toBe(200)
    expect((await env.call('rho', 'GET', `${base(B)}/diversity?conceptIds=${a.id},${b.id}`)).status).toBe(404)
    expect((await env.call('rho', 'GET', `${base(B)}/diversity?parentId=${a.id}`)).status).toBe(404)
  })
})

describe('a definition stored before ECII increment 2', () => {
  it('loads through the API with architecture null and is assessed as unclassified', async () => {
    const ids = [randomUUID(), randomUUID()]
    const client = await env.pool.connect()
    await client.query('BEGIN')
    for (const [i, id] of ids.entries()) {
      await client.query(`INSERT INTO conceptualize.concepts (id, project_id, key, current_revision, maturity, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,'defined',now(),'eli',now(),'eli')`, [id, PROJECT, `CON-9${i}0`])
      await client.query(`INSERT INTO conceptualize.concept_revisions (concept_id, revision, name, abstraction, maturity_at_creation, source_kind, created_at, created_by, definition) VALUES ($1,1,$2,'system','defined','user',now(),'eli',$3)`, [id, `Old concept ${i}`, JSON.stringify({ intent: 'old', components: [], relationships: [], interfaces: [], parameters: [], layout: null, idSeq: 0 })])
    }
    await client.query('COMMIT')
    client.release()
    const one = await get(`/concepts/${ids[0]}`)
    expect(one.status, JSON.stringify(one.body)).toBe(200)
    expect(one.body.definition.architecture).toBeNull()
    const d = await get(`/diversity?conceptIds=${ids.join(',')}`)
    expect(d.status).toBe(200)
    expect(d.body.unclassified).toHaveLength(2)
    const r = await get(`/readiness?conceptId=${ids[0]}`)
    expect(r.status).toBe(200)
    const upd = await env.call('eli', 'PATCH', `${BASE}/concepts/${ids[0]}`, { expectedRevision: 1, definition: { intent: 'old, revised' }, reason: 'Wording' }, idem())
    expect(upd.status, JSON.stringify(upd.body)).toBe(200)
    expect(upd.body.definition.architecture).toBeNull()
  })
})

describe('a variant is assessed through its parent architecture', () => {
  it('does not reach Context Established through a variant of an architecture without a host interface', async () => {
    const intent = (await post('/intents', { designObject: 'Accessory', role: 'accessory', integration: 'hosted', externalSystems: [{ name: 'Apparatus model 7', role: 'host', description: 'd', identified: true, owner: 'external', relation: 'mounts-to' }] })).body
    const bare = (await post('/concepts', { name: 'Bare architecture', definition: { architecture: arch({ hostInterface: '' }) } })).body
    const variantOfBare = (await post('/concepts', { name: 'Variant of bare', definition: { architecture: { level: 'variant', parent: bare.key } } })).body
    const r1 = await get(`/readiness?intentId=${intent.id}&conceptId=${variantOfBare.id}`)
    expect(r1.body).toMatchObject({ level: 'exploratory' })
    const host = (await post('/concepts', { name: 'Hosted architecture', definition: { architecture: arch() } })).body
    const variantOfHost = (await post('/concepts', { name: 'Variant of hosted', definition: { architecture: { level: 'variant', parent: 'Hosted architecture' } } })).body
    const r2 = await get(`/readiness?intentId=${intent.id}&conceptId=${variantOfHost.id}`)
    expect(r2.body).toMatchObject({ level: 'context-established', architecturesConsidered: 1 })
    expect(host.id).toBeTruthy()
  })
})
