import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { AiModuleDescriptor, OperationClass, ServerModuleHost, ServerModuleDescriptor, ServerModuleManifest } from '@ews/platform-sdk'
import { BASE_PATH, createRequirementsArtifactSource, requirementsPlugin, type EventHub, type SysmlElementDirectory, type TwinDirectory } from '@ews/requirements-service'
import { CONCEPTS_BASE_PATH, conceptsPlugin, conceptualizeServerManifest, createConceptsArtifactSource, type ConceptsEventHub } from '@ews/conceptualize-service'
import { SYSML_BASE_PATH, createSysmlArtifactSource, sysmlPlugin, sysmlServerManifest, type SysmlEventHub, type SysmlRepository } from '@ews/sysml-service'
import { CAD_BASE_PATH, cadPlugin, cadServerManifest, createCadArtifactSource, type CadEventHub } from '@ews/cad-service'
import { composeTwinDirectories, productTwinDirectory, projectsServerManifest, type BlobStore } from '@ews/projects-service'
import { AdapterRegistry, VISUALIZATION_BASE_PATH, createFakeImageAdapter, createOpenAIImageAdapter, visualizationPlugin, visualizationServerManifest } from '@ews/visualization-service'
import type { AssistantBackend } from '@ews/assistant-service'
import type { identity } from './platform/identity'
import { sysmlElementDirectory } from './sysmlDirectory'
import { SAMPLE_TWIN } from './sampleTwin'
import type { ServerOptions } from './server'

/**
 * What the API host gives a server module when it registers (SDK `ServerModuleHost`, typed with the host's own
 * services). Only what the existing adapters need: the application, the database pool, the request identity checks, the
 * event hubs the host created (they are part of `ApiServer`), the host options and the shared blob store.
 */
export interface ApiModuleHost extends ServerModuleHost {
  app: FastifyInstance
  pool: Pool
  production: boolean
  auth: ReturnType<typeof identity>
  options: ServerOptions
  /** Requirements outbox. */
  events: EventHub
  /** Conceptualize outbox (its own schema and publisher). */
  conceptEvents: ConceptsEventHub
  /** Project Management blob store (documents, attachments), shared with the visualization jobs. */
  blobs: BlobStore
  /** The assistant backend once the host has started it (undefined while it is not running). */
  assistant: () => AssistantBackend | undefined
}

export type ApiServerModule = ServerModuleManifest<ApiModuleHost>

/**
 * The server modules installed in the API host, in registration order (docs/specifications/module-registration.md, I3).
 * These are thin adapters around the plugin registration the host did before; each moves into its own package in the
 * M-steps. Projects, settings and the assistant stay composed by the host (server.ts): they consume what these return
 * (artifact sources, settings, provisioning) and are registered after the list.
 */
