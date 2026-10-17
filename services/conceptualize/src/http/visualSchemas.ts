import { Type, type Static, type TSchema } from '@sinclair/typebox'
import { Definition, Provenance, Timestamp, Uuid } from './schemas'

/** Visual concept exploration (concept-visualization-contracts.md): visuals, annotations, generation, staleness, handoff. */

const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])
const L = <T extends string>(...values: T[]) => Type.Union(values.map((v) => Type.Literal(v)))
const Text = (max: number, min = 0) => Type.String({ minLength: min, maxLength: max })

export const VisualKind = L('illustration', 'layout', 'mechanism', 'architecture', 'envelope-3d', 'motion')
const GenerationState = L('pending', 'running', 'succeeded', 'failed', 'cancelled', 'refused')
const AssetRef = Type.Object({ assetId: Text(200, 1), sha256: Type.Optional(Type.String({ pattern: '^[0-9a-f]{64}$' })) }, { additionalProperties: false })
const ProvenanceOut = Type.Object({ sourceKind: Type.String(), conversationId: Nullable(Type.String()), proposalId: Nullable(Type.String()), messageId: Nullable(Type.String()) })

export const DefinitionChange = Type.Object({
  area: L('intent', 'component', 'relationship', 'interface', 'parameter', 'layout', 'architecture'),
  id: Type.String(),
  change: L('added', 'removed', 'changed'),
  label: Type.String(),
})
export const Staleness = Type.Object(
  { outdated: Type.Boolean({ description: 'Possibly outdated: relevant parts of the engineering definition changed since the pinned revision' }), currentConceptRevision: Type.Integer(), changes: Type.Array(DefinitionChange) },
  { $id: 'Staleness', description: 'Derived on read; nothing is regenerated automatically.' },
)

export const Annotation = Type.Object(
  {
    id: Uuid,
    visualId: Uuid,
    revision: Type.Integer({ description: 'The exact visual revision annotated (never carried onto another revision)' }),
    number: Type.Integer({ minimum: 1 }),
    shape: L('pin', 'rect'),
    x: Type.Number({ minimum: 0, maximum: 1 }),
    y: Type.Number({ minimum: 0, maximum: 1 }),
    width: Nullable(Type.Number()),
    height: Nullable(Type.Number()),
    instruction: Type.String(),
    componentId: Nullable(Type.String()),
    componentBasis: Nullable(L('structured', 'inferred', 'user')),
    createdAt: Timestamp,
    createdBy: Type.String(),
    provenance: ProvenanceOut,
  },
  { $id: 'VisualAnnotation' },
)
export const AnnotationCreate = Type.Object(
  {
    shape: L('pin', 'rect'),
    x: Type.Number({ minimum: 0, maximum: 1, description: 'Normalized (0 left, 1 right)' }),
    y: Type.Number({ minimum: 0, maximum: 1, description: 'Normalized (0 top, 1 bottom)' }),
    width: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1 })),
    height: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1 })),
    instruction: Text(4000, 1),
    componentId: Type.Optional(Type.String({ maxLength: 40 })),
    componentBasis: Type.Optional(L('structured', 'inferred', 'user')),
  },
  { $id: 'VisualAnnotationCreate', additionalProperties: false },
)

export const Generation = Type.Object(
  {
    jobId: Nullable(Type.String()),
    state: GenerationState,
    adapter: Type.String(),
    provider: Type.String(),
    model: Type.String(),
    attempt: Type.Integer(),
    assetId: Nullable(Type.String()),
    assetSha256: Nullable(Type.String()),
    mediaType: Nullable(Type.String()),
    testAsset: Type.Boolean({ description: 'Output of the fake test adapter (development and tests only)' }),
    error: Nullable(Type.Object({ code: Type.String(), message: Type.String(), retryable: Type.Optional(Type.Boolean()) })),
    requestedAt: Timestamp,
    requestedBy: Type.String(),
    updatedAt: Timestamp,
  },
  { $id: 'VisualGeneration', description: 'The visualization job of an illustration revision (asset references only).' },
)
export const GenerationRecord = Type.Object(
  {
    jobId: Type.Optional(Nullable(Text(200, 1))),
    state: GenerationState,
    adapter: Type.Optional(Text(200)),
    provider: Type.Optional(Text(200)),
    model: Type.Optional(Text(200)),
    attempt: Type.Optional(Type.Integer({ minimum: 1 })),
    assetId: Type.Optional(Nullable(Text(200, 1))),
    assetSha256: Type.Optional(Nullable(Type.String({ pattern: '^[0-9a-f]{64}$' }))),
    mediaType: Type.Optional(Nullable(Text(100))),
    testAsset: Type.Optional(Type.Boolean()),
    error: Type.Optional(Nullable(Type.Object({ code: Text(200, 1), message: Text(4000), retryable: Type.Optional(Type.Boolean()) }, { additionalProperties: false }))),
  },
  { $id: 'VisualGenerationRecord', additionalProperties: false },
)

