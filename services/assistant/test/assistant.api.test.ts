import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAiEnv, PROJECT, wireRequest, type AiEnv } from './env'

/**
 * Assistant API on a disposable PostgreSQL with the FAKE provider (npm run req:test:db). No test calls a
 * real provider; see live.test.ts for the opt-in smoke test.
 */

let env: AiEnv
const A = '/api/assistant/v1'
const FAKE_KEY = 'fake-owner-secret-0123456789'
const TOOLS = ['read_object', 'search_objects', 'propose_changes', 'read_help', 'requirements.search', 'requirements.update', 'conceptualize.read', 'conceptualize.create', 'cad-modeler.export']

beforeAll(async () => {
  env = await createAiEnv({ ai: { mode: 'user' } })
})
afterAll(async () => env?.close())

async function setUser(user: string, values: Record<string, unknown>) {
  const v = (await env.call(user, 'GET', `/api/settings/v1/values?projectId=${PROJECT}`)).body
  const r = await env.call(user, 'PUT', `/api/settings/v1/users/me/values?projectId=${PROJECT}`, { values }, { 'if-match': v.user.etag })
  expect(r.status).toBe(200)
}

const respond = (user: string, body: unknown) => env.call(user, 'POST', `${A}/respond`, body)

describe('connections', () => {
  it('lists providers generically, including a second (fake) provider', async () => {
    const r = await env.call('eli', 'GET', `${A}/providers`)
    expect(r.body.providers.map((p: { id: string }) => p.id)).toEqual(['openai', 'fake'])
    const openai = r.body.providers[0]
    expect(openai.defaultModel).toBe('gpt-6.1-sol')
    expect(openai.methods.map((m: { id: string; kind: string }) => `${m.id}:${m.kind}`)).toEqual(['chatgpt:oauth', 'api-key:api-key'])
    expect(openai.methods[0]).toMatchObject({ buttonLabel: 'Continue with ChatGPT', available: true })
    expect(JSON.stringify(r.body)).not.toMatch(/dynamic_agent_client|tokenEndpoint/)
  })

  it('refuses an invalid key and stores nothing', async () => {
    const bad = await env.call('eli', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'fake', apiKey: 'fake-invalid-key-123' })
    expect(bad.status).toBe(422)
    expect(bad.body.error.message).toMatch(/Nothing was stored/)
    expect(JSON.stringify(bad.body)).not.toContain('fake-invalid-key-123')
    expect((await env.call('eli', 'GET', `${A}/connection`)).body.connection).toBeNull()
    expect((await env.call('eli', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'openai', apiKey: 'not a key' })).status).toBe(422)
  })

  it('connects with a validated key, never returns or logs it, and stores it encrypted', async () => {
    const r = await env.call('eli', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'fake', apiKey: FAKE_KEY })
    expect(r.status).toBe(201)
    expect(r.body.connection).toMatchObject({ provider: 'fake', method: 'api-key', keyLast4: '6789', model: 'fake-small', status: 'active' })
    expect(r.body.connection.account).toMatch(/key ending 6789/)
    const status = await env.call('eli', 'GET', `${A}/connection`)
    expect(JSON.stringify(status.body)).not.toContain(FAKE_KEY)
    const { rows } = await env.pool.query('SELECT * FROM assistant.connections')
    expect(JSON.stringify(rows)).not.toContain(FAKE_KEY)
    expect(Buffer.from(rows[0].secret_ciphertext).toString('latin1')).not.toContain(FAKE_KEY)
    const settings = (await env.call('eli', 'GET', `/api/settings/v1/values?projectId=${PROJECT}`)).body
    expect(settings.user.values['ai.connection.active']).toBe(`assistant:${rows[0].id}`)
    expect(env.logs.join('\n')).not.toContain(FAKE_KEY)
    expect(env.logs.join('\n')).not.toContain('owner-secret')
  })

  it('lists models, changes the model and tests the connection', async () => {
    expect((await env.call('eli', 'GET', `${A}/connection/models`)).body.models.map((m: { id: string }) => m.id)).toEqual(['fake-small', 'fake-large'])
    expect((await env.call('eli', 'PUT', `${A}/connection/model`, { model: 'fake-large' })).body.connection.model).toBe('fake-large')
    expect((await env.call('eli', 'PUT', `${A}/connection/model`, { model: 'gpt-imaginary' })).status).toBe(422)
    expect((await env.call('eli', 'POST', `${A}/connection/test`)).body).toMatchObject({ ok: true, models: 2 })
  })

  it('explains that nothing is connected', async () => {
    const r = await respond('rui', wireRequest('hello', TOOLS))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('not-connected')
  })
})

