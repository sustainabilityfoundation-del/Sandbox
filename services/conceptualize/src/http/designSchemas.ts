import { Type, type Static, type TSchema } from '@sinclair/typebox'
import { ArtifactRef, Basis, Decision as BaseDecision, DecisionCreate as BaseDecisionCreate, Evidence as BaseEvidence, EvidenceCreate as BaseEvidenceCreate, Provenance, Quantity, Statement, StatementInput, Timestamp, Uuid } from './schemas'

/**
 * Schemas of the design-knowledge extensions (CR-C1…C6, C9, C10): Function, DesignConstraint, Assumption,
 * typed design links and their registry, decision and evidence extensions, batch, graph and search.
 */

const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])
const L = <T extends string>(...values: T[]) => Type.Union(values.map((v) => Type.Literal(v)))
const Text = (max: number, min = 0) => Type.String({ minLength: min, maxLength: max })

export const DesignEntityType = L('function', 'concept', 'implementation', 'constraint', 'assumption', 'evidence', 'decision', 'alternative-set', 'trade-study', 'exploration', 'calculation-model', 'statement')
export const DesignRef = Type.Object(
  { module: Type.Literal('conceptualize'), type: DesignEntityType, id: Type.String({ minLength: 1, maxLength: 100 }), revision: Type.Optional(Type.Integer({ minimum: 1 })) },
  { $id: 'DesignRef', additionalProperties: false, description: 'Reference to a Conceptualize record (SDK DesignRef, CR-S1)', examples: [{ module: 'conceptualize', type: 'function', id: '0c0a0001-0000-4000-8000-000000000001' }] },
)
export type DesignRefDto = Static<typeof DesignRef>
/** Either a design record or an artifact of another module. */
export const AnyRef = Type.Union([DesignRef, ArtifactRef], { $id: 'AnyRef' })

// ---- Function (CR-C1) ----------------------------------------------------------------------------------------

export const Flow = Type.Object(
  { direction: L('in', 'out'), kind: L('energy', 'material', 'signal', 'force', 'data', 'other'), name: Text(200, 1), quantity: Type.Optional(Nullable(Quantity)) },
  { $id: 'Flow', additionalProperties: false },
)
export const Objective = Type.Object(
  { name: Text(200, 1), direction: L('minimize', 'maximize', 'target'), quantity: Type.Optional(Quantity), basis: Type.Optional(Basis) },
  { $id: 'PerformanceObjective', additionalProperties: false, description: 'Performance objective of a Function: optimisation direction, optional value or range with unit, basis (R1 contract)' },
)
export const FunctionDto = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['FN-001'] }),
    projectId: Type.String(),
    revision: Type.Integer(),
    name: Type.String(),
    verbPhrase: Type.String(),
    description: Type.String(),
    purpose: Type.String(),
    flows: Type.Array(Flow),
    performanceObjectives: Type.Array(Objective),
    statements: Type.Array(Statement),
    classifications: Type.Array(Type.String()),
    status: L('draft', 'active', 'retired'),
    originConceptId: Nullable(Uuid),
    changeReason: Type.String(),
    provenance: Provenance,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'Function', description: 'What a system must accomplish, independent of how. Never implemented directly and never an alternative.' },
)
const FunctionFields = {
  verbPhrase: Type.Optional(Text(200)),
  description: Type.Optional(Text(40000)),
  purpose: Type.Optional(Text(4000)),
  flows: Type.Optional(Type.Array(Flow, { maxItems: 50 })),
  performanceObjectives: Type.Optional(Type.Array(Objective, { maxItems: 50 })),
  statements: Type.Optional(Type.Array(StatementInput, { maxItems: 300 })),
  classifications: Type.Optional(Type.Array(Text(60, 1), { maxItems: 30 })),
}
export const FunctionCreate = Type.Object(
  { name: Text(200, 1), ...FunctionFields, status: Type.Optional(L('draft', 'active')), parentFunctionId: Type.Optional(Uuid), decompositionId: Type.Optional(Uuid), reason: Type.Optional(Text(2000)) },
  { $id: 'FunctionCreate', additionalProperties: false, examples: [{ name: 'Transmit mechanical power', verbPhrase: 'transmit power', performanceObjectives: [{ name: 'Torque', quantity: { max: 8, unit: 'N*m' }, direction: 'target' }] }] },
)
export type FunctionCreateDto = Static<typeof FunctionCreate>
export const FunctionPatch = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), name: Type.Optional(Text(200, 1)), ...FunctionFields, status: Type.Optional(L('draft', 'active', 'retired')), reason: Type.Optional(Text(2000)) },
  { $id: 'FunctionPatch', additionalProperties: false },
)
export type FunctionPatchDto = Static<typeof FunctionPatch>
export const ConvertToFunction = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Type.Optional(Text(2000)) },
  { $id: 'ConvertToFunction', additionalProperties: false, description: 'Explicit conversion (CR-C1 step 3): the Concept and its links stay as history.' },
)
export const Conversion = Type.Object(
  { function: FunctionDto, derivedLinkId: Uuid, performsLinkIds: Type.Array(Uuid), conceptId: Uuid },
  { $id: 'Conversion' },
)

