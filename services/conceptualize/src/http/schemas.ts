import { Type, type Static, type TSchema } from '@sinclair/typebox'

/**
 * Request and response schemas of the Conceptualize API (v1). One source for runtime validation
 * (Fastify/Ajv), TypeScript types and the OpenAPI 3.1 document.
 */

const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])
const L = <T extends string>(...values: T[]) => Type.Union(values.map((v) => Type.Literal(v)))
const Text = (max: number, min = 0) => Type.String({ minLength: min, maxLength: max })

export const Uuid = Type.String({ format: 'uuid', description: 'Canonical identity (UUID)' })
export const Timestamp = Type.String({ format: 'date-time', description: 'RFC 3339 UTC timestamp with milliseconds, set by the server', examples: ['2026-10-14T09:30:00.000Z'] })
export const Maturity = L('idea', 'exploring', 'defined', 'evaluated', 'selected', 'engineering-development', 'implemented', 'verified', 'superseded', 'archived')
export const Abstraction = L('function', 'component', 'assembly', 'subsystem', 'system', 'abstract')
export const Basis = Type.Union([L('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision')], {
  $id: 'Basis',
  description: 'How it is known (ADR-0043 ladder): user-assertion (stated by a person), ai-hypothesis (assistant, unverified), assumption, assessment (qualitative judgement), estimate (preliminary calculation), calculated (registered model with manifest), evidence (verified), decision (recorded decision)',
})
export const StatementKind = L('function', 'behavior', 'principle', 'effect', 'input', 'output', 'constraint', 'interface', 'mechanism', 'problem', 'capability', 'performance', 'assumption', 'uncertainty', 'question', 'rationale', 'note')
export const VerificationStatus = L('not-verified', 'partially-verified', 'verified', 'failed')
export const ImplementationStatus = L('candidate', 'in-development', 'implemented', 'retired')
export const ConceptImplementationStatus = Type.Union([L('none', 'candidate', 'in-development', 'implemented', 'retired')], { description: 'Derived from the linked implementations (most advanced, retired only when all are retired)' })
export const ArtifactModule = L('requirements', 'sysml', 'cad', 'analysis', 'twin', 'external', 'product', 'projects')
export const RelationshipType = L('contains', 'depends-on', 'interfaces-with', 'alternative-to', 'derived-from', 'refines', 'implements', 'conflicts-with', 'replaces')
export const SourceKind = L('user', 'assistant', 'import', 'system')

export const ErrorBody = Type.Object(
  {
    error: Type.Object({
      code: L('invalid', 'unauthenticated', 'forbidden', 'not-found', 'conflict', 'unavailable'),
      message: Type.String(),
      details: Type.Optional(Type.Object({ currentRevision: Type.Optional(Type.Integer()), fields: Type.Optional(Type.Record(Type.String(), Type.String())) }, { additionalProperties: true })),
    }),
  },
  { $id: 'Error', examples: [{ error: { code: 'conflict', message: 'CON-001 changed since revision 3 (now 4).', details: { currentRevision: 4 } } }] },
)

export const Provenance = Type.Object(
  {
    sourceKind: SourceKind,
    conversationId: Nullable(Type.String()),
    proposalId: Nullable(Type.String()),
    messageId: Type.Optional(Nullable(Type.String())),
  },
  { $id: 'Provenance', description: 'Origin of a change: a person (user), the assistant (with the conversation and proposal it came from), an import or the system. Send X-Source-Kind, X-Conversation-Id, X-Proposal-Id, X-Message-Id headers on writes.' },
)

export const Quantity = Type.Object(
  {
    value: Type.Optional(Nullable(Type.Number())),
    unit: Type.String({ maxLength: 60, description: 'Unit expression, e.g. N, kN, mm, N*m, m/s^2, kg/m^3, %, EUR; "-" for dimensionless' }),
    min: Type.Optional(Nullable(Type.Number())),
    max: Type.Optional(Nullable(Type.Number())),
  },
  { $id: 'Quantity', additionalProperties: false, description: 'A unit-aware value with an optional uncertainty range. The unit must parse; dimensions are checked where a dimension is expected.', examples: [{ value: 500, unit: 'N' }] },
)

export const Attribute = Type.Object(
  { value: Type.Optional(Nullable(Type.Number())), unit: Type.String({ maxLength: 60 }), min: Type.Optional(Nullable(Type.Number())), max: Type.Optional(Nullable(Type.Number())), basis: Type.Optional(Basis), note: Type.Optional(Text(1000)) },
  { $id: 'Attribute', additionalProperties: false },
)

export const ArtifactRef = Type.Object(
  {
    module: ArtifactModule,
    id: Type.String({ minLength: 1, maxLength: 2000, description: 'Canonical ID in the owning module: requirement UUID, twin object ID (SYS-…, CAD-…, ROD-…), artifact ID (OUT-…), test-adapter ID for analysis, URL for external, product-element UUID (product), Project Management entity UUID such as a project document (projects)' }),
    revision: Type.Optional(Type.Integer({ minimum: 1, description: 'Pinned revision; omit to follow the latest deliberately' })),
    kind: Type.Optional(Text(60)),
    label: Type.Optional(Text(300)),
  },
  { $id: 'ArtifactRef', additionalProperties: false, examples: [{ module: 'cad', id: 'CAD-120', revision: 3, kind: 'cad-representation', label: 'Rod (mock geometry)' }] },
)

// ---- statements ---------------------------------------------------------------------------------------

