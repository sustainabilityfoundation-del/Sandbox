import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { memoryBlobStore } from '../src/blob/blobStore'
import { API, assistant, createProject, createTestEnv, expectConforms, idem, ifMatch, newKey, type TestEnv } from './helpers'

let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

const P = (id: string) => `${API}/projects/${id}`

describe('project creation and lifecycle', () => {
  it('creates a genuinely blank project: creator is administrator, nothing exists in any module', async () => {
    const key = newKey()
    const res = await env.call('eli', 'POST', `${API}/projects`, { key, name: 'Example Engineering Product', description: 'From first principles', disciplines: ['mechanical'] }, idem())
    expect(res.status).toBe(201)
    await expectConforms(env, 'createProject', 201, res.body)
    const p = res.body
    expect(p).toMatchObject({ key, name: 'Example Engineering Product', status: 'planning', state: 'active', templateId: 'blank', ownerId: 'eli', role: 'administrator', revision: 1 })
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers.etag).toBe('"1"')

    // Membership is the platform's: every hosted service now sees eli as administrator.
    const me = await env.call('eli', 'GET', '/api/platform/v1/me')
    expect(me.body.projects).toContainEqual({ projectId: p.id, role: 'administrator' })

    // Empty everywhere: registry, work items, milestones, documents, and the other modules.
    expect((await env.call('eli', 'GET', `${P(p.id)}/artifacts`)).body).toMatchObject({ items: [], total: 0 })
    expect((await env.call('eli', 'GET', `${P(p.id)}/work-items`)).body.total).toBe(0)
    expect((await env.call('eli', 'GET', `${P(p.id)}/milestones`)).body).toEqual([])
    expect((await env.call('eli', 'GET', `${P(p.id)}/documents`)).body).toEqual([])
    const reqs = await env.call('eli', 'GET', `/api/requirements/v1/projects/${p.id}/requirements`)
    expect(reqs.status).toBe(200)
    expect(reqs.body.items).toEqual([])
    const concepts = await env.call('eli', 'GET', `/api/concepts/v1/projects/${p.id}/concepts`)
    expect(concepts.status).toBe(200)
    expect(concepts.body.items).toEqual([])
    const sysml = await env.call('eli', 'GET', `/api/sysml/v1/projects?platformProjectId=${p.id}`)
    expect(sysml.status).toBe(200)
    expect(sysml.body).toEqual([])

    const ctx = await env.call('eli', 'POST', `${P(p.id)}/open`)
    expect(ctx.status).toBe(200)
    await expectConforms(env, 'openProject', 200, ctx.body)
    expect(ctx.body.modules.map((m: { module: string; status: string }) => `${m.module}:${m.status}`)).toEqual(["conceptualize:not-needed", "requirements:not-needed", "settings:not-needed", "sysml:not-needed"])
    expect(ctx.body.settings).toMatchObject({ available: true, values: {}, requested: {} })
    expect(ctx.body.project.counts).toEqual({ members: 1, artifacts: 0, openWorkItems: 0, milestones: 0, documents: 0 })
  })

  it('creates from a template with planning items only and records requested settings as provenance', async () => {
    const p = await createProject(env, 'eli', { templateId: 'mechanical-product', settings: { 'projects.units.length': 'm' } })
    const ms = (await env.call('eli', 'GET', `${P(p.id)}/milestones`)).body
    expect(ms.map((m: { name: string }) => m.name)).toEqual(['Concept review', 'Preliminary design review', 'Critical design review'])
    const wi = (await env.call('eli', 'GET', `${P(p.id)}/work-items`)).body
    expect(wi.items.map((w: { title: string }) => w.title)).toEqual(['Capture stakeholder needs', 'Define the product breakdown'])
    const art = (await env.call('eli', 'GET', `${P(p.id)}/artifacts`)).body
    expect(new Set(art.items.map((a: { category: string }) => a.category))).toEqual(new Set(['milestone', 'work-item']))
    const ctx = (await env.call('eli', 'GET', `${P(p.id)}/context`)).body
    expect(ctx.settings.requested).toEqual({ 'projects.units.system': 'si', 'projects.units.length': 'm', 'projects.conventions.drawing-projection': 'first-angle' })
    expect(ctx.modules).toContainEqual(expect.objectContaining({ module: "settings", status: "ready" }))
    expect(ctx.settings.values).toEqual({ "projects.units.system": "si", "projects.units.length": "m", "projects.conventions.drawing-projection": "first-angle" })
    expect(ctx.creation).toMatchObject({ templateId: 'mechanical-product', templateVersion: 1 })
  })

  it('validates input, refuses duplicate keys, supports dry run and idempotent retries', async () => {
    expect((await env.call('eli', 'POST', `${API}/projects`, { key: 'x', name: 'Bad' }, idem())).status).toBe(400)
    expect((await env.call('eli', 'POST', `${API}/projects`, { key: newKey(), name: 'No key header' })).status).toBe(400)
    expect((await env.call('eli', 'POST', `${API}/projects`, { key: newKey(), name: 'T', templateId: 'nope' }, idem())).status).toBe(422)
    const key = newKey()
    const dry = await env.call('eli', 'POST', `${API}/projects?dryRun=true`, { key, name: 'Dry' })
    expect(dry.status).toBe(200)
    expect(dry.body).toMatchObject({ dryRun: true, result: { key, name: 'Dry' } })
    expect((await env.call('eli', 'GET', `${API}/projects?q=${key}`)).body.total).toBe(0)
    const me = await env.call('eli', 'GET', '/api/platform/v1/me')
    expect(me.body.projects.find((x: { projectId: string }) => x.projectId === dry.body.result.id)).toBeUndefined()

    const headers = idem()
    const a = await env.call('eli', 'POST', `${API}/projects`, { key, name: 'Once' }, headers)
    const b = await env.call('eli', 'POST', `${API}/projects`, { key, name: 'Once' }, headers)
    expect([a.status, b.status]).toEqual([201, 201])
    expect(b.body.id).toBe(a.body.id)
    expect(b.headers['idempotency-replayed']).toBe('true')
    const dup = await env.call('rui', 'POST', `${API}/projects`, { key: key.toLowerCase(), name: 'Same key' }, idem())
    expect(dup.status).toBe(409)
  })

  it('rolls back completely when a member to invite does not exist', async () => {
    const key = newKey()
    const res = await env.call('eli', 'POST', `${API}/projects`, { key, name: 'Bad member', members: [{ userId: 'nobody', role: 'editor' }] }, idem())
    expect(res.status).toBe(422)
    const rows = await env.pool.query('SELECT 1 FROM projects.projects WHERE key = $1', [key])
    expect(rows.rowCount).toBe(0)
    const memberships = await env.pool.query(`SELECT 1 FROM platform.project_memberships m WHERE NOT EXISTS (SELECT 1 FROM projects.projects p WHERE p.id = m.project_id) AND m.project_id <> 'PRJ-ACT100'`)
    expect(memberships.rowCount).toBe(0)
  })

  it('lists, searches, filters and sorts projects the caller is a member of; records recents', async () => {
    const a = await createProject(env, 'rho', { name: 'Alpha gearbox', disciplines: ['mechanical'] })
    const b = await createProject(env, 'rho', { name: 'Beta controller', disciplines: ['software'] })
    await env.call('rho', 'PATCH', P(b.id), { status: 'active' }, ifMatch(1))
    const all = await env.call('rho', 'GET', `${API}/projects?sort=name`)
    await expectConforms(env, 'listProjects', 200, all.body)
    const names = all.body.items.map((p: { name: string }) => p.name)
    expect(names).toEqual([...names].sort((x: string, y: string) => x.toLowerCase().localeCompare(y.toLowerCase())))
    expect(names).toEqual(expect.arrayContaining(['Alpha gearbox', 'Beta controller', 'ACT-100 Linear actuator']))
    expect((await env.call('rho', 'GET', `${API}/projects?q=gearbox`)).body.items.map((p: { id: string }) => p.id)).toEqual([a.id])
    const filtered = (await env.call('rho', 'GET', `${API}/projects?status=active&discipline=software`)).body.items.map((p: { id: string }) => p.id)
    expect(filtered).toContain(b.id)
    expect(filtered).not.toContain(a.id)
    // Not a member: not listed, not readable.
    expect((await env.call('nia', 'GET', `${API}/projects?q=gearbox`)).body.total).toBe(0)
    expect((await env.call('nia', 'GET', P(a.id))).status).toBe(403)
    await env.call('rho', 'POST', `${P(a.id)}/open`)
    await env.call('rho', 'POST', `${P(b.id)}/open`)
    const recent = (await env.call('rho', 'GET', `${API}/me/recent-projects`)).body
    expect(recent.slice(0, 2).map((p: { id: string }) => p.id)).toEqual([b.id, a.id])
    // Paging
    const page1 = await env.call('rho', 'GET', `${API}/projects?limit=1&sort=name`)
    expect(page1.body.items).toHaveLength(1)
    const page2 = await env.call('rho', 'GET', `${API}/projects?limit=1&sort=name&cursor=${page1.body.nextCursor}`)
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id)
  })

  it('edits metadata with optimistic concurrency and keeps immutable revisions', async () => {
    const p = await createProject(env, 'eli')
    expect((await env.call('eli', 'PATCH', P(p.id), { name: 'No revision' })).status).toBe(400)
    const ok = await env.call('eli', 'PATCH', P(p.id), { name: 'Renamed', objectives: ['Mass below 2 kg'], scope: 'Bracket only', status: 'active' }, ifMatch(1))
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ name: 'Renamed', objectives: ['Mass below 2 kg'], status: 'active', revision: 2 })
    const stale = await env.call('eli', 'PATCH', P(p.id), { name: 'Stale' }, ifMatch(1))
    expect(stale.status).toBe(409)
    expect(stale.body.error.details.currentRevision).toBe(2)
    const history = (await env.call('eli', 'GET', `${P(p.id)}/lifecycle`)).body
    expect(history.map((h: { revision: number }) => h.revision)).toEqual([2, 1])
    await expect(env.pool.query('UPDATE projects.project_revisions SET summary = $1 WHERE project_id = $2', ['x', p.id])).rejects.toThrow(/immutable/)
    // A reader cannot edit; changing the key needs an administrator.
    await env.call('eli', 'PUT', `${P(p.id)}/members/rho`, { role: 'reader' })
    await env.call('eli', 'PUT', `${P(p.id)}/members/rui`, { role: 'editor' })
    expect((await env.call('rho', 'PATCH', P(p.id), { name: 'Reader' }, ifMatch(2))).status).toBe(403)
    expect((await env.call('rui', 'PATCH', P(p.id), { key: newKey() }, ifMatch(2))).status).toBe(403)
  })

  it('manages members through the platform membership, protecting the last administrator', async () => {
    const p = await createProject(env, 'eli')
    expect((await env.call('eli', 'PUT', `${P(p.id)}/members/rui`, { role: 'reviewer' })).status).toBe(200)
    const members = (await env.call('eli', 'GET', `${P(p.id)}/members`)).body
    expect(members).toEqual([expect.objectContaining({ userId: 'eli', role: 'administrator' }), expect.objectContaining({ userId: 'rui', role: 'reviewer' })])
    expect((await env.call('eli', 'PUT', `${P(p.id)}/members/eli`, { role: 'editor' })).status).toBe(422)
    expect((await env.call('eli', 'DELETE', `${P(p.id)}/members/eli`)).status).toBe(422)
    expect((await env.call('eli', 'PUT', `${P(p.id)}/members/ghost`, { role: 'editor' })).status).toBe(422)
    expect((await env.call('eli', 'PUT', `${P(p.id)}/members/rho`, { role: 'reader' }, assistant())).status).toBe(403)
    expect((await env.call('eli', 'DELETE', `${P(p.id)}/members/rui`)).status).toBe(204)
    const events = await env.pool.query(`SELECT action, user_id FROM platform.membership_events WHERE project_id = $1 ORDER BY id`, [p.id])
    expect(events.rows).toEqual([
      { action: 'set', user_id: 'eli' },
      { action: 'set', user_id: 'rui' },
      { action: 'removed', user_id: 'rui' },
    ])
  })

  it('archives (read-only everywhere), restores, soft-deletes with confirmation and restores again', async () => {
    const p = await createProject(env, 'ada')
    const dry = await env.call('ada', 'POST', `${P(p.id)}/archive?dryRun=true`, {})
    expect(dry.body).toMatchObject({ dryRun: true, result: { state: 'archived', effects: { moduleDataUnchanged: true } } })
    expect((await env.call('ada', 'GET', P(p.id))).body.state).toBe('active')
    expect((await env.call('eli', 'POST', `${P(p.id)}/archive`, {})).status).toBe(403)
    const archived = await env.call('ada', 'POST', `${P(p.id)}/archive`, { reason: 'Paused' })
    expect(archived.body).toMatchObject({ state: 'archived' })

    // Project Management refuses writes; reads and opening still work.
    expect((await env.call('ada', 'POST', `${P(p.id)}/work-items`, { kind: 'task', title: 'x' }, idem())).body.error.details.reason).toBe('archived')
    expect((await env.call('ada', 'GET', P(p.id))).status).toBe(200)
    expect((await env.call('ada', 'POST', `${P(p.id)}/open`)).status).toBe(200)

    // Every hosted service refuses writes to the archived project (host roleOf caps the role at reader; Q6).
    const req = await env.call('ada', 'POST', `/api/requirements/v1/projects/${p.id}/requirements`, { title: 'R', statement: 'The part shall be red.', type: 'functional' }, idem())
    expect(req.status).toBe(403)
    const con = await env.call('ada', 'POST', `/api/concepts/v1/projects/${p.id}/concepts`, { name: 'C' }, idem())
    expect(con.status).toBe(403)
    const sys = await env.call('ada', 'POST', '/api/sysml/v1/projects', { name: 'M', platformProjectId: p.id }, idem())
    expect(sys.status).toBe(403)
    // …and reads still work.
    expect((await env.call('ada', 'GET', `/api/requirements/v1/projects/${p.id}/requirements`)).status).toBe(200)

    await env.call('ada', 'POST', `${P(p.id)}/restore`, {})
    expect((await env.call('ada', 'POST', `/api/concepts/v1/projects/${p.id}/concepts`, { name: 'C' }, idem())).status).toBe(201)

    // Delete needs X-Confirm with the key.
    const noConfirm = await env.call('ada', 'DELETE', P(p.id))
    expect(noConfirm.status).toBe(428)
    const wrong = await env.call('ada', 'DELETE', P(p.id), undefined, { 'x-confirm': 'WRONG' })
    expect(wrong.status).toBe(428)
    const deleted = await env.call('ada', 'DELETE', P(p.id), undefined, { 'x-confirm': p.key })
    expect(deleted.status).toBe(200)
    expect(deleted.body).toMatchObject({ state: 'deleted' })
    expect(new Date(deleted.body.purgeAfter).getTime() - new Date(deleted.body.deletedAt).getTime()).toBe(30 * 86_400_000)
    // Hidden from the default list; other services see no membership; module data untouched.
    expect((await env.call('ada', 'GET', `${API}/projects?q=${p.key}`)).body.total).toBe(0)
    expect((await env.call('ada', 'GET', `${API}/projects?q=${p.key}&state=deleted`)).body.total).toBe(1)
    expect((await env.call('ada', 'GET', `/api/concepts/v1/projects/${p.id}/concepts`)).status).toBe(403)
    expect((await env.pool.query('SELECT count(*)::int AS n FROM conceptualize.concepts WHERE project_id = $1', [p.id])).rows[0].n).toBe(1)
    expect((await env.call('ada', 'GET', `${P(p.id)}/work-items`)).status).toBe(403)

    const restored = await env.call('ada', 'POST', `${P(p.id)}/restore`, { reason: 'Mistake' })
    expect(restored.body).toMatchObject({ state: 'active' })
    expect((await env.call('ada', 'GET', `/api/concepts/v1/projects/${p.id}/concepts`)).body.items).toHaveLength(1)
    const actions = (await env.call('ada', 'GET', `${P(p.id)}/activity?entityType=project`)).body.map((a: { action: string }) => a.action)
    expect(actions).toEqual(['restored', 'deleted', 'restored', 'archived', 'created'])
  })

  it('duplicates configuration and planning items without module content', async () => {
    const src = await createProject(env, 'eli', { templateId: 'systems-engineering' })
    await env.call('eli', 'PUT', `${P(src.id)}/members/rui`, { role: 'reviewer' })
    expect((await env.call('eli', 'POST', `${P(src.id)}/duplicate`, { key: newKey(), name: 'Copy', include: { moduleContent: true } }, idem())).status).toBe(422)
    const copy = await env.call('eli', 'POST', `${P(src.id)}/duplicate`, { key: newKey(), name: 'Copy', include: { members: true, milestones: true } }, idem())
    expect(copy.status).toBe(201)
    const members = (await env.call('eli', 'GET', `${P(copy.body.id)}/members`)).body
    expect(members.map((m: { userId: string; role: string }) => `${m.userId}:${m.role}`)).toEqual(['eli:administrator', 'rui:reviewer'])
    expect((await env.call('eli', 'GET', `${P(copy.body.id)}/milestones`)).body).toHaveLength(2)
    expect((await env.call('eli', 'GET', `${P(copy.body.id)}/context`)).body.creation.duplicatedFrom).toBe(src.id)
  })

  it('registers the legacy example project PRJ-ACT100 without changing its data', async () => {
    const p = await env.call('ada', 'GET', P('PRJ-ACT100'))
    expect(p.status).toBe(200)
    expect(p.body).toMatchObject({ id: 'PRJ-ACT100', key: 'ACT100', legacy: true, templateId: 'example-actuator', state: 'active' })
    expect((await env.call('ada', 'GET', '/api/requirements/v1/projects/PRJ-ACT100/requirements')).body.items.length).toBeGreaterThan(0)
  })
})

