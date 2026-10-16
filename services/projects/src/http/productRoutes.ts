import { Type } from '@sinclair/typebox'
import { addEdge, breakdownTree, createBreakdown, createElement, elementHistory, getElement, listBreakdowns, listElements, removeEdge, updateElement, ELEMENT_KINDS, BREAKDOWN_PURPOSES } from '../store/product'
import type { RouteSpec } from './route'

/**
 * Product registry API (ADR-0063, integration milestone 1 C2): the authoritative server-side home of product,
 * system, subsystem, assembly and part elements and their breakdowns. Other modules reference elements as
 * `ArtifactRef { module: 'product', kind: 'product-element', id: <uuid>, revision }`. Twin IDs of the example
 * project (ACT-100, ROD-120 …) resolve as aliases.
 */
const L = (...values: readonly string[]) => Type.Union(values.map((v) => Type.Literal(v)))
const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const PE = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }), elementId: Type.String({ minLength: 1, maxLength: 100, description: 'Element UUID or a twin alias such as ROD-120' }) })
const PB = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }), breakdownId: Type.String({ format: 'uuid' }) })
const err = (description: string) => ({ description, schema: Type.Ref('Error') as never })
const Quantity = Type.Object({ value: Type.Number(), unit: Type.String({ minLength: 1, maxLength: 40 }) }, { additionalProperties: false })
const PropertyValue = Type.Union([Type.String({ maxLength: 5000 }), Type.Number(), Type.Boolean(), Type.Array(Type.String({ maxLength: 500 }), { maxItems: 100 }), Quantity])
const Properties = Type.Record(Type.String({ pattern: '^[A-Za-z][A-Za-z0-9_]{0,59}$' }), PropertyValue, { description: 'Typed properties; quantities as { value, unit } with platform units' })

export const ProductElement = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    projectId: Type.String(),
    key: Type.String(),
    name: Type.String(),
    elementKind: L(...ELEMENT_KINDS),
    description: Type.String(),
    properties: Type.Record(Type.String(), Type.Unknown()),
    lifecycle: Type.String(),
    aliases: Type.Array(Type.String()),
    artifactId: Type.Optional(Type.String()),
    createdAt: Type.String(),
    createdBy: Type.String(),
    updatedAt: Type.String(),
    updatedBy: Type.String(),
    revision: Type.Integer(),
  },
  { $id: 'ProductElement' },
)

export const Breakdown = Type.Object(
  { id: Type.String({ format: 'uuid' }), projectId: Type.String(), name: Type.String(), purpose: L(...BREAKDOWN_PURPOSES), description: Type.String(), revision: Type.Integer(), createdAt: Type.String(), createdBy: Type.String() },
  { $id: 'Breakdown' },
)

export const PRODUCT_SCHEMAS = [ProductElement, Breakdown]

