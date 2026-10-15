# Conceptual-to-formal transition (brief §7)

Status: Proposed. Part of deliverable E. Index: [README.md](README.md). Decision:
[ADR-0023](../../decisions/0023-change-impact-and-invalidation.md); change request CR-C11.

## 1. Progressive formalization without a mandatory sequence

The brief's chain, mapped to records and owners:

| Stage (example) | Record | Owner | Link to the previous stage |
| --- | --- | --- | --- |
| Function: *Transmit mechanical power* | Function FN-001 | Conceptualize | — |
| Candidate concept: *Planetary gearbox* | Concept CON-010 | Conceptualize | CON-010 `performs` FN-001 |
| Refined concept: *Three-stage planetary gearbox* | Concept CON-011 | Conceptualize | CON-011 `refines` CON-010 (or a new revision of CON-010) |
| Formal model: SysML structure and behaviour | `sysml-element` objects | SysML | ConceptImplementation IMP-003 `realizes` CON-011, artifacts `{module: sysml, id: SYS-…, revision}` |
| Physical implementation: CAD assembly | `cad-representation`, components | CAD / platform | same IMP-003 (or another implementation), artifacts `{module: cad, …}`, `{module: twin, id: ACT-…}` |
| Engineering evaluation: torque, efficiency, mass, thermal, structural | CalculationModels + calculated Evidence; analysis results (adapter) | Conceptualize; Analysis (future) | Evidence `subjects` = CON-011 and IMP-003; `manifest` pins inputs incl. CAD dimensions by revision |
| Verification | Twin verification records (ADR-0007) | Requirements tool (artifacts) | `verified-by` from the Constraint/Concept; requirement revision pinned by the record |

Any stage can exist without the earlier or later ones; several concepts and implementations can evolve
in parallel; a Concept may stay at `exploring` while a prototype CAD model already exists.

## 2. Synchronization states (CR-C11)

A ConceptImplementation records the **concept revision it realizes** (`realizedConceptRevision`) and, per
artifact, the **pinned artifact revision**. The sync state is derived on read:

| State | Condition | Meaning | Offered resolutions |
| --- | --- | --- | --- |
| `in-sync` | concept revision = realized revision and every artifact pin = current artifact revision | The implementation is known to reflect the intent it was linked to | — |
| `implementation-ahead` | an artifact's current revision > pinned | The model changed after it was linked | **Review and re-pin** (accept the change as consistent with intent), **record deviation**, **request revert** |
| `intent-ahead` | concept current revision > realized revision | Design intent changed after implementation | **Request implementation update** (realization request to the owning module), **confirm still valid** (re-pin realized revision with a note) |
| `diverged` | both of the above | Both sides moved | Resolve each side; nothing is merged automatically |
| `broken` | a pinned artifact no longer exists | Deleted or replaced in its module | **Re-link** to the replacement or **retire** the implementation; the Concept is unaffected |

Rules:

1. Changes in an implementation **never** rewrite the Concept, Function, constraints or decisions.
   They produce a sync state and, through the engine, an impact notification.
2. Re-pinning, recording a deviation and confirming validity are explicit user actions (or previewed
   proposals), each with a reason, recorded in Conceptualize history.
3. A **deviation** record (`implementation_deviations`: what differs, why, accepted by whom, optional
   decision ref) documents intended departures so that later analysis does not keep flagging them.
   Accepting a deviation that contradicts a hard constraint needs a recorded decision (reviewer).
4. Parameters flow only along documented mappings. Today the only cross-tool mapping is CAD dimension →
   component property (ADR-0006). A concept attribute is **not** pushed into CAD or SysML; a calculation
   may read a CAD dimension as an input (pinned), which is a read, not a mapping.

## 3. Conflict resolution

Conflicts are detected, explained and offered for resolution; there is no automatic merge.

| Conflict | Detection | Resolution path |
| --- | --- | --- |
| Concept attribute vs implementation value (e.g. intended rod Ø 25 mm, CAD now Ø 22 mm) | Calculation input binding or attribute ↔ artifact property comparison configured on the implementation (`checkedProperties`) | Re-pin, deviation, revise intent (new concept revision), or request change in CAD |
| Constraint violated by implementation evidence | Constraint check on calculated or analysis evidence for the implementation | Decision review flag; propose design change; or relax the constraint (needs reviewer if it formalizes a requirement) |
| Two implementations of the same concept disagree | Both `in-sync` but with different checked values | Shown side by side; selecting one is a design decision |
| Requirement revised under a formalizing constraint | Pinned requirement revision ≠ current | Constraint `suspect`; re-formalize (new constraint revision) or confirm unchanged |

## 4. Traceability

Forward: Requirement → (formalized by) Constraint → (constrains) Function → (performed by) Concept →
(realized by) Implementation → artifacts → (verified by) verification record. Backward along the same
links. Every hop is a typed, revision-aware link, so the graph API can answer both "what realizes this
requirement's intent?" and "which intent does this CAD part come from?" (SDK
`ConceptsService.conceptsForArtifact` already exists for the latter).

## 5. Mapping to SysML v2 (target, no conformance claim)

When the SysML module grows beyond its current subset, the following correspondences guide
formalization (clause numbers from SysML v2.0 Part 1, formal/2026-03-02; see the research note for access):

| Reasoning-layer record | SysML v2 construct | Clause |
| --- | --- | --- |
| Function | action definition / usage (functional behaviour) | §7.17 Actions |
| Concept performs Function | allocation of the action usage to a part usage | §7.15 Allocations |
| Concept decomposition | part usage composition; interfaces between parts | §7.11 Parts, §7.14 Interfaces |
| DesignConstraint (mathematical) | constraint definition / usage; `assert constraint` | §7.20 Constraints |
| CalculationModel | calculation definition / usage | §7.19 Calculations |
| Trade study / exploration | analysis case with a `TradeStudy` (subject alternatives, `TradeStudyObjective`, `EvaluationFunction`, `MinimizeObjective` / `MaximizeObjective`) | §7.23.3, §9.4.5 |
| Requirement formalized by constraint | requirement usage with required constraints | §7.21 Requirements |
| Units and quantities | ISQ quantities and SI units libraries | §9.8.2, §9.8.4, §9.8.6 |

The mapping is a design aid for the future SysML integration and for export; it does not imply that any
current module produces or consumes SysML v2.
