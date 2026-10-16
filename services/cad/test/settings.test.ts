import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'

/** The API host registers the CAD Modeler settings, so the settings service accepts and validates them. */

let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

describe('CAD Modeler settings on the settings service', () => {
  it('lists the CAD page and definitions, stores valid values and refuses invalid ones', async () => {
    const defs = await env.call('eli', 'GET', '/api/settings/v1/definitions')
    expect(defs.status).toBe(200)
    expect(defs.body.pages).toContainEqual(expect.objectContaining({ id: 'cad-modeler', title: 'CAD Modeler' }))
    expect(defs.body.definitions.filter((d: { pageId: string }) => d.pageId === 'cad-modeler').map((d: { id: string }) => d.id)).toEqual([
      'cad-modeler.units.measurements',
      'cad-modeler.display.mesh-tolerance',
      'cad-modeler.view.orientation',
      'cad-modeler.view.show-edges',
    ])
    const path = '/api/settings/v1/users/me/values?projectId=PRJ-ACT100'
    const etag = async () => (await env.call('eli', 'GET', '/api/settings/v1/values?projectId=PRJ-ACT100')).body.user.etag as string
    const bad = await env.call('eli', 'PUT', path, { values: { 'cad-modeler.display.mesh-tolerance': 5 } }, { 'if-match': await etag() })
    expect(bad.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(bad.body)).toMatch(/between 0.01 and 1 mm/)
    const ok = await env.call('eli', 'PUT', path, { values: { 'cad-modeler.units.measurements': 'in', 'cad-modeler.view.show-edges': false } }, { 'if-match': await etag() })
    expect(ok.status).toBe(200)
    const read = await env.call('eli', 'GET', '/api/settings/v1/values?projectId=PRJ-ACT100')
    expect(JSON.stringify(read.body.user)).toContain('"cad-modeler.units.measurements":"in"')
  })
})