export const Statement = Type.Object(
  {
    id: Uuid,
    kind: StatementKind,
    text: Type.String(),
    basis: Basis,
    quantity: Nullable(Quantity),
    state: Nullable(L('open', 'resolved')),
    evidenceId: Nullable(Uuid),
    decisionId: Nullable(Uuid),
    confirmedBy: Nullable(Type.String()),
    confirmedAt: Nullable(Timestamp),
    source: Type.String(),
  },
  { $id: 'Statement', description: 'A typed statement of design intent (function, constraint, assumption, open question …) with its basis. The ID is stable across revisions.' },
)

export const StatementInput = Type.Object(
  {
    id: Type.Optional(Uuid),
    kind: StatementKind,
    text: Text(4000, 1),
    basis: Type.Optional(Basis),
    quantity: Type.Optional(Nullable(Quantity)),
    state: Type.Optional(Nullable(L('open', 'resolved'))),
    evidenceId: Type.Optional(Nullable(Uuid)),
    decisionId: Type.Optional(Nullable(Uuid)),
    source: Type.Optional(Text(2000)),
    confirm: Type.Optional(Type.Boolean({ description: 'Confirm an AI hypothesis as a user assertion (explicit user action; refused for assistant-sourced requests)' })),
  },
  { $id: 'StatementInput', additionalProperties: false },
)

// ---- concepts -------------------------------------------------------------------------------------------

