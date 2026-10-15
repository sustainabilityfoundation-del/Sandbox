import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { localObjectStorage, migrateRequirements } from '@ews/requirements-service'

async function withTransactionForTests(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<void>) {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await fn(c)
    await c.query('COMMIT')
  } finally {
    c.release()
  }
}
import { isResettable } from '../src/config'
import { ensureDatabase, resetDatabase, startEmbedded } from '../src/database'
import { buildServer, prepareDatabase } from '../src/server'
import { BASE, PROJECT, REQ1, createTestEnv, idem, type TestEnv } from './helpers'

describe('migrations and seed (AC-B1)', () => {
  it('migrate cleanly on an empty database, are idempotent, and refuse edited migrations', async () => {
    const env = await createTestEnv({ seed: false })
    try {
      const again = await migrateRequirements(env.pool)
      expect(again.applied).toEqual([])
      expect(again.alreadyApplied).toEqual(['0001_initial.sql', '0002_outbox_retention.sql', '0003_origin_and_allocation_targets.sql'])
      await env.pool.query(`UPDATE requirements.schema_migrations SET checksum = 'x' WHERE version = '0001'`)
      await expect(migrateRequirements(env.pool)).rejects.toThrow(/changed after it was applied/)
    } finally {
      await env.close()
    }
  })

  it('seeds reproducibly: two databases get identical canonical content', async () => {
    const a = await createTestEnv()
    const b = await createTestEnv()
    try {
      const snapshot = async (env: TestEnv) =>
        (
          await env.pool.query(
            `SELECT r.id, r.key, r.status, v.revision, v.title, v.statement, v.attributes::text FROM requirements.requirements r
             JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision ORDER BY r.key`,
          )
        ).rows
      expect(await snapshot(a)).toEqual(await snapshot(b))
      expect((await snapshot(a)).length).toBe(6)
      // Seeding again changes nothing.
      const before = (await a.pool.query('SELECT count(*)::int AS n FROM requirements.audit_events')).rows[0].n
      await prepareDatabase(a.pool, { seed: true })
      expect((await a.pool.query('SELECT count(*)::int AS n FROM requirements.audit_events')).rows[0].n).toBe(before)
    } finally {
      await a.close()
      await b.close()
    }
  })
})

describe('reset is restricted to development and test databases (AC-B2)', () => {
  it('refuses other database names', async () => {
    expect(isResettable('ews_dev')).toBe(true)
    expect(isResettable('ews_test_abc123')).toBe(true)
    expect(isResettable('postgres')).toBe(false)
    expect(isResettable('ews_prod')).toBe(false)
    expect(isResettable('ews_dev2')).toBe(false)
    await expect(resetDatabase(inject('pgAdminUrl'), 'postgres')).rejects.toThrow(/Refusing/)
  })
})

describe('development identities are refused in production (contracts §6)', () => {
  it('returns 401 for X-Dev-User when NODE_ENV is production', async () => {
    const env = await createTestEnv({ production: true, seed: true })
    try {
      const res = await env.call('ada', 'GET', `${BASE}/requirements`)
      expect(res.status).toBe(401)
      expect(res.body.error.message).toMatch(/not accepted in production/)
      expect((await env.call('', 'GET', '/api/platform/v1/dev-users')).status).toBe(404)
    } finally {
      await env.close()
    }
  })
})

