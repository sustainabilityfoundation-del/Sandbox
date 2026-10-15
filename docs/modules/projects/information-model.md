# Unified project information model and relationships

Status: **Proposed**. Index: [README.md](README.md). Decisions: ADR-0061 (registry and identity), ADR-0063
(product structure).

## 1. Layers

The model has three layers. Only the first two are stored by Project Management.

| Layer | Content | Stored by |
| --- | --- | --- |
| **Project** | Project, membership, templates, settings references, milestones, work items, documents, baselines, activity | Project Management (`projects` schema; settings in the settings service; membership in `platform`) |
| **Index** | Artifact registry entries (identity, type, owner, lifecycle, version, availability) and cross-module links that no module owns; a derived, rebuildable index of module-owned links | Project Management |
| **Content** | Requirements, Concepts and design knowledge, SysML elements, CAD documents, analyses, verification evidence, product elements* | The owning module |

\* Product elements are content owned by the product registry. If ADR-0063 is accepted, the product
registry is part of Project Management (separate tables, its own module ID `product`).

## 2. Common artifact contract

Every artifact in a project, whichever module owns it, is described in the registry by the same record.

```ts
/** Registry record (projects.artifacts). Content stays in the owning module. */
export interface ArtifactRecord {
  /** Stable, globally unique identity (UUID), minted at first registration. Never reused. */
  artifactId: string
  projectId: string
  /** Owning module's native reference (no revision). Unique per project. */
  ref: { module: string; kind: string; id: string }
  /** Display identifier from the module (REQ-001, CON-003, SYS-…, a document title). Not an identity. */
  key: string
  title: string
  /** Module-defined kind, from the module's published kind list (see §3). */
  kind: string
  /** Normalised category for cross-module views (see §3). */
  category: ArtifactCategory
  ownerModule: string
  /** Normalised lifecycle state (§5); the module's own state is kept verbatim in moduleState. */
  lifecycle: ArtifactLifecycle
  moduleState?: string
  /** Current version in the module's own numbering, e.g. requirement revision 4, SysML commit 12, CAD revision 3. */
  version: { value: number | string; label?: string; at: string }
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
  /** Last time the owning module confirmed this record (event or reconciliation). */
  confirmedAt: string
  availability: 'available' | 'module-unavailable' | 'missing-in-module' | 'not-entitled'
  /** Parent in the module's own containment (e.g. SysML element in a SysML project), as an artifactId. */
  containerId?: string
  /** Registry record revision (increments on every change of the record itself). */
  revision: number
}

export type ArtifactCategory =
  | 'product-element'      // product, system, subsystem, assembly, part (product registry or twin)
  | 'concept'              // Conceptualize concepts, functions, alternatives
  | 'design-knowledge'     // decisions, assumptions, rationale, trade studies, evidence (Conceptualize)
  | 'requirement'          // requirements and collections
  | 'model'                // SysML projects and model elements
  | 'geometry'             // CAD documents, parts, assemblies, drawings, configurations
  | 'analysis'             // analyses, simulation results (no module yet: test adapter only)
  | 'verification'         // verification records, test evidence
  | 'document'             // documents and attachments (Project Management)
  | 'work-item'            // tasks, issues, risks (Project Management)
  | 'milestone'            // milestones (Project Management)
  | 'baseline'             // project and module baselines

export type ArtifactLifecycle = 'working' | 'in-review' | 'released' | 'superseded' | 'retired'
```

The brief's required attributes map as follows: stable global ID → `artifactId`; defined type → `ref.kind`
+ `category`; ownership → `ownerModule` (module) and module-level authorship (`createdBy`, `modifiedBy`);
creation/modification metadata → `createdAt/By`, `modifiedAt/By`; lifecycle state → `lifecycle` (+ verbatim
`moduleState`); version information → `version` (module numbering) and the module's own immutable revisions
reachable through the owning module.

## 3. Artifact kinds (initial catalogue)

Kinds are owned by modules and published by each `ArtifactSource` (`kinds()`), so a new module adds kinds
without a Project Management change (brief §3: "additional modules without redesigning the project model").

