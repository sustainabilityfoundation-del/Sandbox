import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { memoryObjectStorage } from '@ews/requirements-service'
import { createTestEnv, REQIF_SCHEMAS, type TestEnv } from '../../api/test/helpers'
import { buildServer, type ApiServer } from '../../api/src/server'
import { dropDatabase } from '../../api/src/database'
import { inject } from 'vitest'

/**
 * Persisted declarative proposals through the real API host (integration milestone 1 C9, C13; ADR-0042):
 * module operations are validated against the module OpenAPI, stored as versioned data, reopened after a
 * server restart, and applied through the module API after revalidation. Real PostgreSQL, real modules.
 */

let env: TestEnv
const P = 'PRJ-ACT100'
const A = '/api/assistant/v1'
const C = `/api/concepts/v1/projects/${P}`
let seq = 0

beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

const conversation = `C-TEST-${randomBytes(3).toString('hex')}`
function proposal(over: Record<string, unknown>) {
  return { projectId: P, conversationId: conversation, messageId: 'M1', key: `CP-${++seq}`, kind: 'declarative', module: 'conceptualize', title: 'Test proposal', explanation: 'test', preview: [{ label: 'New Concept', proposed: 'x', basis: 'ai-hypothesis' }], ...over }
}
const createOp = (name: string) => ({ module: 'conceptualize', operationId: 'createConcept', method: 'POST', path: `/projects/${P}/concepts`, body: { name, abstraction: 'component' } })
const store = (user: string, body: unknown) => env.call(user, 'POST', `${A}/proposals`, body)
const apply = (user: string, id: string, projectId = P, body: unknown = {}) => env.call(user, 'POST', `${A}/proposals/${id}/apply?projectId=${projectId}`, body)
const conceptsNamed = async (name: string) => (await env.call('eli', 'GET', `${C}/concepts?text=${encodeURIComponent(name)}&limit=50`)).body.items.filter((c: { name: string }) => c.name === name)

describe('declarative proposals: validation against the module API', () => {
  it('refuses unknown operations, wrong methods, paths outside the template and other projects', async () => {
    expect((await store('eli', proposal({ operations: [{ ...createOp('a'), operationId: 'dropDatabase' }] }))).status).toBe(422)
    expect((await store('eli', proposal({ operations: [{ ...createOp('a'), method: 'DELETE' }] }))).status).toBe(422)
    expect((await store('eli', proposal({ operations: [{ ...createOp('a'), path: `/projects/${P}/concepts/../../admin` }] }))).status).toBe(422)
    expect((await store('eli', proposal({ operations: [{ ...createOp('a'), path: 'http://evil.example/x' }] }))).status).toBe(422)
    expect((await store('eli', proposal({ operations: [{ ...createOp('a'), module: 'shell' }] }))).status).toBe(422)
    const other = await store('eli', proposal({ operations: [{ ...createOp('a'), path: '/projects/PRJ-OTHER/concepts' }] }))
    expect(other.status).toBe(409)
    expect(other.body.error.code).toBe('project-mismatch')
    expect((await store('nia', proposal({ operations: [createOp('a')] }))).status).toBe(201) // stored; the module checks on Apply
  })
})

