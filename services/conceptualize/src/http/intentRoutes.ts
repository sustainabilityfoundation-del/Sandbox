import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import { intentContext, intentGaps, listIntentRevisions, listIntents, createIntent, requireIntent, resolveIntent, updateIntent } from '../store/intents'
import { registerRoute, type HostServices, type RequestContext, type RouteSpec } from './route'
import * as I from './intentSchemas'
import * as S from './schemas'

const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const PI = Type.Object({ projectId: Type.String(), intentId: Type.String() })
const E = {
  400: { description: 'Malformed request (invalid)', schema: S.ErrorBody },
  401: { description: 'No identity (unauthenticated)', schema: S.ErrorBody },
  403: { description: 'Not entitled or role does not allow it (forbidden)', schema: S.ErrorBody },
  404: { description: 'Not found', schema: S.ErrorBody },
  409: { description: 'Revision conflict (conflict)', schema: S.ErrorBody },
  422: { description: 'Semantically invalid (invalid)', schema: S.ErrorBody },
  503: { description: 'Database not available (unavailable)', schema: S.ErrorBody },
}
const READ = { 400: E[400], 401: E[401], 403: E[403], 404: E[404], 503: E[503] }
const WRITE = { ...READ, 409: E[409], 422: E[422] }
const CONC = 'Expected revision as an ETag; alternative to expectedRevision in the body'
const body = <T>(rc: RequestContext) => rc.body as T
const base = (rc: RequestContext) => `/api/concepts/v1/projects/${rc.projectId}`
const RevisionQuery = Type.Object({ revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false })

/** Engineering Intent routes (ECII increment 1). The intent is addressed by its UUID or its key (INT-001). */
export function registerIntentRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)
  route({
    method: 'GET', path: '/projects/{projectId}/intents', operationId: 'listIntents', tag: 'Intent', summary: 'Engineering intents (excluding retired unless a status filter is given)', params: P,
    query: Type.Object({ status: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Intents', schema: Type.Array(I.IntentDto) }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => listIntents(ctx.db, rc.projectId, rc.query as { status?: string })) }),
  })
  route({
    method: 'POST', path: '/projects/{projectId}/intents', operationId: 'createIntent', tag: 'Intent', summary: 'Create an engineering intent (revision 1; basis ai-hypothesis when written by the assistant)', params: P, body: I.IntentCreate,
    permission: 'author', idempotency: 'required', responses: { 201: { description: 'Created', schema: I.IntentDto }, ...WRITE },
    handler: async (rc) => rc.write(async (ctx) => { const i = await createIntent(ctx, body(rc)); return { status: 201, body: i, etag: i.revision, headers: { Location: `${base(rc)}/intents/${i.id}` } } }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/intents/{intentId}', operationId: 'getIntent', tag: 'Intent', summary: 'Read an intent (current or an exact revision) by ID or key', params: PI, query: RevisionQuery,
    permission: 'read', crossModule: true, concurrency: CONC, responses: { 200: { description: 'Intent', schema: I.IntentDto }, ...READ },
    handler: async (rc) => {
      const revision = (rc.query as { revision?: number }).revision
      const i = await rc.read((ctx) => (revision ? requireIntent(ctx.db, rc.projectId, rc.params.intentId, revision) : resolveIntent(ctx.db, rc.projectId, rc.params.intentId)))
      return { body: i, etag: i.revision }
    },
  })
  route({
    method: 'PATCH', path: '/projects/{projectId}/intents/{intentId}', operationId: 'updateIntent', tag: 'Intent', summary: 'Revise an intent (new immutable revision) or change its status', params: PI, body: I.IntentPatch,
    permission: 'author', idempotency: 'optional', concurrency: CONC, responses: { 200: { description: 'Intent', schema: I.IntentDto }, ...WRITE },
    handler: async (rc) => { const b = body<I.IntentPatchDto>(rc); const ex = rc.expected(b.expectedRevision); return rc.write(async (ctx) => { const i = await updateIntent(ctx, rc.params.intentId, b, ex); return { body: i, etag: i.revision } }) },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/intents/{intentId}/revisions', operationId: 'listIntentRevisions', tag: 'Intent', summary: 'Revisions of an intent with provenance', params: PI,
    permission: 'read', crossModule: true, responses: { 200: { description: 'Revisions', schema: Type.Array(S.RevisionSummary) }, ...READ },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => { const i = await resolveIntent(ctx.db, rc.projectId, rc.params.intentId); return listIntentRevisions(ctx.db, rc.projectId, i.id) }) }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/intents/{intentId}/gaps', operationId: 'identifyIntentGaps', tag: 'Intent',
    summary: 'Missing information of an intent in four tiers (essential, concept, detail, immaterial); deterministic',
    description: 'Computed from the structure of the intent revision: the integration mode, the external systems and whether they are identified, the open information needs and the open questions. No model and no keyword rules. A standalone intent has no system gaps.',
    params: PI, query: RevisionQuery, permission: 'read', crossModule: true, responses: { 200: { description: 'Gaps', schema: I.IntentGaps }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => intentGaps(ctx.db, rc.projectId, rc.params.intentId, (rc.query as { revision?: number }).revision)) }),
  })
  route({
    method: 'GET', path: '/projects/{projectId}/intents/{intentId}/context', operationId: 'readIntentContext', tag: 'Intent',
    summary: 'The intent with its assumptions, the project constraints and concepts, its open questions and its gaps', params: PI,
    permission: 'read', crossModule: true, responses: { 200: { description: 'Context', schema: I.IntentContext }, ...READ },
    handler: async (rc) => ({ body: await rc.read((ctx) => intentContext(ctx.db, rc.projectId, rc.params.intentId)) }),
  })
}