describe('work items, milestones, links and the registry', () => {
  it('creates tasks, issues and risks with subjects, status rules and revisions', async () => {
    const p = await createProject(env, 'eli')
    await env.call('eli', 'PUT', `${P(p.id)}/members/rui`, { role: 'reviewer' })
    await env.call('eli', 'PUT', `${P(p.id)}/members/rho`, { role: 'editor' })
    const ms = await env.call('eli', 'POST', `${P(p.id)}/milestones`, { name: 'Design review', due: '2026-12-01' }, idem())
    expect(ms.status).toBe(201)
    await expectConforms(env, 'createMilestone', 201, ms.body)
    const task = await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'task', title: 'Size the bracket', priority: 'high', milestoneId: ms.body.id, assigneeId: 'rui', subjects: [ms.body.artifactId] }, idem())
    expect(task.status).toBe(201)
    await expectConforms(env, 'createWorkItem', 201, task.body)
    expect(task.body).toMatchObject({ key: 'TSK-001', kind: 'task', status: 'open', closed: false, subjects: [ms.body.artifactId] })
    expect((await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'task', title: 'x', assigneeId: 'nia' }, idem())).status).toBe(422)

    const risk = await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'risk', title: 'Fatigue at the weld', risk: { likelihood: 4, impact: 5, mitigation: 'Fillet radius' } }, idem())
    expect(risk.body).toMatchObject({ key: 'RSK-001', status: 'identified', risk: { score: 20, response: 'mitigate' } })
    // Accepting a risk needs a reviewer and a rationale; the assistant may not apply it.
    expect((await env.call('rho', 'PATCH', `${P(p.id)}/work-items/${risk.body.id}`, { status: 'accepted', statusNote: 'ok' }, ifMatch(1))).status).toBe(403)
    expect((await env.call('rui', 'PATCH', `${P(p.id)}/work-items/${risk.body.id}`, { status: 'accepted' }, ifMatch(1))).status).toBe(422)
    expect((await env.call('rui', 'PATCH', `${P(p.id)}/work-items/${risk.body.id}`, { status: 'accepted', statusNote: 'Margin 2.1' }, { ...ifMatch(1), ...assistant() })).status).toBe(403)
    const accepted = await env.call('rui', 'PATCH', `${P(p.id)}/work-items/${risk.body.id}`, { status: 'accepted', statusNote: 'Margin 2.1 by analysis' }, ifMatch(1))
    expect(accepted.body).toMatchObject({ status: 'accepted', closed: true, revision: 2 })

    const issue = await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'issue', title: 'Drawing shows wrong thread', issue: { severity: 'minor' } }, idem())
    expect((await env.call('eli', 'PATCH', `${P(p.id)}/work-items/${issue.body.id}`, { status: 'closed' }, ifMatch(1))).status).toBe(422)
    expect((await env.call('eli', 'PATCH', `${P(p.id)}/work-items/${issue.body.id}`, { status: 'closed', issue: { resolution: 'Redrawn' } }, ifMatch(1))).status).toBe(200)
    expect((await env.call('eli', 'PATCH', `${P(p.id)}/work-items/${issue.body.id}`, { status: 'done' }, ifMatch(2))).status).toBe(422)

    const list = await env.call('eli', 'GET', `${P(p.id)}/work-items?open=true`)
    expect(list.body.items.map((w: { key: string }) => w.key)).toEqual(['TSK-001'])
    expect((await env.call('eli', 'GET', `${P(p.id)}/work-items?subject=${ms.body.artifactId}`)).body.items.map((w: { key: string }) => w.key)).toEqual(['TSK-001'])
    expect((await env.call('eli', 'GET', `${P(p.id)}/work-items/${risk.body.id}/history`)).body.map((h: { revision: number }) => h.revision)).toEqual([2, 1])

    // Achieving the milestone with open work warns, never refuses.
    const done = await env.call('eli', 'PATCH', `${P(p.id)}/milestones/${ms.body.id}`, { status: 'achieved' }, ifMatch(1))
    expect(done.status).toBe(200)
    expect(done.body.warnings[0]).toContain('TSK-001')

    // Registry: every Project Management entity is registered with a global ID, version and lifecycle.
    const reg = (await env.call('eli', 'GET', `${P(p.id)}/artifacts?sort=key`)).body
    await expectConforms(env, 'listArtifacts', 200, reg)
    expect(reg.items.map((a: { key: string; lifecycle: string }) => `${a.key}:${a.lifecycle}`)).toEqual(['ISS-001:retired', 'MS-001:released', 'RSK-001:retired', 'TSK-001:working'])
    const taskArtifact = reg.items.find((a: { key: string }) => a.key === 'TSK-001')
    const detail = await env.call('eli', 'GET', `${P(p.id)}/artifacts/${taskArtifact.artifactId}`)
    expect(detail.body.links).toEqual([expect.objectContaining({ type: 'subject-of', toArtifact: expect.objectContaining({ key: 'MS-001' }) })])
    const riskArtifact = reg.items.find((a: { key: string }) => a.key === 'RSK-001')
    const history = (await env.call('eli', 'GET', `${P(p.id)}/artifacts/${riskArtifact.artifactId}/history`)).body
    expect(history.map((h: { version: string; lifecycle: string }) => `${h.version}:${h.lifecycle}`)).toEqual(['2:retired', '1:working'])
  })

  it('validates links with the link rules and refuses meanings owned by modules', async () => {
    const p = await createProject(env, 'eli')
    const task = (await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'task', title: 'A' }, idem())).body
    const risk = (await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'risk', title: 'B' }, idem())).body
    const ok = await env.call('eli', 'POST', `${P(p.id)}/links`, { type: 'mitigated-by', from: { artifactId: risk.artifactId }, to: { artifactId: task.artifactId } })
    expect(ok.status).toBe(201)
    await expectConforms(env, 'createLink', 201, ok.body)
    expect((await env.call('eli', 'POST', `${P(p.id)}/links`, { type: 'mitigated-by', from: { artifactId: risk.artifactId }, to: { artifactId: task.artifactId } })).status).toBe(409)
    expect((await env.call('eli', 'POST', `${P(p.id)}/links`, { type: 'mitigated-by', from: { artifactId: task.artifactId }, to: { artifactId: risk.artifactId } })).status).toBe(422)
    const alloc = await env.call('eli', 'POST', `${P(p.id)}/links`, { type: 'allocated-to', from: { artifactId: task.artifactId }, to: { artifactId: risk.artifactId } })
    expect(alloc.status).toBe(422)
    expect(alloc.body.error.message).toContain('Requirements owns allocation')
    const removed = await env.call('eli', 'POST', `${P(p.id)}/links/${ok.body.id}/remove`, { reason: 'Superseded' })
    expect(removed.body).toMatchObject({ removedBy: 'eli', removalReason: 'Superseded' })
    expect((await env.call('eli', 'GET', `${P(p.id)}/links`)).body).toEqual([])
    expect((await env.call('eli', 'GET', `${P(p.id)}/links?includeRemoved=true`)).body).toHaveLength(1)
    // Links cannot cross projects.
    const other = await createProject(env, 'eli')
    const foreign = (await env.call('eli', 'POST', `${P(other.id)}/work-items`, { kind: 'task', title: 'C' }, idem())).body
    expect((await env.call('eli', 'POST', `${P(p.id)}/links`, { type: 'blocks', from: { artifactId: task.artifactId }, to: { artifactId: foreign.artifactId } })).status).toBe(404)
  })
})