describe('declarative proposals: apply', () => {
  it('stores a versioned proposal, applies it through the module API once, and is idempotent', async () => {
    const name = `Proposal concept ${randomBytes(3).toString('hex')}`
    const created = await store('eli', proposal({ operations: [createOp(name)] }))
    expect(created.status).toBe(201)
    expect(created.body.proposal).toMatchObject({ version: 1, status: 'pending', projectId: P, actor: 'eli', kind: 'declarative' })
    expect(await conceptsNamed(name)).toHaveLength(0) // nothing written before Apply
    const id = created.body.proposal.id
    expect((await apply('rui', id)).status).toBe(404) // identity: only the person who prepared it
    const first = await apply('eli', id)
    expect(first.status).toBe(200)
    expect(first.body.proposal.status).toBe('applied')
    expect(first.body.proposal.createdIds).toHaveLength(1)
    const again = await apply('eli', id)
    expect(again.body.alreadyApplied).toBe(true)
    expect(await conceptsNamed(name)).toHaveLength(1)
  })

  it('C13: refuses to apply a proposal of project A while the current project is B', async () => {
    const name = `Cross project ${randomBytes(3).toString('hex')}`
    const { body } = await store('eli', proposal({ operations: [createOp(name)] }))
    const r = await apply('eli', body.proposal.id, 'PRJ-B')
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('project-mismatch')
    expect(r.body.error.message).toMatch(/belongs to project PRJ-ACT100, but the current project is PRJ-B/)
    expect(await conceptsNamed(name)).toHaveLength(0)
    expect((await env.call('eli', 'GET', `${A}/proposals/${body.proposal.id}`)).body.proposal.status).toBe('pending')
  })

  it('refuses a stale proposal with an explanation and changes nothing', async () => {
    const base = await env.call('eli', 'POST', `${C}/concepts`, { name: `Stale base ${randomBytes(3).toString('hex')}` }, { 'idempotency-key': randomBytes(8).toString('hex') })
    const concept = base.body
    const { body } = await store('eli', proposal({
      title: 'Rename',
      operations: [{ module: 'conceptualize', operationId: 'updateConcept', method: 'PATCH', path: `/projects/${P}/concepts/${concept.id}`, body: { name: 'Renamed by the proposal' }, ifMatch: `"${concept.revision}"` }],
      expected: [{ module: 'conceptualize', kind: 'concept', id: concept.id, label: `${concept.key} ${concept.name}`, revision: concept.revision, read: { operationId: 'getConcept', path: `/projects/${P}/concepts/${concept.id}`, field: 'revision' } }],
    }))
    // Someone edits the Concept after the preview.
    const edited = await env.call('ada', 'PATCH', `${C}/concepts/${concept.id}`, { summary: 'changed meanwhile', expectedRevision: concept.revision })
    expect(edited.status).toBe(200)
    const r = await apply('eli', body.proposal.id)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('stale')
    expect(r.body.error.message).toContain(`${concept.key} ${concept.name} changed since the preview: revision ${concept.revision} → ${edited.body.revision}.`)
    expect(r.body.error.details.proposal.status).toBe('conflict')
    expect((await env.call('eli', 'GET', `${C}/concepts/${concept.id}`)).body.name).toBe(concept.name)
  })

  it('chains operations with placeholders and resumes safely after a partial failure', async () => {
    const name = `Chained ${randomBytes(3).toString('hex')}`
    const { body } = await store('eli', proposal({
      operations: [
        createOp(name),
        { module: 'conceptualize', operationId: 'updateConcept', method: 'PATCH', path: `/projects/${P}/concepts/$result[0].id`, body: { summary: 'set by the second operation', expectedRevision: 1 } },
        { module: 'conceptualize', operationId: 'updateConcept', method: 'PATCH', path: `/projects/${P}/concepts/$result[0].id`, body: { name: '', expectedRevision: 2 } },
      ],
    }))
    const r = await apply('eli', body.proposal.id)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('module-refused')
    expect(r.body.error.message).toMatch(/2 of 3 operations had already been applied/)
    const [made] = await conceptsNamed(name)
    expect(made.summary).toBe('set by the second operation')
    const retry = await apply('eli', body.proposal.id)
    expect(retry.status).toBe(422)
    expect(await conceptsNamed(name)).toHaveLength(1) // the first operation was not repeated
  })

  it('keeps twin and closure proposals as data applied in the browser, with recorded outcomes', async () => {
    const twin = await store('eli', proposal({ kind: 'twin', module: 'workspace', preview: [{ kind: 'set-property', targetId: 'ROD-120', property: 'diameter' }] }))
    expect((await apply('eli', twin.body.proposal.id)).body.error.code).toBe('apply-in-browser')
    const done = await env.call('eli', 'POST', `${A}/proposals/${twin.body.proposal.id}/outcome`, { status: 'applied', message: 'model rev 9' })
    expect(done.body.proposal.status).toBe('applied')
    const closure = await store('eli', proposal({ kind: 'closure' }))
    const c = await apply('eli', closure.body.proposal.id)
    expect(c.body.error.message).toMatch(/only be applied in the window that prepared it/)
  })
})

