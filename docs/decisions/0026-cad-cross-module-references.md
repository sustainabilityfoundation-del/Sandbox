# ADR-0026: References between CAD Modeler entities and other modules

Status: Proposed (2026-10-14, CAD agent). Number provisional. Needs coordinator approval (contract change).

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
2. **Inbound references** (`ArtifactRef` from other modules to CAD Modeler entities), contract change
   request CR-CAD-1: keep `module: 'cad'` and distinguish CAD Modeler entities by an ID scheme,
   `id: "cadm:<documentUuid>/<entityId>"`, `kind` one of `cad-document`, `cad-part`, `cad-feature`,
   `cad-parameter`, `cad-face`, `revision` = document version. Twin `CAD-…` IDs keep their meaning, so
   no stored data changes. Alternative: add `'cad-modeler'` to `ArtifactModule` (SDK minor bump).
3. **Twin projection** (contract §4 open question), proposal: do not project every CAD entity. When a
   part `represents` a twin component, the platform may later show a read-time projection
   (ADR-0012) of that part (name, document version, mass properties) on the component, owned by CAD.
   No implicit synchronisation of dimensions in Phase 1; the ADR-0006 delegation stays with the mock.

## Consequences

- Concept → CAD traceability works with today's `ArtifactRef` type once the scheme is approved.
- Validation of targets needs the CAD document to be loaded; dangling targets are reported, never
  removed silently.