// ---- DesignConstraint (CR-C2) ----------------------------------------------------------------------------------

export const Bound = Type.Object(
  { symbol: Type.Optional(Text(60)), operator: L('<=', '<', '=', '>=', '>', 'in-range'), quantity: Quantity },
  { $id: 'Bound', additionalProperties: false },
)
export const ConstraintSource = Type.Union(
  [
    Type.Object({ kind: Type.Literal('requirement'), ref: ArtifactRef }, { additionalProperties: false }),
    Type.Object({ kind: Type.Literal('derived'), from: DesignRef }, { additionalProperties: false }),
    Type.Object({ kind: Type.Literal('stated'), basis: Type.Optional(Basis) }, { additionalProperties: false }),
  ],
  { $id: 'ConstraintSource', description: 'requirement: formalizes one pinned requirement revision; derived: from another design record; stated: by a person or the assistant (see basis)' },
)
export const Expression = Type.Object({ modelId: Uuid, revision: Type.Integer({ minimum: 1 }), relationId: Text(100, 1) }, { $id: 'Expression', additionalProperties: false })
export const ConstraintDto = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['CST-001'] }),
    projectId: Type.String(),
    revision: Type.Integer(),
    kind: L('qualitative', 'logical', 'mathematical', 'dimensional', 'interface'),
    statement: Type.String(),
    bound: Nullable(Bound),
    expression: Nullable(Expression),
    strength: L('hard', 'soft', 'preference'),
    source: ConstraintSource,
    basis: Basis,
    origin: Nullable(Type.Object({ conceptId: Uuid, statementId: Uuid })),
    status: L('proposed', 'active', 'relaxed', 'retired'),
    subjects: Type.Array(DesignRef),
    changeReason: Type.String(),
    provenance: Provenance,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'DesignConstraint', description: 'Conceptual constraint. suspect (pinned requirement revision superseded) is derived by clients through the Requirements service in v1.' },
)
const ConstraintFields = {
  bound: Type.Optional(Nullable(Bound)),
  expression: Type.Optional(Nullable(Expression)),
  strength: Type.Optional(L('hard', 'soft', 'preference')),
  basis: Type.Optional(Basis),
}
export const ConstraintCreate = Type.Object(
  {
    kind: L('qualitative', 'logical', 'mathematical', 'dimensional', 'interface'),
    statement: Text(4000, 1),
    ...ConstraintFields,
    source: Type.Optional(ConstraintSource),
    subjects: Type.Optional(Type.Array(DesignRef, { maxItems: 50 })),
    status: Type.Optional(L('proposed', 'active')),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'ConstraintCreate', additionalProperties: false, examples: [{ kind: 'dimensional', statement: 'Fits a 100 mm envelope', bound: { symbol: 'L', operator: '<=', quantity: { value: 100, unit: 'mm' } }, strength: 'hard' }] },
)
export type ConstraintCreateDto = Static<typeof ConstraintCreate>
export const ConstraintPatch = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), statement: Type.Optional(Text(4000, 1)), kind: Type.Optional(L('qualitative', 'logical', 'mathematical', 'dimensional', 'interface')), ...ConstraintFields, status: Type.Optional(L('proposed', 'active', 'relaxed', 'retired')), reason: Type.Optional(Text(2000)) },
  { $id: 'ConstraintPatch', additionalProperties: false },
)
export type ConstraintPatchDto = Static<typeof ConstraintPatch>
export const StatusChange = Type.Object({ status: Type.String({ minLength: 1, maxLength: 40 }), expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Text(2000, 1) }, { $id: 'StatusChange', additionalProperties: false })
export const PromoteStatement = Type.Object(
  { statementId: Uuid, kind: Type.Optional(L('qualitative', 'logical', 'mathematical', 'dimensional', 'interface')), strength: Type.Optional(L('hard', 'soft', 'preference')), operator: Type.Optional(L('<=', '<', '=', '>=', '>', 'in-range')), reason: Type.Optional(Text(2000)) },
  { $id: 'PromoteStatement', additionalProperties: false, description: 'User-invoked promotion of a constraint statement with a quantity (CR-C2); the statement stays unchanged.' },
)