export const Concept = Type.Object(
  {
    id: Uuid,
    key: Type.String({ description: 'Human-readable key, display only', examples: ['CON-001'] }),
    projectId: Type.String(),
    revision: Type.Integer({ minimum: 1, description: 'Immutable content revision' }),
    name: Type.String(),
    summary: Type.String(),
    description: Type.String({ description: 'Freeform natural-language description, kept verbatim' }),
    purpose: Type.String(),
    abstraction: Abstraction,
    classifications: Type.Array(Type.String()),
    attributes: Type.Record(Type.String(), Attribute),
    statements: Type.Array(Statement),
    maturity: Maturity,
    verificationStatus: VerificationStatus,
    implementationStatus: ConceptImplementationStatus,
    changeReason: Type.String(),
    provenance: Provenance,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  {
    $id: 'Concept',
    examples: [
      {
        id: '0c0a0001-0000-4000-8000-000000000001',
        key: 'CON-001',
        projectId: 'PRJ-ACT100',
        revision: 1,
        name: 'Compact linear actuator',
        summary: 'Deliver 500 N of linear force within a 100 mm envelope.',
        description: 'Develop alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.',
        purpose: 'Provide controlled linear force',
        abstraction: 'system',
        classifications: ['actuator'],
        attributes: {},
        statements: [],
        maturity: 'exploring',
        verificationStatus: 'not-verified',
        implementationStatus: 'none',
        changeReason: '',
        provenance: { sourceKind: 'user', conversationId: null, proposalId: null },
        revisionCreatedAt: '2026-10-14T09:30:00.000Z',
        revisionCreatedBy: 'eli',
        createdAt: '2026-10-14T09:30:00.000Z',
        createdBy: 'eli',
        updatedAt: '2026-10-14T09:30:00.000Z',
        updatedBy: 'eli',
      },
    ],
  },
)

export const ConceptListItem = Type.Object(
  {
    id: Uuid,
    key: Type.String(),
    projectId: Type.String(),
    revision: Type.Integer(),
    name: Type.String(),
    summary: Type.String(),
    abstraction: Abstraction,
    classifications: Type.Array(Type.String()),
    maturity: Maturity,
    verificationStatus: VerificationStatus,
    implementationStatus: ConceptImplementationStatus,
    sourceKind: SourceKind,
    openQuestions: Type.Integer(),
    unconfirmedHypotheses: Type.Integer(),
    updatedAt: Timestamp,
  },
  { $id: 'ConceptListItem' },
)

export const ConceptPage = Type.Object({ items: Type.Array(ConceptListItem), nextCursor: Type.Optional(Type.String()), total: Type.Integer() }, { $id: 'ConceptPage' })

export const ConceptCreate = Type.Object(
  {
    name: Text(200, 1),
    summary: Type.Optional(Text(1000)),
    description: Type.Optional(Text(40000)),
    purpose: Type.Optional(Text(4000)),
    abstraction: Type.Optional(Abstraction),
    classifications: Type.Optional(Type.Array(Text(60, 1), { maxItems: 30 })),
    attributes: Type.Optional(Type.Record(Type.String({ minLength: 1, maxLength: 80 }), Attribute)),
    statements: Type.Optional(Type.Array(StatementInput, { maxItems: 300 })),
    maturity: Type.Optional(L('idea', 'exploring', 'defined')),
    parentId: Type.Optional(Uuid),
    decompositionId: Type.Optional(Uuid),
    performs: Type.Optional(Type.Array(Uuid, { maxItems: 20, description: 'Functions this Concept performs (creates performs links; R1 ConceptInput)' })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'ConceptCreate', additionalProperties: false, examples: [{ name: 'Thermal management', summary: 'Keep the motor below 80 °C.', abstraction: 'function', parentId: '0c0a0001-0000-4000-8000-000000000001' }] },
)
export type ConceptCreateDto = Static<typeof ConceptCreate>

export const ConceptPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    name: Type.Optional(Text(200, 1)),
    summary: Type.Optional(Text(1000)),
    description: Type.Optional(Text(40000)),
    purpose: Type.Optional(Text(4000)),
    abstraction: Type.Optional(Abstraction),
    classifications: Type.Optional(Type.Array(Text(60, 1), { maxItems: 30 })),
    attributes: Type.Optional(Type.Record(Type.String({ minLength: 1, maxLength: 80 }), Nullable(Attribute), { description: 'Merged; null removes an attribute' })),
    statements: Type.Optional(Type.Array(StatementInput, { maxItems: 300, description: 'Replaces the statement list. Statements sent with their id keep their identity.' })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'ConceptPatch', additionalProperties: false },
)
export type ConceptPatchDto = Static<typeof ConceptPatch>

export const ConceptListQuery = Type.Object(
  {
    text: Type.Optional(Type.String({ maxLength: 200, description: 'Prefix search in name, summary, description, purpose and classifications' })),
    maturity: Type.Optional(Type.String({ description: 'Comma-separated maturities' })),
    abstraction: Type.Optional(Type.String({ description: 'Comma-separated abstractions' })),
    classification: Type.Optional(Type.String()),
    ids: Type.Optional(Type.String({ description: 'Comma-separated UUIDs' })),
    includeArchived: Type.Optional(Type.Boolean({ description: 'Include archived and superseded Concepts (default false)' })),
    cursor: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  },
  { additionalProperties: false },
)
export type ConceptListQueryDto = Static<typeof ConceptListQuery>

export const RevisionSummary = Type.Object(
  { revision: Type.Integer(), name: Type.String(), changeReason: Type.String(), maturityAtCreation: Type.String(), createdAt: Timestamp, createdBy: Type.String(), provenance: Provenance },
  { $id: 'RevisionSummary' },
)
export const RevisionComparison = Type.Object(
  { from: Type.Integer(), to: Type.Integer(), changes: Type.Array(Type.Object({ field: Type.String(), from: Type.Unknown(), to: Type.Unknown() })) },
  { $id: 'RevisionComparison' },
)
export const AuditEvent = Type.Object(
  {
    id: Type.String(),
    entityType: Type.String(),
    entityId: Type.String(),
    conceptIds: Type.Array(Type.String()),
    action: Type.String(),
    revision: Nullable(Type.Integer()),
    actor: Type.String(),
    occurredAt: Timestamp,
    reason: Type.String(),
    provenance: Provenance,
    details: Type.Record(Type.String(), Type.Unknown()),
  },
  { $id: 'AuditEvent' },
)

export const MaturityChange = Type.Object(
  {
    to: Maturity,
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    reason: Text(2000, 1),
    replacedBy: Type.Optional(Uuid),
  },
  { $id: 'MaturityChange', additionalProperties: false, description: 'Any change is allowed (no mandatory sequence) except the approval gates and evidence rules in x-maturity.' },
)
export const VerificationChange = Type.Object(
  { status: VerificationStatus, evidenceIds: Type.Array(Uuid, { maxItems: 50 }), expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Text(2000, 1) },
  { $id: 'VerificationChange', additionalProperties: false },
)
export const Branch = Type.Object(
  { name: Type.Optional(Text(200, 1)), alternativeSetId: Type.Optional(Uuid), reason: Type.Optional(Text(2000)) },
  { $id: 'Branch', additionalProperties: false, description: 'Creates a new Concept from the current revision (own identity, derived-from link); the original is unchanged.' },
)

export const Assessment = Type.Object(
  {
    conceptId: Uuid,
    revision: Type.Integer(),
    maturity: Maturity,
    completeness: Type.Number(),
    suggestedMaturity: Maturity,
    checks: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), met: Type.Boolean(), detail: Type.String() })),
    counts: Type.Object({ openQuestions: Type.Integer(), openUncertainties: Type.Integer(), unconfirmedHypotheses: Type.Integer(), assumptions: Type.Integer(), quantifiedConstraints: Type.Integer() }),
    nextSteps: Type.Array(Type.Object({ id: Type.String(), text: Type.String(), operation: Type.Optional(Type.String()), priority: L('high', 'medium', 'low') })),
    note: Type.String(),
  },
  { $id: 'Assessment' },
)

// ---- relationships and structure ----------------------------------------------------------------------------

export const InterfaceDefinition = Type.Object(
  { name: Text(200, 1), kind: L('mechanical', 'electrical', 'thermal', 'fluid', 'data', 'control', 'other'), description: Type.Optional(Text(4000)), flows: Type.Optional(Type.Array(Text(200, 1), { maxItems: 20 })) },
  { $id: 'InterfaceDefinition', additionalProperties: false },
)

export const Relationship = Type.Object(
  {
    id: Uuid,
    type: RelationshipType,
    fromId: Uuid,
    toId: Uuid,
    decompositionId: Nullable(Uuid),
    note: Type.String(),
    interface: Nullable(InterfaceDefinition),
    basis: Basis,
    revision: Type.Integer(),
    removed: Type.Boolean(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    removedAt: Nullable(Timestamp),
    removedBy: Nullable(Type.String()),
    provenance: Provenance,
  },
  { $id: 'Relationship' },
)
export const RelationshipCreate = Type.Object(
  { type: RelationshipType, fromId: Uuid, toId: Uuid, decompositionId: Type.Optional(Uuid), note: Type.Optional(Text(4000)), interface: Type.Optional(InterfaceDefinition), basis: Type.Optional(Basis), reason: Type.Optional(Text(2000)) },
  { $id: 'RelationshipCreate', additionalProperties: false, examples: [{ type: 'contains', fromId: '0c0a0001-0000-4000-8000-000000000001', toId: '0c0a0001-0000-4000-8000-000000000002' }] },
)
export type RelationshipCreateDto = Static<typeof RelationshipCreate>
export const RemoveBody = Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Type.Optional(Text(2000)) }, { $id: 'RemoveBody', additionalProperties: false })

