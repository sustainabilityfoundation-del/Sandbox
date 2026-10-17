import { Type, type Static, type TSchema } from '@sinclair/typebox'

/**
 * Request and response schemas of the Requirements API (v1). One source for runtime validation
 * (Fastify/Ajv), TypeScript types and the OpenAPI 3.1 document.
 */

const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])
export const Uuid = Type.String({ format: 'uuid', description: 'Canonical identity (UUID)' })
export const Timestamp = Type.String({ format: 'date-time', description: 'RFC 3339 UTC timestamp with milliseconds, set by the server', examples: ['2026-10-13T09:30:00.000Z'] })
export const Status = Type.Union([Type.Literal('draft'), Type.Literal('in-review'), Type.Literal('approved'), Type.Literal('retired')], { description: 'Lifecycle status' })
export const Priority = Type.Union([Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')])
export const AttributeValue = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Array(Type.String()), Type.Null()], {
  description: 'Typed value: string/date (YYYY-MM-DD)/xhtml as string, integer/real as number, boolean, enumeration as array of enum value keys',
})
export const RelationshipType = Type.Union([Type.Literal('derives-from'), Type.Literal('decomposes'), Type.Literal('depends-on'), Type.Literal('allocated-to')])

export const ErrorBody = Type.Object(
  {
    error: Type.Object({
      code: Type.Union([Type.Literal('invalid'), Type.Literal('unauthenticated'), Type.Literal('forbidden'), Type.Literal('not-found'), Type.Literal('conflict'), Type.Literal('unavailable')]),
      message: Type.String(),
      details: Type.Optional(
        Type.Object(
          {
            currentRevision: Type.Optional(Type.Integer()),
            fields: Type.Optional(Type.Record(Type.String(), Type.String())),
          },
          { additionalProperties: true },
        ),
      ),
    }),
  },
  { $id: 'Error', examples: [{ error: { code: 'conflict', message: 'REQ-001 changed since revision 3 (now 4).', details: { currentRevision: 4 } } }] },
)

// ---- requirements ------------------------------------------------------------------------------------

export const Origin = Type.Union([Type.Literal('stakeholder'), Type.Literal('ai-proposed'), Type.Literal('derived')], {
  description: 'Where the requirement came from: a stakeholder (user constraint), an AI-proposed choice a person accepted, or derived from another requirement (with a derives-from relationship). Null: not recorded.',
})

export const Requirement = Type.Object(
  {
    id: Uuid,
    key: Type.String({ description: 'Human-readable identifier, unique per project; display only, may be renumbered', examples: ['REQ-001'] }),
    projectId: Type.String(),
    revision: Type.Integer({ minimum: 1, description: 'Immutable content revision' }),
    title: Type.String(),
    statement: Type.String({ description: 'Normative text only' }),
    statementXhtml: Nullable(Type.String({ description: 'Sanitised XHTML rich text (imported); the plain statement remains authoritative' })),
    rationale: Type.String(),
    type: Type.String(),
    source: Type.String(),
    owner: Nullable(Type.String()),
    priority: Nullable(Priority),
    status: Status,
    archived: Type.Boolean(),
    applicability: Type.Array(Type.String(), { description: 'Configuration IDs the requirement applies to; empty means all' }),
    verificationMethods: Type.Array(Type.String()),
    acceptanceCriteria: Type.String(),
    origin: Nullable(Origin),
    attributes: Type.Record(Type.String(), AttributeValue, { description: 'Custom attribute values keyed by attribute definition ID' }),
    legacyIds: Type.Array(Type.String(), { description: 'Resolvable aliases such as legacy twin IDs' }),
    changeReason: Type.String({ description: 'Reason recorded with this revision' }),
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
    openReviewId: Nullable(Uuid),
    /** Set when read from a baseline. */
    baselineId: Type.Optional(Uuid),
  },
  {
    $id: 'Requirement',
    examples: [
      {
        id: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001',
        key: 'REQ-001',
        projectId: 'PRJ-ACT100',
        revision: 1,
        title: 'Operating load',
        statement: 'The actuator shall withstand an operating load of 12 kN in the maximum-load scenario with a positive margin of safety.',
        statementXhtml: null,
        rationale: 'Peak press-fit force measured on the customer line is 11 kN; 12 kN adds a handling allowance.',
        type: 'performance',
        source: 'Customer specification CS-ACT-100 §4.1',
        owner: 'eli',
        priority: 'high',
        status: 'approved',
        archived: false,
        applicability: [],
        verificationMethods: ['analysis', 'test'],
        acceptanceCriteria: 'Static analysis margin of safety > 0 at 12 kN; proof test at 12 kN without permanent deformation.',
        origin: null,
        attributes: {},
        legacyIds: ['REQ-001'],
        changeReason: 'Seeded from the sample twin',
        revisionCreatedAt: '2026-10-13T09:00:00.000Z',
        revisionCreatedBy: 'ada',
        createdAt: '2026-10-13T09:00:00.000Z',
        createdBy: 'ada',
        updatedAt: '2026-10-13T09:00:00.000Z',
        updatedBy: 'ada',
        openReviewId: null,
      },
    ],
  },
)
export type RequirementDto = Static<typeof Requirement>