// ---- Assumption (CR-C3) ----------------------------------------------------------------------------------------

export const AssumptionScope = Type.Object({ subjects: Type.Array(DesignRef, { maxItems: 50 }), applicability: Type.Optional(Text(2000)) }, { $id: 'AssumptionScope', additionalProperties: false })
export const AssumptionValidation = Type.Object(
  {
    id: Uuid,
    revision: Type.Integer({ description: 'Content revision the change applied to' }),
    status: Type.String({ description: 'R1: the new status' }),
    by: Type.String(),
    at: Timestamp,
    reason: Type.String(),
    evidence: Type.Optional(DesignRef),
    fromStatus: Type.String(),
    toStatus: Type.String(),
    evidenceIds: Type.Array(Uuid),
    actor: Type.String(),
    occurredAt: Timestamp,
    provenance: Provenance,
  },
  { $id: 'AssumptionValidation' },
)
export const AssumptionDto = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['ASM-001'] }),
    projectId: Type.String(),
    revision: Type.Integer(),
    statement: Type.String(),
    quantity: Nullable(Quantity),
    scope: Type.Object({ subjects: Type.Array(DesignRef), applicability: Type.String() }),
    basis: Basis,
    dependsOn: Type.Array(AnyRef),
    origin: Nullable(Type.Object({ conceptId: Uuid, statementId: Uuid })),
    validationStatus: L('unvalidated', 'under-review', 'validated', 'invalidated', 'retired'),
    validatedBy: Type.Array(Uuid),
    validations: Type.Array(AssumptionValidation),
    changeReason: Type.String(),
    provenance: Provenance,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'Assumption' },
)
export const AssumptionCreate = Type.Object(
  {
    statement: Text(4000, 1),
    quantity: Type.Optional(Nullable(Quantity)),
    scope: Type.Optional(AssumptionScope),
    basis: Type.Optional(L('user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate')),
    dependsOn: Type.Optional(Type.Array(AnyRef, { maxItems: 50 })),
    origin: Type.Optional(Type.Object({ conceptId: Uuid, statementId: Uuid }, { additionalProperties: false })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'AssumptionCreate', additionalProperties: false, examples: [{ statement: 'Rod ends are pinned (K = 1)', quantity: { value: 1, unit: '-' }, basis: 'assumption' }] },
)
export type AssumptionCreateDto = Static<typeof AssumptionCreate>
export const AssumptionPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    statement: Type.Optional(Text(4000, 1)),
    quantity: Type.Optional(Nullable(Quantity)),
    scope: Type.Optional(AssumptionScope),
    basis: Type.Optional(L('user-assertion', 'ai-hypothesis', 'assumption')),
    dependsOn: Type.Optional(Type.Array(AnyRef, { maxItems: 50 })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'AssumptionPatch', additionalProperties: false },
)
export type AssumptionPatchDto = Static<typeof AssumptionPatch>
export const ValidationChange = Type.Object(
  { status: L('unvalidated', 'under-review', 'validated', 'invalidated', 'retired'), evidence: Type.Optional(DesignRef), evidenceIds: Type.Optional(Type.Array(Uuid, { maxItems: 20 })), expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Text(2000, 1) },
  { $id: 'ValidationChange', additionalProperties: false, description: 'R1-2: validated needs an evidence reference (evidence, or evidenceIds) and a person; validating or invalidating an assumption used by a recorded decision needs a reviewer. expectedRevision is optional (the history is append-only).' },
)

// ---- link registry and design links (CR-C4) ------------------------------------------------------------------------

