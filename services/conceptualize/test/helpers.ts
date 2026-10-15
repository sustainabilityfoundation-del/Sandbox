import { randomBytes } from 'node:crypto'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { createTestEnv as createApiTestEnv, type TestEnv } from '../../api/test/helpers'

/**
 * Test helpers for the Conceptualize API on a real, disposable PostgreSQL database (the API host's
 * test environment: migrations, development users, seed, the real server).
 */
export const PROJECT = 'PRJ-ACT100'
export const BASE = `/api/concepts/v1/projects/${PROJECT}`
export type { TestEnv }

export async function createTestEnv(opts: { seed?: boolean } = {}): Promise<TestEnv> {
  return createApiTestEnv(opts)
}

export const idem = (extra: Record<string, string> = {}) => ({ 'idempotency-key': randomBytes(8).toString('hex'), ...extra })
export const assistant = (proposalId = `PRP-${randomBytes(3).toString('hex')}`, conversationId = 'CONV-test') => ({ 'x-source-kind': 'assistant', 'x-conversation-id': conversationId, 'x-proposal-id': proposalId })

const addFormats = addFormatsModule as unknown as (a: Ajv) => Ajv
let validator: { doc: any; ajv: Ajv } | undefined

/** Validates a response body against the OpenAPI response schema of an operation (API contract test). */
export async function expectConforms(env: TestEnv, operationId: string, status: number, body: unknown) {
  if (!validator) {
    const doc = (await env.call('', 'GET', '/api/concepts/v1/openapi.json')).body
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