describe('UI/AI validation parity (the same module validation for both paths)', () => {
  it('Conceptualize: an invalid Concept is refused identically by the UI path and the AI path', async () => {
    const ui = await env.call('eli', 'POST', `${C}/concepts`, { name: '' }, { 'idempotency-key': randomBytes(8).toString('hex') })
    const { body } = await store('eli', proposal({ operations: [{ ...createOp(''), body: { name: '' } }] }))
    const ai = await apply('eli', body.proposal.id)
    expect(ui.status).toBeGreaterThanOrEqual(400)
    expect(ai.status).toBe(422)
    expect(ai.body.error.message).toContain(ui.body.error.message)
  })

  it('Requirements: an invalid requirement is refused identically by the UI path and the AI path', async () => {
    const invalid = { title: '', statement: 'x', type: 'performance' }
    const ui = await env.call('eli', 'POST', `/api/requirements/v1/projects/${P}/requirements`, invalid, { 'idempotency-key': randomBytes(8).toString('hex') })
    const { body } = await store('eli', proposal({ module: 'requirements', operations: [{ module: 'requirements', operationId: 'createRequirement', method: 'POST', path: `/projects/${P}/requirements`, body: invalid }] }))
    expect(body.proposal).toBeDefined()
    const ai = await apply('eli', body.proposal.id)
    expect(ui.status).toBeGreaterThanOrEqual(400)
    expect(ai.status).toBe(422)
    expect(ai.body.error.message).toContain(ui.body.error.message)
  })

  it('Requirements: a valid draft requirement proposed by the AI is created by the module, with its own validation and history', async () => {
    const title = `AI draft ${randomBytes(3).toString('hex')}`
    const { body } = await store('eli', proposal({ module: 'requirements', operations: [{ module: 'requirements', operationId: 'createRequirement', method: 'POST', path: `/projects/${P}/requirements`, body: { title, statement: 'The holder shall retain six bits after a 1 m drop.', type: 'performance' } }] }))
    const r = await apply('eli', body.proposal.id)
    expect(r.status).toBe(200)
    const [id] = r.body.proposal.createdIds
    const created = await env.call('eli', 'GET', `/api/requirements/v1/projects/${P}/requirements/${id}`)
    expect(created.body).toMatchObject({ title, status: 'draft' })
  })
})

describe('proposals reopen after a server restart', () => {
  it('lists the open proposal from the database after a restart and applies it there', async () => {
    const name = `After restart ${randomBytes(3).toString('hex')}`
    const { body } = await store('eli', proposal({ operations: [createOp(name)] }))
    // Restart: close the server and start a new one on the same database.
    await env.server.close()
    const restarted: ApiServer = await buildServer({ pool: env.pool, storage: memoryObjectStorage(), production: false, eventPollMs: 200, reqifSchemaDir: REQIF_SCHEMAS })
    const call = async (user: string, method: string, url: string, payload?: unknown) => {
      const res = await restarted.app.inject({ method: method as 'GET', url, headers: { 'x-dev-user': user, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) }, payload: payload === undefined ? undefined : JSON.stringify(payload) })
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined }
    }
    const open = await call('eli', 'GET', `${A}/proposals?projectId=${P}&conversationId=${conversation}&open=true`)
    expect(open.body.proposals.map((p: { id: string }) => p.id)).toContain(body.proposal.id)
    const reopened = open.body.proposals.find((p: { id: string }) => p.id === body.proposal.id)
    expect(reopened).toMatchObject({ version: 1, title: 'Test proposal', preview: [{ label: 'New Concept' }], operations: [{ operationId: 'createConcept' }] })
    const applied = await call('eli', 'POST', `${A}/proposals/${body.proposal.id}/apply?projectId=${P}`, {})
    expect(applied.status).toBe(200)
    expect(applied.body.proposal.status).toBe('applied')
    // The helper's close() would close the first server again; close each server exactly once.
    env.close = async () => {
      await restarted.close()
      await env.pool.end()
      await dropDatabase(inject('pgAdminUrl'), env.name)
    }
  })
})
