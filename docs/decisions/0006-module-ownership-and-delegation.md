# ADR-0006: Module ownership and delegation, enforced in the repository

Status: Accepted (2026-10-13)

## Context

Each module owns its domain model, and parameter ownership and permitted update direction must be
explicit (vision §4, §5).

## Decision

- `ARTIFACT_OWNER` maps each object type to one module (`packages/model-service/src/domain/ownership.ts`).
  Relationships belong to the module owning the `from` end.
- `DELEGATIONS` lists the only exceptions. Today: CAD may write `diameter`, `outerDiameter`,
  `length` and `effectiveLength` on parts and assemblies, in the direction CAD representation →
  component.
- `RELATIONSHIP_RULES` restricts the endpoint types of each relationship type and states its meaning.
- The repository, not the UI, checks every batch and fails with `forbidden` (ownership) or `invalid`
  (relationship semantics). The retired Verification module's data is read-only.

## Consequences

- A defect in one tool cannot write another module's data.
- In production these checks move server-side with the repository.