const RequirementFields = {
  title: Type.String({ minLength: 1, maxLength: 300 }),
  statement: Type.String({ maxLength: 20000 }),
  rationale: Type.String({ maxLength: 20000 }),
  type: Type.String({ minLength: 1, maxLength: 60 }),
  source: Type.String({ maxLength: 2000 }),
  owner: Nullable(Type.String({ maxLength: 200 })),
  priority: Nullable(Priority),
  applicability: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 }),
  verificationMethods: Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { maxItems: 10 }),
  acceptanceCriteria: Type.String({ maxLength: 20000 }),
  origin: Nullable(Origin),
  attributes: Type.Record(Type.String(), AttributeValue),
}

export const RequirementCreate = Type.Object(
  {
    title: RequirementFields.title,
    statement: RequirementFields.statement,
    rationale: Type.Optional(RequirementFields.rationale),
    type: Type.Optional(RequirementFields.type),
    source: Type.Optional(RequirementFields.source),
    owner: Type.Optional(RequirementFields.owner),
    priority: Type.Optional(RequirementFields.priority),
    applicability: Type.Optional(RequirementFields.applicability),
    verificationMethods: Type.Optional(RequirementFields.verificationMethods),
    acceptanceCriteria: Type.Optional(RequirementFields.acceptanceCriteria),
    origin: Type.Optional(RequirementFields.origin),
    derivesFrom: Type.Optional(Type.String({ format: 'uuid', description: 'With origin "derived": the requirement this one derives from; the derives-from relationship is created in the same transaction' })),
    attributes: Type.Optional(RequirementFields.attributes),
    collectionId: Type.Optional(Uuid),
    parentNodeId: Type.Optional(Uuid),
    reason: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { $id: 'RequirementCreate', additionalProperties: false, examples: [{ title: 'Stroke speed', statement: 'The actuator shall extend at no less than 50 mm/s at nominal load.', type: 'performance' }] },
)
export type RequirementCreateDto = Static<typeof RequirementCreate>

export const RequirementPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1, description: 'Required unless If-Match is sent' })),
    reason: Type.Optional(Type.String({ maxLength: 2000 })),
    title: Type.Optional(RequirementFields.title),
    statement: Type.Optional(RequirementFields.statement),
    rationale: Type.Optional(RequirementFields.rationale),
    type: Type.Optional(RequirementFields.type),
    source: Type.Optional(RequirementFields.source),
    owner: Type.Optional(RequirementFields.owner),
    priority: Type.Optional(RequirementFields.priority),
    applicability: Type.Optional(RequirementFields.applicability),
    verificationMethods: Type.Optional(RequirementFields.verificationMethods),
    acceptanceCriteria: Type.Optional(RequirementFields.acceptanceCriteria),
    origin: Type.Optional(RequirementFields.origin),
    attributes: Type.Optional(Type.Record(Type.String(), AttributeValue, { description: 'Merged into the current values; null removes a value' })),
    key: Type.Optional(Type.String({ pattern: '^[A-Za-z][A-Za-z0-9_.-]{0,39}$', description: 'Renumber (administrators only)' })),
  },
  { $id: 'RequirementPatch', additionalProperties: false, examples: [{ expectedRevision: 3, statement: 'The actuator shall withstand 13 kN.', reason: 'Customer change request CR-12' }] },
)
export type RequirementPatchDto = Static<typeof RequirementPatch>

