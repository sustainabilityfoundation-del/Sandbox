import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import {
  BASE_PATH,
  createEventHub,
  errorBody,
  migrateRequirements,
  requirementsPlugin,
  seedRequirements,
  staticTwinDirectory,
  type EventHub,
  type ObjectStorage,
  type SysmlElementDirectory,
  type TwinDirectory,
} from '@ews/requirements-service'
import { CONCEPTS_BASE_PATH, conceptsPlugin, createConceptsEventHub, migrateConcepts, seedConcepts, type ConceptsEventHub } from '@ews/conceptualize-service'
import { identity, migratePlatform, registerPlatformRoutes, seedPlatform } from './platform/identity'
import { registerApiDocs } from './apiDocs'
import { sysmlElementDirectory } from './sysmlDirectory'
import { SYSML_BASE_PATH, sysmlPlugin } from '@ews/sysml-service'
import {
  PROJECTS_BASE_PATH,
  PROJECT_SETTINGS_PAGE,
  PROJECT_SETTING_DEFINITIONS,
  composeTwinDirectories,
  createProjectsEventHub,
  importLegacyProduct,
  memoryBlobStore,
  migrateProjects,
  moduleEnablementDefinitions,
  productTwinDirectory,
  projectState,
  projectsPlugin,
  seedLegacyProject,
  type BlobStore,
  type ProjectSettingsPort,
  type ProjectsEventHub,
  type ProvisioningModule,
} from '@ews/projects-service'
import { platformMemberships } from './platform/memberships'
import { CAD_BASE_PATH, CAD_SETTINGS, cadPlugin } from '@ews/cad-service'
import { SETTINGS_BASE_PATH, SettingsRegistry, settingsPlugin, type SettingsStore } from '@ews/settings-service'
import { AI_SETTINGS_PAGE, AI_SETTING_DEFINITIONS, ASSISTANT_BASE_PATH, CredentialVault, ProviderRegistry, assistantPlugin, createFakeProvider, createOpenAIProvider, registerOAuthCallback, type AssistantBackend } from '@ews/assistant-service'

/**
 * Development twin directory: the component IDs of the sample actuator twin
 * (packages/model-service seed). Allocation targets are validated against it until the platform
 * offers a twin directory endpoint (integration need, see the progress file).
 */
export const SAMPLE_TWIN: TwinDirectory = staticTwinDirectory(
  {
    'PRJ-ACT100': [
      { id: 'ACT-100', type: 'assembly', name: 'Actuator assembly' },
      { id: 'HSG-110', type: 'part', name: 'Housing' },
      { id: 'ROD-120', type: 'part', name: 'Rod' },
      { id: 'MTR-130', type: 'part', name: 'Motor' },
      { id: 'SYS-001', type: 'sysml-element', name: 'ActuatorSystem' },
      { id: 'SYS-002', type: 'sysml-element', name: 'housing' },
      { id: 'SYS-003', type: 'sysml-element', name: 'rod' },
      { id: 'SYS-004', type: 'sysml-element', name: 'motor' },
      { id: 'SYS-005', type: 'sysml-element', name: 'operatingLoad' },
      { id: 'SYS-006', type: 'sysml-element', name: 'extensionTime' },
      { id: 'CAD-110', type: 'cad-representation', name: 'Housing (mock geometry)' },
      { id: 'CAD-120', type: 'cad-representation', name: 'Rod (mock geometry)' },
      { id: 'CAD-130', type: 'cad-representation', name: 'Motor (mock geometry)' },
    ],
  },
  'development directory of the sample actuator twin',
)

/**
 * Modules hosted here, provisioned for every new project (integration milestone 1, C1). None needs a provisioning
 * step today: each keys its data by project ID and creates its per-project space on the first write (SysML: a SysML
 * project created by the person). CAD joins when services/cad is hosted. A module's own `provision()` replaces
 * `lazyReason` when its ArtifactSource ships (CR-PM-REG-1…4).
 */
export const INSTALLED_MODULES: ProvisioningModule[] = [
  { module: 'requirements', name: 'Requirements', lazyReason: 'Requirements stores data by project ID; its project space appears with the first requirement.' },
  { module: 'conceptualize', name: 'Conceptualize', lazyReason: 'Conceptualize stores data by project ID; its project space appears with the first concept.' },
  { module: 'sysml', name: 'SysML Modeler', lazyReason: 'A SysML model is created in the SysML Modeler when you start modelling; none exists in a new project.' },
]

export interface ServerOptions {
  pool: Pool
  storage: ObjectStorage
  production?: boolean
  twin?: TwinDirectory
  /** SysML Modeler elements as allocation targets (default: the in-process SysML service). */
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
    /** Replace the provider registry (tests). */
    providers?: ProviderRegistry
    fetch?: typeof fetch
  }
}

