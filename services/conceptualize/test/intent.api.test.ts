import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConceptsArtifactSource } from '@ews/conceptualize-service'
import { BASE, PROJECT, assistant, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

/**
 * Engineering intent (ECII increment 1) on a real PostgreSQL database: structure validation, immutable
 * revisions, basis rules and the deterministic gaps. These tests prove structure and computation, not the
 * quality of a model's interpretation.
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const post = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'POST', `${BASE}${path}`, body, idem(headers))
const get = (path: string, user = 'rho') => env.call(user, 'GET', `${BASE}${path}`)

const hostedIntent = {
  designObject: 'Accessory for an existing apparatus',
  role: 'accessory',
  integration: 'hosted',
  rationale: 'It attaches to a system the person already owns.',
  externalSystems: [{ name: 'Existing apparatus (model not stated)', role: 'host', description: 'Owned by the person', identified: false, owner: 'external', relation: 'mounts-to' }],
  objectives: ['Stay attached in use'],
  questions: [{ id: 'Q1', text: 'Which model is it?', why: 'The attachment features depend on the model.', impact: 'blocks', options: ['continue generically', 'identify the model', 'upload photos or CAD', 'supply measurements'], state: 'open', needId: 'system-0' }],
}
const standaloneIntent = { designObject: 'Freestanding organizer', role: 'standalone', integration: 'standalone' }

describe('engineering intent: structure validation', () => {
  it('creates revision 1 with a key, conforming to the API contract', async () => {
    const r = await post('/intents', hostedIntent)
    expect(r.status).toBe(201)
    await expectConforms(env, 'createIntent', 201, r.body)
    expect(r.body).toMatchObject({ key: expect.stringMatching(/^INT-\d{3}$/), revision: 1, status: 'active', basis: 'user-assertion', integration: 'hosted', provenance: { sourceKind: 'user' } })
    expect(r.headers.etag).toBe('"1"')
    const one = await get(`/intents/${r.body.key}`)
    expect(one.status).toBe(200)
    await expectConforms(env, 'getIntent', 200, one.body)
    expect(one.body.id).toBe(r.body.id)
    const list = await get('/intents')
    await expectConforms(env, 'listIntents', 200, list.body)
    expect(list.body.map((i: { id: string }) => i.id)).toContain(r.body.id)
  })

  it('refuses structures that contradict themselves, naming the field', async () => {
    const a = await post('/intents', { ...standaloneIntent, externalSystems: hostedIntent.externalSystems })
    expect(a.status).toBe(422)
    expect(JSON.stringify(a.body)).toContain('externalSystems')
    const b = await post('/intents', { ...hostedIntent, role: 'standalone' })
    expect(b.status).toBe(422)
    expect(JSON.stringify(b.body)).toContain('integration')
    const c = await post('/intents', { ...hostedIntent, questions: [{ ...hostedIntent.questions[0], why: '' }] })
    expect(c.status).toBe(422)
    const d = await post('/intents', { ...hostedIntent, questions: [{ ...hostedIntent.questions[0], needId: 'unknown' }] })
    expect(d.status).toBe(422)
    const e = await post('/intents', { ...hostedIntent, integration: 'nonsense' })
    expect(e.status).toBe(400)
    const f = await post('/intents', { ...hostedIntent, informationNeeds: [{ id: 'N1', text: 'x', tier: 4, route: 'research', state: 'open' }] })
    expect(f.status).toBe(422)
    const g = await post('/intents', { ...hostedIntent, assumptions: ['00000000-0000-4000-8000-000000000000'] })
    expect(g.status).toBe(422)
  })

  it('keeps an external system without a product element as a description with identified false', async () => {
    const r = await post('/intents', hostedIntent)
    expect(r.body.externalSystems[0]).toMatchObject({ identified: false, description: 'Owned by the person' })
    expect(r.body.externalSystems[0].productElement).toBeUndefined()
  })

  it('needs the author permission to write; readers may read', async () => {
    expect((await post('/intents', standaloneIntent, 'rho')).status).toBe(403)
    expect((await get('/intents', 'rho')).status).toBe(200)
  })
})

describe('engineering intent: revisions', () => {
  it('writes immutable revisions, refuses stale edits and keeps every revision readable', async () => {
    const created = (await post('/intents', hostedIntent)).body
    const patch = (body: Record<string, unknown>, headers: Record<string, string> = {}) => env.call('eli', 'PATCH', `${BASE}/intents/${created.id}`, body, headers)
    const same = await patch({ expectedRevision: 1, objectives: hostedIntent.objectives })
    expect(same.status).toBe(200)
    expect(same.body.revision).toBe(1) // nothing changed, no new revision
    const named = await patch({ expectedRevision: 1, externalSystems: [{ ...hostedIntent.externalSystems[0], name: 'Model X', identified: true }], reason: 'The person named the model' })
    expect(named.status).toBe(200)
    await expectConforms(env, 'updateIntent', 200, named.body)
    expect(named.body).toMatchObject({ revision: 2, changeReason: 'The person named the model' })
    expect((await patch({ expectedRevision: 1, designObject: 'Stale' })).status).toBe(409)
    expect((await patch({ designObject: 'Stale' }, { 'if-match': '"1"' })).status).toBe(409)
    const revs = await get(`/intents/${created.id}/revisions`)
    expect(revs.body.map((r: { revision: number }) => r.revision)).toEqual([2, 1])
    const first = await get(`/intents/${created.id}?revision=1`)
    expect(first.body.externalSystems[0]).toMatchObject({ identified: false, name: 'Existing apparatus (model not stated)' })
    // Revision rows are immutable at the database level.
    await expect(env.pool.query(`UPDATE conceptualize.intent_revisions SET design_object = 'x' WHERE intent_id = $1`, [created.id])).rejects.toThrow()
    await expect(env.pool.query(`DELETE FROM conceptualize.intent_revisions WHERE intent_id = $1`, [created.id])).rejects.toThrow()
    const retired = await patch({ status: 'retired', expectedRevision: 2 })
    expect(retired.body.status).toBe('retired')
    expect((await patch({ designObject: 'Edit while retired', expectedRevision: 2 })).status).toBe(422)
    expect((await get('/intents')).body.map((i: { id: string }) => i.id)).not.toContain(created.id)
  })

  it('registers the intent in the artifact registry as kind intent', async () => {
    const created = (await post('/intents', standaloneIntent)).body
    const source = createConceptsArtifactSource(env.pool, env.server.conceptEvents)
    const page = await source.list(PROJECT, { kinds: ['intent'], limit: 500 })
    expect(page.items.find((a) => a.ref.id === created.id)).toMatchObject({ ref: { module: 'conceptualize', kind: 'intent' }, key: created.key, title: 'Freestanding organizer', lifecycle: 'working', version: { value: 1 } })
    await env.call('eli', 'PATCH', `${BASE}/intents/${created.id}`, { expectedRevision: 1, status: 'retired' })
    expect((await source.describe(PROJECT, [{ module: 'conceptualize', kind: 'intent', id: created.id }]))[0].lifecycle).toBe('retired')
  })
})

describe('engineering intent: basis rules', () => {
  it('records ai-hypothesis when the assistant writes, with its provenance', async () => {
    const r = await post('/intents', hostedIntent, 'eli', assistant())
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ basis: 'ai-hypothesis', provenance: { sourceKind: 'assistant', conversationId: 'CONV-test' } })
  })
  it('refuses a user-assertion basis from the assistant, accepts the gateway headers of declarative proposals', async () => {
    expect((await post('/intents', { ...hostedIntent, basis: 'user-assertion' }, 'eli', assistant())).status).toBe(422)
    const viaGateway = await post('/intents', hostedIntent, 'eli', { 'x-ews-source': 'assistant', 'x-ews-proposal': 'CONV-9/PRP-1' })
    expect(viaGateway.status).toBe(201)
    expect(viaGateway.body).toMatchObject({ basis: 'ai-hypothesis', provenance: { sourceKind: 'assistant', conversationId: 'CONV-9', proposalId: 'PRP-1' } })
  })
  it('refuses every assistant basis other than ai-hypothesis, on create and on revision', async () => {
    for (const basis of ['assumption', 'assessment', 'estimate', 'user-assertion']) {
      const r = await post('/intents', { ...hostedIntent, basis }, 'eli', assistant())
      expect(r.status).toBe(422)
      expect(r.body.error.code).toBe('invalid')
      expect(JSON.stringify(r.body)).toContain('basis')
    }
    const mine = (await post('/intents', standaloneIntent, 'eli', assistant())).body
    const patched = await env.call('eli', 'PATCH', `${BASE}/intents/${mine.id}`, { expectedRevision: 1, objectives: ['x'], basis: 'estimate' }, assistant())
    expect(patched.status).toBe(422)
  })
  it('the assistant cannot retire an intent; a person can', async () => {
    const mine = (await post('/intents', standaloneIntent)).body
    const r = await env.call('eli', 'PATCH', `${BASE}/intents/${mine.id}`, { expectedRevision: 1, status: 'retired' }, assistant())
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('forbidden')
    expect((await get(`/intents/${mine.id}`)).body.status).toBe('active')
    const byPerson = await env.call('eli', 'PATCH', `${BASE}/intents/${mine.id}`, { expectedRevision: 1, status: 'retired' })
    expect(byPerson.status).toBe(200)
  })
  it('an assistant revision of a person-asserted intent becomes an AI hypothesis again', async () => {
    const mine = (await post('/intents', standaloneIntent)).body
    expect(mine.basis).toBe('user-assertion')
    const r = await env.call('eli', 'PATCH', `${BASE}/intents/${mine.id}`, { expectedRevision: 1, objectives: ['Be tidy'] }, assistant())
    expect(r.body).toMatchObject({ revision: 2, basis: 'ai-hypothesis' })
  })
})

describe('identify_gaps (deterministic, from the structure)', () => {
  it('an unidentified system the design attaches to is an essential gap covered by the question', async () => {
    const created = (await post('/intents', hostedIntent)).body
    const g = await get(`/intents/${created.key}/gaps`)
    expect(g.status).toBe(200)
    await expectConforms(env, 'identifyIntentGaps', 200, g.body)
    expect(g.body.counts).toEqual({ essential: 1, concept: 0, detail: 0, immaterial: 0 })
    expect(g.body.gaps[0]).toMatchObject({ tier: 'essential', text: 'identify host model and mounting features', route: 'ask-user', source: 'structure' })
    expect(g.body.researchItems).toEqual([])
    expect(g.body.unaskedEssential).toEqual([])
    const uncovered = (await post('/intents', { ...hostedIntent, questions: [] })).body
    expect((await get(`/intents/${uncovered.id}/gaps`)).body.unaskedEssential).toHaveLength(1)
  })
  it('a standalone intent has no system gaps and no research items', async () => {
    const created = (await post('/intents', standaloneIntent)).body
    const g = (await get(`/intents/${created.id}/gaps`)).body
    expect(g.gaps).toEqual([])
    expect(g.systemGaps).toEqual([])
    expect(g.researchItems).toEqual([])
  })
  it('follows revisions: identifying the system closes the gap, an earlier revision keeps its gaps', async () => {
    const created = (await post('/intents', hostedIntent)).body
    await env.call('eli', 'PATCH', `${BASE}/intents/${created.id}`, { expectedRevision: 1, externalSystems: [{ ...hostedIntent.externalSystems[0], identified: true }] })
    expect((await get(`/intents/${created.id}/gaps`)).body.gaps).toEqual([])
    expect((await get(`/intents/${created.id}/gaps?revision=1`)).body.counts.essential).toBe(1)
  })
  it('only open tier 1 needs routed to research are research items', async () => {
    const created = (await post('/intents', { ...standaloneIntent, informationNeeds: [{ id: 'N1', text: 'Look it up', tier: 1, route: 'research', state: 'open' }, { id: 'N2', text: 'Nice to know', tier: 3, route: 'research', state: 'open' }] })).body
    const g = (await get(`/intents/${created.id}/gaps`)).body
    expect(g.counts).toEqual({ essential: 1, concept: 0, detail: 1, immaterial: 0 })
    expect(g.researchItems.map((x: { ref: string }) => x.ref)).toEqual(['N1'])
  })
})

describe('read_context', () => {
  it('returns the intent with its assumptions, the project constraints and concepts, open questions and gaps', async () => {
    const assumption = (await post('/assumptions', { statement: 'The person owns one such apparatus' })).body
    expect(assumption.id).toBeTruthy()
    const created = (await post('/intents', { ...hostedIntent, assumptions: [assumption.id] })).body
    const ctx = await get(`/intents/${created.key}/context`)
    expect(ctx.status).toBe(200)
    await expectConforms(env, 'readIntentContext', 200, ctx.body)
    expect(ctx.body.intent.id).toBe(created.id)
    expect(ctx.body.assumptions.map((a: { id: string }) => a.id)).toEqual([assumption.id])
    expect(ctx.body.questions).toHaveLength(1)
    expect(ctx.body.gaps.counts.essential).toBe(1)
    expect(Array.isArray(ctx.body.constraints)).toBe(true)
    expect(Array.isArray(ctx.body.concepts)).toBe(true)
  })
})