export const WriteOptions = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Type.Optional(Type.String({ maxLength: 2000 })) },
  { additionalProperties: false },
)

export const Transition = Type.Object(
  {
    action: Type.Union([Type.Literal('request-review'), Type.Literal('withdraw'), Type.Literal('reopen'), Type.Literal('retire'), Type.Literal('reinstate')], {
      description: 'Approve and reject are review decisions (POST …/reviews/{reviewId}/decisions)',
    }),
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    reason: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { $id: 'Transition', additionalProperties: false },
)

export function page<T extends TSchema>(item: T, id: string) {
  return Type.Object(
    { items: Type.Array(item), nextCursor: Type.Optional(Type.String()), total: Type.Optional(Type.Integer()) },
    { $id: id },
  )
}
export const RequirementPage = page(Requirement, 'RequirementPage')

export const RequirementListQuery = Type.Object(
  {
    text: Type.Optional(Type.String({ maxLength: 200, description: 'Words matched as prefixes in title, statement, rationale, source and acceptance criteria, or a key prefix' })),
    status: Type.Optional(Type.String({ description: 'Comma-separated statuses' })),
    type: Type.Optional(Type.String({ description: 'Comma-separated types' })),
    priority: Type.Optional(Type.String()),
    owner: Type.Optional(Type.String()),
    ids: Type.Optional(Type.String({ description: 'Comma-separated UUIDs' })),
    keys: Type.Optional(Type.String({ description: 'Comma-separated keys' })),
    collectionId: Type.Optional(Uuid),
    allocatedTo: Type.Optional(Type.String({ description: 'Allocation target IDs (comma-separated; component IDs, product element UUIDs or aliases): requirements allocated to any of them' })),
    includeArchived: Type.Optional(Type.Boolean()),
    configurationId: Type.Optional(Type.String({ description: 'Only requirements applicable to this configuration (empty applicability = all)' })),
    baselineId: Type.Optional(Uuid),
    sort: Type.Optional(Type.Union([Type.Literal('key'), Type.Literal('-updated')])),
    cursor: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  },
  { additionalProperties: false },
)
export type RequirementListQueryDto = Static<typeof RequirementListQuery>

export const RevisionSummary = Type.Object(
  { revision: Type.Integer(), title: Type.String(), changeReason: Type.String(), createdAt: Timestamp, createdBy: Type.String(), statusAtCreation: Status },
  { $id: 'RevisionSummary' },
)

export const FieldChange = Type.Object({ field: Type.String(), from: Type.Unknown(), to: Type.Unknown() })
export const RevisionComparison = Type.Object(
  { requirementId: Uuid, from: Type.Integer(), to: Type.Integer(), changes: Type.Array(FieldChange) },
  { $id: 'RevisionComparison' },
)

export const AuditEvent = Type.Object(
  {
    id: Type.String(),
    entityType: Type.String(),
    entityId: Type.String(),
    action: Type.String(),
    revision: Nullable(Type.Integer()),
    actor: Type.String(),
    occurredAt: Timestamp,
    reason: Type.String(),
    details: Type.Record(Type.String(), Type.Unknown()),
  },
  { $id: 'AuditEvent' },
)

// ---- relationships, trace, impact -----------------------------------------------------------------------

export const Relationship = Type.Object(
  {
    id: Uuid,
    projectId: Type.String(),
    type: RelationshipType,
    fromId: Uuid,
    toRequirementId: Nullable(Uuid),
    toTwinId: Nullable(Type.String({ description: 'Allocation target ID; targetKind says which directory it belongs to' })),
    targetKind: Type.Union([Type.Literal('twin'), Type.Literal('sysml-model-element')], { description: "'twin': component or product element (host twin directory); 'sysml-model-element': System Model element `<sysmlProjectId>/<elementId>`" }),
    toTargetRevision: Nullable(Type.Integer({ description: 'Revision of the target this relationship revision was made against (SysML commit number), if known' })),
    revision: Type.Integer(),
    deleted: Type.Boolean(),
    rationale: Type.String(),
    fromRequirementRevision: Type.Integer({ description: 'Revision of the from requirement when this relationship revision was made' }),
    toRequirementRevision: Nullable(Type.Integer()),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'Relationship' },
)
export type RelationshipDto = Static<typeof Relationship>

export const RelationshipCreate = Type.Object(
  {
    type: RelationshipType,
    fromId: Uuid,
    toRequirementId: Type.Optional(Uuid),
    toTwinId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    toSysmlElement: Type.Optional(Type.String({ minLength: 3, maxLength: 100, description: 'Allocation to a System Model element: `<sysmlProjectId>/<elementId>` (validated by the host)' })),
    expectedFromRevision: Type.Optional(Type.Integer({ minimum: 1, description: 'Refuse with 409 unless the from requirement is still at this revision' })),
    rationale: Type.Optional(Type.String({ maxLength: 2000 })),
    reason: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { $id: 'RelationshipCreate', additionalProperties: false, examples: [{ type: 'allocated-to', fromId: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', toTwinId: 'ROD-120' }] },
)

export const RelationshipRuleDto = Type.Object({ type: RelationshipType, to: Type.String(), acyclic: Type.Boolean(), meaning: Type.String(), reads: Type.String(), sysml: Type.String() })

export const TraceLink = Type.Object(
  {
    id: Type.String(),
    type: Type.String(),
    from: Type.String(),
    to: Type.String(),
    ownerModule: Type.Union([Type.Literal('requirements'), Type.Literal('sysml'), Type.Literal('verification')]),
    fromRevision: Type.Optional(Type.Integer()),
  },
  { $id: 'TraceLink' },
)

export const ImpactItem = Type.Object({
  kind: Type.Union([Type.Literal('requirement'), Type.Literal('twin-component'), Type.Literal('baseline'), Type.Literal('collection'), Type.Literal('review')]),
  id: Type.String(),
  label: Type.String(),
  via: Type.String(),
  depth: Type.Integer(),
})
export const Impact = Type.Object(
  { requirementId: Uuid, revision: Type.Integer(), items: Type.Array(ImpactItem), note: Type.String() },
  { $id: 'Impact' },
)

export const TraceMatrix = Type.Object(
  {
    rows: Type.Array(Type.Object({ id: Uuid, key: Type.String(), title: Type.String() })),
    columns: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), kind: Type.String() })),
    cells: Type.Array(Type.Object({ row: Uuid, column: Type.String(), types: Type.Array(Type.String()) })),
    truncated: Type.Boolean(),
  },
  { $id: 'TraceMatrix' },
)

// ---- collections -------------------------------------------------------------------------------------------

/** Nodes are returned flat, in document order (depth-first), with parent, position and depth. */
export const CollectionNode = Type.Object(
  {
    id: Uuid,
    parentId: Nullable(Uuid),
    position: Type.Integer({ minimum: 0, description: 'Order among siblings' }),
    depth: Type.Integer({ minimum: 0 }),
    /** Outline number such as "2.1.3", derived from the structure. */
    number: Type.String(),
    kind: Type.Union([Type.Literal('heading'), Type.Literal('requirement')]),
    heading: Nullable(Type.String()),
    requirementId: Nullable(Uuid),
    key: Nullable(Type.String()),
    title: Nullable(Type.String()),
    status: Nullable(Status),
  },
  { $id: 'CollectionNode' },
)

export const Collection = Type.Object(
  {
    id: Uuid,
    projectId: Type.String(),
    name: Type.String(),
    description: Type.String(),
    kind: Type.Union([Type.Literal('document'), Type.Literal('set')]),
    revision: Type.Integer(),
    structureRevision: Type.Integer({ description: 'Bumped on every membership, heading or order change; use as If-Match for structure edits' }),
    archived: Type.Boolean(),
    requirementCount: Type.Integer(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'Collection' },
)
export const CollectionTree = Type.Object({ collection: Collection, nodes: Type.Array(CollectionNode), baselineId: Type.Optional(Uuid) }, { $id: 'CollectionTree' })

export const CollectionCreate = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 200 }), description: Type.Optional(Type.String({ maxLength: 4000 })), kind: Type.Optional(Type.Union([Type.Literal('document'), Type.Literal('set')])) },
  { $id: 'CollectionCreate', additionalProperties: false },
)
export const CollectionPatch = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer()), name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })), description: Type.Optional(Type.String({ maxLength: 4000 })), archived: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
)
export const NodeCreate = Type.Object(
  {
    expectedStructureRevision: Type.Optional(Type.Integer()),
    kind: Type.Union([Type.Literal('heading'), Type.Literal('requirement')]),
    heading: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    requirementId: Type.Optional(Uuid),
    parentId: Type.Optional(Nullable(Uuid)),
    position: Type.Optional(Type.Integer({ minimum: 0, description: 'Defaults to the end' })),
  },
  { $id: 'NodeCreate', additionalProperties: false },
)
export const NodeMove = Type.Object(
  { expectedStructureRevision: Type.Optional(Type.Integer()), parentId: Nullable(Uuid), position: Type.Integer({ minimum: 0 }) },
  { $id: 'NodeMove', additionalProperties: false },
)
export const NodeUpdate = Type.Object(
  { expectedStructureRevision: Type.Optional(Type.Integer()), heading: Type.String({ minLength: 1, maxLength: 300 }) },
  { additionalProperties: false },
)

