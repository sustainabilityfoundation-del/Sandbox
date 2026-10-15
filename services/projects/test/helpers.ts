import { randomBytes } from 'node:crypto'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { createTestEnv as createApiTestEnv, type TestEnv } from '../../api/test/helpers'

/**
 * Project Management API tests on a real, disposable PostgreSQL database: the API host's test environment
 * (migrations, development users and seed, the real server with every hosted service).
 */
export const API = '/api/projects/v1'
export type { TestEnv }

export async function createTestEnv(opts: { seed?: boolean } = {}): Promise<TestEnv> {
  return createApiTestEnv(opts)
}

export const idem = (extra: Record<string, string> = {}) => ({ 'idempotency-key': randomBytes(8).toString('hex'), ...extra })
export const assistant = (proposalId = `PRP-${randomBytes(3).toString('hex')}`, conversationId = 'CONV-test') => ({ 'x-source-kind': 'assistant', 'x-conversation-id': conversationId, 'x-proposal-id': proposalId })
export const ifMatch = (revision: number) => ({ 'if-match': `"${revision}"` })

let keySeq = 0
/** A fresh, unique project key. */
export const newKey = () => `T${Date.now().toString(36).toUpperCase().slice(-5)}${(keySeq++).toString(36).toUpperCase()}`

/** Creates a blank project as `user` and returns its body. */
export async function createProject(env: TestEnv, user = 'eli', body: Record<string, unknown> = {}) {
  const res = await env.call(user, 'POST', `${API}/projects`, { key: newKey(), name: 'Test project', ...body }, idem())
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body as { id: string; key: string; revision: number; [k: string]: unknown }
}

const addFormats = addFormatsModule as unknown as (a: Ajv) => Ajv
let validator: { doc: any; ajv: Ajv } | undefined

/** Validates a response body against the OpenAPI response schema of an operation (API contract test). */
export async function expectConforms(env: TestEnv, operationId: string, status: number, body: unknown) {
  if (!validator) {
    const doc = (await env.call('', 'GET', `${API}/openapi.json`)).body
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