| Brief §2 item | Module | `ref.kind` | `ref.id` | Category |
| --- | --- | --- | --- | --- |
| Projects and metadata | projects | `project` | project ID | — (the container) |
| Product and system breakdown | product | `product-element` (attribute `elementKind`: product, system, subsystem, assembly, part, other) | element UUID | product-element |
| Breakdown structures | product | `breakdown` | breakdown UUID | product-element |
| Components (twin, legacy) | twin | `assembly`, `part` | `ACT-100`, `ROD-120` | product-element |
| Concepts and alternatives | conceptualize | `concept`, `alternative-set`, `function`* | Concept UUID | concept |
| Design decisions, assumptions, rationale | conceptualize | `decision`, `assumption`*, `trade-study`, `evidence` | UUID | design-knowledge |
| Requirements and hierarchies | requirements | `requirement`, `requirement-collection` | requirement UUID | requirement |
| SysML models and elements | sysml | `sysml-project`, `sysml-model-element` | `<sysmlProjectId>` / `<sysmlProjectId>/<elementId>` | model |
| SysML (illustrative tool) | twin | `sysml-element` | `SYS-001` | model |
| CAD models, geometry, configurations | cad | `cad-document`, `cad-modeler-entity` (attribute `entityKind`: part, assembly, feature, configuration, drawing) | `<documentUuid>` / `<documentUuid>/<entityId>` | geometry |
| CAD (mock tool) | twin | `cad-representation` | `CAD-120` | geometry |
| Analyses and simulation results | analysis | `analysis`, `result` | test adapter only | analysis |
| Verification and validation evidence | twin / requirements | `verification-record` | `OUT-…` artifact ID | verification |
| Documents and attachments | projects | `document` | document UUID | document |
| Tasks, issues, risks | projects | `task`, `issue`, `risk` | UUID | work-item |
| Milestones | projects | `milestone` | UUID | milestone |
| Baselines | projects / module | `project-baseline`, `requirements-baseline`, `sysml-tag`, `twin-baseline` | UUID / module ID | baseline |

\* `function` and `assumption` as first-class Conceptualize entities are design reasoning CR-C1…C3
(pending). Registration needs no change when they land: Conceptualize publishes the new kinds.

**Granularity rule.** Register what people navigate, reference, review or baseline: documents, models,
requirements, Concepts, decisions, CAD documents and their parts/assemblies/configurations, SysML projects
and their *named, owned* definitions/usages. Do not register sketch entities, faces, every SysML
relationship or every feature. Each module states its registered kinds in its `ArtifactSource`.

## 4. Product structure (if ADR-0063 is accepted)

```ts
export interface ProductElement {
  id: string                 // UUID
  projectId: string
  key: string                // display, e.g. "ACT-100" for the migrated example, "PE-001" otherwise
  aliases: string[]          // legacy twin IDs (ACT-100, ROD-120) for the example project
  name: string
  elementKind: 'product' | 'system' | 'subsystem' | 'assembly' | 'part' | 'other'
  description: string
  /** Typed properties with units; quantities use the SDK unit algebra (contract/quantities.ts). */
  properties: Record<string, string | number | boolean | { value: number; unit: string } | string[]>
  revision: number
  lifecycle: ArtifactLifecycle
}

/** A named breakdown (product breakdown, physical assembly structure …). An element may appear in several. */
export interface Breakdown {
  id: string
  projectId: string
  name: string
  purpose: 'product-breakdown' | 'physical-assembly' | 'other'
  rootElementIds: string[]
}

/** Parent–child edge inside one breakdown, with quantity for assemblies (BOM-ready). */
export interface BreakdownEdge {
  breakdownId: string
  parentId: string
  childId: string
  quantity?: number
  position?: number
}
```

`elementKind` is a label, not a constraint: any kind may contain any other kind, a breakdown may start at a
system with no product above it, and a Concept may represent a whole system before any element exists
(brief §5). A breakdown edge may not create a cycle within its breakdown (checked on write).

## 5. Lifecycle normalisation

Modules keep their own states; Project Management maps them for cross-module views and keeps the original.

| Module | Module state → `lifecycle` |
| --- | --- |
| Requirements | draft, proposed → working; in-review → in-review; approved, baselined → released; superseded → superseded; archived, rejected → retired |
| Conceptualize | idea … evaluated → working; selected, engineering-development → in-review*; implemented, verified → released; superseded → superseded; archived → retired |
| SysML Modeler | element at branch head → working; element pinned by a tag → released (per tag, not per element: the record stays `working`, the tag artifact is `released`) |
| CAD Modeler | document → working; archived → retired |
| Project Management | per entity (see [lifecycle-and-persistence.md](lifecycle-and-persistence.md)) |

\* The mapping is published by each module's `ArtifactSource` (`lifecycleOf(moduleState)`), so the module,
not Project Management, decides what "released" means for its data. The table shows the proposal.

## 6. Relationships

### 6.1 Who owns a relationship

The platform rule stays: **a relationship belongs to the module that owns its `from` end**
(AGENTS.md). Project Management owns a relationship only when (a) its `from` end is a Project Management
artifact (task, issue, risk, document, milestone, baseline, product element), or (b) it links two artifacts
of modules that offer no native way to express it, listed in `LINK_RULES` with `nativeOwner: null`.

### 6.2 Link record

```ts
export interface LinkRecord {
  id: string
  projectId: string
  type: LinkType
  from: { artifactId: string; revision?: number }
  to: { artifactId: string; revision?: number }
  /** Explanation recorded with the link; never inferred. */
  note?: string
  createdAt: string
  createdBy: string
  source: Provenance
  /** Links are never deleted: removal is recorded. */
  removedAt?: string
  removedBy?: string
  revision: number
}
```

