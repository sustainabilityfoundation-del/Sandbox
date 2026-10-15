# ADR-0032: SysML Modeler — the stored model is the KerML/SysML abstract syntax

Status: Proposed (2026-10-14, SysML agent)

## Context

Brief §4: "Do not substitute a simplified proprietary graph schema for the SysML semantic model … the
stored model must preserve the semantics of SysML and KerML."

## Decision

- Elements are instances of the specification metaclasses with their stored (non-derived) attributes,
  serialized as in the Systems Modeling API JSON (`@id`, `@type`, `{ "@id" }` references).
- Relationships are elements (memberships, typing, specialization, feature values, connectors…);
  ownership is expressed by owning relationships, never by a parent field.
- Derived properties are computed by the core; they may be added to responses on request but are never
  accepted as input.
- A metamodel registry (`sysml-core/src/metamodel`) is the single source for supported metaclasses,
  attributes, reference properties and kind compatibility; unknown metaclasses from imports are kept
  opaquely and reported.

## Consequences

- Exchange with the Systems Modeling API and other tools does not need a semantic mapping layer.
- More elements per modelling concept (a typed part usage is 3 elements: usage, membership, typing):
  storage and indexes are sized for that (head index, reference index).
- Commands hide the relationship plumbing from users and the AI (ADR-0034).