export function registerProductRoutes(route: (spec: RouteSpec) => void) {
  route({
    method: 'GET',
    path: '/projects/{projectId}/product-elements',
    operationId: 'listProductElements',
    tag: 'Product structure',
    summary: 'Product elements of the project (product, system, subsystem, assembly, part, other)',
    params: P,
    query: Type.Object({ q: Type.Optional(Type.String({ maxLength: 200 })), elementKind: Type.Optional(L(...ELEMENT_KINDS)) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Elements', schema: Type.Array(Type.Ref('ProductElement')) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listElements(ctx, rc.query as never)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/product-elements',
    operationId: 'createProductElement',
    tag: 'Product structure',
    summary: 'Create a product element, optionally placed in a breakdown',
    description: 'The kind is a label: any kind may contain any other kind, and a Concept may stand for a whole system before any element exists.',
    params: P,
    query: Type.Object({ dryRun: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    body: Type.Object(
      {
        name: Type.String({ minLength: 1, maxLength: 200 }),
        elementKind: L(...ELEMENT_KINDS),
        description: Type.Optional(Type.String({ maxLength: 20000 })),
        properties: Type.Optional(Properties),
        placement: Type.Optional(Type.Object({ breakdownId: Type.String({ format: 'uuid' }), parentId: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])), quantity: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) }, { additionalProperties: false })),
      },
      { additionalProperties: false, examples: [{ name: 'Example product', elementKind: 'product' }] },
    ),
    permission: 'edit',
    dryRun: true,
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: Type.Ref('ProductElement') as never }, 404: err('Breakdown or parent not found'), 422: err('Invalid') },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const e = await createElement(ctx, rc.body as never)
        return { status: 201, etag: e.revision, body: e }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/product-elements/{elementId}',
    operationId: 'getProductElement',
    tag: 'Product structure',
    summary: 'A product element (by UUID or twin alias)',
    params: PE,
    permission: 'read',
    responses: { 200: { description: 'The element', schema: Type.Ref('ProductElement') as never }, 404: err('Not found') },
    handler: async (rc) => {
      const e = await rc.read((ctx) => getElement(ctx, rc.params.elementId))
      return { etag: e.revision, body: e }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/product-elements/{elementId}',
    operationId: 'updateProductElement',
    tag: 'Product structure',
    summary: 'Edit a product element (new immutable revision); properties are merged',
    params: PE,
    body: Type.Object(
      { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })), elementKind: Type.Optional(L(...ELEMENT_KINDS)), description: Type.Optional(Type.String({ maxLength: 20000 })), properties: Type.Optional(Properties), lifecycle: Type.Optional(L('working', 'in-review', 'released', 'superseded', 'retired')) },
      { additionalProperties: false },
    ),
    permission: 'edit',
    concurrency: 'Required: If-Match "<revision>" or expectedRevision',
    idempotency: 'optional',
    responses: { 200: { description: 'Updated', schema: Type.Ref('ProductElement') as never }, 409: err('Stale revision'), 422: err('Invalid') },
    handler: async (rc) => {
      const { expectedRevision, ...input } = rc.body as { expectedRevision?: number } & Record<string, unknown>
      const expected = rc.expected(expectedRevision)
      return rc.write(async (ctx) => {
        const e = await updateElement(ctx, rc.params.elementId, expected, input as never)
        return { etag: e.revision, body: e }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/product-elements/{elementId}/history',
    operationId: 'productElementHistory',
    tag: 'Product structure',
    summary: 'Immutable revisions of a product element',
    params: PE,
    permission: 'read',
    responses: { 200: { description: 'Newest first', schema: Type.Array(Type.Object({ revision: Type.Integer(), changedAt: Type.String(), changedBy: Type.String(), summary: Type.String(), snapshot: Type.Unknown() })) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => elementHistory(ctx, rc.params.elementId)) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/breakdowns',
    operationId: 'listBreakdowns',
    tag: 'Product structure',
    summary: 'Named breakdowns (product breakdown, physical assembly, other)',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Breakdowns', schema: Type.Array(Type.Ref('Breakdown')) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listBreakdowns(ctx)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/breakdowns',
    operationId: 'createBreakdown',
    tag: 'Product structure',
    summary: 'Create a breakdown',
    params: P,
    body: Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }), purpose: L(...BREAKDOWN_PURPOSES), description: Type.Optional(Type.String({ maxLength: 5000 })) }, { additionalProperties: false }),
    permission: 'edit',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: Type.Ref('Breakdown') as never }, 409: err('Name taken'), 422: err('Invalid') },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await createBreakdown(ctx, rc.body as never) })),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/breakdowns/{breakdownId}/tree',
    operationId: 'breakdownTree',
    tag: 'Product structure',
    summary: 'The breakdown as a tree (a projection; elements under two parents appear twice) plus unplaced elements',
    params: PB,
    permission: 'read',
    responses: { 200: { description: 'Tree', schema: Type.Object({ breakdown: Type.Ref('Breakdown'), roots: Type.Array(Type.Unknown()), unplaced: Type.Array(Type.String()) }) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => breakdownTree(ctx, rc.params.breakdownId)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/breakdowns/{breakdownId}/edges',
    operationId: 'addBreakdownEdge',
    tag: 'Product structure',
    summary: 'Place an element in a breakdown (below a parent, or as a root); cycles are refused',
    params: PB,
    body: Type.Object({ parentId: Type.Union([Type.String({ maxLength: 100 }), Type.Null()]), childId: Type.String({ minLength: 1, maxLength: 100 }), quantity: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), position: Type.Optional(Type.Integer({ minimum: 0 })) }, { additionalProperties: false }),
    permission: 'edit',
    idempotency: 'optional',
    responses: { 201: { description: 'Edge', schema: Type.Object({ id: Type.String(), breakdownId: Type.String(), parentId: Type.Union([Type.String(), Type.Null()]), childId: Type.String(), quantity: Type.Union([Type.Number(), Type.Null()]), position: Type.Integer() }) as never }, 409: err('Already placed'), 422: err('Cycle or invalid') },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await addEdge(ctx, rc.params.breakdownId, rc.body as never) })),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/breakdowns/{breakdownId}/edges/{edgeId}/remove',
    operationId: 'removeBreakdownEdge',
    tag: 'Product structure',
    summary: 'Remove an element from a breakdown position (recorded; the element stays)',
    params: Type.Object({ projectId: Type.String(), breakdownId: Type.String({ format: 'uuid' }), edgeId: Type.String({ format: 'uuid' }) }),
    permission: 'edit',
    idempotency: 'optional',
    responses: { 204: { description: 'Removed' }, 404: err('Not found') },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        await removeEdge(ctx, rc.params.breakdownId, rc.params.edgeId)
        return { status: 204 }
      }),
  })
}
