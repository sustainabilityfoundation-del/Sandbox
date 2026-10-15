import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createSysmlEventHub, type SysmlEvent } from '../src/events'

/**
 * C13 project scoping (integration-milestone-1.md): two platform projects, each with a SysML project.
 * Every write or read whose target resource (branch, commit, element, tag) belongs to another project
 * than the path is refused, membership is per platform project, and events are delivered per project.
 */

let env: TestEnv
const BASE = '/api/sysml/v1'
const A = 'PRJ-SCOPE-A'
const B = 'PRJ-SCOPE-B'
const idem = () => ({ 'idempotency-key': randomBytes(8).toString('hex') })
let pa: { id: string; branch: string; head: string; root: string }
let pb: { id: string; branch: string; head: string; root: string }

async function create(platform: string, name: string) {
  const r = await env.call('eli', 'POST', `${BASE}/projects`, { name, platformProjectId: platform, initialText: `package ${name} { part def Thing; }` }, idem())
  expect(r.status).toBe(201)
  const root = (await env.pool.query<{ root_element_id: string }>('SELECT root_element_id FROM sysml.projects WHERE id = $1', [r.body['@id']])).rows[0].root_element_id
  return { id: r.body['@id'] as string, branch: r.body.defaultBranch['@id'] as string, head: r.body.headCommit['@id'] as string, root }
}
const tx = (p: { id: string }, branch: string, base: string, commands: unknown[]) => env.call('eli', 'POST', `${BASE}/projects/${p.id}/branches/${branch}/transactions`, { baseCommitId: base, commands }, idem())

