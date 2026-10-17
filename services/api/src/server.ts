import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import {
  createEventHub,
  errorBody,
  migrateRequirements,
  seedRequirements,
  type EventHub,
  type ObjectStorage,
  type SysmlElementDirectory,
  type TwinDirectory,
} from '@ews/requirements-service'
import { createConceptsEventHub, migrateConcepts, seedConcepts, type ConceptsEventHub } from '@ews/conceptualize-service'
import { identity, migratePlatform, registerPlatformRoutes, seedPlatform } from './platform/identity'
import { registerApiDocs } from './apiDocs'
import type { ArtifactSource } from '@ews/platform-sdk'
import {
  PROJECTS_BASE_PATH,
  PROJECT_SETTINGS_PAGE,
  PROJECT_SETTING_DEFINITIONS,
  createProjectsEventHub,
  importLegacyProduct,
  memoryBlobStore,
  migrateProjects,
  moduleEnablementDefinitions,
  projectState,
  projectsPlugin,
  projectsServerManifest,
  seedLegacyProject,
  type BlobStore,
  type ProjectSettingsPort,
  type ProjectsEventHub,
  type ProvisioningModule,
} from '@ews/projects-service'
import { platformMemberships } from './platform/memberships'
import { SETTINGS_BASE_PATH, SettingsRegistry, settingsPlugin, type SettingsStore } from '@ews/settings-service'
import type { AdapterRegistry as VisualizationAdapters } from '@ews/visualization-service'
import { AI_SETTINGS_PAGE, ASSISTANT_BASE_PATH, CredentialVault, ProviderRegistry, assistantPlugin, createFakeProvider, createOpenAIProvider, createPolicy, registerOAuthCallback, type AiRuntimeConfig, type AssistantBackend } from '@ews/assistant-service'
import { ALL_SERVER_MODULES, INSTALLED_SERVER_MODULES, assertUniqueManifests, collectPolicyContributions, type ApiModuleHost } from './modules'
import { SAMPLE_TWIN } from './sampleTwin'
import { readAiConfig } from './config'

export { SAMPLE_TWIN }

export interface ServerOptions {
  pool: Pool
  storage: ObjectStorage
  production?: boolean
  twin?: TwinDirectory
  /** System Model elements as allocation targets (default: the in-process SysML service). */
  sysml?: SysmlElementDirectory
  logger?: boolean
  eventPollMs?: number
  /** Official ReqIF schemas for validation (npm run req:reqif:schemas). */
  reqifSchemaDir?: string
  /** Retention of delivered events (hours, default 168). */
  outboxRetentionHours?: number
  /** Project Management blob store (documents, attachments); default in-memory (tests). main.ts passes the local store. */
  blobs?: BlobStore
  /** AI connection (docs/specifications/ai-connection.md): credential key, loopback origin, providers. */
  assistant?: {
    /** 32-byte key for credentials at rest (EWS_ASSISTANT_KEY). Without it outside production a random per-process key is used; in production the assistant is not started. */
    key?: Buffer
    /** Origin at which the person's browser reaches this API directly, e.g. http://127.0.0.1:8801 (OAuth loopback redirect). */
    publicOrigin?: string
    /** Register the scripted fake provider (tests and development browser flows; never in production). */
    fakeProvider?: boolean
    /**
     * AI runtime from `readAiConfig` (ADR-0080): mode (mock, development, user), developer keys, budget. Default: `user`
     * (people's own connections only). Never honoured in production except `user`.
     */
    ai?: Partial<AiRuntimeConfig>
    /** Replace the provider registry (tests). */
    providers?: ProviderRegistry
    fetch?: typeof fetch
  }
  /** Image generation for concept visuals (docs/specifications/concept-visualization-contracts.md §1). */
  visualization?: {
    /** Register the fake test image adapter (development and tests; never in production). Default: assistant.fakeProvider. */
    fakeAdapter?: boolean
    /** Replace the adapter registry (tests). */
    adapters?: VisualizationAdapters
    /** fetch for the OpenAI image adapter (tests stub it; never a real provider in tests). */
    fetch?: typeof fetch
    runner?: { concurrency?: number; pollMs?: number; staleAfterMs?: number }
  }
}