// ---- attributes ---------------------------------------------------------------------------------------------

export const EnumValue = Type.Object({ id: Uuid, key: Type.String(), label: Type.String(), position: Type.Integer(), archived: Type.Boolean() })
export const AttributeDefinition = Type.Object(
  {
    id: Uuid,
    projectId: Type.String(),
    key: Type.String(),
    name: Type.String(),
    description: Type.String(),
    dataType: Type.Union([Type.Literal('string'), Type.Literal('integer'), Type.Literal('real'), Type.Literal('boolean'), Type.Literal('date'), Type.Literal('enumeration'), Type.Literal('xhtml')]),
    multiValued: Type.Boolean(),
    minValue: Nullable(Type.Number()),
    maxValue: Nullable(Type.Number()),
    maxLength: Nullable(Type.Integer()),
    required: Type.Boolean(),
    revision: Type.Integer(),
    archived: Type.Boolean(),
    enumValues: Type.Array(EnumValue),
  },
  { $id: 'AttributeDefinition' },
)
export type AttributeDefinitionDto = Static<typeof AttributeDefinition>
export const AttributeDefinitionCreate = Type.Object(
  {
    key: Type.String({ pattern: '^[a-z][a-z0-9_.-]{0,59}$' }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.Optional(Type.String({ maxLength: 4000 })),
    dataType: AttributeDefinition.properties.dataType,
    multiValued: Type.Optional(Type.Boolean()),
    minValue: Type.Optional(Nullable(Type.Number())),
    maxValue: Type.Optional(Nullable(Type.Number())),
    maxLength: Type.Optional(Nullable(Type.Integer({ minimum: 1 }))),
    required: Type.Optional(Type.Boolean()),
    enumValues: Type.Optional(Type.Array(Type.Object({ key: Type.String({ minLength: 1, maxLength: 120 }), label: Type.String({ minLength: 1, maxLength: 200 }) }), { maxItems: 500 })),
  },
  { $id: 'AttributeDefinitionCreate', additionalProperties: false, examples: [{ key: 'safety-class', name: 'Safety class', dataType: 'enumeration', enumValues: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }] },
)
export const AttributeDefinitionPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer()),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    description: Type.Optional(Type.String({ maxLength: 4000 })),
    required: Type.Optional(Type.Boolean()),
    archived: Type.Optional(Type.Boolean()),
    addEnumValues: Type.Optional(Type.Array(Type.Object({ key: Type.String({ minLength: 1, maxLength: 120 }), label: Type.String({ minLength: 1, maxLength: 200 }) }))),
  },
  { additionalProperties: false },
)