describe('respond: server-enforced access policy', () => {
  it('answers through the second provider without any workspace change', async () => {
    const r = await respond('eli', wireRequest('hello', TOOLS))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ type: 'final', meta: { provider: 'fake', model: 'fake-large' } })
    // Entitlements of eli (server-side): requirements, sysml, cad, conceptualize.
    expect(env.fake.calls.at(-1)!.tools.map((t) => t.name)).toEqual(TOOLS)
  })

  it('a proposal from a model tool call is a signed call the browser executes as a preview; the result loop completes', async () => {
    const first = await respond('eli', wireRequest('Set REQ-003 status to approved', TOOLS))
    expect(first.body.type).toBe('tool_calls')
    const call = first.body.calls[0]
    expect(call.name).toBe('propose_changes')
    expect(call.id).toMatch(/^fake_call_\d+~[A-Za-z0-9_-]{22}$/)
    const result = { callId: call.id, name: call.name, arguments: call.arguments, ok: true, data: { proposalId: 'CP-1', status: 'awaiting user review' } }
    const second = await respond('eli', wireRequest('Set REQ-003 status to approved', TOOLS, [result]))
    expect(second.body).toMatchObject({ type: 'final' })
    expect(second.body.text).toMatch(/CP-1.*Apply/)
    // A result the server did not issue (changed arguments) is refused.
    const forged = await respond('eli', wireRequest('Set REQ-003 status to approved', TOOLS, [{ ...result, arguments: { title: 'x' } }]))
    expect(forged.status).toBe(403)
    expect(forged.body.error.code).toBe('forged-tool-result')
  })

  it('with a module off its tools are not sent and a forged call for it is refused', async () => {
    await setUser('eli', { 'ai.access.requirements': 'off' })
    const r = await respond('eli', wireRequest('forge requirements.update', TOOLS))
    const sent = env.fake.calls.at(-1)!.tools.map((t) => t.name)
    expect(sent.some((n) => n.startsWith('requirements.'))).toBe(false)
    expect(r.body.type).toBe('final')
    expect(r.body.meta.refused[0]).toMatchObject({ name: 'requirements.update' })
    expect(r.body.text).not.toContain('Forged call result: {"ok":true')
    const audit = (await env.call('eli', 'GET', `${A}/audit?limit=1`)).body.records[0]
    expect(audit.toolsRefused).toContain('requirements.update')
  })

  it('with read only a propose call is refused, reads stay available', async () => {
    await setUser('eli', { 'ai.access.requirements': 'propose', 'ai.access.conceptualize': 'read' })
    await respond('eli', wireRequest('forge conceptualize.create', TOOLS))
    const sent = env.fake.calls.at(-2)!.tools.map((t) => t.name)
    expect(sent).toContain('conceptualize.read')
    expect(sent).not.toContain('conceptualize.create')
    expect(env.fake.calls.at(-1)!.messages.at(-1)).toMatchObject({ type: 'tool_result', name: 'conceptualize.create' })
    expect((env.fake.calls.at(-1)!.messages.at(-1) as { output: string }).output).toMatch(/Refused by the platform/)
  })

  it('refuses operations outside the server-side subscription even if the browser offers them', async () => {
    await env.call('rho', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'fake', apiKey: 'fake-rho-key-000000' })
    // rho (reader) is entitled to tool:requirements and tool:conceptualize only.
    const r = await respond('rho', wireRequest('forge cad-modeler.export', TOOLS))
    expect(env.fake.calls.at(-2)!.tools.map((t) => t.name)).not.toContain('cad-modeler.export')
    expect(r.body.meta.refused[0].reason).toMatch(/subscription/)
  })

  it('applies data sharing to what is sent and shows it in the preview', async () => {
    await setUser('eli', { 'ai.sharing.selection': false, 'ai.access.conceptualize': null })
    const preview = await env.call('eli', 'POST', `${A}/preview`, wireRequest('What applies?', TOOLS))
    expect(preview.status).toBe(200)
    expect(preview.body.messages.at(-1).text).toContain('[not shared]')
    expect(preview.body.messages.at(-1).text).not.toContain('ROD-120')
    expect(preview.body.tools).toContain('read_object')
    expect(preview.body.removedTools).toEqual([])
    await respond('eli', wireRequest('hello', TOOLS))
    expect(JSON.stringify(env.fake.calls.at(-1)!.messages)).not.toContain('ROD-120')
    await setUser('eli', { 'ai.sharing.selection': null })
  })

  it('maps provider errors to clear messages and records them', async () => {
    const r = await respond('eli', wireRequest('simulate rate limit', TOOLS))
    expect(r.status).toBe(429)
    expect(r.body.error).toMatchObject({ code: 'provider-rate-limit' })
    expect(r.body.error.message).toMatch(/rate-limiting/)
    const down = await respond('eli', wireRequest('simulate outage', TOOLS))
    expect(down.status).toBe(502)
    const audit = (await env.call('eli', 'GET', `${A}/audit?limit=2`)).body.records
    expect(audit.map((a: { outcome: string }) => a.outcome)).toEqual(['error', 'error'])
  })

  it('stops a call at the request timeout', async () => {
    await setUser('eli', { 'ai.limits.timeout': 10 })
    const started = Date.now()
    const r = await respond('eli', wireRequest('simulate timeout', TOOLS))
    expect(r.status).toBe(504)
    expect(r.body.error.code).toBe('provider-timeout')
    expect(Date.now() - started).toBeLessThan(20_000)
    await setUser('eli', { 'ai.limits.timeout': null })
  }, 30_000)

  it('audits calls without credentials or prompts unless prompt storage is on', async () => {
    const records = (await env.call('eli', 'GET', `${A}/audit?limit=50`)).body.records
    expect(records.length).toBeGreaterThan(4)
    expect(records[records.length - 1]).toMatchObject({ provider: 'fake', promptStored: false })
    const { rows } = await env.pool.query('SELECT count(*)::int AS n FROM assistant.audit WHERE prompt IS NOT NULL')
    expect(rows[0].n).toBe(0)
    await setUser('eli', { 'ai.audit.store-prompts': true })
    await respond('eli', wireRequest('hello', TOOLS))
    const stored = await env.pool.query('SELECT prompt FROM assistant.audit WHERE prompt IS NOT NULL')
    expect(stored.rows).toHaveLength(1)
    expect(JSON.stringify(stored.rows[0])).not.toContain(FAKE_KEY)
    await setUser('eli', { 'ai.audit.store-prompts': null })
  })
})