export const RelationshipTypeInfo = Type.Object(
  { type: RelationshipType, acyclic: Type.Boolean(), symmetric: Type.Boolean(), reads: Type.String(), inverse: Type.String(), meaning: Type.String() },
  { $id: 'RelationshipTypeInfo' },
)

export const Decomposition = Type.Object(
  { id: Uuid, parentId: Uuid, name: Type.String(), description: Type.String(), status: L('candidate', 'preferred', 'rejected'), recordVersion: Type.Integer(), createdAt: Timestamp, createdBy: Type.String(), updatedAt: Timestamp },
  { $id: 'Decomposition' },
)
export const DecompositionCreate = Type.Object({ parentId: Uuid, name: Text(200, 1), description: Type.Optional(Text(4000)) }, { $id: 'DecompositionCreate', additionalProperties: false })
export const DecompositionPatch = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), name: Type.Optional(Text(200, 1)), description: Type.Optional(Text(4000)), status: Type.Optional(L('candidate', 'preferred', 'rejected')), reason: Type.Optional(Text(2000)) },
  { $id: 'DecompositionPatch', additionalProperties: false },
)

// ---- alternatives and decisions --------------------------------------------------------------------------------

export const AlternativeMember = Type.Object(
  { conceptId: Uuid, status: L('candidate', 'selected', 'rejected', 'deferred', 'withdrawn'), decisionId: Nullable(Uuid), addedAt: Timestamp, addedBy: Type.String() },
  { $id: 'AlternativeMember' },
)
export const AlternativeSet = Type.Object(
  { id: Uuid, key: Type.String(), parentId: Uuid, name: Type.String(), question: Type.String(), members: Type.Array(AlternativeMember), recordVersion: Type.Integer(), createdAt: Timestamp, createdBy: Type.String(), updatedAt: Timestamp },
  { $id: 'AlternativeSet' },
)
export const AlternativeSetCreate = Type.Object(
  { parentId: Uuid, name: Text(200, 1), question: Type.Optional(Text(4000)), memberIds: Type.Optional(Type.Array(Uuid, { maxItems: 50 })) },
  { $id: 'AlternativeSetCreate', additionalProperties: false },
)
export const MemberAdd = Type.Object({ conceptId: Uuid }, { $id: 'MemberAdd', additionalProperties: false })

export const DecisionOutcome = Type.Object(
  { conceptId: Uuid, outcome: L('accepted', 'rejected', 'deferred'), rationale: Type.Optional(Text(4000)) },
  { $id: 'DecisionOutcome', additionalProperties: false },
)
export const Decision = Type.Object(
  {
    id: Uuid,
    key: Type.String(),
    title: Type.String(),
    question: Type.String(),
    rationale: Type.String(),
    subjectId: Nullable(Uuid),
    setId: Nullable(Uuid),
    tradeStudyId: Nullable(Uuid),
    outcomes: Type.Array(DecisionOutcome),
    status: L('proposed', 'recorded', 'withdrawn'),
    supersedesId: Nullable(Uuid),
    supersededById: Nullable(Uuid),
    proposedBy: Type.String(),
    proposedAt: Timestamp,
    recordedBy: Nullable(Type.String()),
    recordedAt: Nullable(Timestamp),
    recordVersion: Type.Integer(),
    provenance: Provenance,
  },
  { $id: 'Decision' },
)
export const DecisionCreate = Type.Object(
  {
    title: Text(300, 1),
    question: Type.Optional(Text(4000)),
    rationale: Text(20000, 1),
    subjectId: Type.Optional(Uuid),
    setId: Type.Optional(Uuid),
    tradeStudyId: Type.Optional(Uuid),
    outcomes: Type.Array(DecisionOutcome, { minItems: 1, maxItems: 50 }),
    record: Type.Optional(Type.Boolean({ description: 'Record immediately (reviewer or administrator for accepted/rejected outcomes); otherwise the decision is proposed' })),
    supersedesId: Type.Optional(Uuid),
  },
  { $id: 'DecisionCreate', additionalProperties: false },
)
export type DecisionCreateDto = Static<typeof DecisionCreate>
export const DecisionAction = Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Type.Optional(Text(2000)) }, { $id: 'DecisionAction', additionalProperties: false })

// ---- trade studies -------------------------------------------------------------------------------------------------