// ---- reviews, comments, references ------------------------------------------------------------------------

export const ReviewDecision = Type.Object({ id: Uuid, decision: Type.Union([Type.Literal('approve'), Type.Literal('reject'), Type.Literal('comment')]), comment: Type.String(), decidedBy: Type.String(), decidedAt: Timestamp })
export const Review = Type.Object(
  {
    id: Uuid,
    requirementId: Uuid,
    requirementRevision: Type.Integer({ description: 'The exact revision under review' }),
    state: Type.Union([Type.Literal('open'), Type.Literal('approved'), Type.Literal('rejected'), Type.Literal('withdrawn'), Type.Literal('superseded')]),
    requestedBy: Type.String(),
    requestedAt: Timestamp,
    note: Type.String(),
    closedBy: Nullable(Type.String()),
    closedAt: Nullable(Timestamp),
    decisions: Type.Array(ReviewDecision),
  },
  { $id: 'Review' },
)
export const ReviewDecisionCreate = Type.Object(
  { decision: Type.Union([Type.Literal('approve'), Type.Literal('reject'), Type.Literal('comment')]), comment: Type.Optional(Type.String({ maxLength: 10000 })), expectedRevision: Type.Optional(Type.Integer()) },
  { $id: 'ReviewDecisionCreate', additionalProperties: false },
)
export const LifecycleEvent = Type.Object({ id: Uuid, revision: Type.Integer(), fromStatus: Status, toStatus: Status, reviewId: Nullable(Uuid), actor: Type.String(), occurredAt: Timestamp, reason: Type.String() })

