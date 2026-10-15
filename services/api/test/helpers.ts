import './providedContext'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import pg from 'pg'
import { inject } from 'vitest'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { memoryObjectStorage, type ObjectStorage, type TwinDirectory } from '@ews/requirements-service'
import { dropDatabase, ensureDatabase } from '../src/database'
import { buildServer, prepareDatabase, type ApiServer } from '../src/server'

export const PROJECT = 'PRJ-ACT100'
export const REQIF_SCHEMAS = resolve(__dirname, '../../../.data/reqif-schemas')
export const REQIF_SAMPLES = resolve(__dirname, '../../../.data/reqif-samples')
export const BASE = `/api/requirements/v1/projects/${PROJECT}`
export const REQ1 = '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001'
export const REQ2 = '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002'
export const REQ3 = '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003'

export interface TestEnv {
  name: string
  url: string
  pool: pg.Pool
  server: ApiServer
  storage: ObjectStorage
  /** HTTP via Fastify inject, as a development user. */
  call: (user: string, method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; headers: Record<string, unknown> }>
  /** Listens on a free port; returns the origin. */
  listen: () => Promise<string>
  close: () => Promise<void>
}

export function testDbUrl(name: string): string {
  const u = new URL(inject('pgAdminUrl'))
  u.pathname = `/${name}`
  return u.toString()
}

/** A fresh database (migrated, optionally seeded) and an API server on it. */
export async function createTestEnv(opts: { seed?: boolean; production?: boolean; twin?: TwinDirectory } = {}): Promise<TestEnv> {
  const name = `ews_test_${randomBytes(5).toString('hex')}`
  const admin = inject('pgAdminUrl')
  await ensureDatabase(admin, name)
  const url = testDbUrl(name)
  const pool = new pg.Pool({ connectionString: url, max: 15 })
  await prepareDatabase(pool, { seed: opts.seed ?? true })
  const storage = memoryObjectStorage()
  const server = await buildServer({ pool, storage, production: opts.production ?? false, eventPollMs: 200, reqifSchemaDir: REQIF_SCHEMAS, twin: opts.twin })
  let listening = false
  return {
    name,
    url,
    pool,
    server,
    storage,
    async call(user, method, path, body, headers = {}) {
      const isRaw = body instanceof Uint8Array || typeof body === 'string'
      const res = await server.app.inject({
        method: method as 'GET',
        url: path,
        headers: { ...(user ? { 'x-dev-user': user } : {}), ...(body !== undefined && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers },
        payload: body === undefined ? undefined : body instanceof Uint8Array ? Buffer.from(body) : isRaw ? (body as string) : JSON.stringify(body),
      })
      let parsed: unknown = res.body
      try {
        parsed = res.body ? JSON.parse(res.body) : undefined
      } catch {
        /* not JSON */
      }
      return { status: res.statusCode, body: parsed, headers: res.headers }
    },
    async listen() {
      const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
      listening = true
      return address
    },
    async close() {
      await server.close()
      await pool.end()
      await dropDatabase(admin, name)
      void listening
    },
  }
}

// ---- OpenAPI conformance -------------------------------------------------------------------------

const addFormats = addFormatsModule as unknown as (a: Ajv) => Ajv
let validator: { doc: any; ajv: Ajv } | undefined

/** Validates a response body against the OpenAPI response schema of an operation. */
export async function expectConforms(env: TestEnv, operationId: string, status: number, body: unknown) {
  if (!validator) {
    const doc = (await env.call('', 'GET', '/api/requirements/v1/openapi.json')).body
    const ajv = addFormats(new Ajv({ strict: false, allErrors: true }))
    ajv.addSchema({ $id: 'openapi', components: doc.components })
    validator = { doc, ajv }
  }
  const { doc, ajv } = validator
  for (const methods of Object.values(doc.paths) as Record<string, any>[]) {
    for (const op of Object.values(methods)) {
      if (op.operationId !== operationId) continue
      const schema = op.responses[String(status)]?.content?.['application/json']?.schema
      if (!schema) throw new Error(`${operationId} documents no JSON schema for ${status}`)
      const rewritten = JSON.parse(JSON.stringify(schema).replace(/"#\/components\//g, '"openapi#/components/'))
      const validate = ajv.compile(rewritten)
      if (!validate(body)) throw new Error(`${operationId} ${status} does not match OpenAPI: ${ajv.errorsText(validate.errors)}`)
      return
    }
  }
  throw new Error(`Unknown operation ${operationId}`)
}

export const idem = () => ({ 'idempotency-key': randomBytes(8).toString('hex') })
