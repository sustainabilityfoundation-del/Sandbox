import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE, PROJECT, REQ1, REQ2, REQ3, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const create = async (user = 'eli', body: Record<string, unknown> = {}) =>
  env.call(user, 'POST', `${BASE}/requirements`, { title: 'Test requirement', statement: 'The actuator shall do X within 2 s.', type: 'performance', ...body }, idem())

describe('seed and identity (AC-D1, contracts §3)', () => {
  it('seeds REQ-001…003 with the agreed UUIDs and legacy aliases', async () => {
    const res = await env.call('rho', 'GET', `${BASE}/requirements?keys=REQ-001,REQ-002,REQ-003`)
    expect(res.status).toBe(200)
    await expectConforms(env, 'listRequirements', 200, res.body)
    expect(res.body.items.map((r: { id: string }) => r.id)).toEqual([REQ1, REQ2, REQ3])
    expect(res.body.items[0].legacyIds).toEqual(['REQ-001'])
    expect(res.body.items.map((r: { status: string }) => r.status)).toEqual(['approved', 'approved', 'in-review'])
  })

  it('resolves a legacy twin ID and a key to the canonical requirement', async () => {
    const res = await env.call('nia', 'GET', `${BASE}/requirements/resolve?key=REQ-002`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(REQ2)
    expect(res.headers.etag).toBe('"1"')
    const missing = await env.call('nia', 'GET', `${BASE}/requirements/resolve?key=REQ-999`)
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('not-found')
  })

  it('refuses requests without an identity and unknown users', async () => {
    expect((await env.call('', 'GET', `${BASE}/requirements`)).status).toBe(401)
    const unknown = await env.call('mallory', 'GET', `${BASE}/requirements`)
    expect(unknown.status).toBe(401)
    expect(unknown.body.error.code).toBe('unauthenticated')
  })
})

describe('revisions and concurrency (AC-D2, AC-B5)', () => {
  it('creates immutable revisions and returns explicit conflicts instead of overwriting', async () => {
    const created = await create()
    expect(created.status).toBe(201)
    await expectConforms(env, 'createRequirement', 201, created.body)
    const id = created.body.id
    expect(created.body.key).toMatch(/^REQ-\d{3,}$/)
    expect(created.body.revision).toBe(1)

    const a = await env.call('eli', 'PATCH', `${BASE}/requirements/${id}`, { expectedRevision: 1, statement: 'The actuator shall do X within 1.5 s.', reason: 'Tighter cycle' })
    expect(a.status).toBe(200)
    expect(a.body.revision).toBe(2)
    expect(a.body.changeReason).toBe('Tighter cycle')
    // A second editor still based on revision 1 gets a conflict, and nothing changes.
    const b = await env.call('ada', 'PATCH', `${BASE}/requirements/${id}`, { expectedRevision: 1, statement: 'Overwrite attempt.' })
    expect(b.status).toBe(409)
    expect(b.body.error).toMatchObject({ code: 'conflict', details: { currentRevision: 2 } })
    const now = await env.call('rho', 'GET', `${BASE}/requirements/${id}`)
    expect(now.body.statement).toBe('The actuator shall do X within 1.5 s.')
    // If-Match works the same way.
    const c = await env.call('eli', 'PATCH', `${BASE}/requirements/${id}`, { rationale: 'Because.' }, { 'if-match': '"2"' })
    expect(c.status).toBe(200)
    expect(c.headers.etag).toBe('"3"')
    // A write without any revision check is refused.
    const d = await env.call('eli', 'PATCH', `${BASE}/requirements/${id}`, { rationale: 'No check' })
    expect(d.status).toBe(400)
    // Old revisions stay readable and unchanged.
    const r1 = await env.call('rho', 'GET', `${BASE}/requirements/${id}?revision=1`)
    expect(r1.body.statement).toBe('The actuator shall do X within 2 s.')
    const cmp = await env.call('rho', 'GET', `${BASE}/requirements/${id}/compare?from=1&to=3`)
    expect(cmp.body.changes.map((x: { field: string }) => x.field).sort()).toEqual(['rationale', 'statement'])
    const revs = await env.call('rho', 'GET', `${BASE}/requirements/${id}/revisions`)
    expect(revs.body.map((r: { revision: number }) => r.revision)).toEqual([3, 2, 1])
    const history = await env.call('rho', 'GET', `${BASE}/requirements/${id}/history`)
    expect(history.body.find((h: { action: string; reason: string; actor: string }) => h.action === 'revised' && h.reason === 'Tighter cycle')).toMatchObject({ actor: 'eli' })
    await expectConforms(env, 'requirementHistory', 200, history.body)
  })

  it('serialises truly concurrent edits: exactly one of two parallel writes wins', async () => {
    const { body } = await create()
    const results = await Promise.all(
      ['first', 'second', 'third'].map((s) => env.call('eli', 'PATCH', `${BASE}/requirements/${body.id}`, { expectedRevision: 1, statement: `The actuator shall do ${s}.` })),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409])
  })

  it('refuses database-level updates and deletes of stored revisions', async () => {
    await expect(env.pool.query(`UPDATE requirements.requirement_revisions SET title = 'x' WHERE requirement_id = $1`, [REQ1])).rejects.toThrow(/immutable/)
    await expect(env.pool.query(`DELETE FROM requirements.requirement_revisions WHERE requirement_id = $1`, [REQ1])).rejects.toThrow(/immutable/)
    await expect(env.pool.query(`DELETE FROM requirements.audit_events`)).rejects.toThrow(/immutable/)
  })

  it('validates fields and returns field-level details', async () => {
    const bad = await create('eli', { type: 'nonsense', verificationMethods: ['guessing'] })
    expect(bad.status).toBe(422)
    expect(Object.keys(bad.body.error.details.fields).sort()).toEqual(['type', 'verificationMethods'])
    const unknownProp = await env.call('eli', 'POST', `${BASE}/requirements`, { title: 'x', statement: 'y', colour: 'red' }, idem())
    expect(unknownProp.status).toBe(400)
    expect(unknownProp.body.error.code).toBe('invalid')
  })
})

