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
import { identity, migratePlatform, registerPlatformRoutes, seedPlatform } from './platform/identity'

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
}

export interface ApiServer {
  app: FastifyInstance
  events: EventHub
  close: () => Promise<void>
}

export async function prepareDatabase(pool: Pool, opts: { seed: boolean; twin?: TwinDirectory }) {
  const platform = await migratePlatform(pool)
  const requirements = await migrateRequirements(pool)
  let seed: { seeded: boolean; message: string } | undefined
  if (opts.seed) {
    await seedPlatform(pool)
    seed = await seedRequirements(pool, opts.twin ?? SAMPLE_TWIN)
  }
  return { platform, requirements, seed }
}

export async function buildServer(options: ServerOptions): Promise<ApiServer> {
  const production = options.production ?? process.env.NODE_ENV === 'production'
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 2 * 1024 * 1024, forceCloseConnections: true })
  const events = await createEventHub(options.pool, { pollMs: options.eventPollMs, retentionHours: options.outboxRetentionHours, onError: (e) => app.log.error(e) })
  const auth = identity(options.pool, { production })
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
  return {
    app,
    events,
    close: async () => {
      await events.close()
      await app.close()
    },
  }
}
