# SysML Modeler: formal functional requirements

Status: Proposed. Each requirement has an ID (`SYS-FR-<area>-<nn>`), a normative statement ("shall"), its
source in the brief (`B§…`) or research backlog (`BL-…`, [backlog](../../research/sysml/backlog.md)), the
phase that delivers it, and its status. Status values: **Implemented** (works, tested, evidence named in
[conformance.md](conformance.md) or the progress file), **Partial** (a documented subset works),
**Planned**. Status is maintained in this file and summarized in the progress file; it is never raised
without a test.

Conventions: "the module" = the SysML Modeler (core, service, client, tool). "Element" = a KerML/SysML v2
model element in the sense of the specifications (relationships are elements too).

## CORE: semantic model and language

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-CORE-01 | The module shall represent models as instances of the KerML/SysML v2 abstract syntax metaclasses (e.g. `Package`, `PartDefinition`, `PartUsage`, `OwningMembership`, `FeatureMembership`, `FeatureTyping`, `Subsetting`, `Redefinition`), with relationships as elements, and shall not substitute a proprietary graph schema. | B§4 | 1 | Implemented (subset, see conformance) |
| SYS-FR-CORE-02 | Every element shall have a stable, globally unique `elementId` (UUID) that survives renaming, moving, textual re-editing and versioning. | B§4, B§10 | 1 | Implemented |
| SYS-FR-CORE-03 | The module shall compute derived properties (owner, owned members, qualified name, features, types, inherited memberships) from the stored relationships rather than storing them as independent truth. | B§4 | 1 | Implemented (subset) |
| SYS-FR-CORE-04 | The module shall parse a documented subset of the SysML v2 textual notation into the semantic model and report syntax errors with line and column. | B§4, B§11 | 1 | Implemented (subset) |
| SYS-FR-CORE-05 | The module shall serialize the semantic model to textual notation such that parse(serialize(m)) is semantically equal to m for the supported subset. | B§4, B§13 | 1 | Implemented (subset) |
| SYS-FR-CORE-06 | The module shall serialize and deserialize elements in the Systems Modeling API JSON form (`@id`, `@type`, references as `{"@id": …}`). | B§11 | 1 | Implemented (subset of attributes) |
| SYS-FR-CORE-07 | The module shall resolve names per KerML rules: owned and inherited memberships, visibility, aliases, namespace and membership imports (including recursive), enclosing namespaces, global scope and model libraries; and feature chains (`a.b.c`). | B§4 | 1 | Implemented (subset) |
| SYS-FR-CORE-08 | The module shall load a model library: a bundled platform subset of standard library names, and the official OMG library when it is provided locally under its licence. | B§4 | 1 | Partial (platform subset; official library loading tested when fetched) |
| SYS-FR-CORE-09 | The module shall represent attributes with values, quantities and units, and check unit/quantity-kind consistency of literal quantity values. | B§5.A, B§5.D | 1 | Implemented (SI subset) |
| SYS-FR-CORE-10 | The module shall support specialization, subsetting, redefinition and conjugation semantics for name resolution and validation. | B§5.A | 1 | Partial (conjugation planned) |
| SYS-FR-CORE-11 | The module shall support SysML v1.7 import and migration per the v1-to-v2 transformation specification. | B§4, B§11 | 5 | Planned |

## VAL: validation and queries

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-VAL-01 | The module shall validate models and return diagnostics with severity, rule ID, element, message and (for text) source range. | B§4, B§13 | 1 | Implemented |
| SYS-FR-VAL-02 | Validation shall include: unresolved references, definition/usage kind compatibility of typing, specialization cycles, multiplicity bounds, duplicate member names, redefinition targets, unit dimension consistency, connector end resolution, satisfy/verify target kinds. | B§4 | 1 | Implemented (rule list in conformance) |
| SYS-FR-VAL-03 | Every modification (human or AI) shall be followed by semantic validation and the change shall report which diagnostics it introduced and resolved. | B§6 | 1 | Implemented |
| SYS-FR-VAL-04 | The module shall offer machine-readable queries by metaclass, name, qualified name, owner and relationship, with pagination. | B§6, B§11 | 1 | Implemented (subset) |
| SYS-FR-VAL-05 | The module shall answer "what references X" (incoming relationships) for impact analysis. | B§5.C, B§6 | 1 | Implemented |
| SYS-FR-VAL-06 | Rule sets shall be selectable and extensible (custom rules, severities). | BL | 4 | Planned |

