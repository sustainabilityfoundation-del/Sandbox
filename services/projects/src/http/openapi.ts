import type { TSchema } from '@sinclair/typebox'
import { LINK_RULES, MODULE_OWNED_LINKS, PERMISSIONS, ROLES, WORK_ITEM_STATUSES, rolesWith, type Permission } from '../domain/rules'
import type { RouteSpec } from './route'
import { SCHEMAS } from './schemas'

/** Strips TypeBox symbols and replaces named sub-schemas by `$ref`s to components. */
export function toJsonSchema(schema: unknown, root: string | null, names: Set<string>): unknown {
  if (Array.isArray(schema)) return schema.map((s) => toJsonSchema(s, null, names))
  if (!schema || typeof schema !== 'object') return schema
  const s = schema as Record<string, unknown>
  const id = s.$id as string | undefined
  if (id && id !== root && names.has(id)) return { $ref: `#/components/schemas/${id}` }
  if (typeof s.$ref === 'string' && names.has(s.$ref)) return { $ref: `#/components/schemas/${s.$ref}` }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === '$id') continue
    out[k] = toJsonSchema(v, null, names)
  }
  return out
}

export const API_VERSION = '1.0.0'
export const BASE_PATH = '/api/projects/v1'

const PROVENANCE_HEADERS = [
  { name: 'X-Source-Kind', in: 'header', required: false, schema: { type: 'string', enum: ['user', 'assistant', 'import'] }, description: 'Origin of the change (default user). Assistant changes cannot accept risks, release documents or change membership.' },
  { name: 'X-Conversation-Id', in: 'header', required: false, schema: { type: 'string', maxLength: 200 }, description: 'Conversation an assistant change came from (required with X-Source-Kind: assistant)' },
  { name: 'X-Proposal-Id', in: 'header', required: false, schema: { type: 'string', maxLength: 200 }, description: 'Service proposal the user applied (required with X-Source-Kind: assistant)' },
  { name: 'X-Message-Id', in: 'header', required: false, schema: { type: 'string', maxLength: 200 }, description: 'Message within the conversation' },
]

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
      params.push({ name, in: 'query', required: q?.required?.includes(name) ?? false, schema: toJsonSchema(schema, null, names), ...(schema.description ? { description: schema.description } : name === 'dryRun' ? { description: 'Validate and return the would-be result without committing anything' } : {}) })
    }
    if (r.method !== 'GET') {
      if (r.idempotency) params.push({ name: 'Idempotency-Key', in: 'header', required: r.idempotency === 'required', schema: { type: 'string', maxLength: 200 }, description: 'Retries with the same key return the first outcome (stored 24 h, inside the write transaction). Reusing a key for a different request fails with invalid.' })
      if (r.concurrency) params.push({ name: 'If-Match', in: 'header', required: false, schema: { type: 'string', examples: ['"3"'] }, description: r.concurrency })
      if (r.confirm) params.push({ name: 'X-Confirm', in: 'header', required: true, schema: { type: 'string' }, description: 'The project key, typed by the person to confirm a destructive change (428 without it)' })
      params.push(...PROVENANCE_HEADERS)
    }
    const responses: Record<string, unknown> = {}
    for (const [status, resp] of Object.entries(r.responses)) {
      responses[status] = {
        description: resp.description,
        ...(resp.schema ? { content: { [resp.contentType ?? 'application/json']: { schema: toJsonSchema(resp.schema, null, names) } } } : resp.contentType ? { content: { [resp.contentType]: { schema: { type: 'string', format: 'binary' } } } } : {}),
        ...(status.startsWith('2') && r.concurrency ? { headers: { ETag: { schema: { type: 'string' }, description: 'Revision of the returned entity' } } } : {}),
      }
    }
    if (!responses['401']) responses['401'] = { description: 'No identity', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
    if (!responses['500']) responses['500'] = { description: 'Unexpected internal error: code `unavailable`, `details.reason` = `internal-error`, `details.errorId`. A write was rolled back.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      summary: r.summary,
      ...(r.description || r.notes ? { description: [r.description, r.notes].filter(Boolean).join('\n\n') } : {}),
      tags: [r.tag],
      parameters: params,
      responses,
      security: [{ devUser: [] }, { bearer: [] }],
      'x-permissions': r.permission === 'authenticated' ? { permission: 'authenticated', roles: [], note: 'Any authenticated user; no project role and no tool entitlement needed' } : { permission: r.permission, roles: rolesWith(r.permission as Permission), entitlements: [], note: 'Core capability: no tool entitlement; project role only' },
      ...(r.dryRun ? { 'x-dry-run': true } : {}),
      ...(r.confirm ? { 'x-destructive': true } : {}),
    }
    if (r.body) {
      const body = toJsonSchema(r.body, null, names)
      const named = SCHEMAS.find((s) => s.$id === (r.body as { $ref?: string }).$ref) as { examples?: unknown[] } | undefined
      op.requestBody = { required: true, content: { 'application/json': { schema: body, ...(named?.examples ? { example: named.examples[0] } : {}) } } }
    }
    if (r.rawBody) op.requestBody = { required: true, description: r.rawBody.description, content: { '*/*': { schema: { type: 'string', format: 'binary' } } } }
    paths[`${r.path}`] = { ...(paths[r.path] ?? {}), [r.method.toLowerCase()]: op }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Project Management API',
      version: API_VERSION,
      description: [
        'Project Management service of the engineering platform. Versioned by path (`/api/projects/v1`). A **project** is the top-level container; every module keys its data by the project ID. Project Management owns the project registry and lifecycle, membership management (through the platform membership, the single authorization source), templates, the **artifact registry** (one global ID per artifact, mapped to the owning module’s native reference), links no module owns, tasks, issues, risks, milestones and documents. It stores references and summaries, never module content.',
        '',
        '**Identity**: project IDs are UUIDs (the legacy example `PRJ-ACT100` keeps its ID); keys such as `EEP`, `TSK-001`, `DOC-001` are display text.',
        '**Blank projects** start with no artifacts in any module. Templates add configuration and planning items only.',
        '**Record state**: archived projects are read-only; deleted projects are restorable within the retention period; module data is never deleted.',
        '**Concurrency**: `ETag: "<revision>"`; writes need `If-Match` or `expectedRevision`; stale → 409 `conflict` with `details.currentRevision`.',
        '**Idempotency**: `Idempotency-Key` replays the first outcome for 24 hours (required for creates).',
        '**Dry run**: `?dryRun=true` on consequential writes validates and returns the would-be result; nothing is committed (`x-dry-run`).',
        '**Destructive operations** need `X-Confirm: <project key>` (`x-destructive`).',
        '**Errors**: `{ "error": { "code", "message", "details" } }` with codes invalid (400/422/428), unauthenticated (401), forbidden (403), not-found (404), conflict (409), unavailable (503/500).',
        '**Events**: committed changes only (transactional outbox), Server-Sent Events at `/projects/{projectId}/events`; dedupe by `eventId`.',
        '**Authorization**: authentication plus project role (no tool entitlement: Project Management is on every plan). See `x-permissions` and `x-roles`. Development identities use `X-Dev-User` (refused in production).',
      ].join('\n'),
    },
    servers: [{ url: BASE_PATH }],
    components: {
      schemas: components,
      securitySchemes: {
        devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only: seeded user ID such as ada, rui, eli, rho, nia' },
        bearer: { type: 'http', scheme: 'bearer', description: 'Production integration point: OIDC access token validated by the API host (not implemented)' },
      },
    },
    paths,
    'x-roles': Object.fromEntries(ROLES.map((role) => [role, (Object.keys(PERMISSIONS) as Permission[]).filter((p) => rolesWith(p).includes(role))])),
    'x-permission-labels': Object.fromEntries(Object.entries(PERMISSIONS).map(([k, p]) => [k, p.label])),
    'x-link-rules': LINK_RULES,
    'x-module-owned-links': MODULE_OWNED_LINKS,
    'x-work-items': WORK_ITEM_STATUSES,
  }
}
