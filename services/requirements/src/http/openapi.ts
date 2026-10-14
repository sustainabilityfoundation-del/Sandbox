import type { TSchema } from '@sinclair/typebox'
import { PERMISSIONS, RELATIONSHIP_RULES, ROLES, TRANSITIONS } from '../domain/rules'
import type { RouteSpec } from './route'
import { SCHEMAS } from './schemas'

/** Strips TypeBox symbols and replaces named sub-schemas by `$ref`s to components. */
function toJsonSchema(schema: unknown, root: string | null, names: Set<string>): unknown {
  if (Array.isArray(schema)) return schema.map((s) => toJsonSchema(s, null, names))
  if (!schema || typeof schema !== 'object') return schema
  const s = schema as Record<string, unknown>
  const id = s.$id as string | undefined
  if (id && id !== root && names.has(id)) return { $ref: `#/components/schemas/${id}` }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === '$id') continue
    out[k] = toJsonSchema(v, null, names)
  }
  return out
}

export const API_VERSION = '1.0.0'
export const BASE_PATH = '/api/requirements/v1'

export function buildOpenApi(routes: RouteSpec[]) {
  const names = new Set(SCHEMAS.map((s) => s.$id as string))
  const components: Record<string, unknown> = {}
  for (const s of SCHEMAS) components[s.$id as string] = toJsonSchema(s, s.$id as string, names)
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of routes) {
    const params: unknown[] = []
    const pathParams = (r.params as TSchema | undefined)?.properties as Record<string, TSchema> | undefined
    for (const [name, schema] of Object.entries(pathParams ?? {})) params.push({ name, in: 'path', required: true, schema: toJsonSchema(schema, null, names) })
    const q = r.query as (TSchema & { properties?: Record<string, TSchema>; required?: string[] }) | undefined
    for (const [name, schema] of Object.entries(q?.properties ?? {})) {
      params.push({ name, in: 'query', required: q?.required?.includes(name) ?? false, schema: toJsonSchema(schema, null, names), ...(schema.description ? { description: schema.description } : {}) })
    }
    if (r.method !== 'GET') {
      if (r.idempotency) params.push({ name: 'Idempotency-Key', in: 'header', required: r.idempotency === 'required', schema: { type: 'string', maxLength: 200 }, description: 'Retries with the same key return the first outcome (stored 24 h). Reusing a key for a different request fails with invalid.' })
      if (r.concurrency || ['PATCH', 'DELETE', 'PUT'].includes(r.method)) params.push({ name: 'If-Match', in: 'header', required: false, schema: { type: 'string', examples: ['"3"'] }, description: r.concurrency ?? 'Expected revision as an ETag; alternative to expectedRevision in the body' })
    }
    params.push({ name: 'X-Configuration-Id', in: 'header', required: false, schema: { type: 'string' }, description: 'Configuration context recorded with emitted events' })
    const responses: Record<string, unknown> = {}
    for (const [status, resp] of Object.entries(r.responses)) {
      responses[status] = {
        description: resp.description,
        ...(resp.schema ? { content: { [resp.contentType ?? 'application/json']: { schema: toJsonSchema(resp.schema, null, names) } } } : {}),
        ...(status.startsWith('2') && ['GET', 'PATCH', 'POST'].includes(r.method) ? { headers: { ETag: { schema: { type: 'string' }, description: 'Revision of the returned entity, where applicable' } } } : {}),
      }
    }
    const roles = ROLES.filter((role) => PERMISSIONS[r.permission].roles.includes(role))
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      summary: r.summary,
      ...(r.description || r.notes ? { description: [r.description, r.notes].filter(Boolean).join('\n\n') } : {}),
      tags: [r.tag],
      parameters: params,
      responses,
      security: [{ devUser: [] }, { bearer: [] }],
      'x-permissions': {
        permission: r.permission,
        roles,
        entitlements: r.crossModule ? ['tool:requirements', 'tool:sysml'] : ['tool:requirements'],
        note: r.crossModule ? 'Cross-module SDK subset: tool:sysml suffices; writes are limited to canonical fields' : undefined,
      },
    }
    if (r.body) {
      op.requestBody = { required: true, content: { 'application/json': { schema: toJsonSchema(r.body, null, names), ...((r.body as { examples?: unknown[] }).examples ? { example: (r.body as { examples: unknown[] }).examples[0] } : {}) } } }
    } else if (r.rawBody) {
      op.requestBody = { required: true, content: Object.fromEntries(r.rawBody.map((t) => [t, { schema: { type: 'string', format: 'binary' } }])) }
    }
    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method.toLowerCase()]: op }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Requirements Management API',
      version: API_VERSION,
      description: [
        'PostgreSQL-backed Requirements service of the engineering platform. Versioned by path (`/api/requirements/v1`).',
        '',
        '**Identity**: canonical IDs are UUIDs; keys such as `REQ-001` are display text and may be renumbered; legacy twin IDs resolve through `/requirements/resolve`.',
        '**Revisions**: every canonical change creates an immutable revision. Lifecycle status, reviews and archival are separate records and do not create content revisions.',
        '**Concurrency**: responses carry `ETag: "<revision>"`; writes need `If-Match` or `expectedRevision` and fail with 409 `conflict` (details.currentRevision) instead of overwriting. No last-write-wins.',
        '**Idempotency**: `Idempotency-Key` on POST/PATCH replays the first outcome for 24 hours.',
        '**Timestamps**: RFC 3339 UTC with milliseconds, set by the server.',
        '**Pagination**: opaque `cursor`, `limit` 1–200 (default 50), stable ordering; a cursor is bound to its query.',
        '**Errors**: `{ "error": { "code", "message", "details" } }` with codes invalid (400/422), unauthenticated (401), forbidden (403), not-found (404), conflict (409), unavailable (503; 500 for unexpected internal errors).',
        '**Events**: committed changes only (transactional outbox), Server-Sent Events at `/projects/{projectId}/events`; dedupe by `eventId`.',
        '**Authorization**: entitlement `tool:requirements` (or `tool:sysml` for the cross-module subset) and project role; see `x-permissions` per operation and `x-roles` below. Development identities use `X-Dev-User` (refused in production).',
        '**Semantics kept distinct**: approval (reviews), verification results (twin artifacts), compliance assessment and modelled satisfaction (SysML `satisfies`). Collection hierarchy never implies derivation or decomposition.',
      ].join('\n'),
    },
    servers: [{ url: BASE_PATH }],
    components: {
      schemas: components,
      securitySchemes: {
        devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only (NODE_ENV !== production): seeded user ID such as ada, rui, eli, rho, nia' },
        bearer: { type: 'http', scheme: 'bearer', description: 'Production integration point: OIDC access token validated by the API host (not implemented)' },
      },
    },
    paths,
    'x-roles': Object.fromEntries(ROLES.map((role) => [role, Object.entries(PERMISSIONS).filter(([, p]) => p.roles.includes(role)).map(([k]) => k)])),
    'x-permission-labels': Object.fromEntries(Object.entries(PERMISSIONS).map(([k, p]) => [k, p.label])),
    'x-lifecycle-transitions': TRANSITIONS,
    'x-relationship-types': RELATIONSHIP_RULES,
  }
}