const CriterionFields = {
  name: Text(200, 1),
  category: L('performance', 'mass', 'cost', 'complexity', 'manufacturability', 'risk', 'custom'),
  description: Type.Optional(Text(2000)),
  weight: Type.Number({ minimum: 0, maximum: 1000 }),
  direction: L('maximize', 'minimize'),
  scale: L('quantity', 'qualitative'),
  unit: Type.Optional(Nullable(Type.String({ maxLength: 60 }))),
}
export const Criterion = Type.Object({ id: Uuid, ...CriterionFields, description: Type.String(), unit: Nullable(Type.String()) }, { $id: 'Criterion' })
export const CriterionInput = Type.Object(CriterionFields, { $id: 'CriterionInput', additionalProperties: false })
export const CriterionUpdate = Type.Object(
  { id: Uuid, name: Type.Optional(Text(200, 1)), description: Type.Optional(Text(2000)), weight: Type.Optional(Type.Number({ minimum: 0, maximum: 1000 })), direction: Type.Optional(L('maximize', 'minimize')) },
  { $id: 'CriterionUpdate', additionalProperties: false },
)
/** C11: a score taken from calculated evidence keeps that output's qualification unchanged. */
export const ScoreQualification = Type.Object(
  { source: Type.Literal('calculation'), evidenceId: Uuid, symbol: Type.String(), kind: L('point', 'sampled-range', 'bounds'), quality: Type.Optional(L('exact', 'enclosure')) },
  { $id: 'ScoreQualification' },
)
export const Score = Type.Object(
  {
    criterionId: Uuid,
    conceptId: Uuid,
    value: Nullable(Type.Number()),
    low: Nullable(Type.Number()),
    high: Nullable(Type.Number()),
    qualitative: Nullable(Type.Integer()),
    basis: Basis,
    rationale: Type.String(),
    evidenceId: Nullable(Uuid),
    enteredUnit: Nullable(Type.String()),
    evidenceOutput: Nullable(Type.String()),
    qualification: Nullable(ScoreQualification),
    studyRevision: Type.Integer(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    provenance: Provenance,
  },
  { $id: 'Score', description: 'Quantity scores are stored in the criterion unit (converted from enteredUnit).' },
)
export const ScoreInput = Type.Object(
  {
    criterionId: Uuid,
    conceptId: Uuid,
    value: Type.Optional(Nullable(Type.Number())),
    low: Type.Optional(Nullable(Type.Number())),
    high: Type.Optional(Nullable(Type.Number())),
    unit: Type.Optional(Type.String({ maxLength: 60, description: 'Unit of value/low/high; converted to the criterion unit (dimension checked). Defaults to the criterion unit.' })),
    qualitative: Type.Optional(Nullable(Type.Integer({ minimum: 1, maximum: 5, description: '1 very poor … 5 very good' }))),
    basis: Basis,
    rationale: Type.Optional(Text(4000)),
    evidenceId: Type.Optional(Nullable(Uuid)),
    evidenceOutput: Type.Optional(Type.String({ maxLength: 60, description: 'Output symbol of the calculated evidence the score is taken from; value (and low/high) must equal it' })),
    qualification: Type.Optional(Type.Unknown({ description: 'Ignored: copied from the evidence by the service' })),
    clear: Type.Optional(Type.Boolean({ description: 'Remove the score (recorded as a new cleared row)' })),
  },
  { $id: 'ScoreInput', additionalProperties: false },
)
export type ScoreInputDto = Static<typeof ScoreInput>
export const OptionResult = Type.Object(
  {
    conceptId: Uuid,
    score: Nullable(Type.Number()),
    low: Nullable(Type.Number()),
    high: Nullable(Type.Number()),
    coverage: Type.Number(),
    missing: Type.Array(Type.String()),
    rank: Nullable(Type.Integer()),
    bases: Type.Record(Type.String(), Type.Integer()),
    normalized: Type.Record(Type.String(), Nullable(Type.Object({ low: Type.Number(), high: Type.Number() }))),
  },
  { $id: 'OptionResult' },
)
export const TradeStudy = Type.Object(
  {
    id: Uuid,
    key: Type.String(),
    title: Type.String(),
    description: Type.String(),
    setId: Nullable(Uuid),
    revision: Type.Integer(),
    criteria: Type.Array(Criterion),
    options: Type.Array(Uuid),
    scores: Type.Array(Score),
    result: Type.Object({
      options: Type.Array(OptionResult),
      ranking: L('robust', 'uncertain', 'incomplete'),
      preliminary: Type.Boolean(),
      method: Type.String(),
      qualifications: Type.Object({ points: Type.Integer(), exactBounds: Type.Integer(), enclosures: Type.Integer(), sampledRanges: Type.Integer(), statedRanges: Type.Integer(), robustnessNote: Type.Optional(Type.String()) }, { description: 'C11: how the score ranges are qualified; a sampled range is not a bound and cannot make the ranking robust' }),
    }),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'TradeStudy' },
)
export const TradeStudyCreate = Type.Object(
  {
    title: Text(300, 1),
    description: Type.Optional(Text(4000)),
    setId: Type.Optional(Uuid),
    conceptIds: Type.Optional(Type.Array(Uuid, { maxItems: 50, description: 'Options; defaults to the candidate members of the alternative set' })),
    criteria: Type.Optional(Type.Array(CriterionInput, { maxItems: 40 })),
    useDefaultCriteria: Type.Optional(Type.Boolean({ description: 'Add performance, mass, cost, complexity, manufacturability and risk (qualitative, weight 1)' })),
  },
  { $id: 'TradeStudyCreate', additionalProperties: false },
)
export const TradeStudyPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    title: Type.Optional(Text(300, 1)),
    description: Type.Optional(Text(4000)),
    addCriteria: Type.Optional(Type.Array(CriterionInput, { maxItems: 40 })),
    updateCriteria: Type.Optional(Type.Array(CriterionUpdate, { maxItems: 40 })),
    removeCriteria: Type.Optional(Type.Array(Uuid, { maxItems: 40 })),
    addOptions: Type.Optional(Type.Array(Uuid, { maxItems: 50 })),
    removeOptions: Type.Optional(Type.Array(Uuid, { maxItems: 50 })),
  },
  { $id: 'TradeStudyPatch', additionalProperties: false },
)
export const ScoresPut = Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), scores: Type.Array(ScoreInput, { minItems: 1, maxItems: 500 }) }, { $id: 'ScoresPut', additionalProperties: false })