beforeAll(async () => {
  env = await createTestEnv()
  await env.pool.query(`INSERT INTO platform.users (id, name) VALUES ('ana', 'Ana (project A only)')`)
  await env.pool.query(`INSERT INTO platform.entitlements (user_id, entitlement) VALUES ('ana', 'tool:sysml')`)
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'administrator'), ($2, 'eli', 'administrator'), ($1, 'ana', 'editor')`, [A, B])
  pa = await create(A, 'Alpha')
  pb = await create(B, 'Beta')
})
afterAll(async () => env?.close())

describe('project scoping (C13)', () => {
  it('membership is per platform project: a member of A can neither read nor write B', async () => {
    expect((await env.call('ana', 'GET', `${BASE}/projects/${pa.id}`)).status).toBe(200)
    expect((await env.call('ana', 'GET', `${BASE}/projects/${pb.id}`)).status).toBe(403)
    expect((await env.call('ana', 'POST', `${BASE}/projects/${pb.id}/branches/${pb.branch}/transactions`, { baseCommitId: pb.head, commands: [{ op: 'createElement', ownerId: 'Beta', kind: 'PartDefinition', name: 'X' }] }, idem())).status).toBe(403)
    expect((await env.call('ana', 'POST', `${BASE}/projects`, { name: 'Sneaky', platformProjectId: B }, idem())).status).toBe(403)
    const listed = (await env.call('ana', 'GET', `${BASE}/projects`)).body as { platformProjectId: string }[]
    expect(listed.some((p) => p.platformProjectId === B)).toBe(false)
  })

  it('writes on A refuse branches, commits and tags of B (404), and change nothing in either project', async () => {
    // Transaction on A's path with B's branch.
    expect((await tx(pa, pb.branch, pb.head, [{ op: 'createElement', ownerId: 'Beta', kind: 'PartDefinition', name: 'X' }])).status).toBe(404)
    // A's branch, but B's commit as the base.
    expect([404, 409, 422]).toContain((await tx(pa, pa.branch, pb.head, [{ op: 'createElement', ownerId: 'Alpha', kind: 'PartDefinition', name: 'X' }])).status)
    // Revert of B's commit through A.
    expect((await env.call('eli', 'POST', `${BASE}/projects/${pa.id}/commits/${pb.head}/revert?branchId=${pa.branch}`, {}, idem())).status).toBe(404)
    // Revert of A's commit onto B's branch.
    const second = await tx(pa, pa.branch, pa.head, [{ op: 'createElement', ownerId: 'Alpha', kind: 'PartDefinition', name: 'Second' }])
    expect(second.status).toBe(200)
    pa.head = second.body.commit['@id']
    expect((await env.call('eli', 'POST', `${BASE}/projects/${pa.id}/commits/${pa.head}/revert?branchId=${pb.branch}`, {}, idem())).status).toBe(404)
    // Tag and branch of A pointing at B's commit.
    expect((await env.call('eli', 'POST', `${BASE}/projects/${pa.id}/tags`, { name: 'x', taggedCommit: { '@id': pb.head } }, idem())).status).toBe(404)
    expect((await env.call('eli', 'POST', `${BASE}/projects/${pa.id}/branches`, { name: 'x', head: { '@id': pb.head } }, idem())).status).toBe(404)
    // Raw commit on A's path targeting B's branch.
    const raw = await env.call('eli', 'POST', `${BASE}/projects/${pa.id}/commits?branchId=${pb.branch}`, { '@type': 'Commit', change: [{ '@type': 'DataVersion', identity: { '@id': pb.root } }] }, idem())
    expect(raw.status).toBe(404)
    // Nothing was written in B by any of these requests (only A's own commit above).
    expect(Number((await env.pool.query('SELECT count(*) AS n FROM sysml.commits WHERE project_id = $1', [pb.id])).rows[0].n)).toBe(1)
    expect(Number((await env.pool.query('SELECT count(*) AS n FROM sysml.commits WHERE project_id = $1', [pa.id])).rows[0].n)).toBe(2)
  })

  it('reads on A refuse B resources (404)', async () => {
    expect((await env.call('eli', 'GET', `${BASE}/projects/${pa.id}/commits/${pb.head}`)).status).toBe(404)
    expect((await env.call('eli', 'GET', `${BASE}/projects/${pa.id}/branches/${pb.branch}`)).status).toBe(404)
    expect((await env.call('eli', 'GET', `${BASE}/projects/${pa.id}/commits/${pb.head}/text`)).status).toBe(404)
  })

  it('commands cannot reach elements of the other project', async () => {
    const thingB = (await env.pool.query<{ element_id: string }>(`SELECT element_id FROM sysml.branch_elements WHERE branch_id = $1 AND name = 'Thing'`, [pb.branch])).rows[0].element_id
    const r = await tx(pa, pa.branch, pa.head, [{ op: 'rename', elementId: thingB, name: 'Hijacked' }])
    expect(r.status).toBe(404)
    const r2 = await tx(pa, pa.branch, pa.head, [{ op: 'createElement', ownerId: 'Alpha', kind: 'PartUsage', name: 'x', typeIds: [thingB] }])
    expect([404, 422]).toContain(r2.status)
    expect((await env.pool.query(`SELECT count(*) AS n FROM sysml.element_versions WHERE name = 'Hijacked'`)).rows[0].n).toBe('0')
  })

  it('events are delivered per project', async () => {
    const hub = await createSysmlEventHub(env.pool, { pollMs: 100 })
    const seenA: SysmlEvent[] = []
    const off = hub.subscribe(pa.id, (e) => seenA.push(e))
    const head = (await env.pool.query<{ head_commit_id: string }>('SELECT head_commit_id FROM sysml.branches WHERE id = $1', [pb.branch])).rows[0].head_commit_id
    expect((await tx(pb, pb.branch, head, [{ op: 'createElement', ownerId: 'Beta', kind: 'PartDefinition', name: 'OnlyB' }])).status).toBe(200)
    try {
      for (let k = 0; k < 10; k++) await hub.flush()
      // A's own earlier events may still be published by this hub; none of B's may arrive.
      expect(seenA.filter((e) => e.projectId !== pa.id)).toEqual([])
    } finally {
      off()
      await hub.close()
    }
  })

  it('an Idempotency-Key used on A cannot replay or apply on B', async () => {
    const key = { 'idempotency-key': `shared-${randomBytes(4).toString('hex')}` }
    const headA = (await env.pool.query<{ head_commit_id: string }>('SELECT head_commit_id FROM sysml.branches WHERE id = $1', [pa.branch])).rows[0].head_commit_id
    const headB = (await env.pool.query<{ head_commit_id: string }>('SELECT head_commit_id FROM sysml.branches WHERE id = $1', [pb.branch])).rows[0].head_commit_id
    const a = await env.call('eli', 'POST', `${BASE}/projects/${pa.id}/branches/${pa.branch}/transactions`, { baseCommitId: headA, commands: [{ op: 'createElement', ownerId: 'Alpha', kind: 'PartDefinition', name: 'K' }] }, key)
    expect(a.status).toBe(200)
    const b = await env.call('eli', 'POST', `${BASE}/projects/${pb.id}/branches/${pb.branch}/transactions`, { baseCommitId: headB, commands: [{ op: 'createElement', ownerId: 'Beta', kind: 'PartDefinition', name: 'K' }] }, key)
    expect(b.status).toBe(422)
    expect((await env.pool.query(`SELECT count(*) AS n FROM sysml.branch_elements WHERE branch_id = $1 AND name = 'K'`, [pb.branch])).rows[0].n).toBe('0')
  })
})
