import { RequirementsServiceError } from '@ews/platform-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttpRequirementsService } from '../../../packages/requirements-client/src'
import { BASE, PROJECT, createTestEnv, type TestEnv } from './helpers'

/** Sprint 003: the SDK paths the SysML tool uses, against the real API and PostgreSQL. */
let env: TestEnv
let origin: string
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
  // A user with neither tool:requirements nor tool:sysml (CAD only), editor in the project.
  await env.pool.query(`INSERT INTO platform.users (id, name) VALUES ('zed', 'Zed (CAD only)')`)
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'zed', 'editor')`, [PROJECT])
  await env.pool.query(`INSERT INTO platform.entitlements (user_id, entitlement) VALUES ('zed', 'tool:cad')`)
})
afterAll(async () => env?.close())

const service = (user: string, f?: typeof fetch) => createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: user, fetch: f })

describe('SysML creates and edits requirements through the SDK (cross-module subset)', () => {
  it('as nia (SysML only): create survives a lost response without a duplicate; the requirement is visible to Requirements users', async () => {
    let lose = true
    // The first POST reaches the server, but its response is "lost" on the way back.
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(input, init)
      if (lose && init?.method === 'POST') {
        lose = false
        throw new TypeError('network connection lost')
      }
      return res
    }) as typeof fetch
    const nia = service('nia', flaky)
    const key = `sysml-create-${Date.now()}`
    const input = { projectId: PROJECT, title: 'Seal wear', statement: 'The rod seal shall last 1 000 000 cycles.', type: 'functional' }
    const first = await nia.create(input, { idempotencyKey: key, reason: 'Created from SysML' }).catch((e) => e)
    expect(first).toBeInstanceOf(RequirementsServiceError)
    expect(first.code).toBe('unavailable')
    const retry = await nia.create(input, { idempotencyKey: key, reason: 'Created from SysML' })
    const n = await env.pool.query(`SELECT count(*)::int AS n FROM requirements.requirement_revisions WHERE title = 'Seal wear'`)
    expect(n.rows[0].n).toBe(1)
    const seen = await env.call('eli', 'GET', `${BASE}/requirements/${retry.id}`)
    expect(seen.body).toMatchObject({ key: retry.key, statement: input.statement, status: 'draft' })
  })

  it('edits canonical fields with expectedRevision and projectId; stale edits are refused with the current revision', async () => {
    const nia = service('nia')
    const created = await nia.create({ projectId: PROJECT, title: 'Rod finish', statement: 'The rod shall have Ra 0.2 µm.', type: 'functional' }, { idempotencyKey: `finish-${Date.now()}` })
    const updated = await nia.update(created.id, { statement: 'The rod shall have a surface roughness of at most Ra 0.2 µm.' }, { expectedRevision: created.revision, projectId: PROJECT, reason: 'Edited in SysML' })
    expect(updated.revision).toBe(created.revision + 1)
    const history = await env.call('eli', 'GET', `${BASE}/requirements/${created.id}/history`)
    expect(history.body.find((h: { action: string }) => h.action === 'revised')).toMatchObject({ actor: 'nia', reason: 'Edited in SysML' })
    const stale = await nia.update(created.id, { statement: 'Stale.' }, { expectedRevision: created.revision, projectId: PROJECT }).catch((e) => e)
    expect(stale).toBeInstanceOf(RequirementsServiceError)
    expect(stale).toMatchObject({ code: 'conflict' })
    expect(stale.details.currentRevision).toBe(updated.revision)
    // Fields outside the canonical subset are refused for a SysML-only user.
    const extra = await env.call('nia', 'PATCH', `${BASE}/requirements/${created.id}`, { expectedRevision: updated.revision, owner: 'nia' })
    expect(extra.status).toBe(403)
  })

  it('refuses users without tool:sysml (and without tool:requirements) on the server', async () => {
    const zed = service('zed')
    const err = await zed.create({ projectId: PROJECT, title: 'x', statement: 'y', type: 'functional' }, { idempotencyKey: `zed-${Date.now()}` }).catch((e) => e)
    expect(err).toMatchObject({ code: 'forbidden' })
    expect(await zed.list({ projectId: PROJECT }).catch((e) => e.code)).toBe('forbidden')
    // A Requirements reader without tool:sysml cannot write either.
    const rho = await service('rho').create({ projectId: PROJECT, title: 'x', statement: 'y', type: 'functional' }, { idempotencyKey: `rho-${Date.now()}` }).catch((e) => e)
    expect(rho).toMatchObject({ code: 'forbidden' })
  })

  it('baseline- and configuration-aware reads for SysML views', async () => {
    const nia = service('nia')
    const bl = (await env.call('rho', 'GET', `${BASE}/baselines`)).body[0]
    const pinned = await nia.get('5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', { projectId: PROJECT, baselineId: bl.id })
    expect(pinned?.key).toBe('REQ-001')
    const resolved = await nia.resolve('REQ-002', { projectId: PROJECT, configurationId: 'CFG-HD' })
    expect(resolved?.id).toBe('5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002')
  })
})
