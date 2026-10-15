import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAiEnv, PROJECT, type AiEnv } from '../../assistant/test/env'

/** Settings API on a disposable PostgreSQL (npm run req:test:db). */

let env: AiEnv
const B = '/api/settings/v1'
beforeAll(async () => {
  env = await createAiEnv()
})
afterAll(async () => env?.close())

async function values(user: string) {
  const r = await env.call(user, 'GET', `${B}/values?projectId=${PROJECT}`)
  expect(r.status).toBe(200)
  return r.body
}

describe('settings service', () => {
  it('lists the registered definitions and reserves ai.reasoning.*', async () => {
    const r = await env.call('eli', 'GET', `${B}/definitions`)
    expect(r.status).toBe(200)
    expect(r.body.pages).toEqual([{ id: 'ai', title: 'AI and reasoning' }])
    expect(r.body.definitions.find((d: { id: string }) => d.id === 'ai.access.requirements')).toMatchObject({ type: 'enum', default: 'propose', scope: 'user', ceiling: 'ai.ceiling.requirements' })
    expect(r.body.reservedNamespaces).toContain('ai.reasoning.')
    expect((await env.call('', 'GET', `${B}/definitions`)).status).toBe(401)
  })

  it('returns defaults, then saves a valid change with If-Match and refuses a stale write', async () => {
    const v = await values('eli')
    expect(v.effective['ai.limits.timeout']).toBe(45)
    const ok = await env.call('eli', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, { values: { 'ai.limits.timeout': 30, 'ai.access.requirements': 'read' } }, { 'if-match': v.user.etag })
    expect(ok.status).toBe(200)
    expect(ok.headers.etag).toBe(ok.body.etag)
    expect((await values('eli')).effective).toMatchObject({ 'ai.limits.timeout': 30, 'ai.access.requirements': 'read' })
    const stale = await env.call('eli', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, { values: { 'ai.limits.timeout': 40 } }, { 'if-match': v.user.etag })
    expect(stale.status).toBe(412)
    expect(stale.body.error.code).toBe('conflict')
    const missing = await env.call('eli', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, { values: { 'ai.limits.timeout': 40 } })
    expect(missing.status).toBe(428)
  })

  it('rejects invalid values atomically: out of range, wrong type, unknown and project-scoped IDs, secrets', async () => {
    const v = await values('rui')
    const r = await env.call('rui', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, {
      values: { 'ai.limits.timeout': 500, 'ai.sharing.selection': 'yes', 'ai.made.up': true, 'ai.ceiling.requirements': 'off', 'ai.connection.active': 'sk-live-abc', 'ai.limits.tool-calls': 3 },
    }, { 'if-match': v.user.etag })
    expect(r.status).toBe(422)
    expect(Object.keys(r.body.error.details.fields).sort()).toEqual(['ai.ceiling.requirements', 'ai.connection.active', 'ai.limits.timeout', 'ai.made.up', 'ai.sharing.selection'])
    expect((await values('rui')).effective['ai.limits.tool-calls']).toBe(6)
  })

  it('lets only the administrator set project ceilings; a person can only narrow them', async () => {
    const before = await values('ada')
    expect(before.canEditProject).toBe(true)
    const denied = await env.call('eli', 'PUT', `${B}/projects/${PROJECT}/values`, { values: { 'ai.ceiling.conceptualize': 'read' } }, { 'if-match': before.project.etag })
    expect(denied.status).toBe(403)
    const set = await env.call('ada', 'PUT', `${B}/projects/${PROJECT}/values`, { values: { 'ai.ceiling.conceptualize': 'read', 'ai.limits-ceiling.tool-calls': 4 } }, { 'if-match': before.project.etag })
    expect(set.status).toBe(200)
    const nia = await values('nia')
    expect(nia.effective['ai.access.conceptualize']).toBe('read') // default propose, clamped to the ceiling
    const widen = await env.call('nia', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, { values: { 'ai.access.conceptualize': 'propose' } }, { 'if-match': nia.user.etag })
    expect(widen.status).toBe(422)
    expect(widen.body.error.details.fields['ai.access.conceptualize']).toMatch(/project limit/)
    const narrow = await env.call('nia', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, { values: { 'ai.access.conceptualize': 'off', 'ai.limits.tool-calls': 3 } }, { 'if-match': nia.user.etag })
    expect(narrow.status).toBe(200)
    // Lowering a ceiling later clamps values already stored.
    const p = await values('ada')
    await env.call('ada', 'PUT', `${B}/projects/${PROJECT}/values`, { values: { 'ai.limits-ceiling.tool-calls': 2 } }, { 'if-match': p.project.etag })
    expect((await values('nia')).effective['ai.limits.tool-calls']).toBe(2)
    // Restore for other tests.
    const q = await values('ada')
    await env.call('ada', 'PUT', `${B}/projects/${PROJECT}/values`, { values: { 'ai.ceiling.conceptualize': null, 'ai.limits-ceiling.tool-calls': null } }, { 'if-match': q.project.etag })
  })

  it('keeps an append-only history of changes', async () => {
    const { rows } = await env.pool.query('SELECT actor, setting_id FROM settings.history ORDER BY id')
    expect(rows.length).toBeGreaterThan(3)
    await expect(env.pool.query('DELETE FROM settings.history')).rejects.toThrow(/append-only/)
  })

  it('refuses non-members and serves an OpenAPI 3.1 document', async () => {
    expect((await env.call('eli', 'GET', `${B}/values?projectId=PRJ-OTHER`)).status).toBe(403)
    const doc = await env.call('', 'GET', `${B}/openapi.json`)
    expect(doc.body.openapi).toBe('3.1.0')
    expect(Object.keys(doc.body.paths)).toEqual(['/definitions', '/values', '/users/me/values', '/projects/{projectId}/values'])
  })
})