export interface ApiServer {
  app: FastifyInstance
  /** IDs of the plugins and modules in the order the host registered them (a test asserts it). */
  registrationOrder: string[]
  events: EventHub
  /** Conceptualize outbox (its own schema and publisher). */
  conceptEvents: ConceptsEventHub
  /** Project Management outbox (schema projects). */
  projectEvents: ProjectsEventHub
  /** Project Management blob store (documents, attachments). */
  projectBlobs: BlobStore
  /** Artifact registry consumer (tests wait for it with idle()). */
  projectsRegistry: () => { idle: () => Promise<void>; reconcile: (projectId: string) => Promise<unknown> } | undefined
  /** The assistant backend (server-side callers such as the design reasoning model gateway use it). */
  assistant: () => AssistantBackend | undefined
  close: () => Promise<void>
}

export async function prepareDatabase(pool: Pool, opts: { seed: boolean; twin?: TwinDirectory }) {
  const platform = await migratePlatform(pool)
  const requirements = await migrateRequirements(pool)
  const concepts = await migrateConcepts(pool)
  // Project Management (docs/specifications/project-management-contracts.md): schema projects.
  const projects = await migrateProjects(pool)
  let seed: { seeded: boolean; message: string } | undefined
  if (opts.seed) {
    await seedPlatform(pool)
    // Development users seeded after the platform migrations get tool:conceptualize here
    // (contracts §6; integration need: add it to DEV_USERS instead).
    await pool.query(`INSERT INTO platform.entitlements (user_id, entitlement) SELECT id, 'tool:conceptualize' FROM platform.users WHERE id IN ('ada', 'rui', 'eli', 'rho') ON CONFLICT DO NOTHING`)
    seed = await seedRequirements(pool, opts.twin ?? SAMPLE_TWIN)
    const conceptSeed = await seedConcepts(pool)
    seed = { seeded: seed.seeded || conceptSeed.seeded, message: `${seed.message} ${conceptSeed.message}` }
    // Registers the existing example project PRJ-ACT100 in the project registry (idempotent; Q3).
    const legacy = await seedLegacyProject(pool)
    // Its components become product elements with their twin IDs as aliases (C2, ADR-0063; additive, idempotent).
    const legacyProduct = await importLegacyProduct(pool, { memberships: platformMemberships(), blobs: memoryBlobStore() })
    seed = { seeded: seed.seeded || legacy.seeded || legacyProduct.seeded, message: `${seed.message} ${legacy.message} ${legacyProduct.message}` }
  }
  return { platform, requirements, concepts, projects, seed }
}

