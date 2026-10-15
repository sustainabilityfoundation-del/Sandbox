# ADR-0068: Project views are projections; no maintained copies

Status: Proposed (2026-10-15)

## Context

The brief (§5) requires product breakdown, functional architecture, requirements hierarchy, physical assembly,
concept hierarchy, verification structure and an artifact browser as different views of connected information,
not independently maintained copies. SysML already treats diagrams as projections (ADR-0035).

## Decision

- Each view is computed at read time from the registry, Project Management links, the derived link index and
  module APIs, and returns its sources with freshness and the modules that could not contribute
  (docs/modules/projects/views.md).
- Edits from a view are commands to the owning module.
- Caches are in memory, keyed by source revisions, never persisted, never authoritative.
- Missing modules produce explicit gaps, never substitute data.

## Consequences

- No synchronisation problems between views; one artifact can appear in several hierarchies.
- View performance depends on the registry and the link index; module calls are limited to details.
