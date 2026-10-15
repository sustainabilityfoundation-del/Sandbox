import { describe, expect, it } from 'vitest'
import { ConceptsServiceError, type ConceptsEvent, type ConceptsService } from '@ews/platform-sdk'

/**
 * Reusable contract test suite for any SDK `ConceptsService` adapter (HTTP, demo, or a host's own).
 * Import from '@ews/conceptualize-client/contract-tests' in a Vitest file:
 *
 *   defineConceptsServiceContract('my adapter', async () => ({ service, projectId: 'PRJ-ACT100' }))
 *
 * The fixture must contain the example Concepts CON-001 … CON-009 with their agreed UUIDs and the
 * implementation of CON-001 that references CAD-120 and SYS-001.
 */
export interface ConceptsContractFixture {
  service: ConceptsService
  projectId: string
  /** Creates a Concept through the module (adapters with writes); returns its ID. */
  createConcept?: () => Promise<string>
  /** Waits until committed events are delivered. */
  settle?: () => Promise<void>
  cleanup?: () => Promise<void>
}

export const CON_001 = 'c0ce0000-0000-4000-8000-000000000001'
export const CON_005 = 'c0ce0000-0000-4000-8000-000000000005'

async function waitFor(cond: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('Timed out waiting for an event')
    await new Promise((r) => setTimeout(r, 25))
  }
}

export function defineConceptsServiceContract(name: string, setup: () => Promise<ConceptsContractFixture>) {
  describe(`ConceptsService contract: ${name}`, () => {
    const withFixture = (fn: (f: ConceptsContractFixture) => Promise<void>) => async () => {
      const f = await setup()
      try {
        await fn(f)
      } finally {
        await f.cleanup?.()
      }
    }

    it(
      'declares its contract version and mode explicitly',
      withFixture(async ({ service }) => {
        expect(service.contractVersion).toMatch(/^1\./)
        expect(['api', 'demo']).toContain(service.mode)
      }),
    )

    it(
      'reads by canonical UUID; the key is display text; unknown IDs are undefined',
      withFixture(async ({ service, projectId }) => {
        const c = await service.get(CON_001, { projectId })
        expect(c).toMatchObject({ id: CON_001, key: 'CON-001', projectId, name: 'Linear actuator ACT-100', abstraction: 'system' })
        expect(c!.revision).toBeGreaterThanOrEqual(1)
        expect(new Date(c!.updatedAt).toISOString()).toBe(c!.updatedAt)
        expect(await service.get('00000000-0000-4000-8000-000000000000', { projectId })).toBeUndefined()
        expect((await service.get(CON_001, { projectId, revision: 1 }))?.revision).toBe(1)
      }),
    )

    it(
      'lists with stable cursor pagination and filters',
      withFixture(async ({ service, projectId }) => {
        const first = await service.list({ projectId, limit: 2 })
        expect(first.items).toHaveLength(2)
        expect(first.nextCursor).toBeTruthy()
        const second = await service.list({ projectId, limit: 2, cursor: first.nextCursor })
        expect(new Set([...first.items, ...second.items].map((c) => c.id)).size).toBe(4)
        const text = await service.list({ projectId, text: 'transmission' })
        expect(text.items.map((c) => c.id)).toContain(CON_005)
        const selected = await service.list({ projectId, maturity: ['selected'] })
        expect(selected.items.every((c) => c.maturity === 'selected')).toBe(true)
        const byId = await service.list({ projectId, ids: [CON_001] })
        expect(byId.items.map((c) => c.id)).toEqual([CON_001])
        await expect(service.list({ projectId, limit: 500 })).rejects.toBeInstanceOf(ConceptsServiceError)
      }),
    )

    it(
      'finds the Concepts an artifact realizes, with the implementation and its version-aware refs',
      withFixture(async ({ service, projectId }) => {
        const hits = await service.conceptsForArtifact({ module: 'cad', id: 'CAD-120' }, { projectId })
        const hit = hits.find((h) => h.concept.id === CON_001)
        expect(hit).toBeDefined()
        expect(hit!.implementation.conceptIds).toContain(CON_001)
        expect(hit!.implementation.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ module: 'sysml', id: 'SYS-001' })]))
        expect(await service.conceptsForArtifact({ module: 'cad', id: 'CAD-999' }, { projectId })).toEqual([])
        const impls = await service.implementations(CON_001, { projectId })
        expect(impls[0]).toMatchObject({ status: 'in-development' })
      }),
    )

    it(
      'subscribes and unsubscribes; with writes, notifies after commit',
      withFixture(async ({ service, projectId, createConcept, settle }) => {
        const events: ConceptsEvent[] = []
        const off = service.subscribe(projectId, (e) => events.push(e))
        try {
          expect(typeof off).toBe('function')
          if (!createConcept) return
          await new Promise((r) => setTimeout(r, 300))
          const cid = await createConcept()
          await settle?.()
          await waitFor(() => events.some((e) => e.entityId === cid && e.type === 'concept.created'))
          const e = events.find((x) => x.entityId === cid)!
          expect(e).toMatchObject({ projectId, committedRevision: 1 })
          expect(e.eventId).toBeTruthy()
        } finally {
          off()
        }
      }),
    )
  })
}