describe('idempotency (AC-B6)', () => {
  it('replays the first outcome for a retried request and refuses a reused key with another body', async () => {
    const key = { 'idempotency-key': `retry-${Date.now()}` }
    const body = { title: 'Retry me', statement: 'The actuator shall survive retries.', type: 'functional' }
    const first = await env.call('eli', 'POST', `${BASE}/requirements`, body, key)
    const second = await env.call('eli', 'POST', `${BASE}/requirements`, body, key)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.body.id).toBe(first.body.id)
    expect(second.headers['idempotency-replayed']).toBe('true')
    const count = await env.pool.query(`SELECT count(*)::int AS n FROM requirements.requirement_revisions WHERE title = 'Retry me'`)
    expect(count.rows[0].n).toBe(1)
    const other = await env.call('eli', 'POST', `${BASE}/requirements`, { ...body, title: 'Different' }, key)
    expect(other.status).toBe(422)
    // Concurrent duplicates with the same key create one requirement.
    const k2 = { 'idempotency-key': `parallel-${Date.now()}` }
    const parallel = await Promise.all([1, 2, 3].map(() => env.call('eli', 'POST', `${BASE}/requirements`, { ...body, title: 'Parallel retry' }, k2)))
    expect(new Set(parallel.map((p) => p.body.id)).size).toBe(1)
    // Create without a key is refused (retries would duplicate).
    expect((await env.call('eli', 'POST', `${BASE}/requirements`, body)).status).toBe(400)
  })
})

