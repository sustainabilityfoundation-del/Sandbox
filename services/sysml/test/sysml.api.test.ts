import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { SEED_PROJECT_ID } from '../src/seed'

/**
 * SysML Modeler API against the real API host and a disposable PostgreSQL (npm run req:test:db).
 * The host seeds the actuator example (project SEED_PROJECT_ID, platform project PRJ-ACT100).
 */

let env: TestEnv
const BASE = '/api/sysml/v1'
const P = `${BASE}/projects/${SEED_PROJECT_ID}`
const idem = () => ({ 'idempotency-key': randomBytes(8).toString('hex') })

beforeAll(async () => {
  env = await createTestEnv()
  // A reader who has the SysML entitlement, and a member without it.
  await env.pool.query(`INSERT INTO platform.users (id, name) VALUES ('rea', 'Rea (SysML reader)'), ('zed', 'Zed (CAD only)')`)
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ('PRJ-ACT100', 'rea', 'reader'), ('PRJ-ACT100', 'zed', 'editor')`)
  await env.pool.query(`INSERT INTO platform.entitlements (user_id, entitlement) VALUES ('rea', 'tool:sysml'), ('zed', 'tool:cad')`)
})
afterAll(async () => env?.close())

async function head(user = 'eli', branch?: string): Promise<{ branchId: string; commitId: string }> {
  const project = (await env.call(user, 'GET', P)).body
  const branchId = branch ?? project.defaultBranch['@id']
  const b = await env.call(user, 'GET', `${P}/branches/${branchId}`)
  return { branchId, commitId: b.body.head['@id'] }
}

async function tx(commands: unknown[], opts: { user?: string; base?: string; dryRun?: boolean; policy?: string; branch?: string; headers?: Record<string, string>; source?: unknown } = {}) {
  const h = await head(opts.user ?? 'eli', opts.branch)
  return env.call(opts.user ?? 'eli', 'POST', `${P}/branches/${h.branchId}/transactions`, { baseCommitId: opts.base ?? h.commitId, commands, ...(opts.dryRun ? { dryRun: true } : {}), ...(opts.policy ? { validationPolicy: opts.policy } : {}), ...(opts.source ? { source: opts.source } : {}) }, opts.headers ?? idem())
}

describe('projects, access and the seeded example', () => {
  it('lists the seeded example for SysML users, refuses others', async () => {
    const eli = await env.call('eli', 'GET', `${BASE}/projects`)
    expect(eli.status).toBe(200)
    expect(eli.body.map((p: { '@id': string }) => p['@id'])).toContain(SEED_PROJECT_ID)
    expect(eli.body[0]).toMatchObject({ '@type': 'Project', platformProjectId: 'PRJ-ACT100' })
    expect((await env.call('nia', 'GET', P)).status).toBe(200)
    expect((await env.call('rho', 'GET', P)).body.error.code).toBe('forbidden') // no tool:sysml
    expect((await env.call('zed', 'GET', P)).status).toBe(403)
    expect((await env.call('', 'GET', P)).status).toBe(401)
  })

  it('serves the model at the head: snapshot, text, children, validation without errors', async () => {
    const h = await head()
    const snap = await env.call('eli', 'GET', `${P}/commits/${h.commitId}/model`)
    expect(snap.body.total).toBeGreaterThan(500)
    expect(snap.body.elements[0]).toHaveProperty('@type')
    const text = await env.call('eli', 'GET', `${P}/commits/${h.commitId}/text`)
    expect(text.body.text).toContain('package ActuatorSystem {')
    const kids = await env.call('eli', 'GET', `${P}/commits/${h.commitId}/children`)
    expect(kids.body.map((k: { name: string }) => k.name)).toEqual(['ActuatorSystem'])
    const v = await env.call('eli', 'GET', `${P}/commits/${h.commitId}/validation`)
    expect(v.body.counts.error).toBe(0)
  })

  it('creates projects with an initial model; refuses invalid text and non-editors', async () => {
    const ok = await env.call('eli', 'POST', `${BASE}/projects`, { name: 'Scratch', platformProjectId: 'PRJ-ACT100', initialText: 'package S { part def A; }' }, idem())
    expect(ok.status).toBe(201)
    expect(ok.body.headCommit.number).toBe(1)
    const bad = await env.call('eli', 'POST', `${BASE}/projects`, { name: 'Bad', platformProjectId: 'PRJ-ACT100', initialText: 'package S { part x : Nope; }' }, idem())
    expect(bad.status).toBe(422)
    expect((await env.call('rea', 'POST', `${BASE}/projects`, { name: 'R', platformProjectId: 'PRJ-ACT100' }, idem())).status).toBe(403)
  })
})

describe('typed transactions', () => {
  it('dry run previews without committing; commit records provenance; idempotent retry replays', async () => {
    const before = await head()
    const cmds = [{ op: 'createElement', ownerId: 'ActuatorSystem::Electrical', kind: 'PartDefinition', name: 'Battery', ref: '$b' }, { op: 'createElement', ownerId: '$b', kind: 'AttributeUsage', name: 'capacity', typeIds: ['ISQ::ElectricChargeValue'], value: '7200 [C]' }]
    const dry = await tx(cmds, { dryRun: true })
    expect(dry.status).toBe(200)
    expect(dry.body).toMatchObject({ dryRun: true, summaryText: 'Created ActuatorSystem::Electrical::Battery' })
    expect(dry.body.commit).toBeUndefined()
    expect((await head()).commitId).toBe(before.commitId)
    const headers = idem()
    const source = { kind: 'assistant', conversationId: 'c-1', proposalId: 'p-1', messageId: 'm-1' }
    const done = await tx(cmds, { headers, source })
    expect(done.status).toBe(200)
    expect(done.body.commit).toMatchObject({ actor: 'eli', source, number: expect.any(Number) })
    expect(done.headers.etag).toBe(`"${done.body.commit['@id']}"`)
    const created = done.body.createdIds.$b
    expect(done.body.changes.find((c: { id: string }) => c.id === created)).toMatchObject({ kind: 'created', metaclass: 'PartDefinition', after: { declaredName: 'Battery' } })
    // Same key, same request: the first outcome, no second commit.
    const again = await env.call('eli', 'POST', `${P}/branches/${before.branchId}/transactions`, { baseCommitId: before.commitId, commands: cmds, source }, headers)
    expect(again.headers['idempotency-replayed']).toBe('true')
    expect(again.body.commit['@id']).toBe(done.body.commit['@id'])
    const commit = await env.call('eli', 'GET', `${P}/commits/${done.body.commit['@id']}`)
    expect(commit.body).toMatchObject({ '@type': 'Commit', source, previousCommit: [{ '@id': before.commitId }] })
  })

  it('requires a version check, a write role, and refuses invalid commands with the command index', async () => {
    const h = await head()
    expect((await env.call('eli', 'POST', `${P}/branches/${h.branchId}/transactions`, { commands: [{ op: 'rename', elementId: 'ActuatorSystem', name: 'X' }] })).status).toBe(400)
    expect((await tx([{ op: 'rename', elementId: 'ActuatorSystem', name: 'X' }], { user: 'rea' })).status).toBe(403)
    const bad = await tx([{ op: 'setTyping', elementId: 'ActuatorSystem::Architecture::LinearActuator::motor', typeIds: ['Nope'] }])
    expect(bad.status).toBe(404)
    expect(bad.body.error.details.commandIndex).toBe(0)
    const policy = await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Rod::mass', expression: '3 [m]' }], { policy: 'reject-new-errors' })
    expect(policy.status).toBe(422)
    expect(policy.body.error.code).toBe('rejected')
  })

  it('element-level concurrency: non-overlapping stale transactions are rebased, overlapping ones conflict', async () => {
    const stale = await head()
    const first = await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Rod::mass', expression: '0.45 [kg]' }])
    expect(first.status).toBe(200)
    const other = await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Housing::mass', expression: '0.9 [kg]' }], { base: stale.commitId })
    expect(other.status).toBe(200)
    expect(other.body.rebased).toBe(true)
    const clash = await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Rod::mass', expression: '0.5 [kg]' }], { base: stale.commitId })
    expect(clash.status).toBe(409)
    expect(clash.body.error.message).toMatch(/ActuatorSystem::Mechanical::Rod::mass/)
  })

  it('idempotency is atomic with the commit: concurrent retries with one key create one commit and replay its outcome', async () => {
    const h = await head()
    const headers = idem()
    const body = { baseCommitId: h.commitId, commands: [{ op: 'setDocumentation', elementId: 'ActuatorSystem::Interfaces', text: `Retry-safe ${Date.now()}` }] }
    const results = await Promise.all([0, 1, 2].map(() => env.call('eli', 'POST', `${P}/branches/${h.branchId}/transactions`, body, headers)))
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    const ids = new Set(results.map((r) => r.body.commit['@id']))
    expect(ids.size).toBe(1)
    expect(results.filter((r) => r.headers['idempotency-replayed'] === 'true')).toHaveLength(2)
    const after = await env.pool.query(`SELECT count(*)::int AS n FROM sysml.commits WHERE description = $1`, [results[0].body.commit.description])
    expect(after.rows[0].n).toBe(1)
    // The stored record lives in the same transaction as the commit: both exist or neither.
    const rec = await env.pool.query(`SELECT response_body FROM sysml.idempotency_keys WHERE actor = 'eli' AND key = $1`, [headers['idempotency-key']])
    expect(rec.rows[0].response_body.commit['@id']).toBe([...ids][0])
  })

  it('parallel transactions on one branch never lose updates', async () => {
    const h = await head()
    const results = await Promise.all(
      ['Gearbox', 'BallScrew', 'Housing', 'Rod'].map((d, k) => tx([{ op: 'setDocumentation', elementId: `ActuatorSystem::Mechanical::${d}`, text: `Parallel note ${k}` }], { base: h.commitId })),
    )
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])
    const numbers = results.map((r) => r.body.commit.number)
    expect(new Set(numbers).size).toBe(4)
    const text = (await env.call('eli', 'GET', `${P}/commits/${(await head()).commitId}/text`)).body.text
    for (let k = 0; k < 4; k++) expect(text).toContain(`Parallel note ${k}`)
  })

  it('undo (revert) restores the previous versions, and refuses when later commits changed the same elements', async () => {
    const created = await tx([{ op: 'createElement', ownerId: 'ActuatorSystem::Mechanical', kind: 'PartDefinition', name: 'Bracket' }])
    const commitId = created.body.commit['@id']
    const h = await head()
    const undo = await env.call('eli', 'POST', `${P}/commits/${commitId}/revert?branchId=${h.branchId}`, {}, idem())
    expect(undo.status).toBe(200)
    expect(undo.body.commit.source).toMatchObject({ kind: 'revert', revertedCommitId: commitId })
    const text = (await env.call('eli', 'GET', `${P}/commits/${undo.body.commit['@id']}/text`)).body.text
    expect(text).not.toContain('Bracket')
    // Change, then change again, then try to undo the first change.
    const a = await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Gearbox::ratio', expression: '6.0' }])
    await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Gearbox::ratio', expression: '7.0' }])
    const refused = await env.call('eli', 'POST', `${P}/commits/${a.body.commit['@id']}/revert?branchId=${h.branchId}`, {}, idem())
    expect(refused.status).toBe(409)
  })
})

describe('Systems Modeling API aligned endpoints', () => {
  it('commits, changes, elements, relationships, roots and history reads at older commits', async () => {
    const commits = (await env.call('eli', 'GET', `${P}/commits?limit=500`)).body
    const first = commits[commits.length - 1]
    expect(first.number).toBe(1)
    const changes = (await env.call('eli', 'GET', `${P}/commits/${first['@id']}/changes`)).body
    expect(changes[0]).toMatchObject({ '@type': 'DataVersion', identity: { '@type': 'DataIdentity' } })
    const roots = (await env.call('eli', 'GET', `${P}/commits/${first['@id']}/roots`)).body
    expect(roots[0]).toMatchObject({ '@type': 'Namespace' })
    const h = await head()
    const pkgs = (await env.call('eli', 'POST', `${P}/query-results?commitId=${h.commitId}`, { '@type': 'Query', where: { '@type': 'CompositeConstraint', operator: 'and', constraint: [{ '@type': 'PrimitiveConstraint', property: '@type', operator: '=', value: 'PartDefinition' }, { '@type': 'PrimitiveConstraint', property: 'name', operator: '=', value: 'BrushlessMotor' }] } })).body
    expect(pkgs).toHaveLength(1)
    const motorDef = pkgs[0]
    expect(motorDef.qualifiedName).toBe('ActuatorSystem::Electrical::BrushlessMotor')
    const el = (await env.call('eli', 'GET', `${P}/commits/${h.commitId}/elements/${motorDef['@id']}?derived=true`)).body
    expect(el).toMatchObject({ '@id': motorDef['@id'], declaredName: 'BrushlessMotor', owningRelationship: { '@id': expect.any(String) } })
    const rels = (await env.call('eli', 'GET', `${P}/commits/${h.commitId}/elements/${motorDef['@id']}/relationships?direction=in`)).body
    expect(rels.some((r: { '@type': string }) => r['@type'] === 'FeatureTyping')).toBe(true)
    // The model at commit 1 has no Battery (added later): history reads are exact.
    const old = (await env.call('eli', 'GET', `${P}/commits/${first['@id']}/text`)).body.text
    expect(old).not.toContain('Battery')
    const diff = (await env.call('eli', 'GET', `${P}/commits/${h.commitId}/diff?baseCommitId=${first['@id']}`)).body
    expect(diff.some((d: { label: string; kind: string }) => d.label === 'ActuatorSystem::Electrical::Battery' && d.kind === 'created')).toBe(true)
    const page = await env.call('eli', 'GET', `${P}/commits/${h.commitId}/elements?page[size]=10`)
    expect(page.body).toHaveLength(10)
    expect(page.headers.link).toMatch(/rel="next"/)
  })

  it('raw commits are validated: dangling references are rejected, well-formed changes accepted', async () => {
    const h = await head()
    const pkg = (await env.call('eli', 'POST', `${P}/query-results`, { where: { property: 'qualifiedName', value: 'ActuatorSystem::Mechanical::Rod' } })).body[0]
    const dangling = { ...pkg, ownedRelationship: [...pkg.ownedRelationship, { '@id': '00000000-0000-4000-8000-000000000001' }] }
    const bad = await env.call('eli', 'POST', `${P}/commits?branchId=${h.branchId}`, { '@type': 'Commit', change: [{ '@type': 'DataVersion', payload: dangling }] }, idem())
    expect(bad.status).toBe(422)
    const renamed = { '@id': pkg['@id'], '@type': pkg['@type'], declaredName: 'PistonRod', owningRelationship: pkg.owningRelationship, ownedRelationship: pkg.ownedRelationship, isAbstract: false }
    const ok = await env.call('eli', 'POST', `${P}/commits?branchId=${h.branchId}`, { '@type': 'Commit', previousCommit: { '@id': h.commitId }, change: [{ '@type': 'DataVersion', payload: renamed }] }, idem())
    expect(ok.status).toBe(201)
    expect(ok.body.source.kind).toBe('api')
    const text = (await env.call('eli', 'GET', `${P}/commits/${ok.body['@id']}/text`)).body.text
    expect(text).toContain('part rod : PistonRod;')
  })

  it('branches and tags: work on a branch does not change main', async () => {
    const h = await head()
    const branch = await env.call('eli', 'POST', `${P}/branches`, { '@type': 'Branch', name: 'alt-gearbox', head: { '@id': h.commitId } }, idem())
    expect(branch.status).toBe(201)
    const onBranch = await tx([{ op: 'setValue', elementId: 'ActuatorSystem::Mechanical::Gearbox::ratio', expression: '10.0' }], { branch: branch.body['@id'] })
    expect(onBranch.status).toBe(200)
    expect((await head()).commitId).toBe(h.commitId)
    const tag = await env.call('eli', 'POST', `${P}/tags`, { '@type': 'Tag', name: 'baseline-1', taggedCommit: { '@id': h.commitId } }, idem())
    expect(tag.status).toBe(201)
    expect((await env.call('eli', 'GET', `${P}/tags`)).body.map((t: { name: string }) => t.name)).toContain('baseline-1')
    expect((await env.call('eli', 'POST', `${P}/branches`, { name: 'alt-gearbox', head: { '@id': h.commitId } }, idem())).status).toBe(409)
  })
})

describe('model services, schema discovery, OpenAPI and events', () => {
  it('impact analysis, search and command schemas', async () => {
    const h = await head()
    const rod = (await env.call('eli', 'GET', `${P}/commits/${h.commitId}/search?text=Housing&metaclass=PartDefinition`)).body[0]
    const imp = await env.call('eli', 'GET', `${P}/commits/${h.commitId}/impact?elementId=${rod.id}`)
    expect(imp.body.impact.map((x: { label: string }) => x.label)).toContain('ActuatorSystem::Architecture::LinearActuator::housing')
    const cmds = await env.call('rea', 'GET', `${BASE}/commands`)
    expect(cmds.body.commands.map((c: { op: string }) => c.op)).toContain('createElement')
    expect(cmds.body.metaclasses.find((m: { name: string }) => m.name === 'PartUsage')).toMatchObject({ supers: ['ItemUsage'] })
  })

  it('publishes an OpenAPI 3.1 document distinguishing aligned endpoints from extensions', async () => {
    const doc = (await env.call('', 'GET', `${BASE}/openapi.json`)).body
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.paths['/projects/{projectId}/commits'].post['x-ews-alignment']).toMatch(/aligned/)
    expect(doc.paths['/projects/{projectId}/branches/{branchId}/transactions'].post['x-ews-alignment']).toBe('platform extension')
    expect((await env.call('', 'GET', `${BASE}/docs`)).status).toBe(200)
  })

  it('streams committed-change events (SSE) after commits', async () => {
    const origin = await env.listen()
    const ac = new AbortController()
    const res = await fetch(`${origin}${P}/events`, { headers: { 'x-dev-user': 'eli' }, signal: ac.signal })
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const done = tx([{ op: 'setDocumentation', elementId: 'ActuatorSystem::Control', text: 'Event test.' }])
    let text = ''
    const deadline = Date.now() + 15000
    while (!text.includes('sysml.commit-created') && Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), new Promise<{ value?: Uint8Array }>((r) => setTimeout(() => r({}), 500))])
      if (chunk.value) text += new TextDecoder().decode(chunk.value)
    }
    expect((await done).status).toBe(200)
    expect(text).toContain('event: sysml.commit-created')
    ac.abort()
  })
})

describe('large-model baseline (database)', () => {
  it('stores a generated model of ~30 000 elements and commits small changes quickly', async () => {
    const lines = ['package Big {', '    private import ISQ::*;', '    private import SI::*;']
    for (let i = 0; i < 1500; i++) lines.push(`    part def D${i} { attribute m : MassValue = ${i} [kg]; part sub : D${Math.max(i - 1, 0)}[0..1]; }`)
    lines.push('}')
    let t = Date.now()
    const created = await env.call('eli', 'POST', `${BASE}/projects`, { name: 'Big', platformProjectId: 'PRJ-ACT100', initialText: lines.join('\n') }, idem())
    const createMs = Date.now() - t
    expect(created.status).toBe(201)
    const id = created.body['@id']
    const branch = created.body.defaultBranch['@id']
    t = Date.now()
    const r = await env.call('eli', 'POST', `${BASE}/projects/${id}/branches/${branch}/transactions`, { baseCommitId: created.body.headCommit['@id'], commands: [{ op: 'rename', elementId: 'Big::D10', name: 'Renamed' }] }, idem())
    const txMs = Date.now() - t
    expect(r.status).toBe(200)
    expect(r.body.commit.changeCount).toBeLessThan(10)
    console.log(`DB baseline: create ${createMs} ms (${lines.length} lines), rename commit ${txMs} ms`)
    expect(txMs).toBeLessThan(10000)
  })
})