export const Comment = Type.Object({ id: Uuid, requirementId: Uuid, revision: Type.Integer(), body: Type.String(), author: Type.String(), createdAt: Timestamp }, { $id: 'Comment' })
export const CommentCreate = Type.Object({ body: Type.String({ minLength: 1, maxLength: 10000 }) }, { additionalProperties: false })

export const ExternalReference = Type.Object(
  { id: Uuid, requirementId: Uuid, system: Type.String(), externalId: Type.String(), url: Nullable(Type.String()), note: Type.String(), createdAt: Timestamp, createdBy: Type.String(), sourceMapping: Type.Optional(Type.Boolean()) },
  { $id: 'ExternalReference' },
)
export const ExternalReferenceCreate = Type.Object(
  { system: Type.String({ minLength: 1, maxLength: 200 }), externalId: Type.String({ minLength: 1, maxLength: 500 }), url: Type.Optional(Type.String({ pattern: '^https?://', maxLength: 2000 })), note: Type.Optional(Type.String({ maxLength: 2000 })) },
  { additionalProperties: false },
)

// ---- baselines ------------------------------------------------------------------------------------------------

export const Baseline = Type.Object(
  {
    id: Uuid,
    projectId: Type.String(),
    name: Type.String(),
    description: Type.String(),
    configurationId: Nullable(Type.String()),
    scopeCollectionIds: Nullable(Type.Array(Uuid)),
    requirementCount: Type.Integer(),
    relationshipCount: Type.Integer(),
    createdAt: Timestamp,
    createdBy: Type.String(),
  },
  { $id: 'Baseline' },
)
export const BaselineCreate = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.Optional(Type.String({ maxLength: 4000 })),
    configurationId: Type.Optional(Type.String({ maxLength: 100 })),
    collectionIds: Type.Optional(Type.Array(Uuid, { description: 'Limit to requirements in these collections; omitted = whole project' })),
    includeArchived: Type.Optional(Type.Boolean()),
  },
  { $id: 'BaselineCreate', additionalProperties: false },
)
export const BaselineComparison = Type.Object(
  {
    from: Type.String({ description: 'Baseline ID' }),
    to: Type.String({ description: "Baseline ID or 'working'" }),
    requirements: Type.Array(
      Type.Object({ id: Uuid, key: Type.String(), change: Type.Union([Type.Literal('added'), Type.Literal('removed'), Type.Literal('changed'), Type.Literal('unchanged')]), fromRevision: Nullable(Type.Integer()), toRevision: Nullable(Type.Integer()), fields: Type.Array(Type.String()) }),
    ),
    relationships: Type.Array(Type.Object({ id: Uuid, change: Type.String(), type: Type.String(), from: Type.String(), to: Type.String() })),
    structure: Type.Array(Type.Object({ collectionId: Uuid, change: Type.String(), detail: Type.String() })),
  },
  { $id: 'BaselineComparison' },
)

// ---- bulk -----------------------------------------------------------------------------------------------------

