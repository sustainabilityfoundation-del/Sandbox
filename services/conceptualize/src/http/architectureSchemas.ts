import { Type, type TSchema } from '@sinclair/typebox'
import { READINESS_ACTIVITIES, READINESS_LEVELS } from '../domain/architecture'
import { Uuid } from './schemas'

/** Schemas of architecture diversity and context readiness (ECII increment 2). Vocabularies come from domain/architecture.ts. */

const L = <T extends string>(values: readonly T[]) => Type.Union(values.map((v) => Type.Literal(v)))
const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])

export const DiversityResult = Type.Object(
  {
    subjects: Type.Array(Type.Object({ id: Uuid, key: Type.String(), name: Type.String(), level: Nullable(L(['architecture', 'variant'] as const)) })),
    thresholds: Type.Object({ samePrinciple: Type.Number(), sameMean: Type.Number(), minimumDistinct: Type.Integer() }),
    architectures: Type.Array(Type.Object({ representative: Type.String(), members: Type.Array(Type.String()) })),
    distinctCount: Type.Integer(),
    variants: Type.Array(Type.Object({ id: Type.String(), key: Type.String(), name: Type.String(), parent: Type.String(), parentId: Nullable(Type.String()) })),
    unclassified: Type.Array(Type.Object({ id: Type.String(), key: Type.String(), name: Type.String() })),
    pairs: Type.Array(
      Type.Object({
        a: Type.String(),
        b: Type.String(),
        similarity: Nullable(Type.Number()),
        fieldsCompared: Type.Integer(),
        principleSimilarity: Nullable(Type.Number()),
        verdict: L(['same', 'distinct', 'unknown'] as const),
        differsOnlyIn: Type.Optional(L(['parameters', 'wording'] as const)),
      }),
    ),
    minimum: Type.Integer(),
    verdict: L(['diverse', 'insufficient'] as const),
    findings: Type.Array(Type.String()),
  },
  { $id: 'DiversityAssessment', description: 'Deterministic comparison of the structured architecture fields of alternatives. Variants and parameter-only differences are reported as variants, not as distinct architectures. No model, no keyword rules.' },
)

const Unmet = Type.Object({ id: Type.String(), level: L(READINESS_LEVELS), text: Type.String(), ref: Type.Optional(Type.String()) })
export const ReadinessResult = Type.Object(
  {
    intent: Nullable(Type.Object({ id: Uuid, key: Type.String(), revision: Type.Integer(), designObject: Type.String(), integration: Type.String() })),
    concept: Nullable(Type.Object({ id: Uuid, key: Type.String(), name: Type.String() })),
    architecturesConsidered: Type.Integer(),
    criteriaVersion: Type.String(),
    advisory: Type.Boolean({ description: 'Phase 1: readiness labels and lists, it never refuses a write' }),
    level: L(READINESS_LEVELS),
    contextReadiness: Type.Object({ state: L(['exploratory', 'established', 'verified'] as const), blockingIssues: Type.Array(Type.String()) }),
    activities: Type.Array(Type.Object({ activity: L(READINESS_ACTIVITIES), requires: L(READINESS_LEVELS), met: Type.Boolean(), unmet: Type.Array(Unmet) })),
    provisional: Type.Boolean(),
    label: Type.String({ description: 'One line for previews and handoff lists, e.g. "Provisional: readiness is Exploratory; ..."' }),
  },
  { $id: 'ContextReadiness', description: 'Whether the available information suffices for each downstream activity (not one completeness percentage). Criteria are data keyed by activity; advisory in Phase 1.' },
)

export const ARCHITECTURE_SCHEMAS: TSchema[] = [DiversityResult, ReadinessResult]