describe('permissions and entitlements on the backend (AC-B8)', () => {
  it('enforces the permissions matrix', async () => {
    expect((await create('rho')).status).toBe(403) // reader
    expect((await create('rui')).status).toBe(403) // reviewer does not author
    const baseline = await env.call('eli', 'POST', `${BASE}/baselines`, { name: 'Editor baseline' })
    expect(baseline.status).toBe(403)
    const attr = await env.call('eli', 'POST', `${BASE}/attribute-definitions`, { key: 'x', name: 'X', dataType: 'string' })
    expect(attr.status).toBe(403)
    expect((await env.call('ada', 'POST', `${BASE}/attribute-definitions`, { key: 'x-ok', name: 'X', dataType: 'string' })).status).toBe(201)
    const perms = await env.call('rui', 'GET', `${BASE}/permissions`)
    expect(perms.body.role).toBe('reviewer')
    expect(perms.body.permissions).toContain('decide-review')
    expect(perms.body.permissions).not.toContain('author')
  })

  it('lets a SysML-only user use the cross-module subset with canonical fields only', async () => {
    const ok = await create('nia', { type: 'functional' })
    expect(ok.status).toBe(201)
    const patched = await env.call('nia', 'PATCH', `${BASE}/requirements/${ok.body.id}`, { expectedRevision: 1, statement: 'The actuator shall do Y.' })
    expect(patched.status).toBe(200)
    const extra = await env.call('nia', 'PATCH', `${BASE}/requirements/${ok.body.id}`, { expectedRevision: 2, priority: 'high' })
    expect(extra.status).toBe(403)
    expect((await env.call('nia', 'GET', `${BASE}/attribute-definitions`)).status).toBe(403)
    expect((await env.call('nia', 'GET', `${BASE}/requirements/${REQ1}/history`)).status).toBe(403)
    expect((await env.call('nia', 'GET', `${BASE}/requirements/${REQ1}/trace-links`)).status).toBe(200)
  })

  it('refuses non-members', async () => {
    expect((await env.call('eli', 'GET', `/api/requirements/v1/projects/PRJ-OTHER/requirements`)).status).toBe(403)
  })
})

describe('relationships (AC-D5)', () => {
  it('validates endpoints, duplicates, self-links and cycles', async () => {
    const a = (await create()).body
    const b = (await create()).body
    const rel = (body: Record<string, unknown>) => env.call('eli', 'POST', `${BASE}/relationships`, body)
    const ok = await rel({ type: 'derives-from', fromId: a.id, toRequirementId: b.id })
    expect(ok.status).toBe(201)
    await expectConforms(env, 'createRelationship', 201, ok.body)
    expect((await rel({ type: 'derives-from', fromId: a.id, toRequirementId: b.id })).status).toBe(409)
    expect((await rel({ type: 'derives-from', fromId: b.id, toRequirementId: a.id })).body.error.details.fields.toRequirementId).toBe('cycle')
    expect((await rel({ type: 'depends-on', fromId: a.id, toRequirementId: a.id })).status).toBe(422)
    expect((await rel({ type: 'allocated-to', fromId: a.id, toRequirementId: b.id })).status).toBe(422)
    expect((await rel({ type: 'allocated-to', fromId: a.id, toTwinId: 'NOPE-1' })).status).toBe(422)
    const sysml = await rel({ type: 'allocated-to', fromId: a.id, toTwinId: 'SYS-003' })
    expect(sysml.status).toBe(422)
    expect(sysml.body.error.message).toMatch(/sysml-element/)
    expect((await rel({ type: 'allocated-to', fromId: a.id, toTwinId: 'ROD-120' })).status).toBe(201)
    // Database constraints back this up.
    await expect(env.pool.query(`INSERT INTO requirements.relationships (id, project_id, type, from_requirement_id, to_twin_id, created_at, created_by, updated_at, updated_by) VALUES (gen_random_uuid(), $1, 'derives-from', $2, 'X', now(), 'x', now(), 'x')`, [PROJECT, a.id])).rejects.toThrow()
    // Deleting keeps history: a new deleted revision.
    const del = await env.call('eli', 'DELETE', `${BASE}/relationships/${ok.body.id}`, undefined, { 'if-match': '"1"' })
    expect(del.status).toBe(200)
    expect(del.body).toMatchObject({ deleted: true, revision: 2 })
    const links = await env.call('rho', 'GET', `${BASE}/requirements/${a.id}/trace-links`)
    expect(links.body.map((l: { type: string }) => l.type)).toEqual(['allocated-to'])
  })

  it('documents relationship semantics and serves a trace matrix and impact list', async () => {
    const types = await env.call('rho', 'GET', `${BASE}/relationship-types`)
    expect(types.body.map((t: { type: string }) => t.type)).toEqual(['derives-from', 'decomposes', 'depends-on', 'allocated-to'])
    const matrix = await env.call('rho', 'GET', `${BASE}/trace-matrix?columns=components`)
    expect(matrix.status).toBe(200)
    await expectConforms(env, 'traceMatrix', 200, matrix.body)
    expect(matrix.body.cells.find((c: { row: string; column: string }) => c.row === REQ1 && c.column === 'ROD-120')).toBeTruthy()
    const impact = await env.call('rho', 'GET', `${BASE}/requirements/${REQ1}/impact`)
    await expectConforms(env, 'requirementImpact', 200, impact.body)
    expect(impact.body.items.map((i: { label: string }) => i.label)).toEqual(expect.arrayContaining(['REQ-004 Rod buckling safety', 'ROD-120', 'Seed baseline']))
  })
})

