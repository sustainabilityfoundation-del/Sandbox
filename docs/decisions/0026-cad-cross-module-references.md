# ADR-0026: References between CAD Modeler entities and other modules

Status: Proposed (2026-10-14, CAD agent). Number provisional. Item 2 approved with a change by the
coordinator (CR-CAD-1, 2026-10-15; see *Decision on CR-CAD-1*); items 1 and 3 remain proposed. Product-structure
references decided by the coordinator (CR-PM-CAD-1, 2026-10-15; see *Product structure*).

## Context

Contracts §4: the CAD module owns its native models; other modules reference CAD entities with
version-aware references; for Conceptualize this is `ArtifactRef` (SDK 1.5), where `module: 'cad'`
currently means the mock tool's twin `CAD-…` objects. Requirements stay in the Requirements service,
SysML elements in the twin; CAD never copies them.

## Decision (proposed)

1. **Outbound references** (owned by CAD, stored in the native document, `references[]`): a subject
   (part, feature, parameter, face name) points to a target `{ module, id, revision?, kind? }` with a
   role: `represents` (twin component), `satisfies` / `verifies` (requirement UUID in the Requirements
   service), `realizes` (Concept UUID), `traces` (SysML element). Targets are validated through the
   owning module's API when available and are never copied.
2. **Inbound references** (`ArtifactRef` from other modules to CAD Modeler entities), CR-CAD-1. The
   original proposal used `id: "cadm:<documentUuid>/<entityId>"` with one kind per entity type. It is
   superseded by the approved scheme below.
3. **Twin projection** (contract §4 open question), proposal: do not project every CAD entity. When a
   part `represents` a twin component, the platform may later show a read-time projection
   (ADR-0012) of that part (name, document version, mass properties) on the component, owned by CAD.
   No implicit synchronisation of dimensions in Phase 1; the ADR-0006 delegation stays with the mock.

## Consequences

- Concept → CAD traceability works with today's `ArtifactRef` type once the scheme is approved.
- Validation of targets needs the CAD document to be loaded; dangling targets are reported, never
  removed silently.

## Decision on CR-CAD-1 (approved with a change, coordinator, 2026-10-15)

`{ module: 'cad', kind: 'cad-modeler-entity', id: '<documentUuid>/<entityId>', revision }`, with no
`cadm:` prefix.

- A whole part or document uses its document-level entity ID: `<documentUuid>/<documentUuid>` for the
  document and `<documentUuid>/<partId>` for a part.
- `revision` is the CAD service revision of the document.
- Twin `CAD-…` IDs cannot collide with this scheme, because they contain no `/` and no UUID.
- Implemented:
  - `entityRef()` in `@ews/cad-client` and `services/cad`;
  - `GET /api/cad/v1/projects/{projectId}/documents/{documentId}/entities/{entityId}` resolves a
    reference and reports the entity type and label.
- Not yet implemented: a UI action that copies a reference, and showing CAD links in other modules.

**Stable UUIDs.** Every document has a UUID (`documentId`).

- Parts have a stable UUID derived as RFC 9562 version 5 of the part ID in the document UUID
  namespace (`entityUuid` in `@ews/cad-core`).
- Summaries and outbox events list them (`parts[].uuid`, service migration 0002), so a consumer that
  needs one UUID per entity (Project Management) does not have to parse `<documentUuid>/<entityId>`.
- Assemblies and configurations do not exist yet. When they are added they get UUIDs the same way.
- The `entityUuid` derivation is fixed: changing it would break stored references.

## Product structure (CR-PM-CAD-1, coordinator, 2026-10-15)

- In new projects, CAD Modeler references to the product structure use
  `ArtifactRef { module: 'product', kind: 'product-element', id: <product element ID>, revision? }`.
  Product elements are owned by Project Management's product registry. They replace twin components
  as `represents` targets.
- PRJ-ACT100, and any project whose twin has components, keeps its twin references
  (`module: 'twin'`). Stored references are never rewritten (ADR-0009). A later migration may add a
  `product` reference next to a twin one, but never in place of it.
- Native format: `product` is a reference target module in ews-cad 1.1 (additive; schema, the
  `add_reference` command and the type).
- CAD Modeler: the Inspect panel offers "Product element (Project Management)". It is the default
  when the project's twin has no components and "Twin component" otherwise. Product IDs are not yet
  validated against Project Management, because no client exists; the reference is stored as typed
  and reported to Project Management as a relation (`createCadArtifactSource`).
- The inbound scheme (CR-CAD-1) is unchanged.

## Open

- Twin projection (item 3) is deferred (CR-CAD-3).
