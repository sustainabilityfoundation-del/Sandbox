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
  type TwinDirectory,
} from '@ews/requirements-service'
import { CONCEPTS_BASE_PATH, conceptsPlugin, createConceptsEventHub, migrateConcepts, seedConcepts, type ConceptsEventHub } from '@ews/conceptualize-service'
import { identity, migratePlatform, registerPlatformRoutes, seedPlatform } from './platform/identity'
import { registerApiDocs } from './apiDocs'
import { SYSML_BASE_PATH, sysmlPlugin } from '@ews/sysml-service'
import { PROJECTS_BASE_PATH, createProjectsEventHub, memoryBlobStore, migrateProjects, projectState, projectsPlugin, seedLegacyProject, type BlobStore, type ProjectsEventHub } from '@ews/projects-service'
import { platformMemberships } from './platform/memberships'

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

export interface ServerOptions {
  pool: Pool
  storage: ObjectStorage
  production?: boolean
  twin?: TwinDirectory
  logger?: boolean
  eventPollMs?: number
  /** Official ReqIF schemas for validation (npm run req:reqif:schemas). */
  reqifSchemaDir?: string
  /** Retention of delivered events (hours, default 168). */
  outboxRetentionHours?: number
  /** Project Management blob store (documents, attachments); default in-memory (tests). main.ts passes the local store. */
  blobs?: BlobStore
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
    seed = { seeded: seed.seeded || legacy.seeded, message: `${seed.message} ${legacy.message}` }
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
    twin: options.twin ?? SAMPLE_TWIN,
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
  // Project Management (CR-PM-API-5). It reads raw membership roles and applies the record state itself.
  registerApiDocs(app, { path: `${PROJECTS_BASE_PATH}/docs`, openapiUrl: `${PROJECTS_BASE_PATH}/openapi.json`, title: 'Project Management API' })
  const projectBlobs = options.blobs ?? memoryBlobStore()
  await app.register(projectsPlugin, { prefix: PROJECTS_BASE_PATH, pool: options.pool, events: projectEvents, blobs: projectBlobs, authenticate: auth.authenticate, roleOf: auth.membershipRole, memberships: platformMemberships() })
  return {
    app,
    events,
    conceptEvents,
    projectEvents,
    projectBlobs,
    close: async () => {
      await events.close()
      await conceptEvents.close()
      await projectEvents.close()
      await app.close()
    },
  }
}