export const Visual = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['VIS-001'] }),
    projectId: Type.String(),
    conceptId: Uuid,
    kind: VisualKind,
    status: L('active', 'archived'),
    revision: Type.Integer(),
    currentRevision: Type.Integer(),
    conceptRevision: Type.Integer({ description: 'The exact Concept revision this visual revision shows' }),
    title: Type.String(),
    view: Type.String(),
    notToScale: Type.Boolean({ description: 'Illustrations always; layouts when a dimensioned extent is not bound to its parameter' }),
    instruction: Type.String(),
    referenceAssets: Type.Array(AssetRef),
    refinedFrom: Type.Array(Uuid, { description: 'Annotations of an earlier revision this revision answers' }),
    changeReason: Type.String(),
    generation: Nullable(Generation),
    annotations: Type.Array(Annotation),
    staleness: Staleness,
    provenance: ProvenanceOut,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
  },
  { $id: 'Visual', description: 'A visual of a Concept. An image is illustrative: never evidence, never geometry, never a verification (ADR-0070).' },
)
export const VisualCreate = Type.Object(
  {
    conceptId: Uuid,
    kind: VisualKind,
    title: Type.Optional(Text(300, 1)),
    view: Type.Optional(Text(200)),
    instruction: Type.Optional(Text(4000)),
    conceptRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    referenceAssets: Type.Optional(Type.Array(AssetRef, { maxItems: 4 })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'VisualCreate', additionalProperties: false },
)
export const VisualRevise = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    conceptRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    title: Type.Optional(Text(300, 1)),
    view: Type.Optional(Text(200)),
    instruction: Type.Optional(Text(4000)),
    referenceAssets: Type.Optional(Type.Array(AssetRef, { maxItems: 4 })),
    refinedFrom: Type.Optional(Type.Array(Uuid, { maxItems: 50 })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'VisualRevise', additionalProperties: false },
)
export const Dependent = Type.Object({ type: L('visual', 'handoff', 'implementation-artifact'), id: Type.String(), key: Type.String(), label: Type.String(), revision: Nullable(Type.Integer()), conceptRevision: Type.Integer(), staleness: Staleness })
export const Dependents = Type.Object({ conceptId: Uuid, currentRevision: Type.Integer(), dependents: Type.Array(Dependent) }, { $id: 'ConceptDependents' })

export type VisualCreateDto = Static<typeof VisualCreate>
export type VisualReviseDto = Static<typeof VisualRevise>
export type AnnotationCreateDto = Static<typeof AnnotationCreate>
export type GenerationRecordDto = Static<typeof GenerationRecord>
export { Definition, Provenance }

// ---- concept cards and the CAD handoff -------------------------------------------------------------------------

const Coverage = L('intended', 'preliminary-check', 'verified')
const Any = Type.Unknown()
export const CardConstraint = Type.Object({
  id: Uuid, key: Type.String(), revision: Type.Integer(), statement: Type.String(), bound: Any, strength: Type.String(), status: Type.String(),
  requirement: Any, coverage: Coverage, checkStatus: Nullable(Type.String()), checkedBy: Nullable(Type.String({ description: 'Evidence key of the check' })),
})
export const ConceptCard = Type.Object(
  {
    concept: Type.Object({ id: Uuid, key: Type.String(), name: Type.String(), summary: Type.String(), revision: Type.Integer(), stage: Type.String(), maturity: Type.String(), verificationStatus: Type.String() }),
    intent: Type.String(),
    principle: Type.Array(Type.String()),
    components: Type.Array(Any),
    interfaces: Type.Array(Any),
    parameters: Type.Array(Any),
    benefits: Type.Array(Type.String()),
    tradeOffs: Type.Array(Type.String()),
    constraints: Type.Array(CardConstraint),
    requirements: Type.Array(Type.Object({ relation: Type.String(), artifact: Any, coverage: Type.Literal('intended') })),
    assumptions: Type.Array(Type.Object({ id: Uuid, key: Type.String(), statement: Type.String(), validationStatus: Type.String() })),
    questions: Type.Array(Type.Object({ kind: Type.String(), text: Type.String(), state: Nullable(Type.String()) })),
    validation: Type.Object({ verificationStatus: Type.String(), openQuestions: Type.Integer(), unconfirmedHypotheses: Type.Integer(), constraintsVerified: Type.Integer(), constraintsChecked: Type.Integer(), constraintsTotal: Type.Integer() }),
    visuals: Type.Array(Visual),
    primaryVisualId: Nullable(Uuid),
    decisions: Type.Array(Type.Object({ id: Uuid, key: Type.String(), title: Type.String(), status: Type.String(), outcome: Type.String(), rationale: Type.String() })),
    membership: Type.Array(Type.Object({ setId: Uuid, setKey: Type.String(), setName: Type.String(), status: Type.String() })),
  },
  { $id: 'ConceptCard', description: 'Everything a comparison card shows. Requirements and constraints are intended unless a recorded check exists (verified needs verified evidence).' },
)
export const SetCards = Type.Object({ setId: Uuid, key: Type.String(), name: Type.String(), question: Type.String(), parentId: Uuid, cards: Type.Array(ConceptCard) }, { $id: 'AlternativeSetCards' })
export const Handoff = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['HND-001'] }),
    projectId: Type.String(),
    conceptId: Uuid,
    conceptRevision: Type.Integer({ description: 'The exact Concept revision the package was built from' }),
    target: Type.Literal('cad'),
    package: Type.Record(Type.String(), Any, { description: 'conceptualize.cad-handoff/1: intent, components, relationships, interfaces, parameters, envelopes, constraints (with coverage), requirement and decision links, assumptions, visual references, unresolved items' }),
    staleness: Staleness,
    createdAt: Timestamp,
    createdBy: Type.String(),
    provenance: ProvenanceOut,
  },
  { $id: 'CadHandoff', description: 'Immutable, revision-pinned package for the CAD. Missing information is listed in unresolved, never invented.' },
)
export const HandoffCreate = Type.Object({ target: Type.Optional(Type.Literal('cad')), conceptRevision: Type.Optional(Type.Integer({ minimum: 1 })) }, { $id: 'CadHandoffCreate', additionalProperties: false })