export async function buildServer(options: ServerOptions): Promise<ApiServer> {
  const production = options.production ?? process.env.NODE_ENV === 'production'
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2 * 1024 * 1024, forceCloseConnections: true })
  const events = await createEventHub(options.pool, { pollMs: options.eventPollMs, retentionHours: options.outboxRetentionHours, onError: (e) => app.log.error(e) })
  const conceptEvents = await createConceptsEventHub(options.pool, { pollMs: options.eventPollMs, retentionHours: options.outboxRetentionHours, onError: (e) => app.log.error(e) })
  // Archived projects are read-only for every hosted service; deleted ones have no members (CR-PM-API-4).
  const auth = identity(options.pool, { production, projectState: (projectId) => projectState(options.pool, projectId).catch(() => undefined) })
  const projectEvents = await createProjectsEventHub(options.pool, { pollMs: options.eventPollMs, retentionHours: options.outboxRetentionHours, onError: (e) => app.log.error(e) })
  app.setErrorHandler((error, request, reply) => {
    const errorId = randomUUID()
    const { status, body } = errorBody(error, errorId)
    if (status >= 500) request.log.error({ err: error, errorId }, 'request failed')
    reply.code(status).send(body)
  })
  app.get('/api/health', async () => {
    const started = Date.now()
    await options.pool.query('SELECT 1')
    return { status: 'ok', database: 'reachable', latencyMs: Date.now() - started }
  })
  registerPlatformRoutes(app, options.pool, auth, { production })
  const projectBlobs = options.blobs ?? memoryBlobStore()
  // Installed server modules (modules.ts), registered in list order: documentation page, then the plugin. Each may return
  // the artifact source of its module (ADR-0062, CR-PM-REG-1/3/4: read-only adapter over its own tables and outbox).
  assertUniqueManifests(ALL_SERVER_MODULES)
  const moduleHost: ApiModuleHost = {
    app,
    pool: options.pool,
    production,
    eventPollMs: options.eventPollMs,
    auth,
    options,
    events,
    conceptEvents,
    blobs: projectBlobs,
    assistant: () => assistantBackend,
  }
  const artifactSources: ArtifactSource[] = []
  const registrationOrder: string[] = []
  const registerModule = async (m: (typeof INSTALLED_SERVER_MODULES)[number]) => {
    if (m.docs) registerApiDocs(app, { path: `${m.basePath}/docs`, openapiUrl: `${m.basePath}/openapi.json`, title: m.docs })
    const registration = await m.register(moduleHost)
    registrationOrder.push(m.id)
    return registration
  }
  for (const m of INSTALLED_SERVER_MODULES) {
    if (m.phase === 'after-host') {
      if (m.settings || m.provisioning) throw new Error(`Server module “${m.id}” registers after the host services and cannot contribute settings or provisioning.`)
      continue
    }
    const registration = await registerModule(m)
    if (registration?.artifactSource) artifactSources.push(registration.artifactSource)
  }
  // Provisioning uses each module's own provision() where it has an ArtifactSource.
  const provisioned = INSTALLED_SERVER_MODULES.flatMap((m) => (m.provisioning ? [{ manifest: m, module: m.provisioning.module ?? m.id, lazyReason: m.provisioning.lazyReason }] : []))
  const installedModules: ProvisioningModule[] = provisioned.map(({ module, manifest, lazyReason }) => {
    const base: ProvisioningModule = { module, name: manifest.name, lazyReason }
    const source = artifactSources.find((s) => s.module === module)
    return source?.provision ? { ...base, provision: (req) => source.provision!(req) } : base
  })
  // Project Management (CR-PM-API-5). It reads raw membership roles and applies the record state itself.
  registerApiDocs(app, { path: `${projectsServerManifest.basePath}/docs`, openapiUrl: `${projectsServerManifest.basePath}/openapi.json`, title: projectsServerManifest.docs! })
  // Project settings live in the settings service (CR-PM-SET-1); the port writes them as the acting administrator.
  const projectSettings: ProjectSettingsPort = {
    description: 'settings service (/api/settings/v1, project scope)',
    async write(projectId, values, actor) {
      if (!settingsStore) throw new Error('The settings service is not ready.')
      const result = await settingsStore.write('project', projectId, values, { ifMatch: '*', actor: { userId: actor, role: await auth.roleOf(actor, projectId) }, projectId })
      return { revision: result.revision }
    },
    async read(projectId) {
      if (!settingsStore) throw new Error('The settings service is not ready.')
      return (await settingsStore.read('project', projectId)).values
    },
  }
  let projectsRegistry: { idle: () => Promise<void>; reconcile: (projectId: string) => Promise<unknown> } | undefined
  await app.register(projectsPlugin, {
    artifactSources,
    onRegistry: (handle) => (projectsRegistry = handle),
    prefix: PROJECTS_BASE_PATH,
    pool: options.pool,
    events: projectEvents,
    blobs: projectBlobs,
    authenticate: auth.authenticate,
    roleOf: auth.membershipRole,
    memberships: platformMemberships(),
    modules: installedModules,
    settings: projectSettings,
  })
  registrationOrder.push('projects')
  // Settings (SDK 1.6) and the AI connection (docs/specifications/ai-connection.md §5, §5a).
  const settingsRegistry = new SettingsRegistry()
  // The AI policy: platform-owned entries plus what the server manifests declare (operations and AI modules).
  const contributions = collectPolicyContributions(ALL_SERVER_MODULES)
  // AI runtime: given by the caller, else read from the environment (EWS_AI_MODE; default user, production always user).
  const aiRuntime: Partial<AiRuntimeConfig> = production ? { mode: 'user' } : (options.assistant?.ai ?? readAiConfig(process.env, false).config)
  const policy = createPolicy(contributions.aiModules, contributions.operations, { routingDefault: aiRuntime.defaultOptimization })
  settingsRegistry.register(AI_SETTINGS_PAGE, policy.settingDefinitions)
  settingsRegistry.register(PROJECT_SETTINGS_PAGE, [...PROJECT_SETTING_DEFINITIONS, ...moduleEnablementDefinitions(installedModules.map((m) => ({ id: m.module, name: m.name })))])
  // Module contributions validated on the server (SDK 1.6): the same definitions the tool declares.
  for (const m of INSTALLED_SERVER_MODULES) if (m.settings) settingsRegistry.register(m.settings.page, m.settings.definitions)
  let settingsStore: SettingsStore | undefined
  registerApiDocs(app, { path: `${SETTINGS_BASE_PATH}/docs`, openapiUrl: `${SETTINGS_BASE_PATH}/openapi.json`, title: 'Settings API' })
  await app.register(settingsPlugin, { prefix: SETTINGS_BASE_PATH, pool: options.pool, registry: settingsRegistry, authenticate: auth.authenticate, roleOf: auth.roleOf, onReady: (s) => (settingsStore = s) })
  registrationOrder.push('settings')
  let assistantBackend: AssistantBackend | undefined
  const assistantKey = options.assistant?.key ?? (production ? undefined : CredentialVault.randomKey())
  if (assistantKey) {
    const publicOrigin = options.assistant?.publicOrigin
    const providers = options.assistant?.providers ?? new ProviderRegistry().register(createOpenAIProvider({ chatgptSignIn: !production && !!publicOrigin?.startsWith('http://127.0.0.1:'), fetch: options.assistant?.fetch }))
    // Mock mode always has its personas (the fake provider); `fakeProvider` also registers it for the older test flows.
    if ((options.assistant?.fakeProvider || aiRuntime.mode === 'mock') && !production && !providers.get('fake')) providers.register(createFakeProvider())
    registerApiDocs(app, { path: `${ASSISTANT_BASE_PATH}/docs`, openapiUrl: `${ASSISTANT_BASE_PATH}/openapi.json`, title: 'Assistant API' })
    await app.register(assistantPlugin, {
      prefix: ASSISTANT_BASE_PATH,
      pool: options.pool,
      vault: new CredentialVault(assistantKey),
      providers,
      publicOrigin,
      fetch: options.assistant?.fetch,
      ai: aiRuntime,
      authenticate: auth.authenticate,
      roleOf: async (userId, projectId) => (await auth.roleOf(userId, projectId)) ?? null,
      settings: {
        effective: (userId, projectId) => settingsStore!.effective(userId, projectId),
        setConnectionReference: async (userId, projectId, reference) => {
          await settingsStore!.write('user', userId, { 'ai.connection.active': reference }, { ifMatch: undefined, actor: { userId, role: null }, projectId, owner: 'assistant' })
        },
      },
      onReady: (b) => (assistantBackend = b),
      // Declarative proposals (integration milestone 1 C9): the module APIs they may call, executed in-process
      // as the person (their identity headers are forwarded; each module enforces its own permissions).
      // Proposal APIs the assistant may call for declarative proposals (integration milestone 1 C9): each module declares
      // `proposals` (entitlement and project parameter) in its manifest.
      modules: ALL_SERVER_MODULES.flatMap((m) => (m.proposals ? [{ id: m.id, label: m.name, basePath: m.basePath, ...m.proposals }] : [])),
      policy,
      callModule: async ({ method, url, headers, body }) => {
        const res = await app.inject({ method: method as 'GET', url, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, payload: body === undefined ? undefined : JSON.stringify(body) })
        let parsed: unknown
        try {
          parsed = res.body ? JSON.parse(res.body) : undefined
        } catch {
          parsed = undefined
        }
        return { status: res.statusCode, body: parsed }
      },
    })
    registrationOrder.push('assistant')
    registerOAuthCallback(app, () => assistantBackend)
  } else app.log.warn('EWS_ASSISTANT_KEY is not set: the assistant API (/api/assistant/v1) is not started.')
  // Modules that need the host services running (visualization resumes jobs on start and needs the assistant).
  for (const m of INSTALLED_SERVER_MODULES) if (m.phase === 'after-host') await registerModule(m)
  return {
    registrationOrder,
    app,
    events,
    conceptEvents,
    projectEvents,
    projectBlobs,
    assistant: () => assistantBackend,
    projectsRegistry: () => projectsRegistry,
    close: async () => {
      await app.close()
      await events.close()
      await conceptEvents.close()
      await projectEvents.close()
    },
  }
}