export interface ApiServer {
  app: FastifyInstance
  events: EventHub
  /** Conceptualize outbox (its own schema and publisher). */
  conceptEvents: ConceptsEventHub
  /** Project Management outbox (schema projects). */
  projectEvents: ProjectsEventHub
  /** Project Management blob store (documents, attachments). */
  projectBlobs: BlobStore
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
  registerApiDocs(app, { path: `${BASE_PATH}/docs`, openapiUrl: `${BASE_PATH}/openapi.json`, title: 'Requirements Management API' })
  registerApiDocs(app, { path: `${CONCEPTS_BASE_PATH}/docs`, openapiUrl: `${CONCEPTS_BASE_PATH}/openapi.json`, title: 'Conceptualize API' })
  await app.register(requirementsPlugin, {
    prefix: BASE_PATH,
    pool: options.pool,
    // Allocation targets: the product registry first (C2, CR-PM-API-3), then the static development directory.
    twin: composeTwinDirectories(productTwinDirectory(options.pool), options.twin ?? SAMPLE_TWIN),
    sysml: options.sysml ?? sysmlElementDirectory(options.pool),
    storage: options.storage,
    events,
    authenticate: auth.authenticate,
    roleOf: auth.roleOf,
    reqifSchemaDir: options.reqifSchemaDir,
  })
  await app.register(conceptsPlugin, { prefix: CONCEPTS_BASE_PATH, pool: options.pool, events: conceptEvents, authenticate: auth.authenticate, roleOf: auth.roleOf })
  // SysML Modeler (docs/specifications/sysml-program-contracts.md §7): migrates schema `sysml`; seeds the example outside production.
  registerApiDocs(app, { path: `${SYSML_BASE_PATH}/docs`, openapiUrl: `${SYSML_BASE_PATH}/openapi.json`, title: 'SysML Modeler API' })
  await app.register(sysmlPlugin, { prefix: SYSML_BASE_PATH, pool: options.pool, authenticate: auth.authenticate, roleOf: auth.roleOf, seed: !production, eventPollMs: options.eventPollMs })
  // CAD Modeler documents (CR-CAD-2): migrates schema `cad`; entitlement tool:cad enforced by the plugin.
  registerApiDocs(app, { path: `${CAD_BASE_PATH}/docs`, openapiUrl: `${CAD_BASE_PATH}/openapi.json`, title: 'CAD Modeler API' })
  await app.register(cadPlugin, { prefix: CAD_BASE_PATH, pool: options.pool, authenticate: auth.authenticate, roleOf: auth.roleOf, eventPollMs: options.eventPollMs })
  // Project Management (CR-PM-API-5). It reads raw membership roles and applies the record state itself.
  registerApiDocs(app, { path: `${PROJECTS_BASE_PATH}/docs`, openapiUrl: `${PROJECTS_BASE_PATH}/openapi.json`, title: 'Project Management API' })
  const projectBlobs = options.blobs ?? memoryBlobStore()
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
  await app.register(projectsPlugin, {
    prefix: PROJECTS_BASE_PATH,
    pool: options.pool,
    events: projectEvents,
    blobs: projectBlobs,
    authenticate: auth.authenticate,
    roleOf: auth.membershipRole,
    memberships: platformMemberships(),
    modules: INSTALLED_MODULES,
    settings: projectSettings,
  })
  // Settings (SDK 1.6) and the AI connection (docs/specifications/ai-connection.md §5, §5a).
  const settingsRegistry = new SettingsRegistry()
  settingsRegistry.register(AI_SETTINGS_PAGE, AI_SETTING_DEFINITIONS)
  settingsRegistry.register(PROJECT_SETTINGS_PAGE, [...PROJECT_SETTING_DEFINITIONS, ...moduleEnablementDefinitions(INSTALLED_MODULES.map((m) => ({ id: m.module, name: m.name })))])
  // Module contributions validated on the server (SDK 1.6): the same definitions the tool declares.
  settingsRegistry.register(CAD_SETTINGS.page, CAD_SETTINGS.definitions)
  let settingsStore: SettingsStore | undefined
  registerApiDocs(app, { path: `${SETTINGS_BASE_PATH}/docs`, openapiUrl: `${SETTINGS_BASE_PATH}/openapi.json`, title: 'Settings API' })
  await app.register(settingsPlugin, { prefix: SETTINGS_BASE_PATH, pool: options.pool, registry: settingsRegistry, authenticate: auth.authenticate, roleOf: auth.roleOf, onReady: (s) => (settingsStore = s) })
  let assistantBackend: AssistantBackend | undefined
  const assistantKey = options.assistant?.key ?? (production ? undefined : CredentialVault.randomKey())
  if (assistantKey) {
    const publicOrigin = options.assistant?.publicOrigin
    const providers = options.assistant?.providers ?? new ProviderRegistry().register(createOpenAIProvider({ chatgptSignIn: !production && !!publicOrigin?.startsWith('http://127.0.0.1:'), fetch: options.assistant?.fetch }))
    if (options.assistant?.fakeProvider && !production && !providers.get('fake')) providers.register(createFakeProvider())
    registerApiDocs(app, { path: `${ASSISTANT_BASE_PATH}/docs`, openapiUrl: `${ASSISTANT_BASE_PATH}/openapi.json`, title: 'Assistant API' })
    await app.register(assistantPlugin, {
      prefix: ASSISTANT_BASE_PATH,
      pool: options.pool,
      vault: new CredentialVault(assistantKey),
      providers,
      publicOrigin,
      fetch: options.assistant?.fetch,
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
      modules: [
        { id: 'requirements', label: 'Requirements', basePath: BASE_PATH, entitlement: 'tool:requirements', projectParam: 'projectId' },
        { id: 'conceptualize', label: 'Conceptualize', basePath: CONCEPTS_BASE_PATH, entitlement: 'tool:conceptualize', projectParam: 'projectId' },
        { id: 'sysml-modeler', label: 'SysML Modeler', basePath: SYSML_BASE_PATH, entitlement: 'tool:sysml' },
      ],
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
    registerOAuthCallback(app, () => assistantBackend)
  } else app.log.warn('EWS_ASSISTANT_KEY is not set: the assistant API (/api/assistant/v1) is not started.')
  return {
    app,
    events,
    conceptEvents,
    projectEvents,
    projectBlobs,
    assistant: () => assistantBackend,
    close: async () => {
      await events.close()
      await conceptEvents.close()
      await projectEvents.close()
      await app.close()
    },
  }
}
