import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API, createProject, createTestEnv, expectConforms, idem, ifMatch, type TestEnv } from './helpers'

/**
 * Integration milestone 1: C1 (provisioning states), C2 (product registry as the authoritative product structure,
 * Requirements allocation through it) and C13 (project scoping: two projects, cross-project writes refused).
 * Real services throughout: the API host with Project Management, Requirements, Conceptualize and SysML on PostgreSQL.
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

const P = (id: string) => `${API}/projects/${id}`
const REQ = (id: string) => `/api/requirements/v1/projects/${id}`

async function element(projectId: string, body: Record<string, unknown>, user = 'eli') {
  const res = await env.call(user, 'POST', `${P(projectId)}/product-elements`, body, idem())
  if (res.status !== 201) throw new Error(`element: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body as { id: string; key: string; artifactId: string; revision: number }
}

async function requirement(projectId: string, user = 'eli') {
  const res = await env.call(user, 'POST', `${REQ(projectId)}/requirements`, { title: 'Stiffness', statement: 'The bracket shall deflect less than 0.5 mm at 200 N.', type: 'performance' }, idem())
  if (res.status !== 201) throw new Error(`requirement: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body as { id: string }
}

describe('C1: provisioning states and per-project workspace defaults', () => {
  it('records every hosted module for a new project and opens the real modules by default', async () => {
    const p = await createProject(env, 'eli')
    const ctx = (await env.call('eli', 'GET', `${P(p.id)}/context`)).body
    await expectConforms(env, 'getProjectContext', 200, ctx)
    const hosted = ctx.modules.filter((m: { module: string }) => m.module !== 'settings')
    expect(hosted.map((m: { module: string; status: string }) => `${m.module}:${m.status}`)).toEqual(['conceptualize:not-needed', 'requirements:not-needed', 'sysml:not-needed'])
    expect(hosted.every((m: { reason?: string }) => !!m.reason)).toBe(true)
    expect(ctx.workspace.defaultTools).toEqual(['requirements', 'conceptualize', 'sysml-modeler', 'cad-modeler'])
    const legacy = (await env.call('ada', 'GET', `${P('PRJ-ACT100')}/context`)).body
    expect(legacy.workspace.defaultTools).toEqual(['requirements', 'sysml', 'cad', 'conceptualize'])
    // Retrying is idempotent and keeps the states.
    const retry = await env.call('eli', 'POST', `${P(p.id)}/provision?force=true`)
    expect(retry.status).toBe(200)
    expect(retry.body.filter((m: { module: string }) => m.module !== 'settings').map((m: { status: string }) => m.status)).toEqual(['not-needed', 'not-needed', 'not-needed'])
  })

  it('records disabled modules without deleting anything and leaves their tools out of the defaults', async () => {
    const p = await createProject(env, 'eli', { modules: ['requirements', 'conceptualize'] })
    const ctx = (await env.call('eli', 'GET', `${P(p.id)}/context`)).body
    expect(ctx.modules.find((m: { module: string }) => m.module === 'sysml').enabled).toBe(false)
    expect(ctx.workspace.defaultTools).toEqual(['requirements', 'conceptualize', 'cad-modeler'])
    expect((await env.call('eli', 'POST', `${API}/projects`, { key: 'BADMOD', name: 'x', modules: ['nonexistent'] }, idem())).status).toBe(422)
  })
})

describe('C2: the product registry is the authoritative product structure', () => {
  it('creates elements and breakdowns, refuses cycles, keeps revisions and registers every element', async () => {
    const p = await createProject(env, 'eli')
    const bd = await env.call('eli', 'POST', `${P(p.id)}/breakdowns`, { name: 'Product breakdown', purpose: 'product-breakdown' }, idem())
    expect(bd.status).toBe(201)
    const product = await element(p.id, { name: 'Example product', elementKind: 'product', placement: { breakdownId: bd.body.id, parentId: null } })
    const system = await element(p.id, { name: 'Drive system', elementKind: 'system', placement: { breakdownId: bd.body.id, parentId: product.id } })
    const bracket = await element(p.id, { name: 'Bracket', elementKind: 'part', properties: { mass: { value: 0.4, unit: 'kg' }, material: 'AlMg3' }, placement: { breakdownId: bd.body.id, parentId: system.id, quantity: 2 } })
    expect(bracket.key).toBe('PE-003')
    await expectConforms(env, 'createProductElement', 201, bracket)
    expect((await env.call('eli', 'POST', `${P(p.id)}/product-elements`, { name: 'Bad', elementKind: 'part', properties: { mass: { value: 1, unit: 'furlongs per bushel' } } }, idem())).status).toBe(422)
    // A system may sit below a part (kinds are labels), but not if that closes a cycle.
    const cycle = await env.call('eli', 'POST', `${P(p.id)}/breakdowns/${bd.body.id}/edges`, { parentId: bracket.id, childId: product.id })
    expect(cycle.status).toBe(422)
    expect(cycle.body.error.message).toContain('cycle')
    const tree = (await env.call('eli', 'GET', `${P(p.id)}/breakdowns/${bd.body.id}/tree`)).body
    expect(tree.roots[0].element.name).toBe('Example product')
    expect(tree.roots[0].children[0].children[0]).toMatchObject({ quantity: 2, element: { name: 'Bracket' } })

    const edited = await env.call('eli', 'PATCH', `${P(p.id)}/product-elements/${bracket.id}`, { properties: { mass: { value: 0.35, unit: 'kg' } } }, ifMatch(1))
    expect(edited.body).toMatchObject({ revision: 2, properties: { mass: { value: 0.35, unit: 'kg' }, material: 'AlMg3' } })
    expect((await env.call('eli', 'PATCH', `${P(p.id)}/product-elements/${bracket.id}`, { name: 'Stale' }, ifMatch(1))).status).toBe(409)
    expect((await env.call('eli', 'GET', `${P(p.id)}/product-elements/${bracket.id}/history`)).body.map((h: { revision: number }) => h.revision)).toEqual([2, 1])

    const reg = (await env.call('eli', 'GET', `${P(p.id)}/artifacts?category=product-element&sort=key`)).body
    expect(reg.items.map((a: { key: string; ref: { module: string; kind: string }; version: { value: number } }) => `${a.key}:${a.ref.module}/${a.ref.kind}:v${a.version.value}`)).toEqual([
      'PE-001:product/product-element:v1',
      'PE-002:product/product-element:v1',
      'PE-003:product/product-element:v2',
    ])
  })

  it('lets Requirements allocate to product elements of the same project through the host directory', async () => {
    const p = await createProject(env, 'eli')
    const part = await element(p.id, { name: 'Bracket', elementKind: 'part' })
    const product = await element(p.id, { name: 'Product', elementKind: 'product' })
    const r = await requirement(p.id)
    const ok = await env.call('eli', 'POST', `${REQ(p.id)}/relationships`, { type: 'allocated-to', fromId: r.id, toTwinId: part.id })
    expect(ok.status).toBe(201)
    // Other kinds need Requirements CR-PM-REQ-2 (accept 'product-element'); until then they are refused, explained.
    const notYet = await env.call('eli', 'POST', `${REQ(p.id)}/relationships`, { type: 'allocated-to', fromId: r.id, toTwinId: product.id })
    expect(notYet.status).toBe(422)
    expect(notYet.body.error.message).toContain('product-element')
    // A retired element is no longer a valid target.
    const retired = await element(p.id, { name: 'Old bracket', elementKind: 'part' })
    await env.call('eli', 'PATCH', `${P(p.id)}/product-elements/${retired.id}`, { lifecycle: 'retired' }, ifMatch(1))
    expect((await env.call('eli', 'POST', `${REQ(p.id)}/relationships`, { type: 'allocated-to', fromId: r.id, toTwinId: retired.id })).status).toBe(422)
  })

  it('imports the example components with their twin IDs as aliases, without changing existing allocations', async () => {
    const rod = await env.call('ada', 'GET', `${P('PRJ-ACT100')}/product-elements/ROD-120`)
    expect(rod.status).toBe(200)
    expect(rod.body).toMatchObject({ key: 'ROD-120', name: 'Rod', elementKind: 'part', aliases: ['ROD-120'], properties: { diameter: { value: 25, unit: 'mm' } } })
    const all = (await env.call('ada', 'GET', `${P('PRJ-ACT100')}/product-elements`)).body
    expect(all.map((e: { key: string }) => e.key)).toEqual(['ACT-100', 'HSG-110', 'MTR-130', 'ROD-120'])
    const bds = (await env.call('ada', 'GET', `${P('PRJ-ACT100')}/breakdowns`)).body
    const tree = (await env.call('ada', 'GET', `${P('PRJ-ACT100')}/breakdowns/${bds[0].id}/tree`)).body
    expect(tree.roots.map((n: { element: { key: string } }) => n.element.key)).toEqual(['ACT-100'])
    expect(tree.roots[0].children.map((n: { element: { key: string } }) => n.element.key).sort()).toEqual(['HSG-110', 'MTR-130', 'ROD-120'])
    // The seeded allocations to twin IDs keep resolving (alias), and new ones work.
    const r = await requirement('PRJ-ACT100')
    expect((await env.call('eli', 'POST', `${REQ('PRJ-ACT100')}/relationships`, { type: 'allocated-to', fromId: r.id, toTwinId: 'ROD-120' })).status).toBe(201)
    // Re-running the import changes nothing.
    const { importLegacyProduct } = await import('../src/store/legacyProduct')
    const { memoryBlobStore } = await import('../src/blob/blobStore')
    const again = await importLegacyProduct(env.pool, { memberships: { set: async () => undefined, remove: async () => undefined, list: async () => [], projectsOf: async () => [], userExists: async () => true }, blobs: memoryBlobStore() })
    expect(again.seeded).toBe(false)
  })
})

describe('C13: project scoping', () => {
  it('keeps two projects apart and refuses writes that target another project’s resources', async () => {
    const a = await createProject(env, 'eli', { name: 'Project A' })
    const b = await createProject(env, 'eli', { name: 'Project B' })
    const partA = await element(a.id, { name: 'Part of A', elementKind: 'part' })
    const bdB = (await env.call('eli', 'POST', `${P(b.id)}/breakdowns`, { name: 'B structure', purpose: 'physical-assembly' }, idem())).body
    const taskA = (await env.call('eli', 'POST', `${P(a.id)}/work-items`, { kind: 'task', title: 'A task' }, idem())).body
    const docA = (await env.call('eli', 'POST', `${P(a.id)}/documents`, { title: 'A doc' }, idem())).body
    const reqB = await requirement(b.id)

    // Switching between the projects shows only each project's data.
    expect((await env.call('eli', 'GET', `${P(a.id)}/product-elements`)).body.map((e: { name: string }) => e.name)).toEqual(['Part of A'])
    expect((await env.call('eli', 'GET', `${P(b.id)}/product-elements`)).body).toEqual([])
    expect((await env.call('eli', 'GET', `${P(b.id)}/work-items`)).body.total).toBe(0)
    expect((await env.call('eli', 'GET', `${P(b.id)}/artifacts`)).body.total).toBe(0)
    expect((await env.call('eli', 'GET', `${REQ(a.id)}/requirements`)).body.items).toEqual([])

    // Cross-project writes are refused on the server.
    expect((await env.call('eli', 'PATCH', `${P(b.id)}/work-items/${taskA.id}`, { title: 'hijack' }, ifMatch(1))).status).toBe(404)
    expect((await env.call('eli', 'PATCH', `${P(b.id)}/product-elements/${partA.id}`, { name: 'hijack' }, ifMatch(1))).status).toBe(404)
    expect((await env.call('eli', 'POST', `${P(b.id)}/breakdowns/${bdB.id}/edges`, { parentId: null, childId: partA.id })).status).toBe(404)
    expect((await env.call('eli', 'PATCH', `${P(b.id)}/documents/${docA.id}`, { title: 'hijack' }, ifMatch(1))).status).toBe(404)
    expect((await env.call('eli', 'POST', `${P(b.id)}/links`, { type: 'relates-to', from: { artifactId: taskA.artifactId }, to: { artifactId: partA.artifactId } })).status).toBe(404)
    const crossAllocation = await env.call('eli', 'POST', `${REQ(b.id)}/relationships`, { type: 'allocated-to', fromId: reqB.id, toTwinId: partA.id })
    expect(crossAllocation.status).toBe(422)
    // Nothing changed in A.
    expect((await env.call('eli', 'GET', `${P(a.id)}/work-items/${taskA.id}`)).body.title).toBe('A task')
    expect((await env.call('eli', 'GET', `${P(a.id)}/product-elements/${partA.id}`)).body.name).toBe('Part of A')

    // A member of B only cannot read or write A.
    await env.call('eli', 'PUT', `${P(b.id)}/members/rui`, { role: 'editor' })
    expect((await env.call('rui', 'GET', `${P(a.id)}/product-elements`)).status).toBe(403)
    expect((await env.call('rui', 'POST', `${P(a.id)}/product-elements`, { name: 'x', elementKind: 'part' }, idem())).status).toBe(403)

    // Event streams are per project.
    const seenA: string[] = []
    const unsubscribe = env.server.projectEvents.subscribe(a.id, (e) => seenA.push(e.projectId))
    await env.call('eli', 'POST', `${P(b.id)}/work-items`, { kind: 'task', title: 'B task' }, idem())
    await env.call('eli', 'POST', `${P(a.id)}/work-items`, { kind: 'task', title: 'A task 2' }, idem())
    await env.server.projectEvents.flush()
    unsubscribe()
    expect(seenA.length).toBeGreaterThan(0)
    expect(new Set(seenA)).toEqual(new Set([a.id]))
  })
})
