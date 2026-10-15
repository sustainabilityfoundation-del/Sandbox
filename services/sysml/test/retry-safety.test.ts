import { randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { sysmlPlugin } from '../src/http/plugin'
import type { SysmlRepository } from '../src/repository'

/**
 * C10 retry safety (integration-milestone-1.md): every mutating SysML endpoint, with an
 * Idempotency-Key, under (a) concurrent duplicates, (b) a retry after a lost response (the server
 * committed, the client never saw the reply), (c) a failure injected just before and just after COMMIT,
 * and (d) reuse of the key with different input. The semantic operation happens exactly once, and (d)
 * is refused with 422 without a second operation.
 *
 * The plugin is mounted on its own Fastify instance so that the test can inject faults into the
 * repository's transaction (`SysmlRepository.faults`, test-only).
 */

let env: TestEnv
let app: FastifyInstance
let repo: SysmlRepository
const PLATFORM = 'PRJ-RETRY'
const BASE = '/api/sysml/v1'
let pid = ''
let mainBranch = ''
let pkgId = ''

type Res = { status: number; body: Record<string, unknown>; replayed: boolean }
async function call(method: 'GET' | 'POST', url: string, body?: unknown, key?: string): Promise<Res> {
  const res = await app.inject({ method, url, headers: { 'x-dev-user': 'eli', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) }, payload: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : {}, replayed: res.headers['idempotency-replayed'] === 'true' }
}
const count = async (sql: string, params: unknown[]) => Number((await env.pool.query<{ n: string }>(sql, params)).rows[0].n)
const head = async () => (await env.pool.query<{ head_commit_id: string }>('SELECT head_commit_id FROM sysml.branches WHERE id = $1', [mainBranch])).rows[0].head_commit_id
const tag = (key: string) => key.replace(/\W/g, '')

beforeAll(async () => {
  env = await createTestEnv()
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'administrator')`, [PLATFORM])
  app = Fastify()
  await app.register(sysmlPlugin, {
    prefix: BASE,
    pool: env.pool,
    authenticate: async (req) => ({ userId: String(req.headers['x-dev-user']), entitlements: ['tool:sysml'] }),
    roleOf: async (user, project) => (await env.pool.query<{ role: string }>('SELECT role FROM platform.project_memberships WHERE user_id = $1 AND project_id = $2', [user, project])).rows[0]?.role ?? null,
    onReady: (s) => (repo = s.repo),
  })
  await app.ready()
  const p = await call('POST', `${BASE}/projects`, { name: 'Retry', platformProjectId: PLATFORM, initialText: 'package R;' }, 'setup-project')
  pid = p.body['@id'] as string
  mainBranch = (p.body.defaultBranch as { '@id': string })['@id']
  pkgId = (await env.pool.query<{ element_id: string }>(`SELECT element_id FROM sysml.branch_elements WHERE branch_id = $1 AND metaclass = 'Package'`, [mainBranch])).rows[0].element_id
})
afterAll(async () => {
  await app?.close()
  await env?.close()
})

/** One mutating endpoint: `prepare` fixes the request bodies of a key (input a, and a different input b). */
interface Op {
  name: string
  ok: number
  prepare: (key: string) => Promise<{ url: string; a: unknown; b: unknown }>
  /** Number of semantic operations performed so far (rows this endpoint creates). */
  effects: () => Promise<number>
}

const ops: Op[] = [
  {
    name: 'create project',
    ok: 201,
    prepare: async (key) => ({ url: `${BASE}/projects`, a: { name: `P-${key}-a`, platformProjectId: PLATFORM }, b: { name: `P-${key}-b`, platformProjectId: PLATFORM } }),
    effects: () => count('SELECT count(*) AS n FROM sysml.projects WHERE platform_project_id = $1', [PLATFORM]),
  },
  {
    name: 'create branch',
    ok: 201,
    prepare: async (key) => {
      const h = await head()
      return { url: `${BASE}/projects/${pid}/branches`, a: { name: `b-${key}-a`, head: { '@id': h } }, b: { name: `b-${key}-b`, head: { '@id': h } } }
    },
    effects: () => count('SELECT count(*) AS n FROM sysml.branches WHERE project_id = $1', [pid]),
  },
  {
    name: 'create tag',
    ok: 201,
    prepare: async (key) => {
      const h = await head()
      return { url: `${BASE}/projects/${pid}/tags`, a: { name: `t-${key}-a`, taggedCommit: { '@id': h } }, b: { name: `t-${key}-b`, taggedCommit: { '@id': h } } }
    },
    effects: () => count('SELECT count(*) AS n FROM sysml.tags WHERE project_id = $1', [pid]),
  },
  {
    name: 'transaction',
    ok: 200,
    prepare: async (key) => {
      const h = await head()
      const body = (v: string) => ({ baseCommitId: h, commands: [{ op: 'createElement', ownerId: pkgId, kind: 'PartDefinition', name: `E${tag(key)}${v}` }] })
      return { url: `${BASE}/projects/${pid}/branches/${mainBranch}/transactions`, a: body('a'), b: body('b') }
    },
    effects: () => count('SELECT count(*) AS n FROM sysml.commits WHERE project_id = $1', [pid]),
  },
  {
    name: 'raw commit',
    ok: 201,
    prepare: async (key) => {
      const { rows } = await env.pool.query<{ payload: Record<string, unknown> }>('SELECT ev.payload FROM sysml.branch_elements be JOIN sysml.element_versions ev ON ev.version_id = be.version_id WHERE be.branch_id = $1 AND be.element_id = $2', [mainBranch, pkgId])
      const body = (v: string) => ({ '@type': 'Commit', change: [{ '@type': 'DataVersion', payload: { ...rows[0].payload, declaredName: `R${tag(key)}${v}` } }] })
      return { url: `${BASE}/projects/${pid}/commits?branchId=${mainBranch}`, a: body('a'), b: body('b') }
    },
    effects: () => count('SELECT count(*) AS n FROM sysml.commits WHERE project_id = $1', [pid]),
  },
  {
    name: 'undo (revert)',
    ok: 200,
    prepare: async (key) => {
      // A fresh commit to undo (made without a key; not part of the measured operation).
      const made = await call('POST', `${BASE}/projects/${pid}/branches/${mainBranch}/transactions`, { baseCommitId: await head(), commands: [{ op: 'createElement', ownerId: pkgId, kind: 'PartDefinition', name: `U${tag(key)}` }] })
      expect(made.status).toBe(200)
      const target = (made.body.commit as { '@id': string })['@id']
      return { url: `${BASE}/projects/${pid}/commits/${target}/revert?branchId=${mainBranch}`, a: { reason: 'undo a' }, b: { reason: 'undo b' } }
    },
    effects: () => count(`SELECT count(*) AS n FROM sysml.commits WHERE project_id = $1 AND source->>'kind' = 'revert'`, [pid]),
  },
]
const newKey = () => randomBytes(6).toString('hex')

describe.each(ops)('retry safety: $name', (op) => {
  it('concurrent duplicates: one operation, every response the same outcome', async () => {
    const key = newKey()
    const r = await op.prepare(key)
    const before = await op.effects()
    const results = await Promise.all([1, 2, 3].map(() => call('POST', r.url, r.a, key)))
    expect(results.map((x) => x.status)).toEqual([op.ok, op.ok, op.ok])
    expect((await op.effects()) - before).toBe(1)
    for (const x of results) expect(x.body).toEqual(results[0].body)
    expect(results.filter((x) => x.replayed).length).toBe(2)
  })

  it('retry after a lost response: the server committed, the client never saw the reply; the retry replays it', async () => {
    const key = newKey()
    const r = await op.prepare(key)
    const before = await op.effects()
    const first = await call('POST', r.url, r.a, key)
    expect(first.status).toBe(op.ok) // ...and the client loses this reply.
    const retry = await call('POST', r.url, r.a, key)
    expect(retry).toMatchObject({ status: op.ok, replayed: true })
    expect(retry.body).toEqual(first.body)
    expect((await op.effects()) - before).toBe(1)
  })

  it('failure injected just after COMMIT: the outcome is recorded with the commit; the request and its retry replay it', async () => {
    const key = newKey()
    const r = await op.prepare(key)
    const before = await op.effects()
    let fired = false
    repo.faults = {
      afterCommit: () => {
        if (!fired) {
          fired = true
          throw new Error('process interrupted after commit')
        }
      },
    }
    let first: Res
    try {
      first = await call('POST', r.url, r.a, key)
    } finally {
      repo.faults = undefined
    }
    expect(fired).toBe(true)
    // The record was written in the committed transaction, so the server answers with it.
    expect(first).toMatchObject({ status: op.ok, replayed: true })
    expect((await op.effects()) - before).toBe(1)
    const retry = await call('POST', r.url, r.a, key)
    expect(retry).toMatchObject({ status: op.ok, replayed: true })
    expect((await op.effects()) - before).toBe(1)
  })

  it('failure injected just before COMMIT: nothing is applied or recorded; the retry applies once', async () => {
    const key = newKey()
    const r = await op.prepare(key)
    const before = await op.effects()
    repo.faults = {
      beforeCommit: () => {
        throw new Error('process interrupted before commit')
      },
    }
    let failed: Res
    try {
      failed = await call('POST', r.url, r.a, key)
    } finally {
      repo.faults = undefined
    }
    expect(failed.status).toBe(500)
    expect((await op.effects()) - before).toBe(0)
    expect(await count('SELECT count(*) AS n FROM sysml.idempotency_keys WHERE key = $1', [key])).toBe(0)
    const retry = await call('POST', r.url, r.a, key)
    expect(retry).toMatchObject({ status: op.ok, replayed: false })
    const again = await call('POST', r.url, r.a, key)
    expect(again).toMatchObject({ status: op.ok, replayed: true })
    expect((await op.effects()) - before).toBe(1)
  })

  it('key reused with different input: refused with 422 and no second operation (sequential and concurrent)', async () => {
    const key = newKey()
    const r = await op.prepare(key)
    const before = await op.effects()
    expect((await call('POST', r.url, r.a, key)).status).toBe(op.ok)
    const reuse = await call('POST', r.url, r.b, key)
    expect(reuse.status).toBe(422)
    expect(reuse.body.error).toMatchObject({ code: 'invalid' })
    expect((await op.effects()) - before).toBe(1)

    const key2 = newKey()
    const r2 = await op.prepare(key2)
    const before2 = await op.effects()
    const pair = await Promise.all([call('POST', r2.url, r2.a, key2), call('POST', r2.url, r2.b, key2)])
    expect(pair.map((x) => x.status).sort()).toEqual([op.ok, 422].sort())
    expect((await op.effects()) - before2).toBe(1)
  })
})