// ---- evidence ---------------------------------------------------------------------------------------------------------

export const NamedQuantity = Type.Object(
  { name: Text(200, 1), value: Type.Optional(Nullable(Type.Number())), unit: Type.String({ maxLength: 60 }), min: Type.Optional(Nullable(Type.Number())), max: Type.Optional(Nullable(Type.Number())) },
  { $id: 'NamedQuantity', additionalProperties: false },
)
export const Evidence = Type.Object(
  {
    id: Uuid,
    key: Type.String(),
    conceptId: Uuid,
    conceptRevision: Type.Integer(),
    kind: L('calculation', 'analysis', 'simulation', 'test', 'review', 'reference', 'estimate'),
    title: Type.String(),
    summary: Type.String(),
    basis: L('ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence'),
    method: Type.String(),
    inputs: Type.Array(NamedQuantity),
    outputs: Type.Array(NamedQuantity),
    assumptions: Type.Array(Type.String()),
    artifact: Nullable(ArtifactRef),
    supersedesId: Nullable(Uuid),
    createdAt: Timestamp,
    createdBy: Type.String(),
    provenance: Provenance,
  },
  { $id: 'Evidence', description: 'Immutable. basis evidence = verified (needs an artifact reference and a person); everything else is preliminary.' },
)
export const EvidenceCreate = Type.Object(
  {
    conceptId: Uuid,
    kind: L('calculation', 'analysis', 'simulation', 'test', 'review', 'reference', 'estimate'),
    title: Text(300, 1),
    summary: Type.Optional(Text(20000)),
    basis: L('ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence'),
    method: Type.Optional(Text(4000)),
    inputs: Type.Optional(Type.Array(NamedQuantity, { maxItems: 100 })),
    outputs: Type.Optional(Type.Array(NamedQuantity, { maxItems: 100 })),
    assumptions: Type.Optional(Type.Array(Text(1000, 1), { maxItems: 100 })),
    artifact: Type.Optional(ArtifactRef),
    supersedesId: Type.Optional(Uuid),
  },
  { $id: 'EvidenceCreate', additionalProperties: false },
)
export type EvidenceCreateDto = Static<typeof EvidenceCreate>

// ---- implementations and links --------------------------------------------------------------------------------------------

export const ImplementationArtifact = Type.Object(
  {
    id: Uuid,
    module: ArtifactModule,
    artifactId: Type.String(),
    revision: Nullable(Type.Integer()),
    kind: Nullable(Type.String()),
    label: Type.String(),
    addedAt: Timestamp,
    addedBy: Type.String(),
    removed: Type.Boolean(),
    removedAt: Nullable(Timestamp),
    removedBy: Nullable(Type.String()),
    provenance: Provenance,
  },
  { $id: 'ImplementationArtifact' },
)
export const RealizationRequest = Type.Object(
  {
    id: Uuid,
    implementationId: Uuid,
    targetModule: L('cad', 'sysml', 'requirements', 'analysis'),
    requestKind: Type.String(),
    description: Type.String(),
    parameters: Type.Record(Type.String(), Type.Unknown()),
    status: L('pending', 'cancelled', 'fulfilled'),
    fulfilledBy: Nullable(ArtifactRef),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    provenance: Provenance,
  },
  { $id: 'RealizationRequest', description: 'A recorded request for another module to realize an implementation. No CAD generation API exists: CAD requests stay pending until the CAD module offers one.' },
)
export const Implementation = Type.Object(
  {
    id: Uuid,
    key: Type.String(),
    name: Type.String(),
    description: Type.String(),
    status: ImplementationStatus,
    revision: Type.Integer(),
    conceptIds: Type.Array(Uuid),
    artifacts: Type.Array(ImplementationArtifact),
    realizationRequests: Type.Array(RealizationRequest),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'Implementation', description: 'A ConceptImplementation: a concrete realization of one or more Concepts. Concepts keep their identity when it changes or is replaced.' },
)
export const ImplementationCreate = Type.Object(
  {
    name: Text(200, 1),
    description: Type.Optional(Text(4000)),
    status: Type.Optional(ImplementationStatus),
    conceptIds: Type.Array(Uuid, { minItems: 1, maxItems: 50 }),
    artifacts: Type.Optional(Type.Array(ArtifactRef, { maxItems: 100 })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'ImplementationCreate', additionalProperties: false },
)
export const ImplementationPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    name: Type.Optional(Text(200, 1)),
    description: Type.Optional(Text(4000)),
    status: Type.Optional(ImplementationStatus),
    addConceptIds: Type.Optional(Type.Array(Uuid, { maxItems: 50 })),
    removeConceptIds: Type.Optional(Type.Array(Uuid, { maxItems: 50 })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'ImplementationPatch', additionalProperties: false },
)
export const ArtifactAdd = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), artifact: ArtifactRef, replaces: Type.Optional(Uuid), reason: Type.Optional(Text(2000)) },
  { $id: 'ArtifactAdd', additionalProperties: false, description: 'Adds an artifact reference; with `replaces`, removes that reference in the same change (implementation redesigned). The Concepts are unchanged.' },
)
export const Repin = Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), revision: Nullable(Type.Integer({ minimum: 1 })), reason: Type.Optional(Text(2000)) }, { $id: 'Repin', additionalProperties: false })
export const RealizationCreate = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    targetModule: L('cad', 'sysml', 'requirements', 'analysis'),
    requestKind: Text(100, 1),
    description: Type.Optional(Text(4000)),
    parameters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { $id: 'RealizationCreate', additionalProperties: false, examples: [{ targetModule: 'cad', requestKind: 'generate-part', description: 'Generate a parametric ball-screw housing within 100 mm', parameters: { envelope: { value: 100, unit: 'mm' } } }] },
)
export const RealizationStatus = Type.Object(
  { status: L('cancelled', 'fulfilled'), fulfilledBy: Type.Optional(ArtifactRef), reason: Type.Optional(Text(2000)) },
  { $id: 'RealizationStatus', additionalProperties: false },
)