## CMD: commands, transactions and AI access

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-CMD-01 | Every model modification shall be expressed as a typed command with a published JSON schema; the UI, the AI assistant and API clients shall use the same commands. | B§6, contracts §6 | 1 | Implemented |
| SYS-FR-CMD-02 | Commands shall be grouped into transactions that apply atomically or not at all. | B§6 | 1 | Implemented |
| SYS-FR-CMD-03 | A transaction shall support dry run, returning the change set (created/updated/deleted elements with before/after), diagnostics delta and text preview without writing. | B§6 | 1 | Implemented |
| SYS-FR-CMD-04 | Transactions shall carry the base commit; the repository shall refuse them when elements they touch changed since that commit (element-level optimistic concurrency) and otherwise apply them on the current head. | B§6, B§10 | 1 | Implemented |
| SYS-FR-CMD-05 | Every committed transaction shall be undoable by a compensating commit; undo shall refuse when later commits changed the same elements. | B§6 | 1 | Implemented |
| SYS-FR-CMD-06 | Every commit shall record actor, source (user, assistant, import, API), reason, the commands, and for the assistant the conversation and proposal IDs (provenance and audit). | B§6 | 1 | Implemented |
| SYS-FR-CMD-07 | The AI assistant shall discover the command schemas and the supported metaclasses (schema discovery) and introspect the model through read operations. | B§6 | 1 | Implemented |
| SYS-FR-CMD-08 | AI modifications shall be service proposals previewed to the user; nothing is written before the user applies them; consequential changes need approval. | B§6, contracts §6 | 1 | Implemented |
| SYS-FR-CMD-09 | The AI shall be able to explain what a commit changed, why (recorded reason), and which elements are affected (incoming references). | B§6 | 1 | Implemented |
| SYS-FR-CMD-10 | Applying textual notation to a namespace shall be a command that reconciles the parsed text with the existing elements, preserving element IDs of matched elements. | B§5.E | 1 | Implemented |
| SYS-FR-CMD-11 | Idempotent retries: API writes shall accept an Idempotency-Key and replay the first outcome. | platform convention | 1 | Implemented |

## REPO: repository, versioning and collaboration

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-REPO-01 | The module shall persist models in PostgreSQL schema `sysml` as immutable element versions per commit, preserving the full abstract syntax of each element. | B§4, contracts §3 | 1 | Implemented |
| SYS-FR-REPO-02 | The repository shall support projects, branches, tags and commits aligned with the Systems Modeling API resource model. | B§10, B§11 | 1 | Implemented (subset) |
| SYS-FR-REPO-03 | Reads shall be possible at any commit and at branch heads, with paging and per-owner lazy loading. | B§9 | 1 | Implemented |
| SYS-FR-REPO-04 | Committed changes shall be announced through a transactional outbox and an SSE stream. | platform convention | 1 | Implemented |
| SYS-FR-REPO-05 | Access shall require the `tool:sysml` entitlement and project membership; writes need an editor (or higher) role; enforcement is server-side. | B§10 | 1 | Implemented |
| SYS-FR-REPO-06 | The module shall provide semantic diff between two commits (element-level). | B§10 | 1 | Implemented (element-level, no merge) |
| SYS-FR-REPO-07 | The module shall merge branches semantically with conflict detection and resolution. | B§10 | 5 | Planned |
| SYS-FR-REPO-08 | The module shall support model review and approval, change notifications, publication and offline work. | B§10 | 5 | Planned |
| SYS-FR-REPO-09 | Element-level access control (beyond project roles). | B§10 | 5 | Planned |
| SYS-FR-REPO-10 | The repository shall handle 100 000+ elements with incremental commits (cost proportional to the change) and indexed queries. | B§9 | 1 (baseline measured), 5 | Partial (measured, see test strategy) |