export const BulkOperation = Type.Object({
  requirementId: Uuid,
  expectedRevision: Type.Integer({ minimum: 1 }),
  set: Type.Optional(
    Type.Object(
      {
        type: Type.Optional(RequirementFields.type),
        owner: Type.Optional(RequirementFields.owner),
        priority: Type.Optional(RequirementFields.priority),
        applicability: Type.Optional(RequirementFields.applicability),
        verificationMethods: Type.Optional(RequirementFields.verificationMethods),
        source: Type.Optional(RequirementFields.source),
        attributes: Type.Optional(RequirementFields.attributes),
      },
      { additionalProperties: false },
    ),
  ),
  archive: Type.Optional(Type.Boolean()),
  addToCollectionId: Type.Optional(Uuid),
  transition: Type.Optional(Type.Union([Type.Literal('request-review'), Type.Literal('withdraw'), Type.Literal('retire'), Type.Literal('reinstate'), Type.Literal('reopen')])),
})
export const BulkRequest = Type.Object(
  {
    atomic: Type.Optional(Type.Boolean({ default: true, description: 'true: all operations commit together or none does. false: each operation commits separately and the response lists per-item outcomes' })),
    reason: Type.Optional(Type.String({ maxLength: 2000 })),
    operations: Type.Array(BulkOperation, { minItems: 1, maxItems: 500 }),
  },
  { $id: 'BulkRequest', additionalProperties: false, examples: [{ atomic: true, reason: 'Assign owner', operations: [{ requirementId: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', expectedRevision: 1, set: { owner: 'eli' } }] }] },
)
export const BulkResult = Type.Object(
  {
    atomic: Type.Boolean(),
    committed: Type.Boolean({ description: 'For atomic requests: whether everything committed' }),
    outcomes: Type.Array(Type.Object({ requirementId: Uuid, ok: Type.Boolean(), revision: Type.Optional(Type.Integer()), error: Type.Optional(ErrorBody.properties.error) })),
  },
  { $id: 'BulkResult' },
)

// ---- saved views -------------------------------------------------------------------------------------------------

export const SavedView = Type.Object(
  { id: Uuid, projectId: Type.String(), owner: Type.String(), name: Type.String(), shared: Type.Boolean(), definition: Type.Record(Type.String(), Type.Unknown()), revision: Type.Integer(), createdAt: Timestamp, updatedAt: Timestamp },
  { $id: 'SavedView' },
)
export const SavedViewWrite = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }), shared: Type.Optional(Type.Boolean()), definition: Type.Record(Type.String(), Type.Unknown()), expectedRevision: Type.Optional(Type.Integer()) },
  { $id: 'SavedViewWrite', additionalProperties: false, examples: [{ name: 'Open performance requirements', definition: { status: ['draft', 'in-review'], type: ['performance'], columns: ['key', 'title', 'status', 'owner'] } }] },
)

// ---- quality ------------------------------------------------------------------------------------------------------

export const QualityFinding = Type.Object(
  {
    ruleId: Type.String(),
    class: Type.Union([Type.Literal('validation'), Type.Literal('heuristic'), Type.Literal('assistant')]),
    severity: Type.Union([Type.Literal('error'), Type.Literal('warning'), Type.Literal('info')]),
    field: Type.String(),
    message: Type.String(),
    explanation: Type.String(),
    suggestion: Type.String(),
    evidence: Type.Optional(Type.String()),
    fingerprint: Type.String(),
    reference: Type.Optional(Type.String()),
    dismissal: Type.Optional(Type.Object({ reason: Type.String(), by: Type.String(), at: Timestamp })),
  },
  { $id: 'QualityFinding' },
)
export const QualityReport = Type.Object(
  { requirementId: Uuid, revision: Type.Integer(), findings: Type.Array(QualityFinding), disclaimer: Type.String() },
  { $id: 'QualityReport' },
)
export const QualitySummary = Type.Object(
  {
    requirementsChecked: Type.Integer(),
    byRule: Type.Record(Type.String(), Type.Integer()),
    items: Type.Array(Type.Object({ requirementId: Uuid, key: Type.String(), title: Type.String(), revision: Type.Integer(), open: Type.Integer(), dismissed: Type.Integer(), topRules: Type.Array(Type.String()) })),
    disclaimer: Type.String(),
  },
  { $id: 'QualitySummary' },
)
export const Dismissal = Type.Object(
  { revision: Type.Integer(), ruleId: Type.String(), fingerprint: Type.String(), reason: Type.String({ minLength: 1, maxLength: 2000 }) },
  { additionalProperties: false },
)
export const Conventions = Type.Object(
  { settings: Type.Record(Type.String(), Type.Unknown()), revision: Type.Integer(), updatedAt: Nullable(Timestamp), updatedBy: Nullable(Type.String()) },
  { $id: 'Conventions' },
)
export const ConventionsWrite = Type.Object({ settings: Type.Record(Type.String(), Type.Unknown()), expectedRevision: Type.Optional(Type.Integer()) }, { additionalProperties: false })

// ---- import / export ----------------------------------------------------------------------------------------------

export const ImportJob = Type.Object(
  {
    id: Uuid,
    projectId: Type.String(),
    format: Type.Union([Type.Literal('reqif'), Type.Literal('json')]),
    status: Type.Union([Type.Literal('previewed'), Type.Literal('applied'), Type.Literal('failed'), Type.Literal('discarded')]),
    fileName: Type.String(),
    sha256: Type.String(),
    byteSize: Type.Integer(),
    sourceId: Nullable(Uuid),
    sourceKey: Nullable(Type.String()),
    preview: Type.Record(Type.String(), Type.Unknown(), { description: 'See ImportPreview' }),
    result: Nullable(Type.Record(Type.String(), Type.Unknown())),
    createdAt: Timestamp,
    createdBy: Type.String(),
    appliedAt: Nullable(Timestamp),
    appliedBy: Nullable(Type.String()),
  },
  { $id: 'ImportJob' },
)
export const ImportApply = Type.Object(
  {
    decisions: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal('take-incoming'), Type.Literal('keep-local'), Type.Literal('skip')]), { description: 'Per preview record key: how to resolve a conflict or whether to skip a new/changed record' })),
    collectionName: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { $id: 'ImportApply', additionalProperties: false },
)
export const ExportRequest = Type.Object(
  {
    format: Type.Union([Type.Literal('reqif'), Type.Literal('reqifz'), Type.Literal('json')]),
    collectionIds: Type.Optional(Type.Array(Uuid)),
    requirementIds: Type.Optional(Type.Array(Uuid)),
    configurationId: Type.Optional(Type.String()),
    baselineId: Type.Optional(Uuid),
    includeArchived: Type.Optional(Type.Boolean()),
    sourceId: Type.Optional(Nullable(Uuid)),
    title: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { $id: 'ExportRequest', additionalProperties: false },
)
export const ExportJob = Type.Object(
  {
    id: Uuid,
    projectId: Type.String(),
    format: Type.String(),
    request: Type.Record(Type.String(), Type.Unknown()),
    report: Type.Record(Type.String(), Type.Unknown()),
    fileName: Type.String(),
    mediaType: Type.String(),
    byteSize: Type.Integer(),
    createdAt: Timestamp,
    createdBy: Type.String(),
  },
  { $id: 'ExportJob' },
)
export const ExchangeSource = Type.Object({ id: Uuid, format: Type.String(), sourceKey: Type.String(), name: Type.String(), createdAt: Timestamp, createdBy: Type.String(), mappedRecords: Type.Integer() }, { $id: 'ExchangeSource' })
export const Attachment = Type.Object(
  { id: Uuid, sha256: Type.String(), mediaType: Type.String(), byteSize: Type.Integer(), originalName: Type.String(), requirementId: Nullable(Uuid), provenance: Type.Record(Type.String(), Type.Unknown()), createdAt: Timestamp, createdBy: Type.String() },
  { $id: 'Attachment' },
)

export const RequirementsEventSchema = Type.Object(
  {
    eventId: Uuid,
    type: Type.String(),
    projectId: Type.String(),
    entityId: Type.String(),
    committedRevision: Type.Integer(),
    configurationId: Type.Optional(Type.String()),
    occurredAt: Timestamp,
    actor: Type.String(),
  },
  { $id: 'RequirementsEvent' },
)

export const SCHEMAS = [
  ErrorBody,
  Requirement,
  RequirementCreate,
  RequirementPatch,
  Transition,
  RequirementPage,
  RevisionSummary,
  RevisionComparison,
  AuditEvent,
  Relationship,
  RelationshipCreate,
  TraceLink,
  Impact,
  TraceMatrix,
  CollectionNode,
  Collection,
  CollectionTree,
  CollectionCreate,
  NodeCreate,
  NodeMove,
  AttributeDefinition,
  AttributeDefinitionCreate,
  Review,
  ReviewDecisionCreate,
  Comment,
  ExternalReference,
  Baseline,
  BaselineCreate,
  BaselineComparison,
  BulkRequest,
  BulkResult,
  SavedView,
  SavedViewWrite,
  QualityFinding,
  QualityReport,
  QualitySummary,
  Conventions,
  ImportJob,
  ImportApply,
  ExportRequest,
  ExportJob,
  ExchangeSource,
  Attachment,
  RequirementsEventSchema,
]
