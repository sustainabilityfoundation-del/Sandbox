import { randomUUID } from 'node:crypto'
import { ARTIFACT_LIFECYCLES, ARTIFACT_SOURCE_CONTRACT_VERSION, type ArtifactChange, type ArtifactDescriptor, type ArtifactSource } from '@ews/platform-sdk'
import { composeTwinDirectory, createRequirementsArtifactSource, staticTwinDirectory, type TwinDirectory } from '@ews/requirements-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prepareDatabase, SAMPLE_TWIN } from '../src/server'
import { BASE, PROJECT, REQ1, createTestEnv, type TestEnv } from './helpers'

/**
 * CR-PM-REG-1: the Requirements `ArtifactSource` (SDK 1.7) on real PostgreSQL, and CR-PM-REQ-2:
 * product elements as allocation targets through the injected TwinDirectory.
 */
const NEW_PROJECT = 'PRJ-NEW-001'
const PRODUCT_ELEMENT = '9e4f0b5d-0001-4d9c-8f40-9c3d6e5f4001'
const ALIASED_ELEMENT = '9e4f0b5d-0002-4d9c-8f40-9c3d6e5f4002'
/** A product directory that resolves an alias to the element's canonical UUID. */
const aliasDirectory: TwinDirectory = {
  description: 'test aliases',
  async lookup(projectId, ids) {
    return new Map(projectId === PROJECT && ids.includes('GBX-200') ? [['GBX-200', { id: ALIASED_ELEMENT, type: 'assembly', name: 'Gearbox (alias)' }]] : [])
  },
}
const TWIN = composeTwinDirectory(
  aliasDirectory,
  SAMPLE_TWIN,
  staticTwinDirectory(
    {
      [PROJECT]: [{ id: PRODUCT_ELEMENT, type: 'product-element', name: 'Gearbox (product element)' }],
      [NEW_PROJECT]: [{ id: 'PE-NEW-1', type: 'product-element', name: 'Frame' }],
    },
    'test product registry',
  ),
)

let env: TestEnv
let source: ArtifactSource
const changes: ArtifactChange[] = []
const idem = () => ({ 'idempotency-key': randomUUID() })
const createIn = (project: string, title: string, user = 'eli') =>
  env.call(user, 'POST', `/api/requirements/v1/projects/${project}/requirements`, { title, statement: 'The actuator shall do X within 2 s.', type: 'performance' }, idem())

async function listAll(projectId: string, limit?: number, kinds?: string[]): Promise<ArtifactDescriptor[]> {
  const out: ArtifactDescriptor[] = []
  let cursor: string | undefined
  for (let i = 0; i < 1000; i++) {
    const page = await source.list(projectId, { cursor, limit, kinds })
    expect(page.items.length).toBeLessThanOrEqual(limit ?? 500)
    out.push(...page.items)
    if (!page.nextCursor) return out
    cursor = page.nextCursor
  }
  throw new Error('paging did not end')
}

/** Waits until the published events have been delivered and a matching change arrived. */
async function changeFor(predicate: (c: ArtifactChange) => boolean): Promise<ArtifactChange | undefined> {
  for (let i = 0; i < 40; i++) {
    await env.server.events.flush()
    const found = changes.find(predicate)
    if (found) return found
    await new Promise((r) => setTimeout(r, 50))
  }
  return undefined
}

