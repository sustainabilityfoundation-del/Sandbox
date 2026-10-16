# ADR-0037: SysML Modeler — cross-module references through metadata and ArtifactRef

Status: Proposed (2026-10-14, SysML agent); parts need coordinator approval (CR-SYSML-01/02/03)

Review note (16 October 2026): not accepted. It conflicts with AGENTS.md "Model identity and revision rules": SysML-to-product links use metadata instead of `represents`. It needs an architecture decision before acceptance.

## Context

Requirements stay authoritative (contracts §5); Conceptualize links concepts to artifacts with
`ArtifactRef`; the CAD contract is shared and reconciled by the coordinator.

## Decision

- Links *from* SysML elements to other modules' records are standard SysML `MetadataUsage`s of platform
  metadata definitions (`EWS::ManagedRequirement`, `EWS::CadRepresentation`, `EWS::CadInterface`), with
  the target's canonical ID and optional revision. They are versioned with the model and visible in text.
- SysML stores no copies of other modules' authoritative data; it reads them through SDK services and
  shows them as read-time projections.
- Proposed `ArtifactRef` for SysML Modeler elements: `{ module: 'sysml', kind: 'sysml-model-element',
  id: '<projectId>/<elementId>', revision?: <commit number> }` (CR-SYSML-02).
- Proposed SDK service `PlatformServices.sysml` for other modules to resolve those refs (CR-SYSML-01).
- CAD mapping as proposed in docs/modules/sysml/api-and-integration.md §5.3 (CR-SYSML-03).

## Consequences

- Traceability survives renames and re-editing (UUIDs), and is pinned to revisions where needed.
- Until CR-SYSML-01/02 are accepted, other modules cannot resolve SysML Modeler elements.