export const LinkType = Type.Object(
  {
    name: Type.String(),
    label: Type.String(),
    inverse: Type.String(),
    fromTypes: Type.Array(Type.String()),
    toTypes: Type.Array(Type.String()),
    symmetric: Type.Boolean(),
    acyclic: Type.Boolean(),
    assistantAssertable: Type.Boolean(),
    impact: L('possible', 'demonstrated', 'none'),
    propagation: L('to-from', 'from-to', 'both', 'none'),
    artifactModules: Nullable(Type.Array(Type.String())),
    description: Type.String(),
    builtin: Type.Boolean(),
    stored: L('design-links', 'relationships', 'derived'),
  },
  { $id: 'LinkType', description: 'stored: design-links (this registry), relationships (Concept↔Concept types), derived (readings of stored data such as realizes or selected-through)' },
)
export const LinkTypeCreate = Type.Object(
  {
    name: Type.String({ pattern: '^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$', maxLength: 80, description: 'Namespaced name, e.g. thermal:rejects-heat-to' }),
    label: Text(100, 1),
    inverse: Text(100, 1),
    fromTypes: Type.Array(L('function', 'concept', 'constraint', 'assumption', 'evidence', 'decision', 'implementation', 'exploration'), { minItems: 1 }),
    toTypes: Type.Array(L('function', 'concept', 'constraint', 'assumption', 'evidence', 'decision', 'implementation', 'exploration', 'artifact'), { minItems: 1 }),
    symmetric: Type.Optional(Type.Boolean()),
    acyclic: Type.Optional(Type.Boolean()),
    assistantAssertable: Type.Optional(Type.Boolean()),
    impact: Type.Optional(L('possible', 'none')),
    propagation: Type.Optional(L('to-from', 'from-to', 'both', 'none')),
    artifactModules: Type.Optional(Type.Array(L('requirements', 'sysml', 'cad', 'twin', 'analysis', 'external', 'reasoning'), { maxItems: 10 })),
    description: Type.Optional(Text(2000)),
  },
  { $id: 'LinkTypeCreate', additionalProperties: false },
)
export const DesignLinkDto = Type.Object(
  {
    id: Uuid,
    type: Type.String(),
    from: DesignRef,
    to: AnyRef,
    decompositionId: Nullable(Uuid),
    basis: Basis,
    note: Type.String(),
    attributes: Type.Record(Type.String(), Type.Unknown()),
    revision: Type.Integer(),
    removed: Type.Boolean(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    removedAt: Nullable(Timestamp),
    removedBy: Nullable(Type.String()),
    provenance: Provenance,
  },
  { $id: 'DesignLink' },
)
export const DesignLinkCreate = Type.Object(
  {
    type: Type.String({ minLength: 1, maxLength: 80 }),
    from: DesignRef,
    to: AnyRef,
    decompositionId: Type.Optional(Uuid),
    basis: Type.Optional(Basis),
    note: Type.Optional(Text(4000)),
    attributes: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'DesignLinkCreate', additionalProperties: false, examples: [{ type: 'performs', from: { module: 'conceptualize', type: 'concept', id: 'c0ce0000-0000-4000-8000-000000000006' }, to: { module: 'conceptualize', type: 'function', id: '0c0a0001-0000-4000-8000-000000000001' } }] },
)
export type DesignLinkCreateDto = Static<typeof DesignLinkCreate>

// ---- decisions (CR-C5) --------------------------------------------------------------------------------------------

export const SupportRef = Type.Object({ ref: DesignRef, role: L('supports', 'contradicts'), note: Type.Optional(Text(2000)) }, { $id: 'SupportRef', additionalProperties: false })
export const InvalidationCondition = Type.Object(
  {
    id: Type.Optional(Text(60)),
    kind: L('assumption-invalidated', 'constraint-changed', 'evidence-superseded', 'requirement-revised', 'artifact-revised', 'relation-violated', 'manual'),
    subject: AnyRef,
    relation: Type.Optional(Type.Object({ modelId: Uuid, revision: Type.Integer(), relationId: Text(100, 1) }, { additionalProperties: false })),
    description: Text(2000, 1),
  },
  { $id: 'InvalidationCondition', additionalProperties: false },
)
export const PinRef = Type.Object({ id: Uuid, revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { $id: 'PinRef', additionalProperties: false })
export const ReviewFlagRecord = Type.Object(
  {
    at: Timestamp,
    by: Type.String(),
    reason: Type.String(),
    impactReportId: Type.Optional(Type.String()),
    conditionId: Type.Optional(Type.String()),
    sourceKind: Type.Optional(Type.String()),
    cleared: Type.Optional(Type.Object({ at: Timestamp, by: Type.String(), note: Type.String(), outcome: Type.Optional(Type.String()) })),
  },
  { $id: 'ReviewFlagRecord', description: 'R1-7: append-only; validity is under-review while an uncleared flag exists' },
)
export const DecisionExtensions = {
  support: Type.Optional(Type.Array(SupportRef, { maxItems: 50 })),
  assumptionIds: Type.Optional(Type.Array(Type.Union([DesignRef, PinRef]), { maxItems: 50, description: 'Assumptions with the revision the decision rests on ({ id, revision } as in R1, or a DesignRef); the current revision when omitted' })),
  constraintIds: Type.Optional(Type.Array(Type.Union([DesignRef, PinRef]), { maxItems: 50, description: 'Constraints with the revision taken into account; the current revision when omitted' })),
  affected: Type.Optional(Type.Array(AnyRef, { maxItems: 100 })),
  invalidationConditions: Type.Optional(Type.Array(InvalidationCondition, { maxItems: 50 })),
}
export const ReviewFlag = Type.Object(
  { reason: Text(2000, 1), impactReportId: Type.Optional(Text(200)), impactReportRef: Type.Optional(ArtifactRef), conditionId: Type.Optional(Text(60)) },
  { $id: 'ReviewFlag', additionalProperties: false, description: 'Sets validity under-review (no edit of the decision record).' },
)
export const ValidityChange = Type.Object(
  { validity: L('valid', 'invalidated'), expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Text(2000, 1), invalidatedBy: Type.Optional(AnyRef) },
  { $id: 'ValidityChange', additionalProperties: false, description: 'Reviewer clears a review flag (valid) or records invalidation.' },
)
export const Rationale = Type.Object(
  {
    decision: Type.Unknown(),
    question: Type.String(),
    alternatives: Type.Array(Type.Object({ ref: DesignRef, key: Type.String(), name: Type.String(), outcome: Nullable(Type.String()), outcomeRationale: Type.String(), memberStatus: Nullable(Type.String()) })),
    support: Type.Array(Type.Object({ ref: DesignRef, key: Type.String(), title: Type.String(), role: Type.String(), basis: Type.String(), validationStatus: Type.String(), checks: Type.Optional(Type.Array(Type.Unknown(), { description: 'C11 Q8: each check with status and statusBasis (calculated evidence)' })), limits: Type.Optional(Type.Unknown({ description: 'What the reproducible calculation does not establish' })) })),
    assumptions: Type.Array(Type.Object({ ref: DesignRef, key: Type.String(), statement: Type.String(), pinnedRevision: Nullable(Type.Integer()), currentRevision: Type.Integer(), validationStatus: Type.String() })),
    constraints: Type.Array(Type.Object({ ref: DesignRef, key: Type.String(), statement: Type.String(), pinnedRevision: Nullable(Type.Integer()), currentRevision: Type.Integer(), status: Type.String() })),
    tradeStudy: Nullable(Type.Object({ ref: DesignRef, key: Type.String(), title: Type.String(), ranking: Type.String(), preliminary: Type.Boolean() })),
    invalidationConditions: Type.Array(InvalidationCondition),
    validity: L('valid', 'under-review', 'invalidated'),
    reviewFlags: Type.Array(ReviewFlagRecord),
    supersedes: Nullable(Type.String()),
    supersededBy: Nullable(Type.String()),
    stale: Type.Array(Type.String({ description: 'Pinned assumption/constraint revisions that are no longer current' })),
  },
  { $id: 'Rationale', description: 'Deterministic assembly of a decision and what it rests on (no model involved).' },
)

// ---- evidence (CR-C6) -------------------------------------------------------------------------------------------

/** C11 qualification of a result value, kept unchanged from the producing tool. */
export const ResultQualification = Type.Object(
  { kind: L('point', 'sampled-range', 'bounds'), quality: Type.Optional(L('exact', 'enclosure')), note: Type.Optional(Text(500)) },
  { $id: 'ResultQualification', additionalProperties: false, description: 'point: one value. sampled-range: values seen, not a proven range (never satisfied). bounds: exact (attained) or enclosure (contains the true range).' },
)
export const EvidenceResultInput = Type.Object(
  {
    name: Text(200, 1),
    value: Type.Optional(Nullable(Type.Number())),
    min: Type.Optional(Nullable(Type.Number())),
    max: Type.Optional(Nullable(Type.Number())),
    unit: Type.String({ maxLength: 60 }),
    qualification: ResultQualification,
    constraint: Type.Optional(Type.Union([DesignRef, Type.Object({ id: Uuid, revision: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false })], { description: 'The constraint the result is checked against (pinned; current revision when omitted)' })),
    status: Type.Optional(L('satisfied', 'violated', 'uncertain')),
    note: Type.Optional(Text(1000)),
  },
  { $id: 'EvidenceResultInput', additionalProperties: false, description: 'A measured or computed result. With a constraint, the service computes status from the constraint bound; a given status must match.' },
)
export const EvidenceResult = Type.Object(
  {
    name: Type.String(),
    value: Nullable(Type.Number()),
    min: Nullable(Type.Number()),
    max: Nullable(Type.Number()),
    unit: Type.String(),
    qualification: ResultQualification,
    constraint: Nullable(DesignRef),
    status: Nullable(L('satisfied', 'violated', 'uncertain')),
    margin: Nullable(Type.Number()),
    marginUnit: Nullable(Type.String()),
    note: Type.String(),
  },
  { $id: 'EvidenceResult' },
)
export const ToolInfo = Type.Object({ name: Text(200, 1), version: Text(100, 1) }, { $id: 'ToolInfo', additionalProperties: false, description: 'Tool that produced the results, e.g. the CAD kernel (ADR-0070 item 3)' })
/** CR-C8 / C11 storage contract: the calculation an evidence record was produced by. */
export const EvidenceCalculationInput = Type.Object(
  { modelId: Uuid, modelRevision: Type.Integer({ minimum: 1 }), manifest: Type.Record(Type.String(), Type.Unknown()) },
  { $id: 'EvidenceCalculationInput', description: 'Re-verified with verifyManifest on write; the service records the verification' },
)
export const EvidenceCalculation = Type.Object(
  { modelId: Uuid, modelRevision: Type.Integer(), manifest: Type.Record(Type.String(), Type.Unknown()), verification: Type.Optional(Type.Object({ verifiedAt: Timestamp, engineVersion: Type.String(), manifestVersion: Type.Integer(), ok: Type.Literal(true), exactDigestMatch: Type.Optional(Type.Boolean()) })) },
  { $id: 'EvidenceCalculation' },
)
export const EvidenceExtensions = {
  subjects: Type.Optional(Type.Array(DesignRef, { maxItems: 50 })),
  applicability: Type.Optional(Type.Union([Text(2000), Type.Record(Type.String(), Type.Unknown())], { description: 'Where the evidence applies (R1: text; structured objects are kept)' })),
  manifest: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Reproducibility manifest (required for basis calculated)' })),
  source: Type.Optional(AnyRef),
  assumptionIds: Type.Optional(Type.Array(Uuid, { maxItems: 50 })),
  tool: Type.Optional(ToolInfo),
  results: Type.Optional(Type.Array(EvidenceResultInput, { maxItems: 200 })),
  calculation: Type.Optional(EvidenceCalculationInput),
  qualifications: Type.Optional(Type.Unknown({ description: 'Ignored: derived by the service with qualifyManifest (Q2)' })),
  verification: Type.Optional(Type.Unknown({ description: 'Ignored: recorded by the service' })),
}
export const EvidenceReview = Type.Object(
  { id: Uuid, outcome: L('accepted', 'rejected'), method: Type.String(), note: Type.String(), reviewer: Type.String(), reviewedAt: Timestamp },
  { $id: 'EvidenceReview' },
)
export const EvidenceReviewCreate = Type.Object(
  { outcome: L('accepted', 'rejected'), method: Type.Optional(Text(1000)), note: Type.Optional(Text(4000)) },
  { $id: 'EvidenceReviewCreate', additionalProperties: false },
)

// ---- batch (CR-C10) -----------------------------------------------------------------------------------------------

export const BATCH_OPS = [
  'createFunction',
  'createConcept',
  'createConstraint',
  'reviseConstraint',
  'createAssumption',
  'createEvidence',
  'createLink',
  'createAlternativeSet',
  'createTradeStudy',
  'putScores',
  'proposeDecision',
  'recordDecision',
  'flagDecisionForReview',
  'createImplementation',
  'createCalculationModel',
  'updateConcept',
  'updateFunction',
  'createRelationship',
  'createConceptLink',
  'addAlternative',
] as const
export const BatchItem = Type.Object(
  {
    op: Type.Union(BATCH_OPS.map((o) => Type.Literal(o)), { description: 'R1-1: the operationId of the write. createLink is a design link (CR-C4); createConceptLink, updateConcept, updateFunction, createRelationship and addAlternative are Conceptualize extensions; createCalculationModel answers 501 until CR-C8.' }),
    as: Type.Optional(Type.String({ pattern: '^\\$[A-Za-z][A-Za-z0-9_-]{0,40}$', description: 'Placeholder for the created (or affected) record, usable by later items as "$name"' })),
    body: Type.Record(Type.String(), Type.Unknown(), { description: 'The body of the single operation (same schema and rules); updates carry id and expectedRevision in the body' }),
  },
  { $id: 'BatchItem', additionalProperties: false },
)
export const BatchRequest = Type.Object(
  { items: Type.Array(BatchItem, { minItems: 1, maxItems: 200 }), reason: Type.Optional(Text(2000)) },
  {
    $id: 'BatchRequest',
    additionalProperties: false,
    description: 'Executed in one transaction with one provenance; any string equal to an earlier placeholder ("$fn1") is replaced by its ID anywhere in later bodies. All or nothing. The Idempotency-Key header covers the whole batch.',
    examples: [{ items: [{ op: 'createFunction', as: '$fn', body: { name: 'Deliver linear force' } }, { op: 'createLink', body: { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: '…' }, to: { module: 'conceptualize', type: 'function', id: '$fn' } } }] }],
  },
)
export type BatchRequestDto = Static<typeof BatchRequest>
export const BatchResult = Type.Object(
  {
    results: Type.Array(Type.Object({ index: Type.Integer(), op: Type.String(), as: Nullable(Type.String()), id: Type.String(), key: Nullable(Type.String()), revision: Nullable(Type.Integer()) })),
    ids: Type.Record(Type.String(), Type.String(), { description: 'Placeholder → created or affected ID' }),
  },
  { $id: 'BatchResult' },
)

// ---- graph and search (CR-C9) -----------------------------------------------------------------------------------------

export const GraphNode = Type.Object(
  { ref: AnyRef, key: Type.String(), label: Type.String(), revision: Nullable(Type.Integer()), type: Type.String(), status: Type.String() },
  { $id: 'GraphNode' },
)
export const GraphEdge = Type.Object(
  { id: Type.String(), type: Type.String(), from: AnyRef, to: AnyRef, basis: Nullable(Type.String()), pinned: Type.Boolean(), derived: Type.Boolean({ description: 'R1-8: read from records, not a stored link' }), stored: L('design-links', 'relationships', 'concept-links', 'derived') },
  { $id: 'GraphEdge' },
)
export const TraverseRequest = Type.Object(
  {
    start: Type.Array(AnyRef, { minItems: 1, maxItems: 50 }),
    follow: Type.Optional(Type.Array(Type.Object({ type: Type.String(), direction: Type.Optional(L('in', 'out', 'both')) }, { additionalProperties: false }), { maxItems: 40 })),
    maxDepth: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
    nodeTypes: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
    where: Type.Optional(Type.Object({ status: Type.Optional(Type.Array(Type.String())), basis: Type.Optional(Type.Array(Type.String())) }, { additionalProperties: false })),
    asOf: Type.Optional(Nullable(Timestamp)),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
    cursor: Type.Optional(Type.String()),
  },
  { $id: 'TraverseRequest', additionalProperties: false },
)
export const TraverseResult = Type.Object(
  { nodes: Type.Array(GraphNode), edges: Type.Array(GraphEdge), truncated: Type.Boolean(), cursor: Type.Optional(Type.String()), builtFrom: Type.Object({ at: Timestamp, asOf: Nullable(Timestamp), revision: Type.Integer({ description: 'Project revision (latest audit sequence) the result reflects' }) }) },
  { $id: 'TraverseResult' },
)
export const PathsRequest = Type.Object(
  { from: AnyRef, to: AnyRef, maxDepth: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })), follow: Type.Optional(Type.Array(Type.String(), { maxItems: 40 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })), asOf: Type.Optional(Nullable(Timestamp)) },
  { $id: 'PathsRequest', additionalProperties: false },
)
export const PathsResult = Type.Object(
  { paths: Type.Array(Type.Object({ nodes: Type.Array(AnyRef), edges: Type.Array(GraphEdge) })), nodes: Type.Array(GraphNode), truncated: Type.Boolean() },
  { $id: 'PathsResult' },
)
export const SearchResult = Type.Object(
  { items: Type.Array(Type.Object({ ref: DesignRef, key: Type.String(), label: Type.String(), status: Type.String(), rank: Type.Number(), snippet: Type.String() })), total: Type.Integer() },
  { $id: 'SearchResult' },
)

