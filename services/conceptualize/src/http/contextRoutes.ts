import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import type { SelectContextRequest } from '@ews/platform-sdk'
import { selectContext } from '../store/contextSelect'
import { registerRoute, type HostServices, type RouteSpec } from './route'
import * as S from './schemas'

/** The context selector (SDK 1.15 `selectContext`, ADR-0085). A read operation called in-process by the assistant as the signed-in person. */
export const SELECT_CONTEXT_PATH = '/projects/{projectId}/select-context'

export function registerContextRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  registerRoute(
    app,
    services,
    {
      method: 'POST',
      path: SELECT_CONTEXT_PATH,
      operationId: 'selectContext',
      tag: 'Context',
      summary: 'Select context items for an AI operation (references with exact revisions and bounded projections); read-only',
      description:
        'Returns ranked snapshot items (the active intent, hosts, constraints, interfaces, assumptions, open unknowns, architectures) with section, mandatory flag, exact revision and a bounded projection: quantities with unit, tolerance and datum, and summaries of at most 2,000 characters. Never document bytes. Mandatory items are hard constraints in force, critical interfaces and material unknowns. Project scope and the caller’s role apply; nothing is written.',
      params: Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) }),
      body: Type.Object(
        {
          projectId: Type.Optional(Type.String()),
          configurationId: Type.Optional(Type.String()),
          operation: Type.String({ minLength: 1, maxLength: 200 }),
          targets: Type.Array(Type.Object({ module: Type.String(), id: Type.String(), revision: Type.Optional(Type.Integer()), kind: Type.Optional(Type.String()), label: Type.Optional(Type.String()) }), { maxItems: 100 }),
          budget: Type.Object({ maxTokens: Type.Integer({ minimum: 1 }), maxItems: Type.Integer({ minimum: 1, maximum: 400 }), maxBytes: Type.Integer({ minimum: 1 }) }),
          sections: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      permission: 'read',
      responses: { 200: { description: 'SelectContextResponse', schema: Type.Object({}, { additionalProperties: true }) }, 400: { description: 'invalid', schema: S.ErrorBody }, 403: { description: 'forbidden', schema: S.ErrorBody } },
      handler: async (rc) => ({ body: await rc.read((ctx) => selectContext(ctx.db, rc.projectId, rc.body as SelectContextRequest)) }),
    },
    registry,
  )
}
