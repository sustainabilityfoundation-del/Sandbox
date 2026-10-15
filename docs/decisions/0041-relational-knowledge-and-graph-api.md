# ADR-0041: Relational knowledge with a persistence-independent graph API; no graph or vector database

Status: Proposed (2026-10-14)

## Context

The brief asks for a hybrid representation (typed entities, typed relationships, text, mathematics,
artifact references, optional embeddings), a graph-oriented traversal API independent of persistence, and
forbids a graph database without demonstrated need. The platform uses PostgreSQL per service schema
(ADR-0011, ADR-0015); Conceptualize already has full-text search on concept revisions.

## Decision

- PostgreSQL (schema `conceptualize`) remains the only authoritative store of design knowledge, including
  typed links (`design_links` plus existing relationship tables).
- Conceptualize exposes `graph/traverse`, `graph/neighbourhood`, `graph/paths` and `search` in terms of
  DesignRefs and link types; the implementation (recursive CTEs) is private and replaceable.
- Retrieval order: structured filters, graph traversal, PostgreSQL full-text search. Embeddings are deferred;
  if introduced (after evaluated retrieval misses and an ADR), they are a rebuildable projection owned by the
  engine, never evidence.
- Extension without a rigid ontology: per-type classifications and taxonomies, registered namespaced link
  types with endpoint rules and impact defaults, typed quantity attributes, free statements. No OWL/RDF
  reasoner.
- Matrices (function × concept design matrix, DSM) are computed views, never stored.

## Consequences

- No new database technology; transactional integrity with the records the links connect.
- Deep, wide traversals are bounded (depth ≤ 6, limits, pagination); if real projects exceed what recursive
  queries serve, a derived graph projection can be added behind the same API.
- Cross-module federation is the engine's job (Context Resolver), not Conceptualize's.
- Alternatives considered: a graph database (rejected: no demonstrated need, second store, sync problem);
  pgvector now (rejected: no evidence that full-text search is insufficient); RDF/OWL (rejected: rigid,
  costly to capture, unnecessary for the questions in the brief).
