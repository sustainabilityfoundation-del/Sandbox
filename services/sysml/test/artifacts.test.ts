import { ARTIFACT_CATEGORIES, ARTIFACT_LIFECYCLES, type ArtifactChange, type ArtifactDescriptor, type ArtifactSource } from '@ews/platform-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createSysmlArtifactSource } from '../src/artifacts'
import { createSysmlEventHub, type SysmlEventHub } from '../src/events'
import { SysmlRepository } from '../src/repository'
import { SEED_PROJECT_ID } from '../src/seed'

/**
 * Contract tests of the SysML artifact source (CR-PM-REG-3; registration-and-provisioning.md §7) on a
 * real PostgreSQL with the seeded example (platform project PRJ-ACT100) and a new, empty platform project.
 */

let env: TestEnv
let repo: SysmlRepository
let hub: SysmlEventHub
let source: ArtifactSource
const changes: ArtifactChange[] = []
const NEW = 'PRJ-SYSML-NEW'

beforeAll(async () => {
  env = await createTestEnv()
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'administrator')`, [NEW])
  repo = new SysmlRepository(env.pool)
  hub = await createSysmlEventHub(env.pool, { pollMs: 100 })
  source = createSysmlArtifactSource(repo, hub)
  source.subscribe((c) => changes.push(c))
})
afterAll(async () => {
  await hub?.close()
  await env?.close()
})

async function all(projectId: string, limit: number): Promise<ArtifactDescriptor[]> {
  const out: ArtifactDescriptor[] = []
  let cursor: string | undefined
  for (let k = 0; k < 1000; k++) {
    const page = await source.list(projectId, { cursor, limit })
    expect(page.items.length).toBeLessThanOrEqual(limit)
    out.push(...page.items)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return out
}

/** Waits until the published events reached the listener (delivery is asynchronous, after commit). */
async function settle(predicate: () => boolean, ms = 45000) {
  const deadline = Date.now() + ms
  while (!predicate() && Date.now() < deadline) {
    await hub.flush()
    await new Promise((r) => setTimeout(r, 50))
  }
}

/** For "nothing is delivered": publish everything committed so far, then give listeners a moment. */
async function quiet() {
  for (let k = 0; k < 5; k++) await hub.flush()
  await new Promise((r) => setTimeout(r, 300))
}

const refKey = (d: { ref: { kind: string; id: string } }) => `${d.ref.kind}:${d.ref.id}`

describe('SysML artifact source (contract)', () => {
  it('describes the module with its kinds', () => {
    const m = source.describeModule()
    expect(m.name).toBe('SysML Modeler')
    expect(m.kinds.map((k) => k.kind)).toEqual(['sysml-project', 'sysml-model-element', 'sysml-tag'])
    for (const k of m.kinds) expect(ARTIFACT_CATEGORIES).toContain(k.category)
    expect(source.module).toBe('sysml')
    expect(source.contractVersion).toBe('1.0.0')
  })

  it('unknown project → empty page; unknown refs → nothing', async () => {
    expect(await source.list('PRJ-NOPE')).toEqual({ items: [] })
    expect(await source.describe('PRJ-ACT100', [{ module: 'sysml', kind: 'sysml-model-element', id: `${SEED_PROJECT_ID}/00000000-0000-4000-8000-000000000000` }, { module: 'cad', kind: 'cad-document', id: 'x' }, { module: 'sysml', kind: 'sysml-project', id: 'not-a-uuid' }])).toEqual([])
    // A SysML project of another platform project is not described in this one.
    expect(await source.describe(NEW, [{ module: 'sysml', kind: 'sysml-project', id: SEED_PROJECT_ID }])).toEqual([])
  })

  it('lists the seeded project: stable paging, valid descriptors, named definitions and usages only', async () => {
    const full = await all('PRJ-ACT100', 500)
    const paged = await all('PRJ-ACT100', 37)
    expect(paged.map(refKey)).toEqual(full.map(refKey))
    expect(new Set(full.map(refKey)).size).toBe(full.length)
    expect(full[0].ref).toEqual({ module: 'sysml', kind: 'sysml-project', id: SEED_PROJECT_ID })
    const kinds = new Set(source.describeModule().kinds.map((k) => k.kind))
    for (const d of full) {
      expect(kinds.has(d.ref.kind)).toBe(true)
      expect(ARTIFACT_LIFECYCLES).toContain(d.lifecycle)
      expect(d.key.length).toBeGreaterThan(0)
      expect(d.title.length).toBeGreaterThan(0)
      expect(Number.isNaN(Date.parse(d.createdAt))).toBe(false)
    }
    const rod = full.find((d) => d.key === 'ActuatorSystem::Mechanical::Rod')!
    expect(rod).toMatchObject({ title: 'part def Rod', lifecycle: 'working', container: { module: 'sysml', kind: 'sysml-project', id: SEED_PROJECT_ID }, open: { toolId: 'sysml-modeler' } })
    expect(rod.ref.id).toMatch(new RegExp(`^${SEED_PROJECT_ID}/[0-9a-f-]{36}$`))
    // Packages and relationships are not registered; named attributes (usages) are.
    expect(full.some((d) => d.key === 'ActuatorSystem::Mechanical')).toBe(false)
    expect(full.some((d) => d.key === 'ActuatorSystem::Mechanical::Rod::mass')).toBe(true)
    // SysML-native relationships are reported for the link index.
    const act100 = full.find((d) => d.key.endsWith('Product::act100'))!
    expect(act100.relations?.filter((r) => r.type === 'satisfies')).toHaveLength(3)
    // Filter by kind.
    const projects = await source.list('PRJ-ACT100', { kinds: ['sysml-project'] })
    expect(projects.items.map((d) => d.ref.kind)).toEqual(['sysml-project'])
    // describe() answers the same descriptors as list().
    const again = await source.describe('PRJ-ACT100', [rod.ref, full[0].ref])
    expect(again.map(refKey).sort()).toEqual([refKey(rod), refKey(full[0])].sort())
    expect(again.find((d) => d.ref.kind === 'sysml-model-element')).toEqual(rod)
  })

  it('a new platform project starts empty; provisioning a blank project creates nothing', async () => {
    expect((await source.list(NEW)).items).toEqual([])
    expect(await source.provision!({ projectId: NEW, template: { id: 'blank', content: 'blank' }, actor: 'eli', idempotencyKey: 'k1' })).toEqual({ status: 'not-needed' })
    expect(await source.provision!({ projectId: NEW, template: { id: 'blank', content: 'blank' }, actor: 'eli', idempotencyKey: 'k1' })).toEqual({ status: 'not-needed' })
    expect((await source.list(NEW)).items).toEqual([])
    // The SysML API also lists no project there.
    expect((await env.call('eli', 'GET', `/api/sysml/v1/projects?platformProjectId=${NEW}`)).body.filter((p: { platformProjectId: string }) => p.platformProjectId === NEW)).toEqual([])
  })

  it('delivers committed changes: project created, elements upserted and retired, tags; not dry runs or other branches', async () => {
    changes.length = 0
    const created = await env.call('eli', 'POST', '/api/sysml/v1/projects', { name: 'Gripper model', platformProjectId: NEW })
    expect(created.status).toBe(201)
    const pid = created.body['@id'] as string
    await settle(() => changes.some((c) => c.kind === 'upserted' && c.refs.some((r) => r.kind === 'sysml-project' && r.id === pid)))
    expect(changes.filter((c) => c.kind !== 'reconcile' && c.refs.some((r) => r.id.startsWith(pid))).every((c) => c.projectId === NEW)).toBe(true)
    const listed = await source.list(NEW)
    expect(listed.items.map((d) => d.ref.kind)).toEqual(['sysml-project']) // the empty root is not registered

    const project = await repo.getProject(pid)
    const branch = project.default_branch_id!
    // Dry run: nothing committed, nothing delivered.
    changes.length = 0
    await repo.transact(pid, branch, 'eli', { commands: [{ op: 'createElement', ownerId: project.root_element_id, kind: 'PartDefinition', name: 'Dry' }], dryRun: true })
    await quiet()
    expect(changes).toEqual([])

    const out = await repo.transact(pid, branch, 'eli', { commands: [{ op: 'createElement', ownerId: project.root_element_id, kind: 'PartDefinition', name: 'Finger', ref: '$f' }, { op: 'createElement', ownerId: '$f', kind: 'AttributeUsage', name: 'length' }] })
    const fingerId = out.createdIds.$f
    await settle(() => changes.some((c) => c.kind === 'upserted' && c.refs.some((r) => r.id === `${pid}/${fingerId}`)))
    const up = changes.find((c) => c.kind === 'upserted')!
    expect(up.kind === 'upserted' && up.refs.map((r) => r.kind).sort()).toEqual(['sysml-model-element', 'sysml-model-element', 'sysml-project'])
    const finger = (await source.describe(NEW, [{ module: 'sysml', kind: 'sysml-model-element', id: `${pid}/${fingerId}` }]))[0]
    expect(finger).toMatchObject({ key: 'Finger', title: 'part def Finger', createdBy: 'eli', version: { value: 2 } })

    // Another branch: not registered.
    changes.length = 0
    const other = await repo.createBranch(pid, 'eli', 'study', out.commit!.id)
    await repo.transact(pid, other.id, 'eli', { commands: [{ op: 'createElement', ownerId: project.root_element_id, kind: 'PartDefinition', name: 'OnlyOnStudy' }] })
    await quiet()
    expect(changes.filter((c) => c.kind !== 'reconcile' && c.refs.some((r) => r.kind === 'sysml-model-element'))).toEqual([])
    expect((await all(NEW, 100)).some((d) => d.key === 'OnlyOnStudy')).toBe(false)

    // Deletion on the default branch: retired.
    changes.length = 0
    await repo.transact(pid, branch, 'eli', { commands: [{ op: 'deleteElement', elementId: fingerId }] })
    await settle(() => changes.some((c) => c.kind === 'retired'))
    const retired = changes.find((c) => c.kind === 'retired')!
    expect(retired.kind === 'retired' && retired.refs.map((r) => r.id)).toContain(`${pid}/${fingerId}`)
    expect(await source.describe(NEW, [{ module: 'sysml', kind: 'sysml-model-element', id: `${pid}/${fingerId}` }])).toEqual([])

    // Tag: upserted as a baseline.
    changes.length = 0
    const tag = await repo.createTag(pid, 'eli', 'v1', out.commit!.id)
    await settle(() => changes.some((c) => c.kind === 'upserted' && c.refs.some((r) => r.kind === 'sysml-tag')))
    const [tagged] = await source.describe(NEW, [{ module: 'sysml', kind: 'sysml-tag', id: `${pid}/${tag.id}` }])
    expect(tagged).toMatchObject({ title: 'v1', lifecycle: 'released', version: { value: 2 } })
    // Every change has an event ID (consumers dedupe by it).
    expect(new Set(changes.map((c) => c.eventId)).size).toBe(changes.length)
  })
})