export const DESIGN_SCHEMAS: TSchema[] = [
  DesignRef,
  AnyRef,
  Flow,
  Objective,
  FunctionDto,
  FunctionCreate,
  FunctionPatch,
  ConvertToFunction,
  Conversion,
  Bound,
  ConstraintSource,
  Expression,
  ConstraintDto,
  ConstraintCreate,
  ConstraintPatch,
  StatusChange,
  PromoteStatement,
  AssumptionScope,
  AssumptionValidation,
  AssumptionDto,
  AssumptionCreate,
  AssumptionPatch,
  ValidationChange,
  LinkType,
  LinkTypeCreate,
  DesignLinkDto,
  DesignLinkCreate,
  SupportRef,
  InvalidationCondition,
  ReviewFlag,
  ValidityChange,
  Rationale,
  EvidenceReview,
  EvidenceReviewCreate,
  BatchItem,
  BatchRequest,
  BatchResult,
  GraphNode,
  GraphEdge,
  TraverseRequest,
  TraverseResult,
  PathsRequest,
  PathsResult,
  SearchResult,
]

export type FunctionOut = Static<typeof FunctionDto>
export type ConstraintOut = Static<typeof ConstraintDto>
export type AssumptionOut = Static<typeof AssumptionDto>
export type DesignLinkOut = Static<typeof DesignLinkDto>
export type InvalidationConditionDto = Static<typeof InvalidationCondition>
export type SupportRefDto = Static<typeof SupportRef>
export type TraverseRequestDto = Static<typeof TraverseRequest>
export type PathsRequestDto = Static<typeof PathsRequest>
export type BoundDto = Static<typeof Bound>
export type ConstraintSourceDto = Static<typeof ConstraintSource>