A revision on an end pins it (exact reference); without it the link follows the latest working revision,
and views show "follows latest" explicitly (ADR-0004).

### 6.3 Link types owned by Project Management

| Type | From → to | Meaning | Native alternative that takes precedence |
| --- | --- | --- | --- |
| `represents` | geometry, model (any module without a native `represents`) → product-element | the artifact represents the product element | Twin `represents` (mock CAD, illustrative SysML); a module's own mapping when it offers one (CR-SYSML-03, CAD ADR-0026) |
| `implements` | product-element → concept | the product element implements the Concept | Conceptualize `ConceptImplementation` (Concept → artifacts). **Refused** in PM: use Conceptualize |
| `allocated-to` | requirement → product-element | — | **Requirements owns allocation** (refused in PM; Requirements needs the product registry as its `TwinDirectory`, CR-PM-API-3) |
| `subject-of` | work-item, document, milestone → any artifact | the task/issue/risk/document concerns the artifact | none |
| `affects` | issue, risk → any artifact | the issue/risk affects the artifact | none |
| `mitigated-by` | risk → work-item | the risk is mitigated by the task | none |
| `blocks` | work-item → work-item | dependency between work items | none |
| `delivers` | milestone → any artifact | the milestone requires the artifact | none |
| `describes` | document → any artifact | the document describes the artifact | none |
| `evidence-for` | document → requirement, decision, verification artifact | the document is evidence | Requirements verification records; Conceptualize evidence (preferred when available) |
| `depends-on` | any → any (both ends in modules without a native link of this meaning) | engineering dependency stated by a person | module-native types |
| `relates-to` | any → any | weak, explanatory association; excluded from impact analysis by default | — |

`LINK_RULES` (in `services/projects/src/domain/linkRules.ts`) states for each type the allowed categories at
each end, whether it participates in impact analysis, and the native owner that makes the PM link
redundant. Creating a PM link whose meaning a module owns is refused with `invalid` and names the module
operation to use instead (same principle as `RELATIONSHIP_RULES`, AGENTS.md).

### 6.4 Module-owned relationships in the index

Module relationships (requirement allocation and derivation, SysML `satisfy`/`allocate`, Concept
relationships and implementations, twin `represents`) stay in their modules. Each `ArtifactSource` may
report them in `describe()` as `relations: { type, toRef, revision? }[]`; the registry stores them in a
**derived** table `projects.link_index` (source = module, rebuildable, never edited by people), so the
Explorer, traceability and integrity checks can traverse across modules without calling every module per
hop. The module remains the authority; the index records `confirmedAt` and source revision.

## 7. Entity–relationship overview

```
Project 1───* Membership (platform)            Project 1───* Template use (creation record)
   │
   ├──* ArtifactRecord ──(ref)──► owning module content (authoritative)
   │        ▲   ▲
   │        │   └──* LinkRecord (PM-owned)  ──► ArtifactRecord
   │        └────── * LinkIndexEntry (derived from modules)
   ├──* ProductElement ──* BreakdownEdge ──► ProductElement      (ADR-0063)
   ├──* WorkItem (task | issue | risk) ──links──► ArtifactRecord
   ├──* Milestone
   ├──* Document 1──* DocumentVersion ──► Blob (content-addressed)
   ├──* ProjectBaseline 1──* BaselineEntry {artifactId, module, version}
   ├──* AuditEvent (append-only)          ──* Outbox event
   └──* ModuleState (provisioning, availability per module)
```

Every PM-owned entity is itself registered (category document, work-item, milestone, baseline,
product-element) so the Explorer, links and export treat it like any other artifact.

## 8. Worked example (brief §9)

| Step | Artifact | Owner | Registry kind | Link |
| --- | --- | --- | --- | --- |
| Project "Example Engineering Product" | project | projects | — | — |
| Product | "Example product" | product | product-element (`product`) | root of breakdown "Product breakdown" |
| Initial concept | Concept CON-001 | conceptualize | concept | ConceptImplementation → product element (Conceptualize, CR-PM-CON-1 needs `ArtifactModule 'product'`) |
| Requirements | REQ-001… | requirements | requirement | `allocated-to` product element (Requirements, via product-registry `TwinDirectory`) |
| SysML elements | part def/usage | sysml | sysml-model-element | `satisfy` (SysML-native) to requirement; `represents` → product element (PM link until CR-SYSML-03) |
| CAD part | CAD document + part | cad | cad-document, cad-modeler-entity | `represents` → product element (PM link until CAD ADR-0026 mapping lands) |
| Decision + rationale | DEC-001 | conceptualize | decision | Conceptualize decision on the Concept |
| Task | TSK-001 | projects | task | `subject-of` → CAD part |