export const ConceptLink = Type.Object(
  {
    id: Uuid,
    conceptId: Uuid,
    relation: L('satisfies', 'derives', 'refines', 'proposes', 'references'),
    artifact: ArtifactRef,
    note: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    removed: Type.Boolean(),
    removedAt: Nullable(Timestamp),
    removedBy: Nullable(Type.String()),
    provenance: Provenance,
  },
  { $id: 'ConceptLink' },
)
export const LinkCreate = Type.Object(
  { relation: L('satisfies', 'derives', 'refines', 'proposes', 'references'), artifact: ArtifactRef, note: Type.Optional(Text(4000)) },
  { $id: 'LinkCreate', additionalProperties: false },
)

export const ArtifactConcepts = Type.Object(
  {
    implementations: Type.Array(Type.Object({ concept: ConceptListItem, implementation: Implementation })),
    links: Type.Array(Type.Object({ concept: ConceptListItem, link: ConceptLink })),
  },
  { $id: 'ArtifactConcepts' },
)

export const Graph = Type.Object(
  {
    nodes: Type.Array(ConceptListItem),
    edges: Type.Array(Relationship),
    decompositions: Type.Array(Decomposition),
    alternativeSets: Type.Array(AlternativeSet),
  },
  { $id: 'Graph', description: 'Concepts with their active relationships, decompositions and alternative sets (archived and superseded Concepts only with includeArchived)' },
)

// ---- explorations ------------------------------------------------------------------------------------------------------------

