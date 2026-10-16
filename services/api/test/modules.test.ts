import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INSTALLED_SERVER_MODULES } from '../src/modules'
import { createTestEnv, type TestEnv } from './helpers'

/** Server module registration (docs/specifications/module-registration.md, I3) on the real host. */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

describe('server module manifests', () => {
  it('register in the original plugin order: modules, then projects, settings and assistant, then visualization', () => {
    expect(env.server.registrationOrder).toEqual(['requirements', 'conceptualize', 'sysml-modeler', 'cad-modeler', 'projects', 'settings', 'assistant', 'visualization'])
  })

  for (const m of INSTALLED_SERVER_MODULES) {
    it(`${m.id}: ${m.basePath} serves /openapi.json`, async () => {
      const res = await env.call('ada', 'GET', `${m.basePath}/openapi.json`)
      expect(res.status).toBe(200)
      expect(res.body.openapi).toMatch(/^3\./)
      expect(Object.keys(res.body.paths ?? {}).length).toBeGreaterThan(0)
    })

    if (m.docs) {
      it(`${m.id}: ${m.basePath}/docs is served`, async () => {
        const res = await env.call('ada', 'GET', `${m.basePath}/docs`)
        expect(res.status).toBe(200)
      })
    }
  }
})
