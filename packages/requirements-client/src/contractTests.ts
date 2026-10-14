import { describe, expect, it } from 'vitest'
import { RequirementsServiceError, type RequirementsEvent, type RequirementsService } from '@ews/platform-sdk'

/**
 * Reusable contract test suite for any SDK `RequirementsService` adapter (HTTP, demo, or a host's
 * own). Import from '@ews/requirements-client/contract-tests' in a Vitest file:
 *
 *   defineRequirementsServiceContract('my adapter', async () => ({ service, projectId: 'PRJ-ACT100' }))
 *
 * The fixture must contain the sample project (REQ-001…REQ-003 with their agreed UUIDs, REQ-001
 * allocated to ROD-120) and allow writes. Each test may create requirements.
 */
export interface ContractFixture {
  service: RequirementsService
  projectId: string
  /** A baseline ID of the project that pins REQ-001, if the adapter supports baselines. */
  baselineId?: string
  /** Waits until committed events have been delivered (e.g. flushes an outbox). */
  settle?: () => Promise<void>
  cleanup?: () => Promise<void>
}

export const REQ_001 = '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001'
export const REQ_002 = '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002'

const key = () => `contract-${Date.now()}-${Math.random().toString(16).slice(2)}`

async function waitFor(cond: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('Timed out waiting for an event')
    await new Promise((r) => setTimeout(r, 25))
  }
}

export function defineRequirementsServiceContract(name: string, setup: () => Promise<ContractFixture>) {
  describe(`RequirementsService contract: ${name}`, () => {
    const withFixture = (fn: (f: ContractFixture) => Promise<void>) => async () => {
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
      'resolves legacy twin IDs and keys to the canonical UUID',
      withFixture(async ({ service, projectId }) => {
        const r = await service.resolve('REQ-001', { projectId })
        expect(r?.id).toBe(REQ_001)
        expect(r?.key).toBe('REQ-001')
        expect(await service.resolve('REQ-DOES-NOT-EXIST', { projectId })).toBeUndefined()
      }),
    )

    it(
      'reads by canonical ID; unknown IDs are undefined, not errors',
      withFixture(async ({ service, projectId }) => {
        const r = await service.get(REQ_001, { projectId })
        expect(r).toMatchObject({ id: REQ_001, projectId, title: 'Operating load' })
        expect(r!.revision).toBeGreaterThanOrEqual(1)
        expect(r!.statement).not.toContain('Peak press-fit force') // normative text only, rationale separate
        expect(await service.get('00000000-0000-4000-8000-000000000000', { projectId })).toBeUndefined()
      }),
    )

    it(
      'lists with stable cursor pagination',
      withFixture(async ({ service, projectId }) => {
        const first = await service.list({ projectId, limit: 2 })
        expect(first.items).toHaveLength(2)
        expect(first.nextCursor).toBeTruthy()
        const second = await service.list({ projectId, limit: 2, cursor: first.nextCursor })
        const ids = [...first.items, ...second.items].map((r) => r.id)
        expect(new Set(ids).size).toBe(4)
        const filtered = await service.list({ projectId, keys: ['REQ-002'] })
        expect(filtered.items.map((r) => r.id)).toEqual([REQ_002])
        await expect(service.list({ projectId, limit: 500 })).rejects.toBeInstanceOf(RequirementsServiceError)
      }),
    )

    it(
      'creates with an idempotency key: a retry returns the same requirement',
      withFixture(async ({ service, projectId }) => {
        const k = key()
        const input = { projectId, title: 'Contract create', statement: 'The system shall be created once.', type: 'functional' }
        const a = await service.create(input, { idempotencyKey: k })
        const b = await service.create(input, { idempotencyKey: k })
        expect(b.id).toBe(a.id)
        expect(a).toMatchObject({ revision: 1, status: 'draft', archived: false })
        expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
      }),
    )

    it(
      'rejects invalid input with field details',
      withFixture(async ({ service, projectId }) => {
        const err = await service.create({ projectId, title: '', statement: 'x', type: 'functional' }, { idempotencyKey: key() }).catch((e) => e)
        expect(err).toBeInstanceOf(RequirementsServiceError)
        expect(err.code).toBe('invalid')
      }),
    )

    it(
      'updates with optimistic concurrency and never overwrites newer changes',
      withFixture(async ({ service, projectId }) => {
        const r = await service.create({ projectId, title: 'Contract update', statement: 'The system shall be updated.', type: 'functional' }, { idempotencyKey: key() })
        const u = await service.update(r.id, { statement: 'The system shall be updated once.' }, { expectedRevision: r.revision, reason: 'contract test' })
        expect(u.revision).toBe(r.revision + 1)
        const stale = await service.update(r.id, { statement: 'Stale overwrite.' }, { expectedRevision: r.revision }).catch((e) => e)
        expect(stale).toBeInstanceOf(RequirementsServiceError)
        expect(stale.code).toBe('conflict')
        expect(stale.details?.currentRevision).toBe(u.revision)
        expect((await service.get(r.id, { projectId }))!.statement).toBe('The system shall be updated once.')
        // Exact revisions stay readable.
        expect((await service.get(r.id, { projectId, revision: r.revision }))!.statement).toBe('The system shall be updated.')
      }),
    )

    it(
      'returns requirement-owned trace links with direction',
      withFixture(async ({ service, projectId }) => {
        const links = await service.traceLinks(REQ_001, { projectId })
        expect(links.find((l) => l.type === 'allocated-to' && l.to === 'ROD-120')).toMatchObject({ from: REQ_001, ownerModule: 'requirements' })
      }),
    )

    it(
      'notifies subscribers after committed changes (dedupe by eventId)',
      withFixture(async ({ service, projectId, settle }) => {
        const events: RequirementsEvent[] = []
        const off = service.subscribe(projectId, (e) => events.push(e))
        try {
          await new Promise((r) => setTimeout(r, 300)) // let an HTTP stream connect
          const r = await service.create({ projectId, title: 'Contract event', statement: 'The system shall notify.', type: 'functional' }, { idempotencyKey: key() })
          await settle?.()
          await waitFor(() => events.some((e) => e.entityId === r.id && e.type === 'requirement.created'))
          const e = events.find((x) => x.entityId === r.id)!
          expect(e).toMatchObject({ projectId, committedRevision: 1 })
          expect(e.eventId).toBeTruthy()
          expect(new Date(e.occurredAt).toISOString()).toBe(e.occurredAt)
        } finally {
          off()
        }
      }),
    )

    it(
      'reads pinned revisions from a baseline when supported',
      withFixture(async ({ service, projectId, baselineId }) => {
        if (!baselineId) {
          await expect(service.get(REQ_001, { projectId, baselineId: '00000000-0000-4000-8000-000000000001' })).rejects.toBeInstanceOf(RequirementsServiceError)
          return
        }
        const pinned = await service.get(REQ_001, { projectId, baselineId })
        expect(pinned?.id).toBe(REQ_001)
        const page = await service.list({ projectId, baselineId, keys: ['REQ-001'] })
        expect(page.items[0]?.revision).toBe(pinned?.revision)
      }),
    )
  })
}