const ConceptSeed = {
  name: Text(200, 1),
  summary: Type.Optional(Text(1000)),
  description: Type.Optional(Text(40000)),
  purpose: Type.Optional(Text(4000)),
  abstraction: Type.Optional(Abstraction),
  classifications: Type.Optional(Type.Array(Text(60, 1), { maxItems: 30 })),
  attributes: Type.Optional(Type.Record(Type.String({ minLength: 1, maxLength: 80 }), Attribute)),
  statements: Type.Optional(Type.Array(StatementInput, { maxItems: 300 })),
}
const EvidenceSeed = Type.Object(
  {
    kind: L('calculation', 'analysis', 'simulation', 'test', 'review', 'reference', 'estimate'),
    title: Text(300, 1),
    summary: Type.Optional(Text(20000)),
    basis: L('ai-hypothesis', 'assumption', 'assessment', 'estimate'),
    method: Type.Optional(Text(4000)),
    inputs: Type.Optional(Type.Array(NamedQuantity, { maxItems: 100 })),
    outputs: Type.Optional(Type.Array(NamedQuantity, { maxItems: 100 })),
    assumptions: Type.Optional(Type.Array(Text(1000, 1), { maxItems: 100 })),
  },
  { additionalProperties: false },
)
export const ExplorationCreate = Type.Object(
  {
    objective: Text(4000, 1),
    parentId: Type.Optional(Uuid),
    parent: Type.Optional(Type.Object(ConceptSeed, { additionalProperties: false })),
    setName: Type.Optional(Text(200, 1)),
    question: Type.Optional(Text(4000)),
    alternatives: Type.Array(
      Type.Object(
        {
          ...ConceptSeed,
          children: Type.Optional(Type.Array(Type.Object(ConceptSeed, { additionalProperties: false }), { maxItems: 30 })),
          interfaces: Type.Optional(
            Type.Array(Type.Object({ from: Type.Integer({ minimum: -1 }), to: Type.Integer({ minimum: -1 }), definition: InterfaceDefinition }, { additionalProperties: false, description: 'Child indexes; -1 is the alternative itself' }), { maxItems: 30 }),
          ),
          evidence: Type.Optional(Type.Array(EvidenceSeed, { maxItems: 20 })),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 20 },
    ),
    tradeStudy: Type.Optional(
      Type.Object(
        {
          title: Text(300, 1),
          criteria: Type.Array(CriterionInput, { minItems: 1, maxItems: 40 }),
          scores: Type.Optional(
            Type.Array(
              Type.Object(
                {
                  criterion: Type.Integer({ minimum: 0 }),
                  alternative: Type.Integer({ minimum: 0 }),
                  value: Type.Optional(Nullable(Type.Number())),
                  low: Type.Optional(Nullable(Type.Number())),
                  high: Type.Optional(Nullable(Type.Number())),
                  unit: Type.Optional(Type.String({ maxLength: 60 })),
                  qualitative: Type.Optional(Nullable(Type.Integer({ minimum: 1, maximum: 5 }))),
                  basis: Basis,
                  rationale: Type.Optional(Text(4000)),
                },
                { additionalProperties: false },
              ),
              { maxItems: 500 },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    generator: Type.Optional(Text(200)),
  },
  { $id: 'ExplorationCreate', additionalProperties: false, description: 'Creates a parent Concept (or uses parentId), an alternative set with one Concept per alternative, their decomposition, interfaces, preliminary evidence and an optional trade study in one transaction.' },
)
export type ExplorationCreateDto = Static<typeof ExplorationCreate>
export const Exploration = Type.Object(
  {
    id: Uuid,
    objective: Type.String(),
    parentId: Uuid,
    setId: Nullable(Uuid),
    tradeStudyId: Nullable(Uuid),
    created: Type.Object({
      concepts: Type.Array(Type.Object({ id: Uuid, key: Type.String(), name: Type.String(), role: L('parent', 'alternative', 'child') })),
      relationships: Type.Array(Uuid),
      evidence: Type.Array(Uuid),
    }),
    generator: Type.String(),
    undone: Type.Boolean(),
    undoneAt: Nullable(Timestamp),
    undoneBy: Nullable(Type.String()),
    createdAt: Timestamp,
    createdBy: Type.String(),
    provenance: Provenance,
  },
  { $id: 'Exploration' },
)

export const Permissions = Type.Object({ userId: Type.String(), projectId: Type.String(), role: Nullable(Type.String()), permissions: Type.Array(Type.String()) }, { $id: 'Permissions' })
export const UnitCheck = Type.Object({ unit: Type.String(), valid: Type.Boolean(), dimension: Type.String(), message: Type.Optional(Type.String()), common: Type.Array(Type.String()) }, { $id: 'UnitCheck' })

export const ConceptsEvent = Type.Object(
  {
    eventId: Uuid,
    type: L(
      'concept.created',
      'concept.revised',
      'concept.relationships-changed',
      'concept.implementation-linked',
      'concept.implementation-unlinked',
      'concept.selected',
      'concept.superseded',
      'concept.decision-recorded',
      'function.created',
      'function.revised',
      'function.retired',
      'constraint.created',
      'constraint.revised',
      'constraint.status-changed',
      'assumption.created',
      'assumption.revised',
      'assumption.validation-changed',
      'evidence.recorded',
      'evidence.reviewed',
      'decision.review-flagged',
      'decision.invalidated',
      'link.created',
      'link.removed',
      'calculation-model.created',
      'calculation-model.revised',
    ),
    projectId: Type.String(),
    entityId: Type.String(),
    committedRevision: Type.Integer(),
    occurredAt: Timestamp,
    actor: Type.String(),
  },
  { $id: 'ConceptsEvent' },
)

export const SCHEMAS = [
  ErrorBody,
  Provenance,
  Basis,
  Quantity,
  Attribute,
  ArtifactRef,
  Statement,
  StatementInput,
  Concept,
  ConceptListItem,
  ConceptPage,
  ConceptCreate,
  ConceptPatch,
  RevisionSummary,
  RevisionComparison,
  AuditEvent,
  MaturityChange,
  VerificationChange,
  Branch,
  Assessment,
  InterfaceDefinition,
  Relationship,
  RelationshipCreate,
  RemoveBody,
  RelationshipTypeInfo,
  Decomposition,
  DecompositionCreate,
  DecompositionPatch,
  AlternativeMember,
  AlternativeSet,
  AlternativeSetCreate,
  MemberAdd,
  DecisionOutcome,
  Decision,
  DecisionCreate,
  DecisionAction,
  Criterion,
  CriterionInput,
  CriterionUpdate,
  Score,
  ScoreInput,
  OptionResult,
  TradeStudy,
  TradeStudyCreate,
  TradeStudyPatch,
  ScoresPut,
  NamedQuantity,
  Evidence,
  EvidenceCreate,
  ImplementationArtifact,
  RealizationRequest,
  Implementation,
  ImplementationCreate,
  ImplementationPatch,
  ArtifactAdd,
  Repin,
  RealizationCreate,
  RealizationStatus,
  ConceptLink,
  LinkCreate,
  ArtifactConcepts,
  Graph,
  ExplorationCreate,
  Exploration,
  Permissions,
  UnitCheck,
  ConceptsEvent,
]

export type StatementInputDto = Static<typeof StatementInput>
export type AttributeDto = Static<typeof Attribute>
export type ArtifactRefDto = Static<typeof ArtifactRef>
export type CriterionInputDto = Static<typeof CriterionInput>
export type TradeStudyCreateDto = Static<typeof TradeStudyCreate>
export type TradeStudyPatchDto = Static<typeof TradeStudyPatch>
export type ImplementationCreateDto = Static<typeof ImplementationCreate>
export type ImplementationPatchDto = Static<typeof ImplementationPatch>
export type LinkCreateDto = Static<typeof LinkCreate>
export type RealizationCreateDto = Static<typeof RealizationCreate>
export type ConceptDto = Static<typeof Concept>
export type ConceptListItemDto = Static<typeof ConceptListItem>
export type StatementDto = Static<typeof Statement>
export type RelationshipDto = Static<typeof Relationship>
export type DecisionDto = Static<typeof Decision>
export type AlternativeSetDto = Static<typeof AlternativeSet>
export type TradeStudyDto = Static<typeof TradeStudy>
export type EvidenceDto = Static<typeof Evidence>
export type ImplementationDto = Static<typeof Implementation>
export type ConceptLinkDto = Static<typeof ConceptLink>
export type DecompositionDto = Static<typeof Decomposition>
export type ExplorationDto = Static<typeof Exploration>