describe('documents and the blob store', () => {
  it('stores immutable versions, verifies digests and integrity, and releases with a reviewer', async () => {
    const p = await createProject(env, 'eli')
    await env.call('eli', 'PUT', `${P(p.id)}/members/rui`, { role: 'reviewer' })
    const doc = await env.call('eli', 'POST', `${P(p.id)}/documents`, { title: 'Load case report', documentKind: 'report' }, idem())
    expect(doc.status).toBe(201)
    expect(doc.body).toMatchObject({ key: 'DOC-001', currentVersion: 0, lifecycle: 'working' })
    const bytes = new TextEncoder().encode('%PDF-1.7 pretend report v1')
    const digest = `sha-256=:${createHash('sha256').update(bytes).digest('base64')}:`
    const up = await env.call('eli', 'POST', `${P(p.id)}/documents/${doc.body.id}/versions`, bytes, { 'content-type': 'application/pdf', 'x-file-name': 'report.pdf', 'content-digest': digest, ...ifMatch(1) })
    expect(up.status).toBe(201)
    await expectConforms(env, 'uploadDocumentVersion', 201, up.body)
    expect(up.body.versions[0]).toMatchObject({ version: 1, fileName: 'report.pdf', mediaType: 'application/pdf', byteSize: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') })
    const bad = await env.call('eli', 'POST', `${P(p.id)}/documents/${doc.body.id}/versions`, new TextEncoder().encode('other'), { 'content-type': 'text/plain', 'x-file-name': 'x.txt', 'content-digest': digest, ...ifMatch(2) })
    expect(bad.status).toBe(422)
    const down = await env.server.app.inject({ method: 'GET', url: `${P(p.id)}/documents/${doc.body.id}/versions/1/content`, headers: { 'x-dev-user': 'rho' } })
    expect(down.statusCode).toBe(403) // rho is not a member yet
    const down2 = await env.server.app.inject({ method: 'GET', url: `${P(p.id)}/documents/${doc.body.id}/versions/1/content`, headers: { 'x-dev-user': 'rui' } })
    expect(down2.statusCode).toBe(200)
    expect(new Uint8Array(down2.rawPayload)).toEqual(bytes)
    expect(down2.headers['content-type']).toContain('application/pdf')

    await env.call('eli', 'PUT', `${P(p.id)}/members/rho`, { role: 'editor' })
    expect((await env.call('rho', 'PATCH', `${P(p.id)}/documents/${doc.body.id}`, { lifecycle: 'released' }, ifMatch(2))).status).toBe(403)
    const rel = await env.call('rui', 'PATCH', `${P(p.id)}/documents/${doc.body.id}`, { lifecycle: 'released' }, ifMatch(2))
    expect(rel.body.lifecycle).toBe('released')
    const v2 = await env.call('eli', 'POST', `${P(p.id)}/documents/${doc.body.id}/versions`, new TextEncoder().encode('v2'), { 'content-type': 'application/pdf', 'x-file-name': 'report.pdf', ...ifMatch(3) })
    expect(v2.body).toMatchObject({ currentVersion: 2, lifecycle: 'working' })
    await expect(env.pool.query('DELETE FROM projects.document_versions WHERE document_id = $1', [doc.body.id])).rejects.toThrow(/immutable/)

    // Integrity: corrupted or missing bytes are reported, never served.
    const storage = env.server.projectBlobs as ReturnType<typeof memoryBlobStore>
    const key = (await env.pool.query('SELECT blob_key FROM projects.document_versions WHERE document_id = $1 AND version = 1', [doc.body.id])).rows[0].blob_key
    storage.corrupt(key, new TextEncoder().encode('tampered'))
    const corrupt = await env.call('eli', 'GET', `${P(p.id)}/documents/${doc.body.id}/versions/1/content`)
    expect(corrupt.status).toBe(503)
    expect(corrupt.body.error.details.reason).toBe('blob-corrupt')
  })
})

describe('events and the OpenAPI document', () => {
  it('emits committed events only and publishes the documented API', async () => {
    const p = await createProject(env, 'eli')
    await env.call('eli', 'POST', `${P(p.id)}/work-items?dryRun=true`, { kind: 'task', title: 'Dry' })
    await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'task', title: 'Real' }, idem())
    await env.server.projectEvents.flush()
    const { rows } = await env.pool.query('SELECT type FROM projects.outbox WHERE project_id = $1 ORDER BY seq', [p.id])
    expect(rows.map((r) => r.type)).toEqual(['project.created', 'artifact.registered', 'work-item.created'])
    const doc = (await env.call('', 'GET', `${API}/openapi.json`)).body
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/projects', '/projects/{projectId}', '/projects/{projectId}/work-items', '/projects/{projectId}/documents/{documentId}/versions', '/projects/{projectId}/events']))
    expect(doc.paths['/projects/{projectId}'].delete['x-destructive']).toBe(true)
    expect(doc['x-roles'].reader).toEqual(['read'])
    expect((await env.call('', 'GET', `${API}/docs`)).status).toBe(200)
    expect((await env.call('', 'GET', `${API}/projects`)).status).toBe(401)
  })
})