export const INSTALLED_SERVER_MODULES: ApiServerModule[] = [
  {
    id: 'requirements',
    name: 'Requirements',
    basePath: BASE_PATH,
    docs: 'Requirements Management API',
    provisioning: { lazyReason: 'Requirements stores data by project ID; its project space appears with the first requirement.' },
    async register(host) {
      const { app, pool, auth, options } = host
      // Special wiring kept in the host (module-registration.md, Risks): allocation targets are the product registry first
      // (C2, CR-PM-API-3), then the static development directory; SysML elements come from the in-process SysML service.
      const twin: TwinDirectory = composeTwinDirectories(productTwinDirectory(pool), options.twin ?? SAMPLE_TWIN)
      const sysml: SysmlElementDirectory = options.sysml ?? sysmlElementDirectory(pool)
      await app.register(requirementsPlugin, {
        prefix: BASE_PATH,
        pool,
        twin,
        sysml,
        storage: options.storage,
        events: host.events,
        authenticate: auth.authenticate,
        roleOf: auth.roleOf,
        reqifSchemaDir: options.reqifSchemaDir,
      })
      return { artifactSource: createRequirementsArtifactSource(pool, host.events) }
    },
  },
  {
    ...conceptualizeServerManifest,
    async register(host) {
      const { app, pool, auth } = host
      await app.register(conceptsPlugin, { prefix: CONCEPTS_BASE_PATH, pool, events: host.conceptEvents, authenticate: auth.authenticate, roleOf: auth.roleOf })
      // Concepts, functions, constraints, decisions, evidence and the rest are indexed (CR-PM-REG-2).
      return { artifactSource: createConceptsArtifactSource(pool, host.conceptEvents) }
    },
  },
  {
    ...sysmlServerManifest,
    async register(host) {
      const { app, pool, auth, options, production } = host
      // The plugin hands its repository and event hub to the host (onReady) for the artifact source (sysml-program-contracts.md §7).
      let services: { repo: SysmlRepository; events: SysmlEventHub } | undefined
      await app.register(sysmlPlugin, { prefix: SYSML_BASE_PATH, pool, authenticate: auth.authenticate, roleOf: auth.roleOf, seed: !production, eventPollMs: options.eventPollMs, onReady: (s) => (services = s) })
      if (!services) throw new Error('The SysML plugin did not report its services (onReady).')
      return { artifactSource: createSysmlArtifactSource(services.repo, services.events) }
    },
  },
  {
    ...cadServerManifest,
    async register(host) {
      const { app, pool, auth, options } = host
      let events: CadEventHub | undefined
      await app.register(cadPlugin, { prefix: CAD_BASE_PATH, pool, authenticate: auth.authenticate, roleOf: auth.roleOf, eventPollMs: options.eventPollMs, onReady: (s) => (events = s.events) })
      if (!events) throw new Error('The CAD plugin did not report its services (onReady).')
      return { artifactSource: createCadArtifactSource(pool, events) }
    },
  },
  {
    ...visualizationServerManifest,
    async register(host) {
      const { app, pool, auth, options, production } = host
      // Image generation jobs. Credentials stay in the assistant service: the port hands the adapter a credential for one
      // call at run time. Without the assistant every real adapter is unavailable (refused clearly).
      const viz = options.visualization
      const adapters = viz?.adapters ?? new AdapterRegistry({ production }).register(createOpenAIImageAdapter({ fetch: viz?.fetch }))
      if ((viz?.fakeAdapter ?? options.assistant?.fakeProvider) && !production && !adapters.get('fake-test')) adapters.register(createFakeImageAdapter())
      await app.register(visualizationPlugin, {
        prefix: VISUALIZATION_BASE_PATH,
        pool,
        blobs: host.blobs,
        adapters,
        access: {
          resolve: async (userId, projectId) => {
            const assistant = host.assistant()
            return assistant
              ? assistant.imageAccess(userId, projectId)
              : { connection: null, enabled: false, quality: 'medium', dailyLimit: 0, credential: async () => Promise.reject(new Error('The assistant service is not started.')) }
          },
        },
        authenticate: auth.authenticate,
        roleOf: async (userId, projectId) => (await auth.roleOf(userId, projectId)) ?? null,
        eventPollMs: options.eventPollMs,
        runner: viz?.runner,
      })
    },
  },
]

/**
 * Every server manifest the host knows: the installed modules plus the host-composed Project Management manifest (its
 * docs page, operations and AI module come from `@ews/projects-service`; the host registers its plugin itself).
 */
export const ALL_SERVER_MODULES: ServerModuleDescriptor[] = [...INSTALLED_SERVER_MODULES, projectsServerManifest]

/** What the manifests contribute to the AI access policy (`createPolicy(aiModules, operations)` in services/assistant). */
export function collectPolicyContributions(modules: ServerModuleDescriptor[]): { aiModules: AiModuleDescriptor[]; operations: Record<string, OperationClass> } {
  const aiModules: AiModuleDescriptor[] = []
  const operations: Record<string, OperationClass> = {}
  const definedBy = new Map<string, string>()
  for (const m of modules) {
    if (m.aiModule) aiModules.push(m.aiModule)
    for (const [name, cls] of Object.entries(m.operations ?? {})) {
      const other = definedBy.get(name)
      if (other) throw new Error(`Operation “${name}” is defined by both the “${other}” and “${m.id}” manifests.`)
      definedBy.set(name, m.id)
      operations[name] = cls
    }
  }
  return { aiModules, operations }
}

/** Throws when two manifests share an ID or a base path (a second module would silently shadow the first). */
export function assertUniqueManifests(modules: ServerModuleDescriptor[]): void {
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const m of modules) {
    if (ids.has(m.id)) throw new Error(`Server module “${m.id}” is installed twice.`)
    if (paths.has(m.basePath)) throw new Error(`Base path ${m.basePath} is used by two server modules.`)
    ids.add(m.id)
    paths.add(m.basePath)
  }
}
