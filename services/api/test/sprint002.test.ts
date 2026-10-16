import { RequirementsServiceError, type RequirementsEvent } from '@ews/platform-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HttpTransport, createHttpRequirementsService, onRequirementsReset, openEventStream } from '../../../packages/requirements-client/src'
import { BASE, PROJECT, createTestEnv, idem, type TestEnv } from './helpers'

/** Sprint 002: SDK 1.3 collection-changed events, internal error contract, outbox retention. */
let env: TestEnv
let origin: string
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
})
afterAll(async () => env?.close())

const until = async (cond: () => boolean, ms = 20000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 40))
  }
}

function stream(after?: string) {
  const events: RequirementsEvent[] = []
  let resets = 0
  const t = new HttpTransport({ baseUrl: `${origin}/api/requirements/v1`, devUser: 'rho' })
  const h = openEventStream(t, `/projects/${PROJECT}/events${after ? `?after=${after}` : ''}`, { onEvent: (e) => events.push(e), onReset: () => resets++ }, { retryMs: 100 })
  return { events, resets: () => resets, close: h.close }
}

describe('requirements.collection-changed (SDK 1.3)', () => {
  it('is emitted after commit for structure changes, with the structure revision; never for refused changes', async () => {
    // Resume from the latest published event, so nothing is missed however long the stream takes to connect.
    await env.server.events.flush()
    const last = (await env.pool.query<{ event_id: string }>('SELECT event_id FROM requirements.outbox WHERE project_id = $1 AND delivery_seq IS NOT NULL ORDER BY delivery_seq DESC LIMIT 1', [PROJECT])).rows[0]?.event_id
    const s = stream(last)
    const coll = (await env.call('eli', 'POST', `${BASE}/collections`, { name: `Events ${Date.now()}` })).body
    const heading = await env.call('eli', 'POST', `${BASE}/collections/${coll.id}/nodes`, { kind: 'heading', heading: 'A' }, { 'if-match': '"1"' })
    const h2 = await env.call('rui', 'GET', `${BASE}/collections/${coll.id}`)
    await env.call('eli', 'POST', `${BASE}/collections/${coll.id}/nodes`, { kind: 'heading', heading: 'B' }, { 'if-match': h2.headers.etag as string })
    await env.call('eli', 'POST', `${BASE}/collections/${coll.id}/nodes/${heading.body.id}/move`, { parentId: null, position: 1 }, { 'if-match': '"3"' })
    const stale = await env.call('eli', 'POST', `${BASE}/collections/${coll.id}/nodes`, { kind: 'heading', heading: 'C' }, { 'if-match': '"1"' })
    expect(stale.status).toBe(409)
    await env.server.events.flush()
    await until(() => s.events.filter((e) => e.entityId === coll.id).length >= 4)
    await new Promise((r) => setTimeout(r, 300))
    const mine = s.events.filter((e) => e.entityId === coll.id)
    expect(mine.map((e) => [e.type, e.committedRevision])).toEqual([
      ['requirements.collection-changed', 1],
      ['requirements.collection-changed', 2],
      ['requirements.collection-changed', 3],
      ['requirements.collection-changed', 4],
    ])
    s.close()
  })

  it('reaches SDK subscribers of the HTTP adapter', async () => {
    const service = createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: 'nia', retryMs: 100 })
    const got: RequirementsEvent[] = []
    const off = service.subscribe(PROJECT, (e) => got.push(e))
    await new Promise((r) => setTimeout(r, 300))
    const coll = (await env.call('eli', 'POST', `${BASE}/collections`, { name: `SDK ${Date.now()}` })).body
    await env.server.events.flush()
    await until(() => got.some((e) => e.type === 'requirements.collection-changed' && e.entityId === coll.id))
    off()
  })
})