describe('sign-in and disconnect', () => {
  it('starts Sign in with ChatGPT with server-held PKCE state, and rejects unknown callbacks', async () => {
    const r = await env.call('eli', 'POST', `${A}/connection/oauth/start?projectId=${PROJECT}`, { provider: 'openai', method: 'chatgpt', returnTo: 'http://localhost:5202/workspace/' })
    expect(r.status).toBe(200)
    const url = new URL(r.body.authorizationUrl)
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8801/auth/callback')
    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client')
    const { rows } = await env.pool.query('SELECT state, return_to FROM assistant.oauth_attempts')
    expect(rows[0].state).toBe(url.searchParams.get('state'))
    expect(JSON.stringify(rows)).not.toContain(url.searchParams.get('code_challenge')!)
    const page = await env.call('', 'GET', '/auth/callback?state=unknown&code=x')
    expect(page.status).toBe(200)
    expect(String(page.body)).toMatch(/expired or was already used/)
    const evil = await env.call('eli', 'POST', `${A}/connection/oauth/start?projectId=${PROJECT}`, { provider: 'openai', method: 'chatgpt', returnTo: 'https://evil.example/workspace' })
    const evilState = new URL(evil.body.authorizationUrl).searchParams.get('state')
    const attempt = await env.pool.query('SELECT return_to FROM assistant.oauth_attempts WHERE state = $1', [evilState])
    expect(attempt.rows[0].return_to).toMatch(/^http:\/\/localhost:5173\/workspace/)
    const cancelled = await env.call('', 'GET', `/auth/callback?state=${evilState}&error=access_denied`)
    expect(String(cancelled.body)).toMatch(/cancelled/)
  })

  it('disconnects: deletes the credential and the settings reference', async () => {
    const r = await env.call('eli', 'DELETE', `${A}/connection?projectId=${PROJECT}`)
    expect(r.body).toEqual({ disconnected: true })
    expect((await env.call('eli', 'GET', `${A}/connection`)).body.connection).toBeNull()
    expect((await env.pool.query("SELECT count(*)::int AS n FROM assistant.connections WHERE user_id = 'eli'")).rows[0].n).toBe(0)
    const settings = (await env.call('eli', 'GET', `/api/settings/v1/values?projectId=${PROJECT}`)).body
    expect(settings.user.values['ai.connection.active']).toBeUndefined()
    expect((await respond('eli', wireRequest('hello', TOOLS))).status).toBe(409)
  })

  it('serves an OpenAPI 3.1 document', async () => {
    const doc = await env.call('', 'GET', `${A}/openapi.json`)
    expect(doc.body.openapi).toBe('3.1.0')
    expect(Object.keys(doc.body.paths)).toContain('/respond')
  })
})