describe('lifecycle, reviews and approval semantics (AC-D4, AC-U6)', () => {
  it('approves exactly the reviewed revision and returns edited requirements to draft', async () => {
    const r = (await create('eli')).body
    const req = await env.call('eli', 'POST', `${BASE}/requirements/${r.id}/transitions`, { action: 'request-review', expectedRevision: 1 })
    expect(req.body.status).toBe('in-review')
    const reviewId = req.body.openReviewId
    // The author of the revision cannot approve it, even as administrator.
    const ada = await env.call('ada', 'POST', `${BASE}/requirements/${r.id}/reviews/${reviewId}/decisions`, { decision: 'approve', expectedRevision: 1 })
    expect(ada.status).toBe(200) // ada did not author it (eli did)
    expect((await env.call('rho', 'GET', `${BASE}/requirements/${r.id}`)).body.status).toBe('approved')
    // Editing creates revision 2 in draft; the approval stays with revision 1.
    const edited = await env.call('eli', 'PATCH', `${BASE}/requirements/${r.id}`, { expectedRevision: 1, statement: 'Changed after approval.' })
    expect(edited.body).toMatchObject({ revision: 2, status: 'draft' })
    expect((await env.call('rho', 'GET', `${BASE}/requirements/${r.id}?revision=1`)).body.status).toBe('approved')
    // Self-approval is refused.
    const again = await env.call('ada', 'POST', `${BASE}/requirements/${r.id}/transitions`, { action: 'request-review', expectedRevision: 2 })
    const self = await env.call('ada', 'POST', `${BASE}/requirements/${r.id}/reviews/${again.body.openReviewId}/decisions`, { decision: 'approve', expectedRevision: 2 })
    expect(self.status).toBe(200) // eli authored rev 2
    const r3 = await env.call('ada', 'PATCH', `${BASE}/requirements/${r.id}`, { expectedRevision: 2, statement: 'Ada edits.' })
    const rev3 = await env.call('ada', 'POST', `${BASE}/requirements/${r.id}/transitions`, { action: 'request-review', expectedRevision: r3.body.revision })
    const selfApprove = await env.call('ada', 'POST', `${BASE}/requirements/${r.id}/reviews/${rev3.body.openReviewId}/decisions`, { decision: 'approve', expectedRevision: 3 })
    expect(selfApprove.status).toBe(403)
    // Editors cannot approve; rejection needs a reason.
    expect((await env.call('eli', 'POST', `${BASE}/requirements/${r.id}/reviews/${rev3.body.openReviewId}/decisions`, { decision: 'approve', expectedRevision: 3 })).status).toBe(403)
    expect((await env.call('rui', 'POST', `${BASE}/requirements/${r.id}/reviews/${rev3.body.openReviewId}/decisions`, { decision: 'reject', expectedRevision: 3 })).status).toBe(422)
    const rejected = await env.call('rui', 'POST', `${BASE}/requirements/${r.id}/reviews/${rev3.body.openReviewId}/decisions`, { decision: 'reject', comment: 'Unclear', expectedRevision: 3 })
    expect(rejected.body.state).toBe('rejected')
    const reviews = await env.call('rho', 'GET', `${BASE}/requirements/${r.id}/reviews`)
    await expectConforms(env, 'listReviews', 200, reviews.body)
    expect(reviews.body.map((x: { state: string; requirementRevision: number }) => `${x.requirementRevision}:${x.state}`)).toEqual(['3:rejected', '2:approved', '1:approved'])
    // Retire and reinstate need a reviewer; retired requirements cannot be edited.
    expect((await env.call('eli', 'POST', `${BASE}/requirements/${r.id}/transitions`, { action: 'retire', expectedRevision: 3 })).status).toBe(403)
    expect((await env.call('rui', 'POST', `${BASE}/requirements/${r.id}/transitions`, { action: 'retire', expectedRevision: 3 })).body.status).toBe('retired')
    expect((await env.call('eli', 'PATCH', `${BASE}/requirements/${r.id}`, { expectedRevision: 3, statement: 'x' })).status).toBe(422)
    expect((await env.call('rui', 'POST', `${BASE}/requirements/${r.id}/transitions`, { action: 'reinstate', expectedRevision: 3 })).body.status).toBe('draft')
  })

  it('archives and restores without deleting', async () => {
    const r = (await create()).body
    const archived = await env.call('eli', 'POST', `${BASE}/requirements/${r.id}/archive`, { expectedRevision: 1, reason: 'Duplicate' })
    expect(archived.body.archived).toBe(true)
    const list = await env.call('rho', 'GET', `${BASE}/requirements?ids=${r.id}`)
    expect(list.body.items).toEqual([])
    const withArchived = await env.call('rho', 'GET', `${BASE}/requirements?ids=${r.id}&includeArchived=true`)
    expect(withArchived.body.items).toHaveLength(1)
    expect((await env.call('eli', 'POST', `${BASE}/requirements/${r.id}/restore`, { expectedRevision: 1 })).body.archived).toBe(false)
  })
})