describe('committed-change notifications (AC-B7)', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await createTestEnv()
  })
  afterAll(async () => env?.close())

  /** Minimal SSE reader over fetch (EventSource cannot send X-Dev-User). */
  async function openStream(origin: string, after?: string) {
    const controller = new AbortController()
    const res = await fetch(`${origin}${BASE}/events${after ? `?after=${after}` : ''}`, { headers: { 'x-dev-user': 'rho' }, signal: controller.signal })
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
    const events: { event: string; id?: string; data: any }[] = []
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) return
          buf += decoder.decode(value, { stream: true })
          let i: number
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const fields = Object.fromEntries(block.split('\n').filter((l) => l && !l.startsWith(':')).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
            if (fields.data) events.push({ event: fields.event ?? 'message', id: fields.id, data: JSON.parse(fields.data) })
          }
        }
      } catch {
        /* aborted */
      }
    })()
    return { events, close: () => controller.abort() }
  }

  const until = async (cond: () => boolean, ms = 8000) => {
    const end = Date.now() + ms
    while (!cond()) {
      if (Date.now() > end) throw new Error('timed out waiting for events')
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  it('emits typed events only after commit, never for rolled-back changes, and resumes after an event ID', async () => {
    const origin = await env.listen()
    const stream = await openStream(origin)
    const created = await env.call('eli', 'POST', `${BASE}/requirements`, { title: 'Evented', statement: 'The actuator shall emit.', type: 'functional' }, { ...idem(), 'x-configuration-id': 'CFG-HD' })
    await until(() => stream.events.some((e) => e.data.entityId === created.body.id))
    const ev = stream.events.find((e) => e.data.entityId === created.body.id)!
    expect(ev.event).toBe('requirement.created')
    expect(ev.data).toMatchObject({ type: 'requirement.created', projectId: PROJECT, committedRevision: 1, configurationId: 'CFG-HD', actor: 'eli' })
    expect(ev.id).toBe(ev.data.eventId)

    // A conflicting (rolled back) write emits nothing.
    const count = stream.events.length
    const conflict = await env.call('eli', 'PATCH', `${BASE}/requirements/${created.body.id}`, { expectedRevision: 9, statement: 'x' })
    expect(conflict.status).toBe(409)
    // An atomic bulk failure emits nothing either.
    await env.call('eli', 'POST', `${BASE}/bulk`, { operations: [{ requirementId: created.body.id, expectedRevision: 1, set: { owner: 'x' } }, { requirementId: REQ1, expectedRevision: 99, set: { owner: 'x' } }] })
    await env.server.events.flush()
    await new Promise((r) => setTimeout(r, 400))
    expect(stream.events.length).toBe(count)

    const upd = await env.call('eli', 'PATCH', `${BASE}/requirements/${created.body.id}`, { expectedRevision: 1, statement: 'The actuator shall emit twice.' })
    await until(() => stream.events.some((e) => e.data.type === 'requirement.updated' && e.data.entityId === created.body.id))
    const updates = stream.events.filter((e) => e.data.type === 'requirement.updated' && e.data.entityId === created.body.id)
    expect(updates.map((e) => [e.data.entityId, e.data.committedRevision])).toEqual([[created.body.id, upd.body.revision]])
    stream.close()

    // Resume: everything after the creation event, without the creation itself.
    const resumed = await openStream(origin, ev.data.eventId)
    await until(() => resumed.events.some((e) => e.data.type === 'requirement.updated'))
    expect(resumed.events.some((e) => e.data.eventId === ev.data.eventId)).toBe(false)
    resumed.close()

    // Unknown resume point → reset signal.
    const reset = await openStream(origin, '00000000-0000-4000-8000-000000000000')
    await until(() => reset.events.some((e) => e.event === 'reset'))
    reset.close()
  })

  it('publishes rows in commit order even when an earlier transaction commits later', async () => {
    // Two transactions: A inserts first (lower seq) but commits after B.
    const a = await env.pool.connect()
    const b = await env.pool.connect()
    try {
      await a.query('BEGIN')
      await a.query(`INSERT INTO requirements.outbox (event_id, project_id, type, entity_id, committed_revision, occurred_at, actor) VALUES (gen_random_uuid(), $1, 'requirement.updated', 'late', 1, now(), 'test')`, [PROJECT])
      await b.query('BEGIN')
      await b.query(`INSERT INTO requirements.outbox (event_id, project_id, type, entity_id, committed_revision, occurred_at, actor) VALUES (gen_random_uuid(), $1, 'requirement.updated', 'early', 1, now(), 'test')`, [PROJECT])
      await b.query('COMMIT')
      await env.server.events.flush()
      await a.query('COMMIT')
      await env.server.events.flush()
      const { rows } = await env.pool.query(`SELECT entity_id FROM requirements.outbox WHERE entity_id IN ('late', 'early') ORDER BY delivery_seq`)
      expect(rows.map((r) => r.entity_id)).toEqual(['early', 'late'])
    } finally {
      a.release()
      b.release()
    }
  })
})

