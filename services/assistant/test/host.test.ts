import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'

/** The API host mounts the settings and assistant APIs with their references (npm run req:test:db). */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

describe('API host', () => {
  it('mounts settings and assistant with OpenAPI and reference pages; the fake provider only in mock mode (the test environments set it)', async () => {
    expect((await env.call('eli', 'GET', '/api/settings/v1/definitions')).body.pages[0].id).toBe('ai')
    const providers = (await env.call('eli', 'GET', '/api/assistant/v1/providers')).body.providers
    expect(providers.map((p: { id: string }) => p.id)).toEqual(['openai', 'fake'])
    // No loopback origin configured in tests: only the API key method is offered.
    expect(providers[0].methods.map((m: { id: string }) => m.id)).toEqual(['api-key'])
    for (const base of ['/api/settings/v1', '/api/assistant/v1']) {
      expect((await env.call('', 'GET', `${base}/openapi.json`)).body.openapi).toBe('3.1.0')
      expect((await env.call('', 'GET', `${base}/docs`)).status).toBe(200)
    }
    expect(env.server.assistant()).toBeDefined()
  })
})
