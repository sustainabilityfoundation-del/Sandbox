# ADR-0003: Physical component identity and `represents`

Status: Accepted (2026-10-13)

## Context

There is one controlled product definition assembled from module-owned artifacts, not one universal
object (vision §5).

## Decision

Physical components (`assembly`, `part`) carry the identity, with stable IDs. SysML elements and CAD
representations are separate, module-owned objects linked to a component with `represents`.
Selections resolve across tools only through explicit relationships. Names are for display only.

## Consequences

- No duplicated components across modules and no implicit synchronisation.
- The only cross-module parameter flow is the documented CAD delegation ([ADR-0006](0006-module-ownership-and-delegation.md)).