describe('search and pagination on a larger dataset (AC-B12)', () => {
  it('pages through 5 000 requirements without gaps or duplicates and searches quickly', async () => {
    const env = await createTestEnv()
    try {
      const words = ['hydraulic', 'thermal', 'seal', 'bearing', 'motor', 'housing', 'sensor', 'cable']
      await withTransactionForTests(env.pool, async (client) => {
        await client.query(
          `WITH n AS (SELECT g, gen_random_uuid() AS id FROM generate_series(1, 5000) g),
           r AS (INSERT INTO requirements.requirements (id, project_id, key, current_revision, status, created_at, created_by, updated_at, updated_by)
                 SELECT id, $1, 'GEN-' || g, 1, CASE WHEN g % 3 = 0 THEN 'approved' ELSE 'draft' END, now(), 'gen', now(), 'gen' FROM n RETURNING id)
           INSERT INTO requirements.requirement_revisions (requirement_id, revision, title, statement, type, status_at_creation, created_at, created_by)
           SELECT n.id, 1, 'Generated ' || g, 'The ' || ($2::text[])[1 + g % 8] || ' subsystem shall meet limit ' || g || ' mm.', 'performance',
                  CASE WHEN g % 3 = 0 THEN 'approved' ELSE 'draft' END, now() - (g || ' seconds')::interval, 'gen' FROM n`,
          [PROJECT, words],
        )
      })
      const seen = new Set<string>()
      let cursor: string | undefined
      let pages = 0
      const t0 = Date.now()
      do {
        const res = await env.call('rho', 'GET', `${BASE}/requirements?limit=200&type=performance${cursor ? `&cursor=${cursor}` : ''}`)
        expect(res.status).toBe(200)
        for (const r of res.body.items) {
          expect(seen.has(r.id)).toBe(false)
          seen.add(r.id)
        }
        expect(res.body.total).toBe(5004) // 5000 generated + 4 seeded performance requirements
        cursor = res.body.nextCursor
        pages++
      } while (cursor)
      const elapsed = Date.now() - t0
      expect(seen.size).toBe(5004)
      expect(pages).toBe(26)
      // Natural key order: GEN-9 before GEN-10.
      const first = await env.call('rho', 'GET', `${BASE}/requirements?limit=12&text=GEN-`)
      expect(first.body.items.slice(0, 11).map((r: { key: string }) => r.key)).toEqual(['GEN-1', 'GEN-2', 'GEN-3', 'GEN-4', 'GEN-5', 'GEN-6', 'GEN-7', 'GEN-8', 'GEN-9', 'GEN-10', 'GEN-11'])
      const t1 = Date.now()
      const search = await env.call('rho', 'GET', `${BASE}/requirements?text=therm&status=approved&limit=50`)
      const searchMs = Date.now() - t1
      expect(search.body.items.every((r: { statement: string; status: string }) => r.statement.includes('thermal') && r.status === 'approved')).toBe(true)
      expect(search.body.total).toBeGreaterThan(150)
      // A cursor is bound to its query.
      const p1 = await env.call('rho', 'GET', `${BASE}/requirements?limit=10`)
      expect((await env.call('rho', 'GET', `${BASE}/requirements?limit=10&status=draft&cursor=${p1.body.nextCursor}`)).status).toBe(400)
      // Newest-first ordering pages stably too.
      const newest = await env.call('rho', 'GET', `${BASE}/requirements?sort=-updated&limit=5`)
      expect(newest.body.items).toHaveLength(5)
      expect(elapsed).toBeLessThan(30_000)
      expect(searchMs).toBeLessThan(2_000)
      console.log(`pagination: ${pages} pages in ${elapsed} ms; filtered prefix search in ${searchMs} ms`)
    } finally {
      await env.close()
    }
  })
})

describe('persistence across restarts (AC-B1)', () => {
  it('keeps committed data when the API and PostgreSQL restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ews-pg-restart-'))
    const port = 59100 + Math.floor(Math.random() * 800)
    const cfg = { port, dataDir: join(dir, 'data'), user: 'postgres', password: 'restart-test', persistent: true }
    const name = 'ews_test_restart'
    const url = `postgres://postgres:restart-test@127.0.0.1:${port}/${name}`
    let id: string
    {
      const db = await startEmbedded(cfg, () => undefined)
      await ensureDatabase(db.adminUrl, name)
      const pool = new pg.Pool({ connectionString: url })
      await prepareDatabase(pool, { seed: true })
      const server = await buildServer({ pool, storage: localObjectStorage(join(dir, 'objects')) })
      const res = await server.app.inject({ method: 'POST', url: `${BASE}/requirements`, headers: { 'x-dev-user': 'eli', 'content-type': 'application/json', 'idempotency-key': 'restart-1' }, payload: JSON.stringify({ title: 'Survives restart', statement: 'The data shall persist.', type: 'functional' }) })
      expect(res.statusCode).toBe(201)
      id = JSON.parse(res.body).id
      await server.close()
      await pool.end()
      await db.stop()
    }
    {
      const db = await startEmbedded(cfg, () => undefined)
      const pool = new pg.Pool({ connectionString: url })
      await prepareDatabase(pool, { seed: true })
      const server = await buildServer({ pool, storage: localObjectStorage(join(dir, 'objects')) })
      const res = await server.app.inject({ method: 'GET', url: `${BASE}/requirements/${id}`, headers: { 'x-dev-user': 'rho' } })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).title).toBe('Survives restart')
      await server.close()
      await pool.end()
      await db.stop()
    }
    rmSync(dir, { recursive: true, force: true })
  })
})