describe('baselines (AC-U7, contracts §8)', () => {
  it('pins revisions, relationships and structure; historical reads stay stable', async () => {
    const coll = await env.call('eli', 'POST', `${BASE}/collections`, { name: `Spec ${Date.now()}` })
    const r = (await create('eli', { collectionId: coll.body.id })).body
    const heading = await env.call('eli', 'POST', `${BASE}/collections/${coll.body.id}/nodes`, { kind: 'heading', heading: 'Intro', position: 0 }, { 'if-match': '"2"' })
    expect(heading.status).toBe(201)
    await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'allocated-to', fromId: r.id, toTwinId: 'MTR-130' })
    const bl = await env.call('rui', 'POST', `${BASE}/baselines`, { name: `BL ${Date.now()}`, collectionIds: [coll.body.id] })
    expect(bl.status).toBe(201)
    await expectConforms(env, 'createBaseline', 201, bl.body)
    expect(bl.body).toMatchObject({ requirementCount: 1, relationshipCount: 1 })

    // Change everything after the baseline.
    await env.call('eli', 'PATCH', `${BASE}/requirements/${r.id}`, { expectedRevision: 1, title: 'Changed later' })
    const tree = await env.call('eli', 'GET', `${BASE}/collections/${coll.body.id}`)
    await env.call('eli', 'POST', `${BASE}/collections/${coll.body.id}/nodes/${heading.body.id}/move`, { parentId: null, position: 1 }, { 'if-match': tree.headers.etag as string })
    const rels = await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)
    await env.call('eli', 'DELETE', `${BASE}/relationships/${rels.body[0].id}?expectedRevision=1`)

    const pinned = await env.call('rho', 'GET', `${BASE}/requirements/${r.id}?baselineId=${bl.body.id}`)
    expect(pinned.body).toMatchObject({ title: 'Test requirement', revision: 1, baselineId: bl.body.id })
    const pinnedTree = await env.call('rho', 'GET', `${BASE}/collections/${coll.body.id}?baselineId=${bl.body.id}`)
    expect(pinnedTree.body.nodes.map((n: { kind: string }) => n.kind)).toEqual(['heading', 'requirement'])
    const pinnedLinks = await env.call('rho', 'GET', `${BASE}/requirements/${r.id}/trace-links?baselineId=${bl.body.id}`)
    expect(pinnedLinks.body).toHaveLength(1)
    const list = await env.call('rho', 'GET', `${BASE}/requirements?baselineId=${bl.body.id}`)
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([r.id])
    const cmp = await env.call('rho', 'GET', `${BASE}/baselines/${bl.body.id}/compare?to=working`)
    await expectConforms(env, 'compareBaselines', 200, cmp.body)
    expect(cmp.body.requirements.find((x: { id: string }) => x.id === r.id)).toMatchObject({ change: 'changed', fields: ['title'] })
    expect(cmp.body.relationships.map((x: { change: string }) => x.change)).toContain('removed')
    expect(cmp.body.structure.map((x: { change: string }) => x.change)).toContain('moved')
    await expect(env.pool.query('DELETE FROM requirements.baseline_requirements WHERE baseline_id = $1', [bl.body.id])).rejects.toThrow(/immutable/)
  })
})