## UI: modeling environment

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-UI-01 | Hierarchical model browser (containment) with search and metaclass filter, keyboard operable. | B§5.E | 2 | Implemented |
| SYS-FR-UI-02 | Textual editor for a selected namespace with diagnostics, dry-run preview and apply. | B§5.E | 2 | Implemented (plain text area, no highlighting) |
| SYS-FR-UI-03 | Graphical views projected from the semantic model; at least a General View and an Interconnection View; automatic layout. | B§5.E | 2 | Implemented (General, Interconnection) |
| SYS-FR-UI-04 | Property inspector editing name, short name, typing, specialization, multiplicity, value, direction and documentation through commands. | B§5.E | 2 | Implemented |
| SYS-FR-UI-05 | Contextual creation of owned elements (add part, port, attribute, …) without dragging. | B§5.E | 2 | Implemented |
| SYS-FR-UI-06 | Validation panel and history panel with undo of commits. | B§5.E | 2 | Implemented |
| SYS-FR-UI-07 | Tables and dependency/relationship matrices derived from the model. | B§5.E | 2–3 | Planned (Phase 3) |
| SYS-FR-UI-08 | Legacy SysML v1-style diagram presentations (BDD, IBD, …) as clearly labelled compatibility presentations of v2 views. | B§5.E | 4 | Planned |
| SYS-FR-UI-09 | Saved viewpoints as SysML `view` usages in the model; customizable styles; model comparison visualization. | B§5.E | 3–5 | Planned |
| SYS-FR-UI-10 | Phone, tablet and desktop layouts, light and dark themes, keyboard access, design-system components only. | contracts §9 | 2 | Implemented |

## INT: cross-module integration

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-INT-01 | Requirement usages that stand for managed requirements shall reference them by canonical UUID and revision via `RequirementsService`; SysML shall store no competing requirement text. | B§5.C, contracts §5 | 3 | Planned (metadata scheme designed) |
| SYS-FR-INT-02 | Concepts shall link to SysML Modeler elements through `ArtifactRef` with element UUID and commit number. | B§7, contracts §5 | 3 | Planned (scheme proposed: contract change request) |
| SYS-FR-INT-03 | Part usages shall link to CAD parts/assemblies with interface traceability and mass properties through an agreed contract. | B§8 | 3 | Planned (proposal; coordinator reconciles) |
| SYS-FR-INT-04 | Traceability matrices, coverage and gap analysis across requirements and model. | B§5.C | 3 | Planned |
| SYS-FR-INT-05 | Analysis/simulation modules shall exchange parameters and results through versioned APIs. | B§8 | 4 | Planned |

## BEH / PAR / EXE: behavior, parametrics, execution

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-BEH-01 | Actions, successions (`first … then …`), states and transitions (`accept … then …`) in the semantic model and text. | B§5.B | 1 (syntax), 4 (views) | Partial (parse, store, resolve) |
| SYS-FR-BEH-02 | Action flow, state transition and sequence views. | B§5.B, B§5.E | 4 | Planned |
| SYS-FR-PAR-01 | Evaluate attribute value expressions with units (arithmetic, references, unit conversion). | B§5.D | 1 | Implemented (subset) |
| SYS-FR-PAR-02 | Constraint checking, parametric solving, trade studies, sensitivity, external solvers. | B§5.D | 4 | Planned |
| SYS-FR-EXE-01 | State-machine and activity execution, clearly labelled as executable versus descriptive. | B§5.F | 4 | Planned |

## XCH: interchange

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-XCH-01 | Native textual notation import/export of whole projects or namespaces. | B§11 | 1 | Implemented (subset) |
| SYS-FR-XCH-02 | Systems Modeling API JSON element export/import (project snapshot). | B§11 | 1 | Implemented (subset) |
| SYS-FR-XCH-03 | SysML v1 XMI import/export where feasible; no claim of universal compatibility without round-trip tests. | B§11 | 5 | Planned |
| SYS-FR-XCH-04 | Document and report export. | B§11 | 5 | Planned |

## HLP: documentation

| ID | Requirement | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| SYS-FR-HLP-01 | A help manifest with overview, getting started, features, command/AI reference, language reference, tutorial, shortcuts, troubleshooting, API notes and a worked multidisciplinary example, discovered automatically by the Help menu. | B§12, AGENTS.md | 1–2 | Implemented |