describe('internal errors (documented, no internals leaked)', () => {
  it('returns 500 with code unavailable, reason internal-error and an error reference; the client raises RequirementsServiceError', async () => {
    // Force an unmapped database failure: the key counter table disappears for a moment.
    await env.pool.query('ALTER TABLE requirements.key_counters RENAME TO key_counters_hidden')
    try {
      const res = await env.call('eli', 'POST', `${BASE}/requirements`, { title: 'Boom', statement: 'The system shall fail internally.', type: 'functional' }, idem())
      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('unavailable')
      expect(res.body.error.details).toMatchObject({ reason: 'internal-error', errorId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
      const text = JSON.stringify(res.body)
      expect(text).not.toMatch(/key_counters|relation|SELECT|INSERT|at .*\.ts|stack/i)
      const service = createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: 'eli' })
      const err = await service.create({ projectId: PROJECT, title: 'Boom', statement: 'x', type: 'functional' }, { idempotencyKey: `boom-${Date.now()}` }).catch((e) => e)
      expect(err).toBeInstanceOf(RequirementsServiceError)
      expect(err.code).toBe('unavailable')
      expect(err.message).toMatch(/^Internal error \(reference [0-9a-f-]{36}\)/)
    } finally {
      await env.pool.query('ALTER TABLE requirements.key_counters_hidden RENAME TO key_counters')
    }
    // Nothing was written by the failed requests.
    const n = await env.pool.query(`SELECT count(*)::int AS n FROM requirements.requirement_revisions WHERE title = 'Boom'`)
    expect(n.rows[0].n).toBe(0)
  })

  it('documents the 500 response on every operation in OpenAPI', async () => {
    const doc = (await env.call('', 'GET', '/api/requirements/v1/openapi.json')).body
    const ops = Object.values(doc.paths).flatMap((m: any) => Object.values(m)) as any[]
    for (const op of ops) expect(op.responses['500'], op.operationId).toBeTruthy()
    expect(doc.info.description).toMatch(/internal-error/)
  })

  it('does not echo database constraint names or driver text in mapped errors', async () => {
    const r = (await env.call('eli', 'POST', `${BASE}/requirements`, { title: 'Dup', statement: 'x', type: 'functional' }, idem())).body
    // A raw duplicate key reaching the database maps to a generic conflict message.
    await expect(env.pool.query('UPDATE requirements.requirement_revisions SET title = $1 WHERE requirement_id = $2', ['x', r.id])).rejects.toThrow()
    const dup = await env.call('ada', 'PATCH', `${BASE}/requirements/${r.id}`, { expectedRevision: 1, key: 'REQ-001' })
    expect(dup.status).toBe(409)
    expect(JSON.stringify(dup.body)).not.toMatch(/constraint|requirements_project_id_key/)
  })
})

describe('outbox retention and reset', () => {
  it('purges delivered events older than the window, keeps newer and unpublished ones; resume inside the window loses nothing; resume from a purged event resets', async () => {
    // Three committed, delivered events.
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push((await env.call('eli', 'POST', `${BASE}/requirements`, { title: `Retention ${i}`, statement: 'The system shall retain.', type: 'functional' }, idem())).body.id)
    await env.server.events.flush()
    const events = (await env.pool.query(`SELECT event_id, entity_id FROM requirements.outbox WHERE entity_id = ANY($1) ORDER BY delivery_seq`, [ids])).rows
    expect(events).toHaveLength(3)
    // Age the first one beyond the window (default 168 h) and add an old unpublished row.
    await env.pool.query(`UPDATE requirements.outbox SET published_at = now() - interval '200 hours' WHERE event_id = $1`, [events[0].event_id])
    await env.pool.query(`UPDATE requirements.outbox SET published_at = now() - interval '200 hours' WHERE published_at IS NOT NULL AND delivery_seq < (SELECT delivery_seq FROM requirements.outbox WHERE event_id = $1)`, [events[0].event_id])
    const before = Number((await env.pool.query('SELECT count(*) FROM requirements.outbox WHERE published_at IS NULL')).rows[0].count)
    const purged = await env.server.events.purge()
    expect(purged).toBeGreaterThanOrEqual(1)
    const left = (await env.pool.query(`SELECT event_id FROM requirements.outbox WHERE entity_id = ANY($1)`, [ids])).rows.map((r) => r.event_id)
    expect(left).toEqual(expect.arrayContaining([events[1].event_id, events[2].event_id]))
    expect(left).not.toContain(events[0].event_id)
    expect(Number((await env.pool.query('SELECT count(*) FROM requirements.outbox WHERE published_at IS NULL')).rows[0].count)).toBe(before)

    // Resume inside the window: everything after events[1] is delivered, nothing lost.
    const inside = stream(events[1].event_id)
    await until(() => inside.events.some((e) => e.eventId === events[2].event_id))
    expect(inside.resets()).toBe(0)
    inside.close()

    // Resume from the purged event: reset signal; the HTTP adapter forwards it to onReset and onRequirementsReset.
    const purgedResume = stream(events[0].event_id)
    await until(() => purgedResume.resets() > 0)
    purgedResume.close()
  })

  it('the HTTP adapter reports a reset to its listeners so tools reread', async () => {
    const resets: string[] = []
    const service = createHttpRequirementsService({ baseUrl: `${origin}/api/requirements/v1`, devUser: 'rho', retryMs: 100, onReset: (p) => resets.push(`config:${p}`) })
    const offReset = onRequirementsReset(service, PROJECT, () => resets.push('listener'))
    // Simulate a stale resume point: subscribe, then make the stream reconnect with a purged ID.
    const off = service.subscribe(PROJECT, () => undefined)
    await new Promise((r) => setTimeout(r, 300))
    const id = (await env.call('eli', 'POST', `${BASE}/requirements`, { title: 'Reset trigger', statement: 'x', type: 'functional' }, idem())).body.id
    await env.server.events.flush()
    await new Promise((r) => setTimeout(r, 400))
    await env.pool.query(`UPDATE requirements.outbox SET published_at = now() - interval '500 hours' WHERE entity_id = $1`, [id])
    await env.server.events.purge()
    // Force a reconnect: restart the server's connections by closing SSE sockets.
    await env.server.app.server.closeAllConnections?.()
    await until(() => resets.includes('listener') && resets.includes(`config:${PROJECT}`), 10000)
    off()
    offReset()
  })
})