describe('collections never imply derivation (AC-D6)', () => {
  it('nests requirements without creating relationships', async () => {
    const coll = await env.call('eli', 'POST', `${BASE}/collections`, { name: `Nest ${Date.now()}` })
    const parent = (await create('eli', { collectionId: coll.body.id })).body
    const tree = await env.call('eli', 'GET', `${BASE}/collections/${coll.body.id}`)
    const parentNode = tree.body.nodes[0].id
    const child = (await create('eli', { collectionId: coll.body.id, parentNodeId: parentNode })).body
    const after = await env.call('eli', 'GET', `${BASE}/collections/${coll.body.id}`)
    await expectConforms(env, 'getCollectionTree', 200, after.body)
    expect(after.body.nodes.map((n: { number: string; requirementId: string }) => [n.number, n.requirementId])).toEqual([
      ['1', parent.id],
      ['1.1', child.id],
    ])
    const rels = await env.call('eli', 'GET', `${BASE}/requirements/${child.id}/relationships`)
    expect(rels.body).toEqual([])
    // Stale structure revision → conflict; a requirement appears once per collection.
    const stale = await env.call('eli', 'POST', `${BASE}/collections/${coll.body.id}/nodes`, { kind: 'heading', heading: 'x' }, { 'if-match': '"1"' })
    expect(stale.status).toBe(409)
    const dup = await env.call('eli', 'POST', `${BASE}/collections/${coll.body.id}/nodes`, { kind: 'requirement', requirementId: child.id }, { 'if-match': after.headers.etag as string })
    expect(dup.status).toBe(409)
    // Cannot move a node under its own descendant.
    const loop = await env.call('eli', 'POST', `${BASE}/collections/${coll.body.id}/nodes/${parentNode}/move`, { parentId: after.body.nodes[1].id, position: 0 }, { 'if-match': after.headers.etag as string })
    expect(loop.status).toBe(422)
  })
})

describe('bulk operations (AC-U10)', () => {
  it('atomic requests change nothing when one item fails; per-item requests report outcomes', async () => {
    const a = (await create()).body
    const b = (await create()).body
    const atomic = await env.call('eli', 'POST', `${BASE}/bulk`, {
      operations: [
        { requirementId: a.id, expectedRevision: 1, set: { owner: 'eli', priority: 'low' } },
        { requirementId: b.id, expectedRevision: 7, set: { owner: 'eli' } },
      ],
    })
    expect(atomic.status).toBe(409)
    expect(atomic.body.error.details.outcomes).toHaveLength(2)
    expect((await env.call('rho', 'GET', `${BASE}/requirements/${a.id}`)).body.owner).toBeNull()
    const perItem = await env.call('eli', 'POST', `${BASE}/bulk`, {
      atomic: false,
      operations: [
        { requirementId: a.id, expectedRevision: 1, set: { owner: 'eli' } },
        { requirementId: b.id, expectedRevision: 7, set: { owner: 'eli' } },
      ],
    })
    expect(perItem.status).toBe(200)
    await expectConforms(env, 'bulkUpdate', 200, perItem.body)
    expect(perItem.body.outcomes.map((o: { ok: boolean }) => o.ok)).toEqual([true, false])
    expect(perItem.body.outcomes[1].error.code).toBe('conflict')
  })
})

describe('custom attributes (AC-D8)', () => {
  it('validates typed values against definitions', async () => {
    const def = await env.call('ada', 'POST', `${BASE}/attribute-definitions`, { key: 'mass-budget', name: 'Mass budget', dataType: 'real', minValue: 0, maxValue: 100 })
    expect(def.status).toBe(201)
    const r = (await create('eli', { attributes: { 'mass-budget': 12.5 } })).body
    expect(r.attributes[def.body.id]).toBe(12.5)
    const bad = await create('eli', { attributes: { 'mass-budget': 500 } })
    expect(bad.status).toBe(422)
    expect(bad.body.error.details.fields['mass-budget']).toMatch(/at most/)
    const enumBad = await create('eli', { attributes: { 'safety-class': ['z'] } })
    expect(enumBad.status).toBe(422)
  })
})

