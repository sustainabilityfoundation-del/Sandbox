import type { TSchema } from '@sinclair/typebox'
import { BASIS_MEANING, GATED_MATURITIES, LINK_MEANING, MATURITY_MEANING, PERMISSIONS, RELATIONSHIP_RULES, ROLES } from '../domain/rules'
import { TRADE_METHOD } from '../domain/tradeStudy'
import { COMMON_UNITS } from '../domain/units'
import { CROSS_MODULE_ENTITLEMENTS, ENTITLEMENT, type RouteSpec } from './route'
import { DESIGN_SCHEMAS } from './designSchemas'
import { SCHEMAS as BASE_SCHEMAS } from './schemas'

const REPLACED = new Set(['Decision', 'DecisionCreate', 'Evidence', 'EvidenceCreate'])
const SCHEMAS = [...BASE_SCHEMAS.filter((s) => !REPLACED.has(s.$id as string)), ...DESIGN_SCHEMAS]

/** Strips TypeBox symbols and replaces named sub-schemas by `$ref`s to components. */
/**
 * Design Reasoning R1 operation names (contract-change-requests.md R1-1) for the operations that implement
 * them. v1 operationIds are kept (agreed 15 Oct 2026: renaming would break generated clients); POST /batch
 * accepts the R1 names as item ops.
 */
export const R1_OPERATION: Record<string, string> = {
  createFunction: 'createFunction',
  createConcept: 'createConcept',
  createConstraint: 'createConstraint',
  reviseConstraint: 'reviseConstraint',
  createAssumption: 'createAssumption',
  setAssumptionValidation: 'setAssumptionValidation',
  createEvidence: 'createEvidence',
  reviewEvidence: 'reviewEvidence',
  createDesignLink: 'createLink',
  createAlternativeSet: 'createAlternativeSet',
  createTradeStudy: 'createTradeStudy',
  putTradeScores: 'putScores',
  createDecision: 'proposeDecision',
  recordDecision: 'recordDecision',
  flagDecisionForReview: 'flagDecisionForReview',
  createImplementation: 'createImplementation',
  traverseGraph: 'traverse',
  decisionRationale: 'decisionRationale',
  listLinkTypes: 'linkTypes',
  listDesignLinks: 'links',
}

