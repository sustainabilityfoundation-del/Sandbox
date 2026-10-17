import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ARTIFACT_LIFECYCLES, ARTIFACT_CATEGORIES, type ArtifactChange, type ArtifactSource } from '@ews/platform-sdk'
import { CONCEPT_SEED_IDS as SEED, createConceptsArtifactSource, FUNCTION_SEED_IDS as FN } from '@ews/conceptualize-service'
import { createTestEnv, idem, type TestEnv } from './helpers'

/**
 * CR-PM-REG-2: Conceptualize as an SDK 1.7 ArtifactSource, on real PostgreSQL. Covers the contract tests
 * of registration-and-provisioning.md §7 (stable paging, unknown refs, kinds and lifecycles, changes
 * after commit, blank provisioning, unknown project) and the no-seed rule for a new project.
 */
let env: TestEnv
let source: ArtifactSource
const NEW = 'PRJ-PM-NEW'
const NEW_BASE = `/api/concepts/v1/projects/${NEW}`

beforeAll(async () => {
  env = await createTestEnv()
  source = createConceptsArtifactSource(env.pool, env.server.conceptEvents)
  for (const [u, role] of [['eli', 'editor'], ['rho', 'reader']]) await env.pool.query('INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [NEW, u, role])
})
afterAll(async () => {
  await env?.close()
})

describe('Conceptualize ArtifactSource (CR-PM-REG-2)', () => {
  it('describes the module with the §4 kinds', () => {
    const d = source.describeModule()
    expect(source.module).toBe('conceptualize')
    expect(d.name).toBe('Conceptualize')
    expect(d.kinds.map((k) => k.kind)).toEqual(['concept', 'function', 'constraint', 'assumption', 'alternative-set', 'trade-study', 'decision', 'evidence', 'concept-implementation', 'calculation-model', 'intent'])
    for (const k of d.kinds) expect(ARTIFACT_CATEGORIES).toContain(k.category)
  })

  it('lists the seeded project in a stable order across pages, with valid descriptors', async () => {
    const all: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await source.list('PRJ-ACT100', { limit: 7, ...(cursor ? { cursor } : {}) })
      expect(page.items.length).toBeLessThanOrEqual(7)
      for (const a of page.items) {
        expect(source.describeModule().kinds.map((k) => k.kind)).toContain(a.ref.kind)
        expect(ARTIFACT_LIFECYCLES).toContain(a.lifecycle)
        expect(a.key).toMatch(/^[A-Z]+-\d{3,}$/)
        expect(a.ref.module).toBe('conceptualize')
        expect(Date.parse(a.version.at)).not.toBeNaN()
      }
      all.push(...page.items.map((a) => `${a.ref.kind}:${a.ref.id}`))
      cursor = page.nextCursor
      pages++
    } while (cursor && pages < 100)
    expect(new Set(all).size).toBe(all.length)
    const once = await source.list('PRJ-ACT100', { limit: 500 })
    expect(once.items.map((a) => `${a.ref.kind}:${a.ref.id}`)).toEqual(all)
    const kinds = new Set(once.items.map((a) => a.ref.kind))
    for (const k of ['concept', 'function', 'constraint', 'assumption', 'alternative-set', 'trade-study', 'decision', 'evidence', 'concept-implementation']) expect(kinds.has(k), k).toBe(true)
    const actuator = once.items.find((a) => a.ref.id === SEED.actuator)!
    expect(actuator).toMatchObject({ key: 'CON-001', moduleState: 'engineering-development', lifecycle: 'in-review', version: { value: expect.any(Number) } })
    expect(actuator.relations?.some((r) => r.type === 'contains')).toBe(true)
    const fn = once.items.find((a) => a.ref.id === FN.linearForce)!
    expect(fn.relations?.filter((r) => r.type === 'decomposes-into')).toHaveLength(3)
    const recorded = once.items.find((a) => a.ref.kind === 'decision' && a.moduleState === 'recorded')
    expect(recorded?.lifecycle).toBe('released')
    expect((await source.list('PRJ-ACT100', { kinds: ['function'], limit: 500 })).items.every((a) => a.ref.kind === 'function')).toBe(true)
  })

  it('describes known refs and omits unknown ones', async () => {
    const d = await source.describe('PRJ-ACT100', [
      { module: 'conceptualize', kind: 'concept', id: SEED.actuator },
      { module: 'conceptualize', kind: 'concept', id: '00000000-0000-4000-8000-000000000000' },
      { module: 'conceptualize', kind: 'function', id: SEED.actuator },
      { module: 'requirements', kind: 'requirement', id: SEED.actuator },
    ])
    expect(d.map((x) => `${x.ref.kind}:${x.ref.id}`)).toEqual([`concept:${SEED.actuator}`])
    expect(await source.describe('PRJ-OTHER', [{ module: 'conceptualize', kind: 'concept', id: SEED.actuator }])).toEqual([])
  })

  it('answers an unknown project with an empty page and never seeds a new project', async () => {
    expect(await source.list('PRJ-DOES-NOT-EXIST')).toEqual({ items: [] })
    expect(await source.provision!({ projectId: NEW, template: { id: 'blank', content: 'blank' }, actor: 'eli', idempotencyKey: 'p-1' })).toEqual({ status: 'not-needed' })
    expect(await source.provision!({ projectId: NEW, template: { id: 'blank', content: 'blank' }, actor: 'eli', idempotencyKey: 'p-1' })).toEqual({ status: 'not-needed' })
    expect((await source.list(NEW)).items).toEqual([])
    // Reading the new project through the API does not create anything either.
    expect((await env.call('eli', 'GET', `${NEW_BASE}/concepts`)).body.items).toEqual([])
    expect((await env.call('eli', 'GET', `${NEW_BASE}/functions`)).body).toEqual([])
    expect((await source.list(NEW)).items).toEqual([])
  })

  it('delivers committed changes after commit only, itemised by kind', async () => {
    const changes: ArtifactChange[] = []
    const off = source.subscribe((c) => changes.push(c))
    try {
      const fn = (await env.call('eli', 'POST', `${NEW_BASE}/functions`, { name: 'Store energy' }, idem())).body
      const c = (await env.call('eli', 'POST', `${NEW_BASE}/concepts`, { name: 'Flywheel', performs: [fn.id] }, idem())).body
      // A failed write commits nothing and announces nothing.
      const bad = await env.call('eli', 'POST', `${NEW_BASE}/batch`, { items: [{ op: 'createFunction', as: '$x', body: { name: 'Rolled back' } }, { op: 'createLink', body: { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: '$x' }, to: { module: 'conceptualize', type: 'function', id: fn.id } } }] }, idem())
      expect(bad.status).toBe(422)
      await env.server.conceptEvents.flush()
      await expect.poll(() => changes.filter((x) => x.projectId === NEW).length, { timeout: 5000 }).toBeGreaterThanOrEqual(3)
      const mine = changes.filter((x): x is Extract<ArtifactChange, { kind: 'upserted' }> => x.projectId === NEW && x.kind === 'upserted')
      const refs = mine.flatMap((x) => x.refs.map((r) => `${r.kind}:${r.id}`))
      expect(refs).toContain(`function:${fn.id}`)
      expect(refs).toContain(`concept:${c.id}`)
      // The performs link is announced for its from record (the Concept).
      expect(mine.some((x) => x.refs.some((r) => r.kind === 'concept' && r.id === c.id))).toBe(true)
      expect(new Set(mine.map((x) => x.eventId)).size).toBe(mine.length)
      const listed = await source.list(NEW)
      expect(listed.items.map((a) => a.title).sort()).toEqual(['Flywheel', 'Store energy'])
      expect(listed.items.find((a) => a.ref.id === c.id)?.relations).toEqual([{ type: 'performs', to: { module: 'conceptualize', kind: 'function', id: fn.id } }])
    } finally {
      off()
    }
  })
})