describe('quality assistance (AC-Q1–Q5)', () => {
  it('explains findings for weak wording and records dismissals per revision', async () => {
    const list = await env.call('rho', 'GET', `${BASE}/requirements?keys=REQ-006`)
    const id = list.body.items[0].id
    const q = await env.call('rho', 'GET', `${BASE}/requirements/${id}/quality`)
    await expectConforms(env, 'requirementQuality', 200, q.body)
    const rules = q.body.findings.map((f: { ruleId: string }) => f.ruleId)
    expect(rules).toEqual(expect.arrayContaining(['heuristic.vague-term', 'heuristic.ambiguous-term', 'validation.missing-rationale', 'validation.missing-source', 'validation.missing-acceptance-criteria', 'validation.missing-trace']))
    expect(q.body.disclaimer).toMatch(/engineering judgement/)
    const vague = q.body.findings.find((f: { ruleId: string }) => f.ruleId === 'heuristic.vague-term')
    expect(vague).toMatchObject({ class: 'heuristic', evidence: 'easy' })
    expect(vague.suggestion).toBeTruthy()
    expect((await env.call('rho', 'POST', `${BASE}/requirements/${id}/quality/dismissals`, { revision: 1, ruleId: vague.ruleId, fingerprint: vague.fingerprint, reason: 'x' })).status).toBe(403)
    const dismissed = await env.call('eli', 'POST', `${BASE}/requirements/${id}/quality/dismissals`, { revision: 1, ruleId: vague.ruleId, fingerprint: vague.fingerprint, reason: 'Defined in the cleaning standard' })
    expect(dismissed.body.findings.find((f: { fingerprint: string }) => f.fingerprint === vague.fingerprint).dismissal.reason).toBe('Defined in the cleaning standard')
    const summary = await env.call('rho', 'GET', `${BASE}/quality`)
    await expectConforms(env, 'qualitySummary', 200, summary.body)
    expect(summary.body.items.some((i: { key: string }) => i.key === 'REQ-006')).toBe(true)
  })

  it('makes conventions configurable (no universal "shall")', async () => {
    const current = await env.call('ada', 'GET', `${BASE}/quality/conventions`)
    expect(current.body.settings.requireObligationVerb).toBe(false)
    const put = await env.call('ada', 'PUT', `${BASE}/quality/conventions`, { expectedRevision: current.body.revision, settings: { vagueTerms: ['easy'], requireObligationVerb: true } })
    expect(put.status).toBe(200)
    expect(put.body.settings.vagueTerms).toEqual(['easy'])
    expect((await env.call('eli', 'PUT', `${BASE}/quality/conventions`, { expectedRevision: put.body.revision, settings: {} })).status).toBe(403)
    await env.call('ada', 'PUT', `${BASE}/quality/conventions`, { expectedRevision: put.body.revision, settings: {} })
  })
})

describe('saved views', () => {
  it('saves personal views; sharing needs an editor or reviewer', async () => {
    const mine = await env.call('rho', 'POST', `${BASE}/views`, { name: 'My drafts', definition: { status: ['draft'], columns: ['key', 'title'] } })
    expect(mine.status).toBe(201)
    expect((await env.call('rho', 'POST', `${BASE}/views`, { name: 'Shared', shared: true, definition: {} })).status).toBe(403)
    expect((await env.call('rho', 'POST', `${BASE}/views`, { name: 'Bad', definition: { colour: 1 } })).status).toBe(422)
    const shared = await env.call('rui', 'POST', `${BASE}/views`, { name: 'Review queue', shared: true, definition: { status: ['in-review'] } })
    const visible = await env.call('rho', 'GET', `${BASE}/views`)
    expect(visible.body.map((v: { name: string }) => v.name)).toEqual(['My drafts', 'Review queue'])
    expect((await env.call('rho', 'PUT', `${BASE}/views/${shared.body.id}`, { name: 'Hijack', definition: {}, expectedRevision: 1 })).status).toBe(403)
  })
})

describe('OpenAPI 3.1', () => {
  it('documents every operation with schemas, permissions and examples', async () => {
    const doc = (await env.call('', 'GET', '/api/requirements/v1/openapi.json')).body
    expect(doc.openapi).toBe('3.1.0')
    const ops = Object.values(doc.paths).flatMap((m: any) => Object.values(m)) as any[]
    expect(ops.length).toBeGreaterThan(45)
    for (const op of ops) {
      expect(op['x-permissions'].roles.length, op.operationId).toBeGreaterThan(0)
      expect(Object.keys(op.responses).some((s) => s.startsWith('2')), op.operationId).toBe(true)
    }
    expect(doc.components.schemas.Requirement.examples).toBeTruthy()
    expect(doc['x-roles'].reader).toContain('read')
  })
})