export function toJsonSchema(schema: unknown, root: string | null, names: Set<string>): unknown {
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
export const BASE_PATH = '/api/concepts/v1'

const PROVENANCE_HEADERS = [
  { name: 'X-Source-Kind', in: 'header', required: false, schema: { type: 'string', enum: ['user', 'assistant', 'import'] }, description: 'Origin of the change (default user). Assistant changes may only record ai-hypothesis, assumption or estimate and cannot pass approval gates.' },
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
      params.push({ name, in: 'query', required: q?.required?.includes(name) ?? false, schema: toJsonSchema(schema, null, names), ...(schema.description ? { description: schema.description } : {}) })
    }
    if (r.method !== 'GET') {
      if (r.idempotency) params.push({ name: 'Idempotency-Key', in: 'header', required: r.idempotency === 'required', schema: { type: 'string', maxLength: 200 }, description: 'Retries with the same key return the first outcome (stored 24 h). Reusing a key for a different request fails with invalid.' })
      if (r.concurrency) params.push({ name: 'If-Match', in: 'header', required: false, schema: { type: 'string', examples: ['"3"'] }, description: r.concurrency })
      params.push(...PROVENANCE_HEADERS)
    }
    const responses: Record<string, unknown> = {}
    for (const [status, resp] of Object.entries(r.responses)) {
      responses[status] = {
        description: resp.description,
        ...(resp.schema ? { content: { [resp.contentType ?? 'application/json']: { schema: toJsonSchema(resp.schema, null, names) } } } : {}),
        ...(status.startsWith('2') && r.concurrency ? { headers: { ETag: { schema: { type: 'string' }, description: 'Revision of the returned entity' } } } : {}),
      }
    }
    if (!responses['500']) {
      responses['500'] = {
        description: 'Unexpected internal error: code `unavailable`, `details.reason` = `internal-error`, `details.errorId` (logged server-side). A write was rolled back.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      }
    }
    const op: Record<string, unknown> = {
      operationId: r.operationId,
      summary: r.summary,
      ...(r.description || r.notes ? { description: [r.description, r.notes].filter(Boolean).join('\n\n') } : {}),
      tags: [r.tag],
      parameters: params,
      responses,
      security: [{ devUser: [] }, { bearer: [] }],
      ...(R1_OPERATION[r.operationId] ? { 'x-r1-operation': R1_OPERATION[r.operationId] } : {}),
      ...(r.operationId === 'createLink' ? { 'x-r1-note': 'Concept→artifact link (v1). The R1 operation createLink is createDesignLink; in a batch this operation is createConceptLink.' } : {}),
      'x-permissions': {
        permission: r.permission,
        roles: ROLES.filter((role) => (r.anyOf ?? [r.permission]).some((p) => PERMISSIONS[p].roles.includes(role))),
        ...(r.anyOf ? { anyOf: r.anyOf } : {}),
        entitlements: r.crossModule ? [ENTITLEMENT, ...CROSS_MODULE_ENTITLEMENTS] : [ENTITLEMENT],
        ...(r.crossModule ? { note: 'SDK read subset (ConceptsService): another tool entitlement suffices' } : {}),
      },
    }
    if (r.body) {
      op.requestBody = { required: true, content: { 'application/json': { schema: toJsonSchema(r.body, null, names), ...((r.body as { examples?: unknown[] }).examples ? { example: (r.body as { examples: unknown[] }).examples[0] } : {}) } } }
    }
    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method.toLowerCase()]: op }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Conceptualize API',
      version: API_VERSION,
      description: [
        'PostgreSQL-backed Conceptualize service of the engineering platform. Versioned by path (`/api/concepts/v1`). A **Concept** is a persistent, implementation-independent engineering idea; **ConceptImplementations** link Concepts to version-aware references of artifacts owned by other modules (requirements, SysML elements, CAD, analysis, twin artifacts). Concept identity never changes when an implementation is replaced.',
        '',
        '**Identity**: canonical IDs are UUIDs; keys such as `CON-001`, `DEC-001`, `TS-001`, `IMP-001` are display text.',
        '**Revisions**: every content change of a Concept creates an immutable revision with provenance. Maturity and verification status are recorded events, separate from implementation status (derived from implementations).',
        '**Basis of knowledge**: statements, scores and evidence carry a basis (user-assertion, ai-hypothesis, assumption, estimate, evidence, decision); AI output is never promoted silently (see `x-basis`).',
        '**Concurrency**: responses carry `ETag: "<revision>"`; writes need `If-Match` or `expectedRevision` and fail with 409 `conflict` (details.currentRevision) instead of overwriting.',
        '**Idempotency**: `Idempotency-Key` on POST replays the first outcome for 24 hours (required for creates).',
        '**Provenance**: `X-Source-Kind`, `X-Conversation-Id`, `X-Proposal-Id`, `X-Message-Id` on writes; assistant changes must name their proposal. Recorded with revisions, links, scores, evidence and audit events.',
        '**Errors**: `{ "error": { "code", "message", "details" } }` with codes invalid (400/422), unauthenticated (401), forbidden (403), not-found (404), conflict (409), unavailable (503/500).',
        '**Events**: committed changes only (transactional outbox), Server-Sent Events at `/projects/{projectId}/events`; dedupe by `eventId`. Trade-study changes are announced as `concept.revised` with the study ID as entityId.',
        `**Authorization**: entitlement \`${ENTITLEMENT}\` and project role; see \`x-permissions\` per operation and \`x-roles\`. Development identities use \`X-Dev-User\` (refused in production).`,
        '**Integration**: the service stores references, never copies of other modules\' data. Stale and broken references are detected by clients through the owning modules (v1). Analysis references come only from a labelled test adapter (no Analysis module); CAD generation is a recorded realization request (no CAD API).',
      ].join('\n'),
    },
    servers: [{ url: BASE_PATH }],
    components: {
      schemas: components,
      securitySchemes: {
        devUser: { type: 'apiKey', in: 'header', name: 'X-Dev-User', description: 'Development only (NODE_ENV !== production): seeded user ID such as ada, rui, eli, rho' },
        bearer: { type: 'http', scheme: 'bearer', description: 'Production integration point: OIDC access token validated by the API host (not implemented)' },
      },
    },
    paths,
    'x-roles': Object.fromEntries(ROLES.map((role) => [role, Object.entries(PERMISSIONS).filter(([, p]) => p.roles.includes(role)).map(([k]) => k)])),
    'x-permission-labels': Object.fromEntries(Object.entries(PERMISSIONS).map(([k, p]) => [k, p.label])),
    'x-maturity': { meaning: MATURITY_MEANING, approvalGates: GATED_MATURITIES, rules: ['No mandatory sequence', 'Entering selected, engineering-development, implemented or verified needs reviewer or administrator', 'Superseding or archiving a Concept that is selected or later needs reviewer or administrator', 'implemented needs an implementation with status implemented', 'verified needs verification status verified'] },
    'x-basis': BASIS_MEANING,
    'x-relationship-types': RELATIONSHIP_RULES,
    'x-link-relations': LINK_MEANING,
    'x-trade-study-method': TRADE_METHOD,
    'x-units': { examples: COMMON_UNITS, note: 'SI base and derived units with prefixes, products (*, ·), quotients (/), powers (^2, ²), %, rpm, °C/°F (absolute only), currencies (no conversion between currencies).' },
  }
}
