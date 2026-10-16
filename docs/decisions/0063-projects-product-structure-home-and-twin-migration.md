# ADR-0063: Server-side product registry in Project Management; the twin's components migrate by projection and aliases

Status: Proposed (2026-10-15) — **coordinator decision; not implemented before approval** (contracts §2.4)

Review note (16 October 2026): not accepted. It conflicts with AGENTS.md "Model identity and revision rules": the ACT-100/ROD-120 import creates a second server record with an alias. It needs an architecture decision before acceptance.

## Context

The product/system/subsystem/assembly/part breakdown has no server-side home. Physical components
(`assembly`, `part`, owned by module `product`, written by `platform`) live only in the browser twin
(`DemoRepository`, `localStorage`), together with SysML elements and CAD representations of the illustrative
tools, `represents` links and baselines. Consequences today:

- A new project cannot have a product structure on the server; Requirements validates allocation targets
  against a static development directory for `PRJ-ACT100` only (`SAMPLE_TWIN`), so a new project cannot
  allocate requirements to anything.
- Concepts (Conceptualize), SysML Modeler elements and CAD Modeler parts need a shared server-side product
  identity to point at (brief §3, §5, acceptance step 7).
- The roadmap lists the server-side repository as an open decision.

## Options

| Option | Summary | Assessment |
| --- | --- | --- |
| A. Product registry inside Project Management | Tables `product_elements`, `breakdowns`, `breakdown_edges` in schema `projects`, API under `/api/projects/v1/projects/{id}/product-elements`, module ID `product` | Matches `ARTIFACT_OWNER` (`product` = the platform's product registry) and the vision's "product and configuration registry" shared service; no new service; PM already has registry, links, baselines |
| B. New `services/product` module | Same tables in schema `product`, separate plugin | Cleaner separation, but another service, another client, and the same owner in practice; can be split out of A later without changing APIs (separate tables and route group from the start) |
| C. Keep components in the browser twin | Multi-project twin only | Blank projects cannot allocate requirements or link CAD/SysML/Concepts on the server; not durable across browsers; does not meet the brief |

## Decision (proposed)

**Option A**, structured so it can become B without an API change:

1. **Ownership.** Product elements (module `product`) are written only through the product API in
   `services/projects`; their own route group, tables, events (`product.element-*`) and permissions. Kinds
   (product, system, subsystem, assembly, part, other) are labels, not constraints; multiple named breakdowns
   (product breakdown, physical assembly) reference the same elements; cycles within a breakdown are refused.
   Properties are `{ value, unit }` quantities validated with the SDK unit algebra.
2. **New projects** use only server-side product elements (UUID identity, display keys `PE-001`).
3. **Requirements allocation.** The API host supplies Requirements with a `TwinDirectory` backed by the
   product registry (`lookup(projectId, ids)` over product element IDs *and aliases*), replacing `SAMPLE_TWIN`
   (CR-PM-API-3). Allocation remains Requirements data.
4. **Twin migration for `PRJ-ACT100` (non-destructive, ADR-0009, following ADR-0012):**
   - an additive, idempotent import creates product elements for `ACT-100`, `HSG-110`, `ROD-120`, `MTR-130`
     with new UUIDs and the twin IDs as **aliases** (`product_element_aliases`), copying name, parent and
     properties at their current twin revision, recorded as `changedBy: 'import'`; nothing in the twin is
     modified or deleted. Because the twin is per-browser, the import runs on the server from a fixture in
     `services/projects` that reproduces the model-service sample seed (services may not import
     `@ews/model-service`); a workspace test, which may import both, fails if the fixture and the seed
     diverge. Edits a user made to components in their own browser twin are not visible to the server;
     they stay in that browser and are listed by a one-time "differences from the server" notice
     (CR-PM-MS-2), never silently overwritten.
   - **read-time projection**: the workspace composes server product elements into the `ModelIndex` (like
     requirements, `composeSnapshot`), aliases resolve (`ROD-120` → UUID), the twin's own component objects
     are hidden while the service is reachable; without the service the twin's components apply (offline
     preview, unit tests).
   - **`represents` links** of the twin (illustrative SysML and mock CAD) keep pointing at `ROD-120`; the index
     resolves the alias, so they need no rewrite. New `represents` links from CAD Modeler / SysML Modeler to
     product elements are owned by those modules when they offer a mapping (CAD ADR-0026, CR-SYSML-03) and by
     Project Management links (`represents`) until then.
   - **CAD delegation** (ADR-0006, CAD → `diameter`, `outerDiameter`, `length`, `effectiveLength`) moves with
     the components: the product API accepts those properties from the mock CAD tool's writes through the
     workspace with the same delegation rule (server-side check), or the coordinator decides to keep the mock
     CAD delegation twin-only until the mock tool is retired. **Open question Q1.**
   - **Baselines**: existing twin baselines stay as they are (they pinned twin revisions; shown as historical).
     New platform baselines pin product element revisions through `BaselineDraft.external` (already
     supported); project baselines (ADR-0067) pin them too.
5. **Rollback**: removing the projection restores the previous behaviour; the imported product elements remain
   as server data (never deleted).

## Consequences

- Blank projects get a real product structure; Requirements, Conceptualize, SysML and CAD can reference it
  (`ArtifactRef { module: 'product', kind: 'product-element', id: <uuid> }`, SDK `ArtifactModule` + `'product'`,
  CR-PM-SDK-1).
- The browser twin keeps working for the example project and offline; its components become a fallback.
- Two writers for components during the transition (twin for offline/preview, product API online) — the
  workspace must write components through the product API whenever the service is available (CR-PM-MS-2), and
  show the twin fallback as read-only to avoid divergence. **Open question Q2** (read-only fallback vs.
  offline edits with later merge; proposal: read-only).
- Verification records that pinned twin component revisions show as potentially stale against product
  revisions, the honest outcome (same as ADR-0012).