beforeAll(async () => {
  env = await createTestEnv({ twin: TWIN })
  // A new project as Project Management creates it: memberships only (CR-PM-API-1), nothing else.
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'editor'), ($1, 'rho', 'reader')`, [NEW_PROJECT])
  source = createRequirementsArtifactSource(env.pool, env.server.events, { twin: TWIN })
  source.subscribe((c) => changes.push(c))
})
afterAll(async () => env?.close())

describe('Requirements ArtifactSource (CR-PM-REG-1)', () => {
  it('describes the module and its three kinds', () => {
    expect(source.module).toBe('requirements')
    expect(source.contractVersion).toBe(ARTIFACT_SOURCE_CONTRACT_VERSION)
    expect(source.describeModule()).toEqual({
      name: 'Requirements',
      kinds: [
        { kind: 'requirement', label: 'Requirement', category: 'requirement', navigable: true },
        { kind: 'requirement-collection', label: 'Requirements collection', category: 'requirement', navigable: true },
        { kind: 'requirements-baseline', label: 'Requirements baseline', category: 'baseline', navigable: true },
      ],
    })
  })

  it('lists every requirement, collection and baseline of a project with valid descriptors', async () => {
    const all = await listAll(PROJECT)
    const counts = async (table: string) => Number((await env.pool.query(`SELECT count(*) AS n FROM requirements.${table} WHERE project_id = $1`, [PROJECT])).rows[0].n)
    expect(all.filter((d) => d.ref.kind === 'requirement')).toHaveLength(await counts('requirements'))
    expect(all.filter((d) => d.ref.kind === 'requirement-collection')).toHaveLength(await counts('collections'))
    expect(all.filter((d) => d.ref.kind === 'requirements-baseline')).toHaveLength(await counts('baselines'))
    const kinds = source.describeModule().kinds.map((k) => k.kind)
    for (const d of all) {
      expect(d.ref.module).toBe('requirements')
      expect(kinds).toContain(d.ref.kind)
      expect(d.key.length).toBeGreaterThan(0)
      expect(d.title.length).toBeGreaterThan(0)
      expect(ARTIFACT_LIFECYCLES).toContain(d.lifecycle)
      expect(Number.isNaN(Date.parse(d.modifiedAt))).toBe(false)
      expect(d.open?.toolId).toBe('requirements')
    }
    const req1 = all.find((d) => d.ref.id === REQ1)!
    expect(req1).toMatchObject({ key: 'REQ-001', title: 'Operating load', ref: { kind: 'requirement' }, open: { toolId: 'requirements', params: { id: REQ1 } } })
    expect(req1.version.value).toBe((await env.call('rho', 'GET', `${BASE}/requirements/${REQ1}`)).body.revision)
  })

  it('pages in a stable order without gaps or duplicates, and filters by kind', async () => {
    const full = await listAll(PROJECT)
    const paged = await listAll(PROJECT, 2)
    expect(paged.map((d) => `${d.ref.kind}:${d.ref.id}`)).toEqual(full.map((d) => `${d.ref.kind}:${d.ref.id}`))
    expect(new Set(paged.map((d) => d.ref.id)).size).toBe(paged.length)
    const onlyBaselines = await listAll(PROJECT, undefined, ['requirements-baseline'])
    expect(onlyBaselines.every((d) => d.ref.kind === 'requirements-baseline')).toBe(true)
    expect(await source.list(PROJECT, { kinds: ['cad-document'] })).toEqual({ items: [] })
    await expect(source.list(PROJECT, { cursor: 'not-a-cursor' })).rejects.toThrow(/cursor/)
  })

  it('describe returns existing refs only, in request order; unknown, foreign and other-project refs are absent', async () => {
    const coll = (await listAll(PROJECT, undefined, ['requirement-collection']))[0]
    const got = await source.describe(PROJECT, [
      coll.ref,
      { module: 'requirements', kind: 'requirement', id: REQ1 },
      { module: 'requirements', kind: 'requirement', id: randomUUID() },
      { module: 'requirements', kind: 'requirement', id: 'REQ-001' },
      { module: 'conceptualize', kind: 'concept', id: REQ1 },
      { module: 'requirements', kind: 'requirements-baseline', id: REQ1 },
    ])
    expect(got.map((d) => d.ref)).toEqual([coll.ref, { module: 'requirements', kind: 'requirement', id: REQ1 }])
    expect(await source.describe(NEW_PROJECT, [{ module: 'requirements', kind: 'requirement', id: REQ1 }])).toEqual([])
  })

  it('reports requirement relationships with the target revision', async () => {
    const a = (await createIn(PROJECT, 'Derived load')).body
    expect((await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'derives-from', fromId: a.id, toRequirementId: REQ1 })).status).toBe(201)
    const [d] = await source.describe(PROJECT, [{ module: 'requirements', kind: 'requirement', id: a.id }])
    const req1Rev = (await env.call('rho', 'GET', `${BASE}/requirements/${REQ1}`)).body.revision
    expect(d.relations).toEqual([{ type: 'derives-from', to: { module: 'requirements', kind: 'requirement', id: REQ1 }, toRevision: req1Rev }])
  })

  it('reports allocations to product elements with the C3 ref; the canonical ID is stored, so allocations made by alias are reported', async () => {
    const r = (await createIn(PROJECT, 'Gearbox efficiency')).body
    for (const toTwinId of [PRODUCT_ELEMENT, 'GBX-200', 'ROD-120']) {
      expect((await env.call('eli', 'POST', `${BASE}/relationships`, { type: 'allocated-to', fromId: r.id, toTwinId })).status).toBe(201)
    }
    // ROD-120 is an alias of a product element when Project Management's registry has one (its seed), else a sample-twin ID.
    const rod = (await env.pool.query<{ id: string }>(`SELECT element_id::text AS id FROM projects.product_element_aliases WHERE project_id = $1 AND alias = 'ROD-120'`, [PROJECT])).rows[0]?.id
    const stored = (await env.call('eli', 'GET', `${BASE}/requirements/${r.id}/relationships`)).body.map((x: { toTwinId: string }) => x.toTwinId).sort()
    expect(stored).toEqual([PRODUCT_ELEMENT, ALIASED_ELEMENT, rod ?? 'ROD-120'].sort())
    const expected = [PRODUCT_ELEMENT, ALIASED_ELEMENT, ...(rod ? [rod] : [])].map((id) => ({ type: 'allocated-to', to: { module: 'product', kind: 'product-element', id } }))
    const [d] = await source.describe(PROJECT, [{ module: 'requirements', kind: 'requirement', id: r.id }])
    expect(d.relations).toEqual(expect.arrayContaining(expected))
    expect(d.relations).toHaveLength(expected.length)
    // The stored IDs are canonical, so a source without a directory reports the same.
    const plain = createRequirementsArtifactSource(env.pool, env.server.events)
    const [p] = await plain.describe(PROJECT, [{ module: 'requirements', kind: 'requirement', id: r.id }])
    expect(p.relations).toEqual(d.relations)
    // The list path reports the same relations.
    const listed = (await listAll(PROJECT, undefined, ['requirement'])).find((x) => x.ref.id === r.id)!
    expect(listed.relations).toEqual(d.relations)
  })

  it('a new project starts empty: provision is not-needed, nothing is seeded, also after the seed runs again', async () => {
    const request = { projectId: NEW_PROJECT, template: { id: 'blank', content: 'blank' as const }, actor: 'ada', idempotencyKey: 'prov-1' }
    expect(await source.provision!(request)).toEqual({ status: 'not-needed' })
    expect(await source.provision!(request)).toEqual({ status: 'not-needed' })
    expect(await source.list(NEW_PROJECT)).toEqual({ items: [] })
    await prepareDatabase(env.pool, { seed: true }) // the development seed on startup
    expect(await source.list(NEW_PROJECT)).toEqual({ items: [] })
    const tables = ['requirements', 'collections', 'baselines', 'relationships', 'attribute_definitions', 'key_counters', 'outbox', 'audit_events']
    for (const t of tables) {
      const n = Number((await env.pool.query(`SELECT count(*) AS n FROM requirements.${t} WHERE project_id = $1`, [NEW_PROJECT])).rows[0].n)
      expect({ table: t, rows: n }).toEqual({ table: t, rows: 0 })
    }
    // The project works through the API, and its first requirement appears in the source.
    expect((await env.call('rho', 'GET', `/api/requirements/v1/projects/${NEW_PROJECT}/requirements`)).body.items).toEqual([])
    const first = await createIn(NEW_PROJECT, 'Frame stiffness')
    expect(first.status).toBe(201)
    expect((await source.list(NEW_PROJECT)).items.map((d) => d.key)).toEqual([first.body.key])
  })

  it('delivers committed changes for every project: upserted, retired, reconcile; failed writes give none', async () => {
    const created = (await createIn(NEW_PROJECT, 'Frame mass')).body
    const up = await changeFor((c) => c.kind === 'upserted' && c.refs.some((r) => r.id === created.id))
    expect(up).toMatchObject({ kind: 'upserted', projectId: NEW_PROJECT, actor: 'eli', refs: [{ module: 'requirements', kind: 'requirement', id: created.id }] })
    expect(typeof up!.eventId).toBe('string')

    await env.call('eli', 'POST', `/api/requirements/v1/projects/${NEW_PROJECT}/requirements/${created.id}/archive`, { expectedRevision: 1, reason: 'Duplicate' })
    expect(await changeFor((c) => c.kind === 'retired' && c.refs.some((r) => r.id === created.id))).toMatchObject({ projectId: NEW_PROJECT })
    const [archived] = await source.describe(NEW_PROJECT, [{ module: 'requirements', kind: 'requirement', id: created.id }])
    expect(archived).toMatchObject({ lifecycle: 'retired', moduleState: 'archived' })

    const coll = await env.call('eli', 'POST', `/api/requirements/v1/projects/${NEW_PROJECT}/collections`, { name: 'Frame specification' }, idem())
    expect(coll.status).toBe(201)
    expect(await changeFor((c) => c.kind === 'upserted' && c.refs[0]?.kind === 'requirement-collection' && c.refs[0].id === coll.body.id)).toBeTruthy()

    const bl = await env.call('rui', 'POST', `${BASE}/baselines`, { name: `Contract test ${Date.now()}` }, idem())
    expect(bl.status).toBe(201)
    expect(await changeFor((c) => c.kind === 'upserted' && c.refs[0]?.kind === 'requirements-baseline' && c.refs[0].id === bl.body.id)).toMatchObject({ projectId: PROJECT })
    const [blDesc] = await source.describe(PROJECT, [{ module: 'requirements', kind: 'requirements-baseline', id: bl.body.id }])
    expect(blDesc).toMatchObject({ lifecycle: 'released', version: { value: 1 } })

    // A write refused inside its transaction (stale revision) commits nothing and emits nothing.
    const other = (await createIn(NEW_PROJECT, 'Frame colour')).body
    await changeFor((c) => c.kind !== 'reconcile' && c.refs.some((r) => r.id === other.id))
    const before = changes.length
    expect((await env.call('eli', 'PATCH', `/api/requirements/v1/projects/${NEW_PROJECT}/requirements/${other.id}`, { expectedRevision: 7, statement: 'Stale.' })).status).toBe(409)
    await env.server.events.flush()
    expect(changes.slice(before).filter((c) => c.projectId === NEW_PROJECT && c.kind !== 'reconcile')).toEqual([])
  })
})

describe('allocation targets through the TwinDirectory port (CR-PM-REQ-2)', () => {
  const allocate = (project: string, fromId: string, toTwinId: string) => env.call('eli', 'POST', `/api/requirements/v1/projects/${project}/relationships`, { type: 'allocated-to', fromId, toTwinId })

  it('accepts product elements; PRJ-ACT100 keeps the sample twin behaviour', async () => {
    const r = (await createIn(PROJECT, 'Gearbox ratio')).body
    expect((await allocate(PROJECT, r.id, PRODUCT_ELEMENT)).status).toBe(201)
    expect((await allocate(PROJECT, r.id, 'ROD-120')).status).toBe(201)
    const sysml = await allocate(PROJECT, r.id, 'SYS-003')
    expect(sysml.status).toBe(422)
    expect(sysml.body.error.message).toMatch(/sysml-element/)
    expect((await allocate(PROJECT, r.id, 'NOPE-1')).status).toBe(422)
  })

  it('validates per project: a new project knows only its own product elements', async () => {
    const r = (await createIn(NEW_PROJECT, 'Frame load')).body
    expect((await allocate(NEW_PROJECT, r.id, 'PE-NEW-1')).status).toBe(201)
    const foreign = await allocate(NEW_PROJECT, r.id, 'ROD-120')
    expect(foreign.status).toBe(422)
    expect(foreign.body.error.message).toMatch(/not a known component or product element/)
  })

  it('composeTwinDirectory answers each ID from the first directory that knows it', async () => {
    const a = staticTwinDirectory({ P: [{ id: 'X', type: 'part', name: 'a' }] }, 'a')
    const b = staticTwinDirectory({ P: [{ id: 'X', type: 'product-element', name: 'b' }, { id: 'Y', type: 'product-element', name: 'b' }] }, 'b')
    const found = await composeTwinDirectory(a, b).lookup('P', ['X', 'Y', 'Z'])
    expect([...found.entries()].map(([id, o]) => `${id}:${o.type}`)).toEqual(['X:part', 'Y:product-element'])
    expect(composeTwinDirectory(a, b).description).toBe('a + b')
  })
})
