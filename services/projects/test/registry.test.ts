import { applyTransaction, createDocument } from '@ews/cad-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, createProject, createTestEnv, idem, type TestEnv } from './helpers'

/**
 * Artifact registry (ADR-0062, integration milestone 1 C5) against the real module sources on main: Requirements,
 * SysML Modeler and CAD Modeler publish their artifacts through their ArtifactSource adapters; the consumer indexes
 * them with global IDs; reconciliation converges; nothing is deleted. Conceptualize has no adapter yet (CR-PM-REG-2).
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

const P = (id: string) => `${API}/projects/${id}`

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string): Promise<T> {
  for (let i = 0; i < 60; i++) {
    await env.server.events.flush()
    await env.server.projectsRegistry()?.idle()
    const v = await read()
    if (ok(v)) return v
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const artifacts = async (projectId: string, query = '') => (await env.call('eli', 'GET', `${P(projectId)}/artifacts?limit=200${query}`)).body.items as { artifactId: string; ref: { module: string; kind: string; id: string }; key: string; title: string; version: { value: number | string }; lifecycle: string; availability: string; category: string }[]

describe('registry fed by the modules', () => {
  it('indexes requirements, SysML and CAD artifacts of a new project with global IDs and versions', async () => {
    const p = await createProject(env, 'eli')
    // Provisioning used the modules' own provision(): nothing failed, nothing was created.
    const states = (await env.call('eli', 'GET', `${P(p.id)}/context`)).body.modules
    expect(states.filter((m: { status: string }) => m.status === 'failed')).toEqual([])
    expect(states.map((m: { module: string }) => m.module)).toEqual(expect.arrayContaining(['requirements', 'sysml', 'cad', 'conceptualize']))
    expect(await artifacts(p.id)).toEqual([])

    const req = (await env.call('eli', 'POST', `/api/requirements/v1/projects/${p.id}/requirements`, { title: 'Hold six bits', statement: 'The holder shall hold six 1/4 in hex bits.', type: 'functional' }, idem())).body
    const sysml = await env.call('eli', 'POST', '/api/sysml/v1/projects', { name: 'Architecture', platformProjectId: p.id }, idem())
    expect(sysml.status).toBe(201)
    const doc = applyTransaction(createDocument({ title: 'Holder block' }), {
      commands: [
        { command: 'create_part', input: { name: 'Block', ref: '$p' } },
        { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
        { command: 'add_rectangle', input: { sketchId: '$s', width: 80, height: 30 } },
        { command: 'extrude_profile', input: { sketchId: '$s', distance: 20 } },
      ],
    })
    if (!doc.ok) throw new Error(doc.error.message)
    const cad = await env.call('eli', 'POST', `/api/cad/v1/projects/${p.id}/documents`, { document: doc.doc, message: 'first' }, idem())
    expect(cad.status).toBe(201)

    const all = await until(() => artifacts(p.id), (a) => ['requirements', 'sysml', 'cad'].every((m) => a.some((x) => x.ref.module === m)), 'requirements, SysML and CAD artifacts')
    const r = all.find((a) => a.ref.module === 'requirements' && a.ref.id === req.id)!
    expect(r).toMatchObject({ category: 'requirement', availability: 'available', title: 'Hold six bits' })
    expect(r.artifactId).toMatch(/^[0-9a-f-]{36}$/)
    expect(all.some((a) => a.ref.module === 'cad' && a.category === 'geometry')).toBe(true)
    expect(all.some((a) => a.ref.module === 'sysml' && a.ref.kind === 'sysml-project')).toBe(true)

    // A new requirement revision updates the record and is observed.
    await env.call('eli', 'PATCH', `/api/requirements/v1/projects/${p.id}/requirements/${req.id}`, { title: 'Hold six hex bits' }, { 'if-match': `"${req.revision}"` })
    const updated = await until(() => artifacts(p.id, '&module=requirements'), (a) => a.some((x) => x.title === 'Hold six hex bits'), 'the requirement update')
    const rec = updated.find((x) => x.ref.id === req.id)!
    expect(String(rec.version.value)).toBe('2')
    const history = (await env.call('eli', 'GET', `${P(p.id)}/artifacts/${rec.artifactId}/history`)).body
    expect(history.map((h: { version: string }) => h.version)).toEqual(['2', '1'])

    // Reconciliation is idempotent and reports per module.
    const report = (await env.call('eli', 'POST', `${P(p.id)}/reconcile`)).body
    expect(report.modules.map((m: { module: string; status: string }) => `${m.module}:${m.status}`).sort()).toEqual(['cad:reconciled', 'conceptualize:reconciled', 'requirements:reconciled', 'sysml:reconciled'])
    expect(report.modules.every((m: { upserted: number; missing: number }) => m.upserted === 0 && m.missing === 0)).toBe(true)

    // Project Management links can now reach module artifacts: a task about the CAD document.
    const cadArtifact = all.find((a) => a.ref.module === 'cad' && a.ref.kind === 'cad-document')!
    const task = await env.call('eli', 'POST', `${P(p.id)}/work-items`, { kind: 'task', title: 'Check the block', subjects: [cadArtifact.artifactId] }, idem())
    expect(task.status).toBe(201)
    // resolve finds registered refs and registers unseen ones through the module.
    const resolved = (await env.call('eli', 'POST', `${P(p.id)}/artifacts/resolve`, { refs: [{ module: 'requirements', kind: 'requirement', id: req.id }] })).body
    expect(resolved[0].artifactId).toBe(rec.artifactId)
  })

  it('keeps registry records of a module that is no longer installed, labelled module-unavailable', async () => {
    const p = await createProject(env, 'eli')
    // A record from a module this host does not have (for example after an import or uninstall).
    await env.pool.query(
      `INSERT INTO projects.artifacts (id, project_id, module, kind, native_id, category, key, title, lifecycle, version_value, version_at, created_at, created_by, modified_at, modified_by, confirmed_at)
       VALUES (gen_random_uuid(), $1, 'analysis', 'analysis', 'A-1', 'analysis', 'AN-1', 'Old analysis', 'working', '1', now(), now(), 'eli', now(), 'eli', now())`,
      [p.id],
    )
    const report = (await env.call('eli', 'POST', `${P(p.id)}/reconcile`)).body
    expect(report.unavailableModules).toEqual(['analysis'])
    const rec = (await artifacts(p.id)).find((a) => a.ref.module === 'analysis')!
    expect(rec.availability).toBe('module-unavailable')
  })

  it('returns the canonical product element UUID from the twin directory, also for an alias lookup', async () => {
    const { productTwinDirectory } = await import('../src/twinDirectory')
    const rod = (await env.call('ada', 'GET', `${P('PRJ-ACT100')}/product-elements/ROD-120`)).body
    const found = await productTwinDirectory(env.pool).lookup('PRJ-ACT100', ['ROD-120', rod.id, 'NOPE-1'])
    expect(found.get('ROD-120')).toEqual({ id: rod.id, type: 'part', name: 'Rod' })
    expect(found.get(rod.id)).toEqual({ id: rod.id, type: 'part', name: 'Rod' })
    expect(found.has('NOPE-1')).toBe(false)
    // Another project never resolves the example alias.
    expect((await productTwinDirectory(env.pool).lookup('some-other-project', ['ROD-120'])).size).toBe(0)
  })
})
