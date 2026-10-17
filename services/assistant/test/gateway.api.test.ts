import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAiConfig } from '../../api/src/config'
import { PgMetering } from '../src/gateway/metering'
import { UsageLedger } from '../src/ledger'
import { createAiEnv, PROJECT, wireRequest, type AiEnv } from './env'

/**
 * Integration tier: gateway, orchestrator and developer mode on a disposable PostgreSQL (npm run ai:test:db). The provider is
 * the OpenAI adapter over a STUBBED fetch and the fake provider: no test reaches a real provider, a person's connection or the
 * ChatGPT sign-in. Brief section 17 criteria 3, 5, 6, 7, 11, 13, 17 and 14 (partial), and the fail-safe.
 */

const A = '/api/assistant/v1'
const OPENAI_KEY = 'sk-test-openai-0123456789abcdef'
const ANTHROPIC_KEY = 'sk-ant-test-0123456789abcdef'
const TOOLS = ['read_object', 'search_objects', 'propose_changes', 'read_help']
const DEV = { mode: 'development' as const, developerKeys: { openai: OPENAI_KEY, anthropic: ANTHROPIC_KEY }, allowUnverifiedPricing: true, monthlyBudgetUsd: '25' }

function sse(events: unknown[]): Response {
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** Answers OpenAI's model list and Responses calls; counts and records every call. */
function openaiStub(delayMs = 0) {
  const calls: { url: string; model?: string; authorization: string | null }[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const authorization = new Headers(init?.headers).get('authorization')
    if (u.endsWith('/models')) {
      calls.push({ url: u, authorization })
      return new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6-luna' }, { id: 'gpt-experimental' }] }), { status: 200 })
    }
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ url: u, model: body.model, authorization })
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    return sse([{ type: 'response.completed', response: { model: body.model, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Stub answer.' }] }], usage: { input_tokens: 1000, output_tokens: 500 } } }])
  }) as typeof fetch
  return { f, calls, responses: () => calls.filter((c) => c.url.endsWith('/responses')) }
}

async function setUser(env: AiEnv, user: string, values: Record<string, unknown>) {
  const v = (await env.call(user, 'GET', `/api/settings/v1/values?projectId=${PROJECT}`)).body
  const r = await env.call(user, 'PUT', `/api/settings/v1/users/me/values?projectId=${PROJECT}`, { values }, { 'if-match': v.user.etag })
  expect(r.status).toBe(200)
}

const ask = (env: AiEnv, user: string, text: string, extra: Record<string, unknown> = {}, turn: Record<string, unknown> = {}) => {
  const req = wireRequest(text, TOOLS)
  return env.call(user, 'POST', `${A}/respond`, { ...req, turn: { ...req.turn, ...turn }, ...extra })
}

const rows = async (env: AiEnv, where = 'true') => (await env.pool.query(`SELECT * FROM assistant.usage_events WHERE ${where} ORDER BY created_at, id`)).rows

describe('development mode (criteria 3, 5, 6, 7, 11, 17)', () => {
  let env: AiEnv
  const stub = openaiStub()
  beforeAll(async () => {
    env = await createAiEnv({ openaiFetch: stub.f, ai: DEV })
  })
  afterAll(async () => env?.close())

  it('criterion 3: a developer key works without signup, connection or payment, and the request is metered', async () => {
    expect((await env.call('eli', 'GET', `${A}/connection`)).body.connection).toBeNull()
    const r = await ask(env, 'eli', 'hello', {}, { conversationId: 'CONV-1' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ type: 'final', text: 'Stub answer.', meta: { provider: 'openai', routing: { source: 'developer-key', billing: 'meter_only', simulated: false, mode: 'balanced' }, cost: { currency: 'USD', verified: false, billing: 'meter_only' }, usage: { inputTokens: 1000, outputTokens: 500, reported: 'provider' } } })
    expect(r.body.meta.cost.estimated).toMatch(/^\d+\.\d{10}$/)
    expect(stub.responses().at(-1)!.authorization).toBe(`Bearer ${OPENAI_KEY}`)
    const events = await rows(env, `conversation_id = 'CONV-1'`)
    expect(events.map((e) => e.event)).toEqual(['started', 'completed'])
    expect(events[0]).toMatchObject({ source: 'developer-key', billing: 'meter_only', simulated: false, user_id: 'eli', project_id: PROJECT, operation_id: 'assistant.respond' })
    expect(Number(events[0].reserved_cost)).toBeGreaterThan(0)
    expect(events[1].credits_charged).toBeNull()
  })

  it('criterion 6: automatic modes choose among eligible models; unknown and unpriced models are not chosen', async () => {
    for (const mode of ['economy', 'balanced', 'quality']) {
      await setUser(env, 'eli', { 'ai.routing.mode': mode })
      const r = await ask(env, 'eli', 'hello')
      expect(r.body.meta.routing.mode).toBe(mode)
      expect(['gpt-6.1-sol', 'gpt-6-luna']).toContain(r.body.meta.routing.model)
      expect(r.body.meta.routing.reason).toMatch(/\w/)
    }
    await setUser(env, 'eli', { 'ai.routing.mode': null })
  })

  it('criterion 7: models the account does not offer, or that have no price, are disabled with a reason', async () => {
    const r = await env.call('eli', 'GET', `${A}/routing/options?projectId=${PROJECT}`)
    expect(r.status).toBe(200)
    const byModel = Object.fromEntries(r.body.models.map((m: { model: string }) => [m.model, m]))
    expect(byModel['gpt-6.1-sol']).toMatchObject({ available: true, automatic: true, source: 'developer-key' })
    expect(byModel['gpt-experimental']).toMatchObject({ available: false, known: false })
    expect(byModel['gpt-experimental'].reason).toMatch(/No price is known/)
    expect(r.body.models.every((m: { provider: string }) => m.provider === 'openai')).toBe(true)
  })

  it('criterion 5: Manual uses exactly the chosen model, and refuses (no fallback) one that is not usable', async () => {
    await setUser(env, 'eli', { 'ai.routing.mode': 'manual' })
    const ok = await ask(env, 'eli', 'hello', { routing: { provider: 'openai', model: 'gpt-6-luna' } })
    expect(ok.status).toBe(200)
    expect(ok.body.meta.routing).toMatchObject({ mode: 'manual', model: 'gpt-6-luna', reason: 'Manual selection.' })
    expect(stub.responses().at(-1)!.model).toBe('gpt-6-luna')
    const before = stub.responses().length
    const refused = await ask(env, 'eli', 'hello', { routing: { provider: 'openai', model: 'gpt-experimental' } })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({ code: 'model-unavailable' })
    expect(refused.body.error.message).toMatch(/does not substitute another model/)
    // Criterion 14 (partial): a provider switched off by the person is refused in Manual too, not replaced.
    await setUser(env, 'eli', { 'ai.routing.providers.openai': false })
    const off = await ask(env, 'eli', 'hello', { routing: { provider: 'openai', model: 'gpt-6-luna' } })
    expect(off.status).toBe(409)
    expect(off.body.error.message).toMatch(/switched off/)
    expect(stub.responses().length).toBe(before)
    await setUser(env, 'eli', { 'ai.routing.mode': null, 'ai.routing.providers.openai': null })
  })

  it('a project ceiling narrows the routing mode a person can pick', async () => {
    const B = '/api/settings/v1'
    const get = async (user: string) => (await env.call(user, 'GET', `${B}/values?projectId=${PROJECT}`)).body
    await setUser(env, 'eli', { 'ai.routing.mode': 'quality' })
    const set = await env.call('ada', 'PUT', `${B}/projects/${PROJECT}/values`, { values: { 'ai.routing-ceiling.mode': 'balanced', 'ai.routing-ceiling.providers.xai': false } }, { 'if-match': (await get('ada')).project.etag })
    expect(set.status).toBe(200)
    // Widening past the limit is refused; a value stored before the limit is clamped to it.
    const wider = await env.call('eli', 'PUT', `${B}/users/me/values?projectId=${PROJECT}`, { values: { 'ai.routing.mode': 'manual' } }, { 'if-match': (await get('eli')).user.etag })
    expect(wider.status).toBe(422)
    expect(wider.body.error.details.fields['ai.routing.mode']).toMatch(/project limit/)
    expect((await get('eli')).effective['ai.routing.mode']).toBe('balanced')
    expect((await ask(env, 'eli', 'hello')).body.meta.routing.mode).toBe('balanced')
    await env.call('ada', 'PUT', `${B}/projects/${PROJECT}/values`, { values: { 'ai.routing-ceiling.mode': null, 'ai.routing-ceiling.providers.xai': null } }, { 'if-match': (await get('ada')).project.etag })
    await setUser(env, 'eli', { 'ai.routing.mode': null })
  })

  it('criterion 11: usage of several requests aggregates per conversation, and by month', async () => {
    for (let i = 0; i < 3; i++) await ask(env, 'eli', `step ${i}`, {}, { conversationId: 'CONV-AGG' })
    await ask(env, 'eli', 'elsewhere', {}, { conversationId: 'CONV-OTHER' })
    const agg = await env.call('eli', 'GET', `${A}/usage?conversationId=CONV-AGG`)
    expect(agg.status).toBe(200)
    const real = agg.body.usage.filter((u: { simulated: boolean }) => !u.simulated)
    expect(real).toHaveLength(1)
    expect(real[0]).toMatchObject({ key: 'CONV-AGG', requests: 3, inputTokens: 3000, outputTokens: 1500, currency: 'USD' })
    expect(Number(real[0].estimatedProviderCost)).toBeGreaterThan(0)
    expect(agg.body.note).toMatch(/not provider invoices/)
    const month = await env.call('eli', 'GET', `${A}/usage?period=month`)
    expect(month.body.usage.some((u: { requests: number }) => u.requests >= 4)).toBe(true)
    expect(month.body.budget).toMatchObject({ limit: expect.any(String), used: expect.any(String) })
    // Another person sees none of it; an unqualified request is invalid.
    const other = await env.call('rho', 'GET', `${A}/usage?conversationId=CONV-AGG`)
    expect(other.body.usage).toEqual([])
    expect((await env.call('eli', 'GET', `${A}/usage`)).status).toBe(400)
  })

  it('reports the developer status: providers, last four characters, validation, models, mode and budget; adapter pending is never called', async () => {
    const s = await env.call('eli', 'GET', `${A}/developer/status`)
    expect(s.status).toBe(200)
    expect(s.body).toMatchObject({ mode: 'development', billing: 'meter_only', allowUnverifiedPricing: true, meteringDegraded: false, budget: { currency: 'USD', limit: '25.0000000000' } })
    const p = Object.fromEntries(s.body.providers.map((x: { provider: string }) => [x.provider, x]))
    expect(p.openai).toMatchObject({ configured: true, state: 'valid', keyLast4: OPENAI_KEY.slice(-4) })
    expect(p.openai.models.map((m: { model: string }) => m.model)).toEqual(expect.arrayContaining(['gpt-6.1-sol', 'gpt-6-luna', 'gpt-experimental']))
    expect(p.anthropic).toMatchObject({ configured: true, state: 'adapter-pending', keyLast4: ANTHROPIC_KEY.slice(-4) })
    expect(p.google).toMatchObject({ configured: false, state: 'not-configured', keyLast4: null })
    expect(stub.calls.every((c) => c.url.startsWith('https://api.openai.com/'))).toBe(true)
    expect(Number(s.body.budget.used)).toBeGreaterThan(0)
  })

  it('validates a key on request; an unknown provider is 404', async () => {
    const v = await env.call('eli', 'POST', `${A}/developer/providers/openai/validate`, {})
    expect(v.body.provider).toMatchObject({ provider: 'openai', state: 'valid' })
    expect((await env.call('eli', 'POST', `${A}/developer/providers/nonsense/validate`, {})).status).toBe(404)
    expect((await env.call('eli', 'GET', `${A}/developer/status`, undefined, {})).status).toBe(200)
  })

  it('criterion 17: no key appears in any response or in the logs', async () => {
    const outputs = [
      await env.call('eli', 'GET', `${A}/developer/status`),
      await env.call('eli', 'GET', `${A}/routing/options?projectId=${PROJECT}`),
      await env.call('eli', 'GET', `${A}/usage?period=month`),
      await env.call('eli', 'GET', `${A}/audit?limit=50`),
      await env.call('eli', 'GET', `${A}/providers`),
      await env.call('eli', 'POST', `${A}/developer/providers/openai/validate`, {}),
      await ask(env, 'eli', 'hello'),
    ]
    for (const o of outputs) {
      const text = JSON.stringify(o.body) + JSON.stringify(o.headers)
      expect(text).not.toContain(OPENAI_KEY)
      expect(text).not.toContain(ANTHROPIC_KEY)
    }
    const logs = env.logs.join('\n')
    expect(logs).not.toContain(OPENAI_KEY)
    expect(logs).not.toContain(ANTHROPIC_KEY)
    const ledger = JSON.stringify(await rows(env))
    expect(ledger).not.toContain(OPENAI_KEY)
  })
})

describe('development mode: an invalid key does not stop the server', () => {
  it('marks the account invalid and reports it; requests fall to what remains', async () => {
    const f = (async (url: string | URL | Request) => (String(url).endsWith('/models') ? new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect API key' } }), { status: 401 }) : new Response('{}', { status: 500 }))) as typeof fetch
    const env = await createAiEnv({ openaiFetch: f, ai: { ...DEV, developerKeys: { openai: 'sk-test-bad-0123456789abcdef' } } })
    try {
      const s = await env.call('eli', 'GET', `${A}/developer/status`)
      expect(s.body.providers.find((p: { provider: string }) => p.provider === 'openai')).toMatchObject({ state: 'invalid' })
      const r = await ask(env, 'eli', 'hello')
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('not-connected')
      expect(r.body.error.message).toMatch(/provider key/)
    } finally {
      await env.close()
    }
  })
})

describe('criterion 13: spending limits under concurrency', () => {
  it('concurrent requests cannot overrun the monthly budget', async () => {
    // Calibrate: the worst case reserved for one identical request.
    const calibrate = await createAiEnv({ openaiFetch: openaiStub().f, ai: DEV })
    let worst: string
    try {
      await ask(calibrate, 'eli', 'budget probe')
      worst = (await rows(calibrate, `event = 'started'`))[0].reserved_cost
    } finally {
      await calibrate.close()
    }
    const budget = (Number(worst) * 2.5).toFixed(10)
    const stub = openaiStub(500)
    const env = await createAiEnv({ openaiFetch: stub.f, ai: { ...DEV, monthlyBudgetUsd: budget } })
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => ask(env, 'eli', 'budget probe')))
      const ok = results.filter((r) => r.status === 200)
      const refused = results.filter((r) => r.status === 429)
      expect(ok.length + refused.length).toBe(8)
      expect(ok.length).toBeGreaterThanOrEqual(1)
      expect(ok.length).toBeLessThanOrEqual(2)
      expect(refused.length).toBeGreaterThanOrEqual(6)
      expect(refused[0].body.error.code).toBe('budget-exceeded')
      // Refused requests never reached the provider and left no reservation.
      expect(stub.responses()).toHaveLength(ok.length)
      expect((await rows(env, `event = 'started'`)).length).toBe(ok.length)
      const used = await env.pool.query(`SELECT COALESCE(sum(COALESCE(actual_provider_cost, estimated_provider_cost)), 0)::float AS used FROM assistant.usage_events WHERE event = 'completed'`)
      expect(used.rows[0].used).toBeLessThanOrEqual(Number(budget))
      const s = await env.call('eli', 'GET', `${A}/developer/status`)
      expect(Number(s.body.budget.reserved)).toBe(0)
    } finally {
      await env.close()
    }
  })
})

describe('criterion 13: the reservation itself is atomic', () => {
  it('under the advisory lock exactly as many reservations fit as the budget allows, however many race', async () => {
    const env = await createAiEnv({ ai: { mode: 'mock' } })
    try {
      const metering = new PgMetering(env.pool)
      const at = new Date()
      const attempt = (i: number) =>
        metering
          .begin({ idempotencyKey: `race-${i}:started`, event: 'started', requestId: `race-${i}`, operationId: 'race', provider: 'openai', model: 'gpt-6.1-sol', source: 'developer-key', billing: 'meter_only', reservedCost: '0.4000000000' }, { limit: '1', at, extraUsed: '0' })
          .then(() => 'reserved', (e) => (e.code === 'budget-exceeded' ? 'refused' : `error:${e.message}`))
      const outcomes = await Promise.all(Array.from({ length: 12 }, (_, i) => attempt(i)))
      expect(outcomes.filter((o) => o === 'reserved')).toHaveLength(2)
      expect(outcomes.filter((o) => o === 'refused')).toHaveLength(10)
      const state = await metering.state('1', at)
      expect(state).toMatchObject({ reserved: '0.8000000000', remaining: '0.2000000000' })
      // An end event releases the reservation; the actual cost counts instead.
      await metering.record({ idempotencyKey: 'race-0:completed', event: 'completed', requestId: 'race-0', operationId: 'race', provider: 'openai', model: 'gpt-6.1-sol', source: 'developer-key', billing: 'meter_only', estimatedProviderCost: '0.0100000000' })
      expect(await metering.state('1', at)).toMatchObject({ used: '0.0100000000', reserved: '0.4000000000' })
    } finally {
      await env.close()
    }
  })
})

describe('mock mode', () => {
  let env: AiEnv
  const stub = openaiStub()
  beforeAll(async () => {
    env = await createAiEnv({ openaiFetch: stub.f, ai: { mode: 'mock', allowUnverifiedPricing: true } })
  })
  afterAll(async () => env?.close())

  it('answers with simulated mock personas without any credentials, and records simulated usage', async () => {
    const r = await ask(env, 'eli', 'hello', {}, { conversationId: 'CONV-MOCK' })
    expect(r.status).toBe(200)
    expect(r.body.meta).toMatchObject({ provider: 'fake', routing: { source: 'mock', billing: 'mock', simulated: true }, cost: { billing: 'mock', estimated: '0.0000000000' } })
    const events = await rows(env, `conversation_id = 'CONV-MOCK'`)
    expect(events.every((e) => e.source === 'mock' && e.billing === 'mock' && e.simulated === true)).toBe(true)
    const usage = await env.call('eli', 'GET', `${A}/usage?conversationId=CONV-MOCK`)
    expect(usage.body.usage.every((u: { simulated: boolean }) => u.simulated)).toBe(true)
    expect((await env.call('eli', 'GET', `${A}/developer/status`)).body).toMatchObject({ mode: 'mock', providers: [], budget: null })
    expect((await env.call('eli', 'GET', `${A}/developer/status`)).body.personas.every((p: { simulated: boolean }) => p.simulated)).toBe(true)
  })

  it('ignores a stored user connection: nothing is sent to its provider, even in Manual mode', async () => {
    // A real-looking connection stored directly (connecting one through the API is refused in mock mode, see below).
    await env.backend().store.saveConnection({ userId: 'eli', provider: 'openai', method: 'api-key', accountLabel: 'OpenAI, key ending 9999', keyLast4: '9999', secret: { kind: 'api-key', apiKey: 'sk-owner-real-key-0000000000009999' }, model: 'gpt-6.1-sol' })
    const r = await ask(env, 'eli', 'hello')
    expect(r.body.meta).toMatchObject({ provider: 'fake', routing: { source: 'mock' } })
    await setUser(env, 'eli', { 'ai.routing.mode': 'manual' })
    const manual = await ask(env, 'eli', 'hello', { routing: { provider: 'openai', model: 'gpt-6.1-sol' } })
    expect(manual.status).toBe(409)
    expect(manual.body.error.code).toBe('model-unavailable')
    await setUser(env, 'eli', { 'ai.routing.mode': null })
    expect(stub.calls).toEqual([])
    expect((await rows(env, `source <> 'mock'`))).toEqual([])
  })

  it('refuses to connect a real account (nothing is validated against a provider)', async () => {
    const r = await env.call('rho', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'openai', apiKey: 'sk-owner-real-key-0000000000009999' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('mock-mode')
    expect(stub.calls).toEqual([])
    // The scripted fake connection still works (the older browser flows connect it).
    expect((await env.call('rho', 'POST', `${A}/connection/api-key?projectId=${PROJECT}`, { provider: 'fake', apiKey: 'fake-rho-key-000000' })).status).toBe(201)
  })

  it('fail-safe: a ledger outage gives 503 metering-unavailable and the provider is not called', async () => {
    const before = env.fake.calls.length
    await env.pool.query('ALTER TABLE assistant.usage_events RENAME TO usage_events_offline')
    try {
      const r = await ask(env, 'eli', 'hello')
      expect(r.status).toBe(503)
      expect(r.body.error.code).toBe('metering-unavailable')
      expect(env.fake.calls.length).toBe(before)
    } finally {
      await env.pool.query('ALTER TABLE assistant.usage_events_offline RENAME TO usage_events')
    }
    expect((await ask(env, 'eli', 'hello')).status).toBe(200)
    expect(env.fake.calls.length).toBe(before + 1)
  })
})

describe('defaults from the environment', () => {
  const store = (env: AiEnv) => env.backend().store.saveConnection({ userId: 'eli', provider: 'fake', method: 'api-key', accountLabel: 'Fake, key ending 6789', keyLast4: '6789', secret: { kind: 'api-key', apiKey: 'fake-owner-secret-0123456789' }, model: 'fake-large' })

  it('mode unset: a stored connection is used exactly as before, and metered as byok', async () => {
    const env = await createAiEnv({ ai: readAiConfig({}, false).config })
    try {
      await store(env)
      const r = await ask(env, 'eli', 'hello', {}, { conversationId: 'CONV-USER' })
      expect(r.body.meta).toMatchObject({ provider: 'fake', model: 'fake-large', routing: { source: 'user-connection', billing: 'byok', simulated: false } })
      expect((await rows(env, `conversation_id = 'CONV-USER'`)).every((e) => e.source === 'user-connection' && e.billing === 'byok')).toBe(true)
      expect(env.fake.calls.at(-1)!.credential).toMatchObject({ apiKey: 'fake-owner-secret-0123456789' })
    } finally {
      await env.close()
    }
  })

  it('fake-provider flag: a stored connection is ignored and only simulated rows are written', async () => {
    const env = await createAiEnv({ ai: readAiConfig({ EWS_ASSISTANT_FAKE_PROVIDER: '1' }, false).config })
    try {
      await store(env)
      const r = await ask(env, 'eli', 'hello')
      expect(r.body.meta.routing).toMatchObject({ source: 'mock', simulated: true })
      expect(env.fake.calls.at(-1)!.credential).not.toMatchObject({ apiKey: 'fake-owner-secret-0123456789' })
      expect((await rows(env, `source <> 'mock' OR simulated = false`))).toEqual([])
    } finally {
      await env.close()
    }
  })
})

describe('user mode and the context hooks', () => {
  let env: AiEnv
  beforeAll(async () => {
    env = await createAiEnv()
  })
  afterAll(async () => env?.close())

  it('developer endpoints are not available outside developer and mock modes', async () => {
    expect((await env.call('eli', 'GET', `${A}/developer/status`)).status).toBe(404)
    expect((await env.call('eli', 'POST', `${A}/developer/providers/openai/validate`, {})).status).toBe(404)
  })

  it('a ChatGPT plan connection is used in Manual mode only', async () => {
    await env.backend().store.saveConnection({ userId: 'eli', provider: 'openai', method: 'chatgpt', accountLabel: 'ChatGPT account (test)', secret: { kind: 'oauth', accessToken: 'test-token', refreshToken: 'test-refresh' }, accessExpiresAt: new Date(Date.now() + 3600_000), model: 'gpt-6.1-sol' })
    // Automatic: refused with an explanation, the provider is not called.
    const auto = await ask(env, 'eli', 'hello')
    expect(auto.status).toBe(409)
    expect(auto.body.error.code).toBe('no-model-available')
    expect(auto.body.error.message).toMatch(/Manual mode only/)
    await env.pool.query('DELETE FROM assistant.connections')
  })

  it('migration 0004 adds context_id to the ledger and to proposals; the ledger round-trips it', async () => {
    const cols = await env.pool.query(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'assistant' AND column_name = 'context_id' ORDER BY table_name`)
    expect(cols.rows.map((r) => r.table_name)).toEqual(['proposals', 'usage_events'])
    const ledger = new UsageLedger(env.pool)
    const { event } = await ledger.record({ idempotencyKey: 'ctx-1', event: 'completed', requestId: 'r-ctx', operationId: 'op', provider: 'fake', model: 'fake-small', source: 'mock', billing: 'mock', contextId: 'CTX-0001' })
    expect(event.contextId).toBe('CTX-0001')
    expect((await ledger.get('ctx-1'))?.contextId).toBe('CTX-0001')
    // Insert-only still holds after the migration.
    await expect(env.pool.query(`UPDATE assistant.usage_events SET context_id = 'x' WHERE idempotency_key = 'ctx-1'`)).rejects.toThrow(/insert-only/)
  })
})
