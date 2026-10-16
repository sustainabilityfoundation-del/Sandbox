import { Type, type Static, type TSchema } from '@sinclair/typebox'
import { AnyRef, DesignRef } from './designSchemas'
import { ArtifactRef, Basis, Provenance, Timestamp, Uuid } from './schemas'

const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])
const Text = (max: number, min = 0) => Type.String({ minLength: min, maxLength: max })

/**
 * Calculation models (CR-C8) and the C11 storage contract (contract-change-requests.md, "CR-C8 and C11:
 * storage contract"). Definitions are validated and evaluated by @ews/engineering-calc; manifests and
 * qualifications are stored exactly as the engine types them.
 */

const L = <T extends string>(...values: T[]) => Type.Union(values.map((v) => Type.Literal(v)))

export const CalculationBinding = Type.Object(
  { ref: AnyRef, property: Text(100, 1) },
  { $id: 'CalculationBinding', additionalProperties: false, description: 'Default source of an input: quantity (assumption), bound (constraint), an attribute name (Concept) or a property of another module’s artifact' },
)
export const CalculationParameter = Type.Object(
  {
    symbol: Type.String({ pattern: '^[A-Za-z][A-Za-z0-9_]{0,40}$' }),
    name: Text(200, 1),
    role: L('input', 'output', 'constant', 'design-variable'),
    unit: Type.String({ minLength: 1, maxLength: 60 }),
    value: Type.Optional(Type.Number()),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    description: Type.Optional(Text(2000)),
    defaultBinding: Type.Optional(CalculationBinding),
  },
  { $id: 'CalculationParameter', additionalProperties: false },
)
export const CalculationRelation = Type.Object(
  { id: Type.String({ pattern: '^[A-Za-z][A-Za-z0-9_-]{0,40}$' }), kind: L('assignment', 'constraint', 'objective'), expression: Text(4000, 1), direction: Type.Optional(L('minimize', 'maximize')), description: Type.Optional(Text(2000)) },
  { $id: 'CalculationRelation', additionalProperties: false },
)
export const CalculationValidity = Type.Object({ text: Text(2000), conditions: Type.Array(Text(1000, 1), { maxItems: 50 }) }, { $id: 'CalculationValidity', additionalProperties: false })
export const ModelValidationStatus = L('unvalidated', 'validated', 'deprecated')

export const CalculationModelDto = Type.Object(
  {
    id: Uuid,
    key: Type.String({ examples: ['CALC-001'] }),
    projectId: Type.String(),
    revision: Type.Integer(),
    name: Type.String(),
    description: Type.String(),
    grammar: Type.String(),
    parameters: Type.Array(CalculationParameter),
    relations: Type.Array(CalculationRelation),
    validity: Nullable(CalculationValidity),
    basis: Basis,
    validationStatus: ModelValidationStatus,
    assumptions: Type.Array(DesignRef),
    sources: Type.Array(ArtifactRef),
    libraryId: Nullable(Type.String()),
    digest: Type.String({ description: 'Engine digest of the canonical model (independent of formatting)' }),
    changeReason: Type.String(),
    provenance: Provenance,
    revisionCreatedAt: Timestamp,
    revisionCreatedBy: Type.String(),
    createdAt: Timestamp,
    createdBy: Type.String(),
    updatedAt: Timestamp,
    updatedBy: Type.String(),
  },
  { $id: 'CalculationModel', description: 'A deterministic calculation model. Validation status is recorded by a reviewer; a new revision is unvalidated. AI-proposed models start unvalidated (R1-5).' },
)
export type CalculationModelOut = Static<typeof CalculationModelDto>

const ModelFields = {
  description: Type.Optional(Text(20000)),
  grammar: Type.Optional(Type.String({ maxLength: 40 })),
  parameters: Type.Optional(Type.Array(CalculationParameter, { maxItems: 100 })),
  relations: Type.Optional(Type.Array(CalculationRelation, { maxItems: 100 })),
  validity: Type.Optional(Nullable(CalculationValidity)),
  basis: Type.Optional(Basis),
  assumptions: Type.Optional(Type.Array(DesignRef, { maxItems: 50 })),
  sources: Type.Optional(Type.Array(ArtifactRef, { maxItems: 50 })),
}
export const CalculationModelCreate = Type.Object(
  {
    name: Type.Optional(Text(200, 1)),
    ...ModelFields,
    validationStatus: Type.Optional(ModelValidationStatus),
    fromLibrary: Type.Optional(Type.String({ maxLength: 100, description: 'Start from an engine library entry (GET /calculation-library); fields given here override it' })),
    reason: Type.Optional(Text(2000)),
  },
  { $id: 'CalculationModelCreate', additionalProperties: false, examples: [{ fromLibrary: 'lib.column.euler-round', name: 'Rod buckling' }] },
)
export type CalculationModelCreateDto = Static<typeof CalculationModelCreate>
export const CalculationModelPatch = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), name: Type.Optional(Text(200, 1)), ...ModelFields, reason: Type.Optional(Text(2000)) },
  { $id: 'CalculationModelPatch', additionalProperties: false },
)
export type CalculationModelPatchDto = Static<typeof CalculationModelPatch>
export const ModelValidationChange = Type.Object(
  { status: ModelValidationStatus, expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), reason: Text(2000, 1) },
  { $id: 'ModelValidationChange', additionalProperties: false, description: 'Validated needs a reviewer or administrator (a person, never the assistant).' },
)

export const CalculationInput = Type.Object(
  {
    value: Type.Optional(Nullable(Type.Number())),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    unit: Type.String({ maxLength: 60 }),
    source: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { $id: 'CalculationInput', additionalProperties: false },
)
export const EvaluateRequest = Type.Object(
  {
    revision: Type.Optional(Type.Integer({ minimum: 1 })),
    inputs: Type.Optional(Type.Record(Type.String(), CalculationInput)),
    uncertainty: Type.Optional(L('point', 'interval')),
  },
  { $id: 'EvaluateRequest', additionalProperties: false, description: 'Inputs not given come from the parameter default binding or value. Read-only: nothing is stored.' },
)
export const EvaluateResult = Type.Object(
  {
    model: Type.Object({ id: Uuid, key: Type.String(), revision: Type.Integer() }),
    inputs: Type.Record(Type.String(), Type.Unknown(), { description: 'Inputs used, with their source (literal or binding)' }),
    manifest: Type.Record(Type.String(), Type.Unknown(), { description: 'Engine manifest (record it as evidence calculation to keep it)' }),
    qualifications: Type.Record(Type.String(), Type.Unknown(), { description: 'qualifyManifest(manifest)' }),
    basis: L('calculated', 'estimate'),
    warnings: Type.Array(Type.String()),
  },
  { $id: 'EvaluateResult' },
)
export const LibraryEntryDto = Type.Object(
  { id: Type.String(), version: Type.String(), title: Type.String(), assumptions: Type.Array(Type.String()), limitations: Type.Array(Type.String()), sources: Type.Array(Type.Object({ citation: Type.String(), scope: Type.String() })), parameters: Type.Array(Type.Unknown()) },
  { $id: 'CalculationLibraryEntry' },
)

export const CALC_SCHEMAS: TSchema[] = [CalculationBinding, CalculationParameter, CalculationRelation, CalculationValidity, CalculationModelDto, CalculationModelCreate, CalculationModelPatch, ModelValidationChange, CalculationInput, EvaluateRequest, EvaluateResult, LibraryEntryDto]
