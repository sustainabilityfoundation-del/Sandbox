import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import type { ReadinessActivity } from '../domain/architecture'
import { diversityOf, readinessOf } from '../store/architecture'
import { registerRoute, type HostServices, type RouteSpec } from './route'
import * as A from './architectureSchemas'
import * as S from './schemas'

const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const E = {
  400: { description: 'Malformed request (invalid)', schema: S.ErrorBody },
  401: { description: 'No identity (unauthenticated)', schema: S.ErrorBody },
  403: { description: 'Not entitled or role does not allow it (forbidden)', schema: S.ErrorBody },
  404: { description: 'Not found', schema: S.ErrorBody },
  422: { description: 'Semantically invalid (invalid)', schema: S.ErrorBody },
  503: { description: 'Database not available (unavailable)', schema: S.ErrorBody },
}
const READ = { 400: E[400], 401: E[401], 403: E[403], 404: E[404], 422: E[422], 503: E[503] }
const csv = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined)

/** Architecture diversity and context readiness routes (ECII increment 2): read-only calculations. */
export function registerArchitectureRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)
  route({
    method: 'GET', path: '/projects/{projectId}/diversity', operationId: 'assessDiversity', tag: 'Architecture',
    summary: 'Are these alternatives really different architectures? Deterministic comparison of their architecture blocks',
    description: 'Compares the structured architecture fields (host interface, attachment principle, interface geometry, load path, installation and removal) as text, never by keyword. Alternatives marked as variants of an architecture, and alternatives whose architecture fields say the same, are reported as variants and not counted as distinct architectures. Name the alternatives with conceptIds, setId or parentId.',
    params: P,
    query: Type.Object({ conceptIds: Type.Optional(Type.String({ description: 'Comma-separated Concept IDs' })), setId: Type.Optional(Type.String()), parentId: Type.Optional(Type.String()), minimum: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Assessment', schema: A.DiversityResult }, ...READ },
    handler: async (rc) => {
      const q = rc.query as { conceptIds?: string; setId?: string; parentId?: string; minimum?: number }
      return { body: await rc.read((ctx) => diversityOf(ctx.db, rc.projectId, { conceptIds: csv(q.conceptIds), setId: q.setId, parentId: q.parentId, minimum: q.minimum })) }
    },
  })
  route({
    method: 'GET', path: '/projects/{projectId}/readiness', operationId: 'evaluateReadiness', tag: 'Architecture',
    summary: 'Context readiness for the downstream activities (architecture concepts, host-specific concepts, dimensioned design, CAD handoff); advisory',
    description: 'Per activity, not one completeness percentage. Levels: not established, Exploratory, Context Established, Interfaces Verified. Computed from the intent (latest active, or intentId), its gaps and the architecture blocks of the named Concept (conceptId) or of the project. Phase 1: advisory; the result labels output provisional and lists the unmet items.',
    params: P,
    query: Type.Object({ intentId: Type.Optional(Type.String()), activity: Type.Optional(Type.String()), conceptId: Type.Optional(Type.String()) }, { additionalProperties: false }),
    permission: 'read', crossModule: true, responses: { 200: { description: 'Readiness', schema: A.ReadinessResult }, ...READ },
    handler: async (rc) => {
      const q = rc.query as { intentId?: string; activity?: string; conceptId?: string }
      return { body: await rc.read((ctx) => readinessOf(ctx.db, rc.projectId, { intentId: q.intentId, activity: q.activity as ReadinessActivity | undefined, conceptId: q.conceptId })) }
    },
  })
}

