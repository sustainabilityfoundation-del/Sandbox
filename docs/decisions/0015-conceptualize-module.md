# ADR-0015: Conceptualize — Concepts independent of their implementations

Status: Accepted (2026-10-14)

## Context

The owner asked for Conceptualize: a module whose unit of information is a Concept, a persistent
engineering idea that exists before and independently of CAD, SysML or other artifacts, matures over
time and is realized by other modules (brief: docs/specifications/conceptualize.md).

## Decision

- Conceptualize is a service-backed module like Requirements (ADR-0011): `services/conceptualize`
  (PostgreSQL schema `conceptualize`), `packages/conceptualize-client`, `packages/tool-conceptualize`,
  hosted by `services/api`, inside the monorepo (ADR-0001).
- A Concept's identity is its own UUID. A separate **ConceptImplementation** links one or more Concepts
  to concrete artifacts through version-aware `ArtifactRef`s; replacing an implementation never changes
  the Concept.
- Other modules use only the SDK 1.5 `ConceptsService`; authoritative data stays in its owning module.
- Assistant mutations to service-backed modules use the new platform **service proposal**: previewed,
  applied by the user, executed through the module API with provenance. This also resolves Requirements
  contract request 3 and keeps the preview policy of ADR-0010/0013.
- Maturity, implementation status and verification status are separate fields; no mandatory sequence.
- Contracts and ownership: docs/specifications/conceptualize-contracts.md.

## Consequences

- Concepts survive redesigns; traceability runs from intent to artifacts through explicit links.
- Changes in implementations produce notifications, never silent edits of design intent.
- Without an Analysis module or a CAD generation API, those integrations are labelled test adapters or
  pending requests until the owning modules provide APIs.
- The workspace inspector and product tree show Concepts only after coordinator integration.
