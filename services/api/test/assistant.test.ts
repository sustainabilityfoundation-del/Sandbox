import { randomUUID } from 'node:crypto'
import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpRequirementsService, getModuleClient } from '../../../packages/requirements-client/src'
import { requirementsAssistant } from '../../../packages/tool-requirements/src/assistant'
import { BASE, PROJECT, REQ1, createTestEnv, type TestEnv } from './helpers'

/**
 * Integration milestone 1 on the real API and PostgreSQL:
 * - C9: every Requirements assistant operation works headless (no view, no React; the service comes
 *   from the action context), and the UI path and the assistant path refuse the same input identically.
 * - C13: a write to a requirement of project A through project B's path is refused.
 */
const OTHER = 'PRJ-B-001'
let env: TestEnv
let origin: string
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'editor'), ($1, 'rui', 'reviewer')`, [OTHER])
})
afterAll(async () => env?.close())

const service = (user: string) => createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: user })
const ctxFor = (user: string, projectId = PROJECT): AssistantActionContext => ({
  model: sampleModel(),
  artifacts: [],
  captured: { projectId, configurationId: 'CFG-BASE', scenarioId: 'SCN-NOM', modelRevision: 1, selectionIds: [] },
  services: { requirements: service(user) },
})
const action = (name: string) => requirementsAssistant.actions.find((a) => a.name === name)!
const provenance = () => ({ conversationId: 'conv-1', proposalId: `p-${randomUUID()}`, messageId: 'm-1' })
const newRequirement = async (title: string) =>
  (await env.call('eli', 'POST', `${BASE}/requirements`, { title, statement: 'The rod shall be chromed.', rationale: 'Wear.', type: 'functional' }, { 'idempotency-key': randomUUID() })).body

/** What a refusal looks like to the person: class, code, HTTP status and message. */
const refusal = (e: unknown) => {
  const x = e as { name: string; code: string; status?: number; message: string }
  return { name: x.name, code: x.code, status: x.status, message: x.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\bREQ-\d+/g, '<key>') }
}

describe('C9: Requirements assistant operations without a mounted view (API mode)', () => {
  it('search, read_for_component, explain_quality and update (preview, Apply, Undo) all succeed headless', async () => {
    const ctx = ctxFor('eli')
    const search = await action('requirements.search').run({ text: 'load' }, ctx)
    expect(search).toMatchObject({ kind: 'data' })
    expect((search as { data: { requirements: { key: string }[] } }).data.requirements.map((r) => r.key)).toContain('REQ-001')

    const read = await action('requirements.read_for_component').run({ objectId: 'ROD-120' }, ctx)
    expect(read).toMatchObject({ kind: 'data', summary: expect.stringMatching(/from the Requirements service/) })
    expect((read as { data: { requirements: { key: string }[] } }).data.requirements.map((r) => r.key)).toContain('REQ-001')

    const quality = await action('requirements.explain_quality').run({ requirementId: 'REQ-006' }, ctx)
    expect(quality).toMatchObject({ kind: 'data', data: { key: 'REQ-006' } })

    const r = await newRequirement('Rod finish')
    const p = (await action('requirements.update').run({ requirementId: r.key, statement: 'The rod shall be hard-chromed.', rationale: 'Wear and corrosion.' }, ctx)) as ServiceProposal
    expect(p).toMatchObject({ kind: 'service-proposal', module: 'requirements' })
    expect(p.preview).toEqual([
      { targetId: r.id, label: `${r.key} Statement`, current: 'The rod shall be chromed.', proposed: 'The rod shall be hard-chromed.', basis: 'user-statement' },
      { targetId: r.id, label: `${r.key} Rationale`, current: 'Wear.', proposed: 'Wear and corrosion.', basis: 'user-statement' },
    ])
    expect((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}`)).body.revision).toBe(1) // nothing written yet
    const pv = provenance()
    await p.apply(pv)
    const saved = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}`)).body
    expect(saved).toMatchObject({ revision: 2, statement: 'The rod shall be hard-chromed.', rationale: 'Wear and corrosion.' })
    const history = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/history`)).body
    expect(history.find((h: { action: string }) => h.action === 'revised')).toMatchObject({ actor: 'eli', reason: `Assistant proposal ${pv.proposalId}` })
    await p.undo!({})
    expect((await env.call('eli', 'GET', `${BASE}/requirements/${r.id}`)).body).toMatchObject({ revision: 3, statement: 'The rod shall be chromed.', rationale: 'Wear.' })
  })
})

