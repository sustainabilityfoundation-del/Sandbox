import '../../api/test/providedContext'
import { randomBytes } from 'node:crypto'
import { Writable } from 'node:stream'
import Fastify, { type FastifyInstance } from 'fastify'
import pg from 'pg'
import { inject } from 'vitest'
import { SettingsRegistry, settingsPlugin, type SettingsStore } from '@ews/settings-service'
import { dropDatabase, ensureDatabase } from '../../api/src/database'
import { prepareDatabase } from '../../api/src/server'
import { identity } from '../../api/src/platform/identity'
import { ALL_SERVER_MODULES, collectPolicyContributions } from '../../api/src/modules'
import { AI_SETTINGS_PAGE, createPolicy } from '../src/policy'
import { CredentialVault } from '../src/crypto'
import { assistantPlugin, registerOAuthCallback } from '../src/plugin'
import { ProviderRegistry } from '../src/providers/registry'
import { createFakeProvider } from '../src/providers/fake'
import { createOpenAIProvider } from '../src/providers/openai'
import type { AssistantBackend } from '../src/service'

/**
 * A disposable database with the settings and assistant plugins hosted the way services/api hosts them, the
 * fake provider registered, and every log line captured (to prove credentials never reach the log).
 */
export interface AiEnv {
  app: FastifyInstance
  pool: pg.Pool
  logs: string[]
  fake: ReturnType<typeof createFakeProvider>
  backend: () => AssistantBackend
  settings: () => SettingsStore
  call: (user: string, method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; headers: Record<string, unknown> }>
  close: () => Promise<void>
}

export async function createAiEnv(options: { openaiFetch?: typeof fetch } = {}): Promise<AiEnv> {
  const name = `ews_test_${randomBytes(5).toString('hex')}`
  const admin = inject('pgAdminUrl')
  await ensureDatabase(admin, name)
  const u = new URL(admin)
  u.pathname = `/${name}`
  const pool = new pg.Pool({ connectionString: u.toString(), max: 10 })
  await prepareDatabase(pool, { seed: true })
  const logs: string[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(String(chunk))
      cb()
    },
  })
  const app = Fastify({ logger: { level: 'trace', stream } })
  const auth = identity(pool, { production: false })
  const registry = new SettingsRegistry()
  // The policy the host builds: platform entries plus what the installed server manifests declare (module-registration.md).
  const contributions = collectPolicyContributions(ALL_SERVER_MODULES)
  const policy = createPolicy(contributions.aiModules, contributions.operations)
  registry.register(AI_SETTINGS_PAGE, policy.settingDefinitions)
  let store: SettingsStore | undefined
  await app.register(settingsPlugin, { prefix: '/api/settings/v1', pool, registry, authenticate: auth.authenticate, roleOf: auth.roleOf, onReady: (s) => (store = s) })
  const fake = createFakeProvider()
  const providers = new ProviderRegistry().register(createOpenAIProvider({ chatgptSignIn: true, fetch: options.openaiFetch })).register(fake)
  let backend: AssistantBackend | undefined
  await app.register(assistantPlugin, {
    prefix: '/api/assistant/v1',
    pool,
    vault: new CredentialVault(CredentialVault.randomKey()),
    providers,
    policy,
    publicOrigin: 'http://127.0.0.1:8801',
    fetch: options.openaiFetch,
    authenticate: auth.authenticate,
    roleOf: async (userId, projectId) => (await auth.roleOf(userId, projectId)) ?? null,
    settings: {
      effective: (userId, projectId) => store!.effective(userId, projectId),
      setConnectionReference: async (userId, projectId, reference) => {
        await store!.write('user', userId, { 'ai.connection.active': reference }, { ifMatch: undefined, actor: { userId, role: null }, projectId, owner: 'assistant' })
      },
    },
    onReady: (b) => (backend = b),
  })
  registerOAuthCallback(app, () => backend)
  await app.ready()
  return {
    app,
    pool,
    logs,
    fake,
    backend: () => backend!,
    settings: () => store!,
    async call(user, method, path, body, headers = {}) {
      const res = await app.inject({
        method: method as 'GET',
        url: path,
        headers: { ...(user ? { 'x-dev-user': user } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        payload: body === undefined ? undefined : JSON.stringify(body),
      })
      let parsed: unknown = res.body
      try {
        parsed = res.body ? JSON.parse(res.body) : undefined
      } catch {
        /* HTML */
      }
      return { status: res.statusCode, body: parsed, headers: res.headers }
    },
    async close() {
      await app.close()
      await pool.end()
      await dropDatabase(admin, name)
    },
  }
}

export const PROJECT = 'PRJ-ACT100'

/** A minimal AssistantRequest as the workspace sends it. */
export function wireRequest(text: string, tools: string[], toolResults: unknown[] = []) {
  return {
    history: [],
    turn: {
      text,
      context: { projectId: PROJECT, configurationId: 'CFG-BASE', configurationName: 'Baseline', scenarioId: 'SC-NOMINAL', scenarioName: 'Nominal', scenarios: [], modelRevision: 3, selection: [{ id: 'ROD-120', name: 'Rod', type: 'part' }], attachedSelection: true, capturedAt: new Date().toISOString() },
      toolResults,
    },
    tools: tools.map((name) => ({ name, description: `Operation ${name}`, parameters: { type: 'object', properties: {} } })),
  }
}
