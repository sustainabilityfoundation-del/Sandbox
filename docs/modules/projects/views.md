# Views as projections

Status: **Proposed**. Decision: ADR-0068. Index: [README.md](README.md).

## 1. Principle (brief §5, contracts §2.5)

A view is a **function** of authoritative data: `view = project(registry, links, link index, module APIs,
query)`. Nothing a view shows is stored as a separate copy of the product definition. Editing in a view is
a command to the owning module (or to Project Management for its own entities), after which the view is
recomputed.

## 2. Projection result

```ts
export interface ViewProjection {
  viewId: ViewId
  projectId: string
  /** Tree roots or graph nodes; each node is a registry artifact plus view-specific fields. */
  nodes: ViewNode[]
  edges: { from: string; to: string; type: string; owner: string; pinnedRevision?: string }[]
  /** Exactly which sources were used and how fresh they are. */
  sources: { module: string; via: 'registry' | 'module-api' | 'link-index'; confirmedAt: string; sourceRevision?: string }[]
  /** Modules that should contribute but could not (unavailable, not entitled, not installed). */
  incomplete: { module: string; reason: 'unavailable' | 'not-entitled' | 'not-installed' | 'disabled'; affectedCount?: number }[]
  /** Artifacts that would appear but have no place in this view's hierarchy (shown in an "Unplaced" group). */
  unplaced: string[]
  generatedAt: string
}

export interface ViewNode {
  artifactId: string
  key: string
  title: string
  category: string
  kind: string
  lifecycle: string
  availability: string
  childIds: string[]
  /** Why the node is here (the relationship that placed it). */
  placedBy?: { type: string; owner: string }
  open?: { toolId: string; params: Record<string, string> }
}

export type ViewId = 'product-breakdown' | 'functional-architecture' | 'requirements-hierarchy' | 'physical-assembly' | 'concept-hierarchy' | 'verification' | 'artifacts'
```

## 3. The seven views

| View | Hierarchy comes from | Other nodes attached by | Data reached through |
| --- | --- | --- | --- |
| Product breakdown | product registry breakdown "product-breakdown" (ADR-0063); legacy project: twin `parentId` | `represents` (twin, PM), Concept implementations, `allocated-to` (Requirements), `subject-of` | registry, product registry, link index |
| Functional architecture | Conceptualize functions/decomposition (after CR-C1) and SysML action/part decomposition | `satisfy`/`allocate` (SysML), `represents` → product elements | registry, link index, `ConceptsService`, SysML API |
| Requirements hierarchy | Requirements collections (headings, order) and `derives-from` | allocation, verification status | `RequirementsService` (live text stays in Requirements) |
| Physical assembly structure | product registry breakdown "physical-assembly" with quantities, else CAD assembly structure | CAD documents/parts via `represents` | registry, product registry, CAD API |
| Concept hierarchy | Conceptualize decomposition and alternative sets | implementations → artifacts, decisions | `ConceptsService`, registry |
| Verification structure | requirements → verification records/evidence → configured article (baseline) | documents (`evidence-for`), work items | Requirements, twin artifacts, registry |
| Artifact and document browser | registry grouped by category → module → container | none (flat with containers) | registry only |

An artifact can appear in several views and several places in one view (a part used in two assemblies, a
requirement allocated to three elements). The Explorer shows the path by which a node was reached.

## 4. Freshness and caching

- The registry-backed parts are as fresh as `confirmedAt`; module-API parts are read live.
- An optional in-memory cache per (project, view, query) is keyed by the registry high-water mark and the
  module source revisions it used; any newer event invalidates it. The cache is never persisted and never
  authoritative.
- When a module is unavailable, its nodes come from the registry (last confirmed summary) and are marked;
  module-API-only details are omitted and listed in `incomplete`.

## 5. Phasing

Phase B: the artifact browser (registry only) for Project Management's own entities. Phase C: product
breakdown and requirements hierarchy with real Requirements and the product registry. Phase D: functional
architecture, concept hierarchy, physical assembly, verification (depend on SysML/CAD/Conceptualize
adapters and their CRs).