// ---- extended Decision and Evidence (replace the base components in the OpenAPI document) ----------------------


export const DecisionV = Type.Object(
  {
    ...BaseDecision.properties,
    support: Type.Array(SupportRef),
    assumptionIds: Type.Array(DesignRef),
    constraintIds: Type.Array(DesignRef),
    affected: Type.Array(AnyRef),
    invalidationConditions: Type.Array(InvalidationCondition),
    validity: L('valid', 'under-review', 'invalidated'),
    reviewFlags: Type.Array(ReviewFlagRecord),
  },
  { $id: 'Decision', description: 'validity is derived (R1-7): invalidated when a reviewer invalidated it or a recorded decision superseded it; under-review while an uncleared review flag exists; otherwise valid.' },
)
export const DecisionCreateV = Type.Object({ ...BaseDecisionCreate.properties, ...DecisionExtensions }, { $id: 'DecisionCreate', additionalProperties: false })
export type DecisionCreateVDto = Static<typeof DecisionCreateV>
export const EvidenceV = Type.Object(
  {
    ...BaseEvidence.properties,
    conceptId: Nullable(Uuid),
    conceptRevision: Nullable(Type.Integer()),
    subjects: Type.Array(DesignRef),
    applicability: Type.Union([Type.String(), Type.Record(Type.String(), Type.Unknown())]),
    manifest: Nullable(Type.Record(Type.String(), Type.Unknown())),
    source: Nullable(AnyRef),
    assumptionIds: Type.Array(Uuid),
    tool: Nullable(ToolInfo),
    results: Type.Array(EvidenceResult),
    calculation: Nullable(EvidenceCalculation),
    qualifications: Nullable(Type.Record(Type.String(), Type.Unknown(), { description: 'CalculationQualifications of @ews/engineering-calc, unchanged' })),
    qualificationsSource: Nullable(L('stored', 'computed-on-read')),
    reviews: Type.Array(EvidenceReview),
    validationStatus: L('unreviewed', 'accepted', 'rejected'),
  },
  { $id: 'Evidence', description: 'Immutable. basis evidence = verified (a person, with an artifact reference). basis calculated is refused until the service can re-verify a calculation (CR-C8; finding D6). Results carry their C11 qualification and a service-computed status against pinned constraints; results need a revision-pinned source and the tool name and version (ADR-0070). validationStatus is derived from append-only reviews.' },
)
export const EvidenceCreateV = Type.Object({ ...BaseEvidenceCreate.properties, conceptId: Type.Optional(Uuid), ...EvidenceExtensions }, { $id: 'EvidenceCreate', additionalProperties: false })
export type EvidenceCreateVDto = Static<typeof EvidenceCreateV>
export type DecisionVDto = Static<typeof DecisionV>
export type EvidenceVDto = Static<typeof EvidenceV>
DESIGN_SCHEMAS.push(DecisionV, DecisionCreateV, EvidenceV, EvidenceCreateV)
