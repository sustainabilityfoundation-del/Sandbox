# ADR-0027: Replacing the mock CAD tool with the CAD Modeler (non-destructive migration)

Status: Proposed (2026-10-15, CAD agent, change request CR-CAD-4). Number provisional. Needs
coordinator approval. Nothing in this ADR is implemented. The mock tool stays registered and
unchanged until the coordinator accepts this ADR and each phase's gate is met. The coordinator
answered the open questions on 2026-10-15 (see *Coordinator answers*); the ADR stays Proposed.

## Context

Two CAD tools share the `tool:cad` entitlement:

- **Mock CAD tool** (`packages/tool-cad`, tool ID `cad`). It owns the twin object type
  `cad-representation` (`ARTIFACT_OWNER`). The seed has three such objects, `CAD-110`, `CAD-120` and
  `CAD-130`. Each has a mock shape, dimensions and a `represents` relationship to a component
  (`HSG-110`, `ROD-120`, `MTR-130`). The objects appear in baselines and artifacts, and they carry
  the platform's only cross-tool delegation (ADR-0006, `DELEGATIONS`): "CAD representation
  dimension → component geometry property" (`diameter`, `outerDiameter`, `length`,
  `effectiveLength`). Conceptualize and Requirements can hold `ArtifactRef { module: 'cad',
  id: 'CAD-…' }`.
- **CAD Modeler** (`packages/tool-cad-modeler`, tool ID `cad-modeler`). Its parametric documents
  (ews-cad 1.1) live in the CAD service (`services/cad`, schema `cad`, immutable revisions). Other
  modules reference its entities with `{ module: 'cad', kind: 'cad-modeler-entity',
  id: '<documentUuid>/<entityId>', revision }` (CR-CAD-1, approved). It has no twin objects of its
  own, and it does not use the delegation.

Retiring the mock tool must not lose stored data (ADR-0009). It must not break references,
baselines or artifacts that cite `CAD-…` IDs and revisions, and it must not introduce implicit
synchronisation (AGENTS.md).

## Decision (proposed)

Replace the mock tool in four gated phases. No phase deletes or rewrites a `cad-representation`
object, its revisions, relationships, baselines or artifacts. Each phase can be reverted by switching
a flag back.

1. **Coexistence (current state).** Both tools are registered. Users author with the CAD Modeler;
   the mock tool keeps its views, its delegation and its assistant actions. The two ID forms cannot
   collide: twin IDs look like `CAD-120`, and CAD Modeler references contain a document UUID followed
   by `/`.
2. **Explicit conversion, per object and user-initiated.** A command in the CAD Modeler, "Create a
   parametric part from CAD-120", reads the representation through the platform. It creates a new CAD
   document with:
   - parameters taken from the dimensions (for example `diameter = 25 mm`, `length = 600 mm`);
   - features matching the mock shape (`rod`: circle sketch and extrude; `housing`: tube; `motor`:
     cylinder);
   - two outbound references (ADR-0026) on the part, both CAD-side only:
     - `represents`: in new projects the product element (`{ module: 'product', kind:
       'product-element', id }`, CR-PM-CAD-1). In PRJ-ACT100 it stays the twin component
       (`ROD-120`) as the labelled legacy path;
     - `derivedFrom` `{ module: 'cad', id: 'CAD-120', revision: <the twin revision read> }`.

   The conversion writes nothing to the twin. The mock object remains the record of what was there.
   The conversion runs through the same command and proposal path as other CAD Modeler commands, so
   the assistant can offer it and the user approves it. A conversion report lists dimensions that
   could not be mapped.
3. **No twin delegation for the CAD Modeler.**
   - The ADR-0006 delegation stays with the mock tool (`cad`) and the twin only.
   - If a parameter-to-property mapping is ever needed, it will be a separate, explicit mapping
     against Project Management product elements, proposed as its own ADR. It is not part of this
     ADR and will not be built now.
   - Nothing synchronises in the background.
4. **Retirement of the mock tool (after every gate below).**
   - The mock tool is hidden from the launcher behind a disabled-by-default flag.
   - `cad-representation` stays a known type, readable through the inspector and in baselines, but
     no tool writes it. This is the same treatment as `RETIRED_MODULES`, applied to the type rather
     than the whole `cad` module, which stays active for the CAD Modeler.
   - `ArtifactRef { module: 'cad', id: 'CAD-…' }` keeps resolving to the twin object. Where a
     conversion exists, the referencing module may show the derived CAD Modeler part next to it,
     read-time only.
   - Stored references are never rewritten.

### Gates (acceptance criteria per phase)

| Phase | Gate |
| --- | --- |
| 2 | Starts after Project Management's I1 is on main. Conversion works for each mock shape in the seed, and `represents` targets product elements (twin components only in PRJ-ACT100). Tests: the parameters reproduce the mock dimensions within 1e-6 mm; the twin is unchanged (same revision); the conversion is idempotent per (representation, revision), so a repeat proposes nothing new |
| 3 | None in this ADR: no delegation and no mapping (coordinator answer 2). A later mapping ADR defines its own gates |
| 4 | A migration test with a fixture of a project holding `cad-representation` objects, baselines and Conceptualize references to `CAD-…`. After retirement: every object, relationship, baseline and reference reads the same; nothing is deleted; the flag restores the mock tool |

## Consequences

- Users keep all mock data and history. Retirement only hides an authoring path.
- The twin keeps an object type whose author is retired. The inspector must label it read-only, as
  it does for retired modules.
- Phase 2 adds a CAD Modeler command and help pages; phase 3 adds nothing; phase 4 is a platform change owned by the
  coordinator (`apps/workspace`, `model-service` ownership).
- Rejected alternative: migrate `cad-representation` objects into CAD documents in place, deleting
  the twin objects and rewriting references. That would rewrite user data (violating ADR-0009) and
  would break baselines that pin `CAD-…` revisions.

## Coordinator answers (2026-10-15)

1. **CAD-side reference only.** No twin relationship type is added. The twin is becoming a
   projection of the Project Management product registry (milestone C2), so cross-module visibility
   comes from the artifact registry and C3 references (the CAD artifact source reports the
   references as relations).
2. **No twin delegation for the CAD Modeler.** The delegation stays with the mock tool (`cad`) and
   the twin. A parameter-to-product-property mapping, if needed, will be a separate explicit mapping
   against product elements, in its own ADR later. It is not built now.
3. **Phase 2 targets product elements** (CR-PM-CAD-1), after Project Management's I1 is on main. The
   PRJ-ACT100 conversion keeps twin `represents` targets as the labelled legacy path.