describe('C9: validation parity between the UI path and the assistant path', () => {
  /** The editor's save (ui/Editor.tsx): the module client of the project, with the base revision. */
  const uiSave = (user: string, id: string, patch: Record<string, unknown>, expectedRevision: number) =>
    getModuleClient(service(user), PROJECT)!.update(id, patch, { expectedRevision }).then(
      () => undefined,
      (e) => refusal(e),
    )
  const aiSave = async (user: string, key: string, args: Record<string, unknown>, before?: () => Promise<void>) => {
    const p = (await action('requirements.update').run({ requirementId: key, ...args }, ctxFor(user))) as ServiceProposal
    await before?.()
    return p.apply(provenance()).then(
      () => undefined,
      (e) => refusal(e),
    )
  }

  it('invalid statement (over 20 000 characters): refused with the same error', async () => {
    const a = await newRequirement('Parity invalid A')
    const b = await newRequirement('Parity invalid B')
    const tooLong = 'x'.repeat(20001)
    const ui = await uiSave('eli', a.id, { statement: tooLong }, 1)
    const ai = await aiSave('eli', b.key, { statement: tooLong })
    expect(ui?.code).toBe('invalid')
    expect(ai).toEqual(ui)
  })

  it('empty statement: both paths follow the same rule (allowed in a draft, required for review)', async () => {
    const a = await newRequirement('Parity empty A')
    const b = await newRequirement('Parity empty B')
    expect(await uiSave('eli', a.id, { statement: '' }, 1)).toBeUndefined()
    expect(await aiSave('eli', b.key, { statement: '' })).toBeUndefined()
    const review = async (id: string) => refusal((await env.call('eli', 'POST', `${BASE}/requirements/${id}/transitions`, { action: 'request-review', expectedRevision: 2 })).body.error)
    const ra = await review(a.id)
    expect(ra.code).toBe('invalid')
    expect(await review(b.id)).toEqual(ra)
  })

  it('stale revision: refused with the same conflict', async () => {
    const a = await newRequirement('Parity stale A')
    const b = await newRequirement('Parity stale B')
    // Both based on revision 1; someone saves revision 2 first.
    await env.call('eli', 'PATCH', `${BASE}/requirements/${a.id}`, { expectedRevision: 1, title: 'Parity stale A (changed)' })
    const ui = await uiSave('eli', a.id, { statement: 'Stale.' }, 1)
    const ai = await aiSave('eli', b.key, { statement: 'Stale.' }, async () => {
      await env.call('eli', 'PATCH', `${BASE}/requirements/${b.id}`, { expectedRevision: 1, title: 'Parity stale B (changed)' })
    })
    expect(ui!.code).toBe('conflict')
    expect(ai).toEqual(ui)
  })

  it('forbidden role (reader): refused with the same error', async () => {
    const a = await newRequirement('Parity forbidden')
    const ui = await uiSave('rho', a.id, { statement: 'Reader edit.' }, 1)
    const ai = await aiSave('rho', a.key, { statement: 'Reader edit.' })
    expect(ui!.code).toBe('forbidden')
    expect(ai).toEqual(ui)
    expect((await env.call('eli', 'GET', `${BASE}/requirements/${a.id}`)).body.revision).toBe(1)
  })
})

describe('C13: project scoping of writes', () => {
  it("a requirement of project A cannot be changed through project B's path", async () => {
    const before = (await env.call('eli', 'GET', `${BASE}/requirements/${REQ1}`)).body
    const b = `/api/requirements/v1/projects/${OTHER}`
    const attempts = [
      await env.call('eli', 'PATCH', `${b}/requirements/${REQ1}`, { expectedRevision: before.revision, statement: 'Cross-project write.' }),
      await env.call('eli', 'POST', `${b}/requirements/${REQ1}/archive`, { expectedRevision: before.revision, reason: 'x' }),
      await env.call('rui', 'POST', `${b}/requirements/${REQ1}/transitions`, { action: 'retire', expectedRevision: before.revision }),
      await env.call('eli', 'POST', `${b}/relationships`, { type: 'depends-on', fromId: REQ1, toRequirementId: '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002' }),
    ]
    for (const res of attempts) {
      expect(res.status, JSON.stringify(res.body)).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      expect(res.status).not.toBe(409)
    }
    // Project-bound clients and the assistant in project B cannot reach it either.
    await expect(getModuleClient(service('eli'), OTHER)!.update(REQ1, { statement: 'x' }, { expectedRevision: before.revision })).rejects.toMatchObject({ code: 'not-found' })
    await expect(action('requirements.update').run({ requirementId: REQ1, statement: 'x' }, ctxFor('eli', OTHER))).rejects.toMatchObject({ code: 'not-found' })
    const after = (await env.call('eli', 'GET', `${BASE}/requirements/${REQ1}`)).body
    expect(after).toMatchObject({ revision: before.revision, statement: before.statement, status: before.status, archived: false })
    const relCount = await env.pool.query(`SELECT count(*)::int AS n FROM requirements.relationships WHERE project_id = $1`, [OTHER])
    expect(relCount.rows[0].n).toBe(0)
  })
})
