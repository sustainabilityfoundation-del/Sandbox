# ADR-0040: Extend Conceptualize with first-class Function, Constraint, Assumption, DesignExploration and typed design links

Status: Proposed (2026-10-14)

## Context

The reasoning brief (§3) requires Function, Concept, ConceptImplementation, DesignDecision, Assumption,
Evidence, Constraint, Alternative and DesignExploration as first-class entities, and Function and Concept as
separate entities (§14 item 3). Conceptualize's current model (feature/conceptualize, b5e2668) expresses
functions as Concepts with `abstraction: 'function'`, constraints and assumptions as typed statements inside
concept revisions, explorations as atomic creation logs, and relationships only between Concepts.
Decisions lack invalidation conditions and explicit supporting references.

## Decision

- Conceptualize gains: **Function** (`FN-`), **DesignConstraint** (`CST-`), **Assumption** (`ASM-`),
  **CalculationModel** (`CALC-`, ADR-0044); structured **DesignExploration**; alternatives as architectures
  (member decomposition); **typed design links** across entity types with a registry of link types;
  decision extensions (support, assumptions, constraints, affected artifacts, invalidation conditions,
  derived validity); evidence extensions (subjects, applicability, reviews, manifest); a batch endpoint with
  placeholders; graph traversal API (ADR-0041). Detailed as CR-C1…C13 in
  docs/modules/design-reasoning/contract-change-requests.md.
- Statements remain the flexible natural-language layer; new entities are used where identity, validation
  status, dependencies or impact analysis are needed.
- Conceptual constraints never duplicate requirements: a constraint either **formalizes** one pinned
  requirement revision or is a conceptual constraint that may be **proposed** as a draft requirement.
- All migrations are additive (ADR-0009): existing Concepts, statements and explorations are kept; conversion
  from function-Concepts and promotion of constraint statements are explicit user operations; assumption
  statements get Assumption records by an additive migration referencing them.

## Consequences

- The reasoning layer can address functions, constraints and assumptions by identity, track their validity
  and traverse their dependencies.
- Conceptualize's model grows; the Conceptualize agent implements it in priority order (P1 first).
- During migration both function-Concepts and Functions exist; the UI must explain the difference and offer
  conversion.
- Alternatives considered: keeping functions as Concepts with a stricter `abstraction` (rejected: no
  invariant separation, `maturity` and implementations make no sense for functions); a separate "design
  knowledge" service next to Conceptualize (rejected: two stores of one design record).
