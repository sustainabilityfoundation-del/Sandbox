# ADR-0070: Boundaries for future standards-aware development assurance

Status: **Accepted** (coordinator, 15 October 2026). Bounded architecture decision; the capability itself is the
deferred epic [E-ASSURE](../roadmap.md#deferred-epic-e-assure-standards-aware-development-assurance-and-safety-engineering).

## Context

The platform should later support development assurance and safety engineering across industries (aviation,
automotive, railway, medical, machinery, process, nuclear, space; cross-industry lifecycle and assurance-case
standards), through selectable, versioned profiles. That work is deferred. This decision checks that today's
architecture does not lock it out, and fixes the boundaries new work must respect.

Inspection of `main` (15 October 2026):

| Principle | Already supported | Gap (deferred unless noted) |
| --- | --- | --- |
| Stable identities and explicit ownership | Twin IDs with `ARTIFACT_OWNER` (ADR-0006); UUIDs in Requirements, Conceptualize, SysML, CAD services; artifact registry design (ADR-0061) | — |
| Typed, revision-pinned relationships | Twin relationships (ADR-0004); `ArtifactRef { module, kind, id, revision }` (milestone C3); pinned Conceptualize implementations, SysML and CAD references; Requirements relations with `toRevision` | Cross-module relationships not owned by any module: Project Management registry (ADR-0062), in progress |
| Coherent baselines across modules | Twin baselines, requirement baselines, SysML tags, CAD immutable document revisions | Project baseline over module revisions (milestone C6), in progress |
| Evidence identifies what it supports | Verification records pin requirement revision and configured article (ADR-0007); calculation manifests record inputs, engine version and digests, and state they establish neither model validity nor requirement satisfaction (manifest v3, C11) | CAD measurements used as evidence must record document revision and kernel version (**required now** by demonstration D1) |
| Earlier results never silently become current evidence | Staleness derived from input revisions (verification records, Conceptualize evidence, decision review flags; ADR-0046) | — |
| Distinct states | Requirement lifecycle (draft, in review, approved) is separate from verification status (not verified, verified, stale) and from reviews; Conceptualize keeps evidence validation status, decision validity and maturity separately; assumptions and open questions are explicit records (CR-C3) | Requirement **validation** (is it the right requirement) and **design implementation** status (CR-C11 sync states) are not yet explicit states |
| AI and humans through the same commands, provenance | Shared typed operations; previewed proposals; provenance on Conceptualize, SysML and CAD writes; headless boundary (milestone C9) | Persisted declarative proposals (C9), in progress |
| Industry terminology out of generic logic | No DAL, ASIL, SIL or standard-specific gates in code (checked) | — |
| Independent modules | Per-module services, schemas and contracts; no shared database requirement | — |

## Decision

1. **Profiles are layered data, not module logic.** A future assurance profile is a versioned, reviewed data
   package (objectives, classification schemes, required evidence kinds, tailoring options) selected per project
   through project-scoped settings (ADR-0048) and applied by a future assurance module through module APIs.
   Generic modules (Requirements, Conceptualize, SysML, CAD, Project Management) must not embed
   standard-specific terminology, integrity-level rules or certification gates.
2. **Classifications keep their governing standard.** A future integrity or safety classification (DAL, ASIL, SIL,
   Performance Level, software safety class, …) is a record: governing standard and edition, classified object
   (`ArtifactRef` with revision), value, rationale, author, review state. No universal conversion between schemes.
3. **Evidence is configuration-specific.** Evidence identifies the requirement revisions, design configuration
   (module revisions or project baseline), inputs and tool name and version it supports. Reuse for a changed
   configuration is an explicit, reviewed decision; otherwise impact analysis marks it possibly or demonstrably
   affected.
4. **States stay distinct.** Requirement validation, design implementation, implementation verification, review
   and approval, and evidence currency are separate attributes owned by the modules that know them. No module
   introduces a single "complete" flag that merges them.
5. **AI output stays distinguishable.** Proposals, engineering results and approved records are different record
   kinds with provenance (actor, proposal, tool versions); an AI proposal never becomes an approved record without a
   person's Apply and, where required, review.
6. **No speculative infrastructure now.** No assurance service, empty module, rules engine or profile content is
   created. The only change required now is item 3 for CAD measurements used in demonstration D1.

## Consequences

- New work is checked against items 1–5 at integration review (coordinator checklist in AGENTS.md).
- Extension points for the epic: project-scoped settings (profile selection), the artifact registry and typed
  relationships (traceability), project baselines (configuration), evidence qualifications and manifests
  (evidence), Conceptualize assumptions, decisions and review flags (rationale and change), declarative
  proposals with provenance (AI).
- Deferred: requirement validation state, implementation sync states (CR-C11), assurance cases and compliance
  matrices, classification records, profiles, tool-qualification records.
