import { RequirementsServiceError } from '@ews/platform-sdk'
import { describe, expect, it } from 'vitest'
import { createHttpRequirementsService } from './adapters'

const REQ = {
  id: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', key: 'REQ-001', projectId: 'PRJ-ACT100', revision: 2, title: 't', statement: 's', type: 'functional', status: 'draft', archived: false,
  applicability: [], verificationMethods: [], updatedAt: '2026-10-14T00:00:00.000Z',
}

function fakeFetch(responder: (url: string, init: RequestInit) => Response) {
  const calls: { method: string; url: string }[] = []
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ method: init.method ?? 'GET', url })
    return responder(url, init)
  }) as typeof fetch
  return { f, calls }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ETag: '"2"' } })

describe('HTTP adapter (SDK 1.3)', () => {
  it('update() with projectId makes no project lookup request', async () => {
    const { f, calls } = fakeFetch(() => json({ ...REQ, revision: 3 }))
    const service = createHttpRequirementsService({ baseUrl: 'http://api.test/api/requirements/v1', fetch: f })
    const r = await service.update(REQ.id, { statement: 'x' }, { expectedRevision: 2, projectId: 'PRJ-ACT100' })
    expect(r.revision).toBe(3)
    expect(calls).toEqual([{ method: 'PATCH', url: `http://api.test/api/requirements/v1/projects/PRJ-ACT100/requirements/${REQ.id}` }])
  })

  it('update() without projectId looks the project up once (project-free read), then patches', async () => {
    const { f, calls } = fakeFetch((_url, init) => (init.method === 'PATCH' ? json({ ...REQ, revision: 3 }) : json(REQ)))
    const service = createHttpRequirementsService({ baseUrl: 'http://api.test/api/requirements/v1', fetch: f })
    await service.update(REQ.id, { statement: 'x' }, { expectedRevision: 2 })
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PATCH'])
    expect(calls[0].url).toBe(`http://api.test/api/requirements/v1/requirements/${REQ.id}`)
  })

  it('maps an internal error body to RequirementsServiceError, keeping code, message and details', async () => {
    const body = { error: { code: 'unavailable', message: 'Internal error (reference abc). The request was not completed; a write was rolled back.', details: { reason: 'internal-error', errorId: 'abc' } } }
    const { f } = fakeFetch(() => json(body, 500))
    const service = createHttpRequirementsService({ baseUrl: 'http://api.test/api/requirements/v1', fetch: f })
    const err = await service.list({ projectId: 'PRJ-ACT100' }).catch((e) => e)
    expect(err).toBeInstanceOf(RequirementsServiceError)
    expect(err.code).toBe('unavailable')
    expect(err.message).toBe(body.error.message)
    expect(err.status).toBe(500)
    expect(err.rawDetails).toEqual({ reason: 'internal-error', errorId: 'abc' })
  })
})
