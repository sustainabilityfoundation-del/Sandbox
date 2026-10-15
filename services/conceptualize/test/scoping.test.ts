import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ConceptsEvent } from '@ews/platform-sdk'
import { CONCEPT_SEED_IDS as SEED, CONSTRAINT_SEED_IDS, FUNCTION_SEED_IDS as FN } from '@ews/conceptualize-service'
import { createTestEnv, idem, type TestEnv } from './helpers'

/**
 * Integration milestone 1, C13 (project scoping): two projects; every write whose target or referenced
 * record belongs to another project than the path is refused, reads never leak across projects, and events
 * are delivered per project.
 */
let env: TestEnv
const A = 'PRJ-ACT100'
const B = 'PRJ-SCOPE-B'
const base = (p: string) => `/api/concepts/v1/projects/${p}`
const post = (p: string, path: string, body: unknown, user = 'eli') => env.call(user, 'POST', `${base(p)}${path}`, body, idem())
const ref = (type: string, id: string) => ({ module: 'conceptualize', type, id })
/** A clean refusal (never a server error or a success). */
const refused = (status: number) => [400, 403, 404, 409, 422].includes(status)

beforeAll(async () => {
  env = await createTestEnv()
  for (const [u, role] of [['eli', 'editor'], ['rui', 'reviewer'], ['rho', 'reader']]) await env.pool.query('INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [B, u, role])
})
afterAll(async () => {
  await env?.close()
})

describe('project scoping (C13)', () => {
  it('starts project B empty and never shows project A records through B', async () => {
    expect((await env.call('rho', 'GET', `${base(B)}/concepts`)).body.items).toEqual([])
    expect((await env.call('rho', 'GET', `${base(B)}/functions`)).body).toEqual([])
    expect((await env.call('rho', 'GET', `${base(B)}/concepts/${SEED.actuator}`)).status).toBe(404)
    expect((await env.call('rho', 'GET', `${base(B)}/functions/${FN.linearForce}`)).status).toBe(404)
    expect((await env.call('rho', 'GET', `${base(B)}/constraints/${CONSTRAINT_SEED_IDS.envelope}`)).status).toBe(404)
    expect((await env.call('rho', 'GET', `${base(B)}/search?q=actuator`)).body.items).toEqual([])
    const t = await env.call('rho', 'POST', `${base(B)}/graph/traverse`, { start: [ref('concept', SEED.actuator)], maxDepth: 2 })
    expect(t.body.edges).toEqual([])
  })

  it('refuses writes to records of another project through this project path', async () => {
    const a = (await env.call('rho', 'GET', `${base(A)}/concepts/${SEED.actuator}`)).body
    expect((await env.call('eli', 'PATCH', `${base(B)}/concepts/${SEED.actuator}`, { expectedRevision: a.revision, name: 'Hijacked' })).status).toBe(404)
    expect((await env.call('eli', 'PATCH', `${base(B)}/functions/${FN.linearForce}`, { expectedRevision: 1, name: 'Hijacked' })).status).toBe(404)
    expect((await post(B, `/constraints/${CONSTRAINT_SEED_IDS.envelope}/status`, { expectedRevision: 1, status: 'retired', reason: 'x' })).status).toBe(404)
    expect((await env.call('rho', 'GET', `${base(A)}/concepts/${SEED.actuator}`)).body.name).toBe(a.name)
  })

  it('refuses references from project B records to project A records', async () => {
    const c = (await post(B, '/concepts', { name: 'B concept' })).body
    const fnB = (await post(B, '/functions', { name: 'B function' })).body
    // Relationships, design links, decompositions
    expect((await post(B, '/relationships', { type: 'depends-on', fromId: c.id, toId: SEED.actuator })).status).toSatisfy(refused)
    expect((await post(B, '/design-links', { type: 'performs', from: ref('concept', c.id), to: ref('function', FN.linearForce) })).status).toSatisfy(refused)
    expect((await post(B, '/design-links', { type: 'performs', from: ref('concept', SEED.actuator), to: ref('function', fnB.id) })).status).toSatisfy(refused)
    expect((await post(B, '/functions', { name: 'Sub of A', parentFunctionId: FN.linearForce })).status).toSatisfy(refused)
    expect((await post(B, '/concepts', { name: 'Child of A', parentId: SEED.actuator })).status).toSatisfy(refused)
    expect((await post(B, '/concepts', { name: 'Performs A', performs: [FN.linearForce] })).status).toSatisfy(refused)
    // Constraints, assumptions and evidence subjects
    expect((await post(B, '/constraints', { kind: 'qualitative', statement: 'x', subjects: [ref('concept', SEED.actuator)] })).status).toSatisfy(refused)
    expect((await post(B, '/assumptions', { statement: 'x', scope: { subjects: [ref('function', FN.linearForce)] } })).status).toSatisfy(refused)
    expect((await post(B, '/evidence', { subjects: [ref('concept', SEED.actuator)], kind: 'analysis', title: 'x', basis: 'estimate' })).status).toSatisfy(refused)
    expect((await post(B, '/evidence', { subjects: [ref('concept', c.id)], kind: 'analysis', title: 'x', basis: 'estimate', source: { module: 'cad', kind: 'cad-modeler-entity', id: '7e57c0de-0000-4000-8000-00000000cad1/body', revision: 1 }, tool: { name: 't', version: '1' }, results: [{ name: 'L', value: 1, unit: 'mm', qualification: { kind: 'point' }, constraint: { id: CONSTRAINT_SEED_IDS.envelope } }] })).status).toSatisfy(refused)
    // Decisions, alternative sets, implementations
    expect((await post(B, '/decisions', { title: 'x', rationale: 'x', subjectId: c.id, outcomes: [{ conceptId: SEED.actuator, outcome: 'deferred' }] })).status).toSatisfy(refused)
    expect((await post(B, '/decisions', { title: 'x', rationale: 'x', subjectId: c.id, outcomes: [{ conceptId: c.id, outcome: 'deferred' }], assumptionIds: [{ id: (await env.call('rho', 'GET', `${base(A)}/assumptions`)).body[0].id }] })).status).toSatisfy(refused)
    expect((await post(B, '/alternative-sets', { parentId: SEED.actuator, name: 'x' })).status).toSatisfy(refused)
    expect((await post(B, '/implementations', { name: 'x', conceptIds: [SEED.actuator] })).status).toSatisfy(refused)
    // The batch applies the same checks and rolls back.
    const before = (await env.call('rho', 'GET', `${base(B)}/functions`)).body.length
    const batch = await post(B, '/batch', { items: [{ op: 'createFunction', as: '$f', body: { name: 'Rolled back' } }, { op: 'createLink', body: { type: 'performs', from: ref('concept', SEED.actuator), to: ref('function', '$f') } }] })
    expect(batch.status).toSatisfy(refused)
    expect((await env.call('rho', 'GET', `${base(B)}/functions`)).body.length).toBe(before)
    // Nothing of project A changed.
    expect((await env.call('rho', 'GET', `${base(A)}/design-links?id=${FN.linearForce}`)).body.every((l: { from: { id: string } }) => l.from.id !== c.id)).toBe(true)
  })

  it('delivers events per project only', async () => {
    const a: ConceptsEvent[] = []
    const b: ConceptsEvent[] = []
    const offA = env.server.conceptEvents.subscribe(A, (e) => a.push(e))
    const offB = env.server.conceptEvents.subscribe(B, (e) => b.push(e))
    try {
      const inB = (await post(B, '/concepts', { name: 'Evented in B' })).body
      await env.server.conceptEvents.flush()
      await expect.poll(() => b.some((e) => e.entityId === inB.id), { timeout: 5000 }).toBe(true)
      expect(a.some((e) => e.entityId === inB.id)).toBe(false)
      expect(b.every((e) => e.projectId === B)).toBe(true)
    } finally {
      offA()
      offB()
    }
  })

  it('refuses a project the caller is not a member of', async () => {
    expect((await env.call('eli', 'GET', `${base('PRJ-NOT-MINE')}/concepts`)).status).toBe(403)
    expect((await post('PRJ-NOT-MINE', '/concepts', { name: 'x' })).status).toBe(403)
  })
})
