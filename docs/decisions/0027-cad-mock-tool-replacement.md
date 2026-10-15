# ADR-0027: Replacing the mock CAD tool with the CAD Modeler (non-destructive migration)

Status: Proposed (2026-10-15, CAD agent, change request CR-CAD-4). Number provisional. Needs
coordinator approval. Nothing in this ADR is implemented. The mock tool stays registered and
unchanged until the coordinator accepts this ADR and each phase's gate is met.

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
   - two outbound references (ADR-0026) on the part:
     - `represents` the same component (`ROD-120`);
     - `derivedFrom` `{ module: 'cad', id: 'CAD-120', revision: <the twin revision read> }`.

   The conversion writes nothing to the twin. The mock object remains the record of what was there.
   The conversion runs through the same command and proposal path as other CAD Modeler commands, so
   the assistant can offer it and the user approves it. A conversion report lists dimensions that
   could not be mapped.
3. **Dimension mapping moves to an explicit mapping (separate decision).**
   - A CAD Modeler part that `represents` a component may declare a mapping such as
     "parameter `diameter` → component property `diameter`".
   - Applying the mapping is a proposal the user approves, submitted with `submitChanges` against the
     component revision it was based on. The repository already permits the `cad` module to write
     these properties.
   - Nothing synchronises in the background.
   - This needs either a delegation entry for the tool ID `cad-modeler`, or a decision that the
     existing `cad` delegation covers both tools. Changing `DELEGATIONS` requires its own ADR
     (AGENTS.md).

   Until then, the delegation stays with the mock tool.
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
| 2 | Conversion works for each mock shape in the seed. Tests: the parameters reproduce the mock dimensions within 1e-6 mm; the twin is unchanged (same revision); the conversion is idempotent per (representation, revision), so a repeat proposes nothing new |
| 3 | Delegation ADR accepted. Mapping proposals carry the base revision and are refused when stale. Tests for unit conversion and refused writes |
| 4 | A migration test with a fixture of a project holding `cad-representation` objects, baselines and Conceptualize references to `CAD-…`. After retirement: every object, relationship, baseline and reference reads the same; nothing is deleted; the flag restores the mock tool |

## Consequences

- Users keep all mock data and history. Retirement only hides an authoring path.
- The twin keeps an object type whose author is retired. The inspector must label it read-only, as
  it does for retired modules.
- Phases 2 and 3 add CAD Modeler commands and help pages; phase 4 is a platform change owned by the
  coordinator (`apps/workspace`, `model-service` ownership).
- Rejected alternative: migrate `cad-representation` objects into CAD documents in place, deleting
  the twin objects and rewriting references. That would rewrite user data (violating ADR-0009) and
  would break baselines that pin `CAD-…` revisions.

## Open questions for the coordinator

1. Should conversion record a twin relationship (for example a new `derivedFrom` relationship type
   owned by `cad`), or only the CAD-side reference proposed here? A twin relationship makes the link
   visible to every module, but it is a `RELATIONSHIP_RULES` change.
2. Should the delegation cover both tool IDs under module `cad`, or should `cad-modeler` get its own
   entry?
3. The order relative to Project Management. The planned product-structure references
   (CR-PM-CAD-1, ArtifactRef module `product`) may replace `represents` targets in a later version;
   phase 2 should then target product items instead of twin components.
