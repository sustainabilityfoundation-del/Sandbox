import { Type, type Static, type TSchema } from '@sinclair/typebox'
import { GAP_TIERS, INTEGRATION_MODES, INTENT_BASES, INTENT_ROLES, NEED_ROUTES, NEED_STATES, QUESTION_IMPACTS, QUESTION_STATES, SYSTEM_OWNERS, SYSTEM_RELATIONS } from '../domain/intent'
import { ArtifactRef, Provenance, Timestamp, Uuid } from './schemas'
import { AssumptionDto, ConstraintDto } from './designSchemas'

/** Schemas of the Engineering Intent (ECII increment 1). Vocabularies come from domain/intent.ts. */

const L = <T extends string>(values: readonly T[]) => Type.Union(values.map((v) => Type.Literal(v)))
const Text = (max: number, min = 0) => Type.String({ minLength: min, maxLength: max })

export const IntentSystem = Type.Object(
  {
    name: Text(200, 1),
    role: Text(100),
    description: Text(2000),
    productElement: Type.Optional(ArtifactRef),
    identified: Type.Boolean({ description: 'true once the system is a known product (a name or a product element); an unidentified system keeps its description' }),
    owner: L(SYSTEM_OWNERS),
    relation: L(SYSTEM_RELATIONS),
  },
  { $id: 'IntentSystem', additionalProperties: false },
)
export const InformationNeed = Type.Object(
  {
    id: Text(40, 1),
    text: Text(1000, 1),
    tier: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4)], { description: '1 essential, 2 concept, 3 detail, 4 immaterial' }),
    subject: Type.Optional(Text(200)),
    route: L(NEED_ROUTES),
    state: L(NEED_STATES),
  },
  { $id: 'InformationNeed', additionalProperties: false },
)
export const IntentQuestion = Type.Object(
  {
    id: Text(40, 1),
    text: Text(1000, 1),
    why: Text(1000),
    impact: L(QUESTION_IMPACTS),
    options: Type.Array(Text(300, 1), { maxItems: 12 }),
    state: L(QUESTION_STATES),
    needId: Type.Optional(Text(40, 1)),
  },
  { $id: 'IntentQuestion', additionalProperties: false },
)
const Fields = {
  designObject: Text(500, 1),
  role: L(INTENT_ROLES),
  integration: L(INTEGRATION_MODES),
  rationale: Text(4000),
  externalSystems: Type.Array(IntentSystem, { maxItems: 30 }),
  objectives: Type.Array(Text(1000, 1), { maxItems: 50 }),
  environment: Type.Array(Text(1000, 1), { maxItems: 50 }),
  informationNeeds: Type.Array(InformationNeed, { maxItems: 100 }),
  assumptions: Type.Array(Uuid, { maxItems: 100, description: 'Assumption record IDs' }),
  questions: Type.Array(IntentQuestion, { maxItems: 50 }),
}
export const IntentDto = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['INT-001'] }),
    projectId: Type.String(),
    revision: Type.Integer(),
    ...Fields,
    basis: L(INTENT_BASES),
    status: L(['active', 'retired'] as const),
    changeReason: Type.String(),
    provenance: Provenance,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'EngineeringIntent', description: 'What is being designed, whether it works with an existing system, which systems are involved, what is not known and what has to be asked. Revisioned and immutable per revision.' },
)
export const IntentCreate = Type.Object(
  {
    designObject: Fields.designObject,
    role: Fields.role,
    integration: Fields.integration,
    rationale: Type.Optional(Fields.rationale),
    externalSystems: Type.Optional(Fields.externalSystems),
    objectives: Type.Optional(Fields.objectives),
    environment: Type.Optional(Fields.environment),
    informationNeeds: Type.Optional(Fields.informationNeeds),
    assumptions: Type.Optional(Fields.assumptions),
    questions: Type.Optional(Fields.questions),
    basis: Type.Optional(L(INTENT_BASES)),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'IntentCreate', additionalProperties: false },
)
export type IntentCreateDto = Static<typeof IntentCreate>
export const IntentPatch = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    designObject: Type.Optional(Fields.designObject),
    role: Type.Optional(Fields.role),
    integration: Type.Optional(Fields.integration),
    rationale: Type.Optional(Fields.rationale),
    externalSystems: Type.Optional(Fields.externalSystems),
    objectives: Type.Optional(Fields.objectives),
    environment: Type.Optional(Fields.environment),
    informationNeeds: Type.Optional(Fields.informationNeeds),
    assumptions: Type.Optional(Fields.assumptions),
    questions: Type.Optional(Fields.questions),
    basis: Type.Optional(L(INTENT_BASES)),
    status: Type.Optional(L(['active', 'retired'] as const)),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'IntentPatch', additionalProperties: false },
)
export type IntentPatchDto = Static<typeof IntentPatch>
export type IntentOut = Static<typeof IntentDto>

export const IntentGap = Type.Object(
  {
    id: Type.String(),
    tier: L(GAP_TIERS),
    text: Type.String(),
    route: L(NEED_ROUTES),
    source: L(['structure', 'information-need'] as const),
    subject: Type.Optional(Type.String()),
    ref: Type.Optional(Type.String()),
  },
  { $id: 'IntentGap' },
)
export const IntentGaps = Type.Object(
  {
    intentId: Uuid,
    key: Type.String(),
    revision: Type.Integer(),
    gaps: Type.Array(IntentGap),
    counts: Type.Object({ essential: Type.Integer(), concept: Type.Integer(), detail: Type.Integer(), immaterial: Type.Integer() }),
    researchItems: Type.Array(IntentGap),
    unaskedEssential: Type.Array(IntentGap),
    systemGaps: Type.Array(IntentGap),
  },
  { $id: 'IntentGaps', description: 'Deterministic: computed from the structure of the intent revision. No model, no keyword rules.' },
)
export const IntentContext = Type.Object(
  {
    intent: IntentDto,
    assumptions: Type.Array(AssumptionDto),
    constraints: Type.Array(ConstraintDto),
    concepts: Type.Array(Type.Object({ id: Uuid, key: Type.String(), name: Type.String(), maturity: Type.String() })),
    questions: Type.Array(IntentQuestion),
    gaps: IntentGaps,
  },
  { $id: 'IntentContext', description: 'The intent with the records around it: assumptions it lists, the project constraints, the project concepts, its open questions and its gaps.' },
)

export const INTENT_SCHEMAS: TSchema[] = [IntentSystem, InformationNeed, IntentQuestion, IntentDto, IntentCreate, IntentPatch, IntentGap, IntentGaps, IntentContext]
