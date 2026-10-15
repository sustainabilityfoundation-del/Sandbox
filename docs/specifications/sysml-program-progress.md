# SysML / MBSE program: progress

Maintained by the SysML agent. Brief: [sysml-program.md](sysml-program.md) (do not edit).
Contracts and governance: [sysml-program-contracts.md](sysml-program-contracts.md).

Branch: `feature/sysml` (sprint 1 merged into `main` as 5a43297; sprint 2 based on `main` eceba15).
Worktree: `C:\Users\kimge.000\Documents\Sandbox-sysml`. Sprint 2 status: **ready for coordinator review**.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| Research and architecture (brief §14 items 1–10) | Done (proposed) | `docs/research/sysml/*` (11 files, sources S-01…S-77), `docs/modules/sysml/*`, ADR-0030…0038 (Proposed) |
| 1 Foundation | Done (subset), merged | `packages/sysml-core` (metamodel subset, store, parser/serializer, resolution with implicit library specializations, library subset, 18 validation rules, units, typed commands, transactions, queries, matrices and coverage), `services/sysml` (schema `sysml`, API, events, idempotency atomic with the commit), `packages/sysml-client`, 12 assistant operations |
| 2 Modeling environment | Usable; sprint 2 added matrices, coverage, behaviour views and a code editor | `packages/tool-sysml-modeler`: browser, CodeMirror text editor (highlighting, completion, in-place diagnostics), General, Interconnection, Action Flow and State Transition views, relationship matrices, requirement coverage, inspector, validation and history with undo, help (20 topics) |
| 3 Engineering integration | Partly done | Managed-requirement link and coverage; Conceptualize scheme approved (CR-SYSML-02); CAD references decided and validated (CR-SYSML-03), no picker or mass read yet |
| 4–6 | Not started (behaviour, cases and views are parsed, stored and now shown; nothing executes) | |

## Sprint 2 (15 October 2026): scope and result

| # | Item | Result | Commits |
| --- | --- | --- | --- |
| 1 | Idempotency record inside the commit transaction | Done: savepoint INSERT in the repository transaction (`OnCommit` hook); a concurrent retry with the same key replays the first outcome; test with three concurrent requests → one commit | 4807ad8 |
| 2 | Relationship matrices (satisfy, allocate, connect) and requirement coverage, with assistant reads | Done: `relationshipMatrix`, `requirementCoverage` (core); Matrix and Coverage tabs; `sysml-modeler.matrix`, `sysml-modeler.coverage` | 759a2e8, 3ca1977 |
| 3 | Action Flow and State Transition views as projections | Done: actions, parameters, successions, flows, start/done; states, entry/do/exit, transitions with trigger and guard, initial state; `sysml-modeler.behavior` | 759a2e8, 0fe81b6, cb7aba1 |
| 4 | Implicit library specializations; more of the official library; new measurement | Done: derived implied generals; parser additions; measurement against the official library (below) | 0fe81b6 |
| 5 | Editor with highlighting and completion (CodeMirror 6) | Done | cb7aba1, 6fe7121 |
| — | CR-SYSML-03 CAD reference scheme | Done in the model and docs (metadata, rule `SYSML-CAD-REFERENCE`, `cadRepresentations()`) | see handoff log |

## Major architectural decisions

ADR-0030…0038 (Proposed, sent 14 October 2026). Sprint 2 adds no new ADR: implied specializations
are derived semantics under ADR-0032/0036; the code editor is a presentation under ADR-0035.

## Standards conformance (supported / unsupported language features)

Full list: [docs/modules/sysml/conformance.md](../modules/sysml/conformance.md). No conformance
claim. Official corpus (SysML-v2-Release 2026-08, 196 example and training files):

| Measure | Sprint 1 | Sprint 2 |
| --- | --- | --- |
| No diagnostics (platform library) | 35 (17.9%) | 38 (19.4%) |
| Parse-clean apart from library names | 90 (45.9%) | 92 (46.9%) |
| No diagnostics resolved against the official library (measurement only, not bundled) | n/a | 49 (25.0%) |
| Official library files parsing with no diagnostics | 37/58 (63.8%) | 43/58 (74.1%) |
| Crashes | 0 | 0 |

New this sprint: implicit specializations (derived, not stored), `start`/`done`, `#(i)`, `a..b`,
`istype`/`hastype`/`@`/`as`/`meta`, `x->f(y)`; end and connector-end multiplicities, alias bodies and
expression-body arguments are read and reported (`SYSML-SYNTAX-UNSUPPORTED`) instead of stopping.
Still unsupported: send/message/event, individuals/snapshots/timeslices, variants, control nodes,
loops/assign, include, dependency, filter, `new`, chains after `( … )`.

## Capability status (implemented / partial / experimental / planned)

| Capability | Status |
| --- | --- |
| Abstract-syntax model store, standard JSON, text parse/serialize (subset) | Implemented |
| Name resolution (inheritance, redefinition, imports, aliases, visibility, chains, conjugation, implicit library specializations) | Implemented (implied generals derived, not stored; typed usages do not also subset the base feature) |
| Model library | Partial (platform subset shipped; official library used for measurement only) |
| Validation (18 rules), units and quantity checks, expression evaluation | Implemented (subset) |
| Typed commands (16), transactions, dry run, diagnostics delta, undo, provenance, idempotency (atomic), element-level concurrency | Implemented |
| Repository: projects, commits, branches, tags, history, diff, impact, events (SSE) | Implemented (no merge) |
| Browser, General View, Interconnection View, inspector, validation, history | Implemented |
| Text editor: CodeMirror 6, highlighting, completion (keywords, model names, `A::` members), diagnostics in place, indentation | Implemented |
| Relationship matrices (satisfy, allocate, connect) | Implemented (read-only; no export) |
| Requirement coverage (satisfied, verified, managed link, gaps) | Implemented |
| Action Flow and State Transition views | Implemented (no control nodes, swimlanes or nested-state drawing) |
| Requirements link (ManagedRequirement) | Implemented |
| CAD representation references (`cad-modeler-entity`) | Partial: stored, validated, readable (`cadRepresentations`); no CAD picker, no mass read |
| AI: 12 operations (describe commands, find, read, validate, impact, explain commit, matrix, coverage, behavior, propose commands, propose text, link requirement) | Implemented (scripted demo planner; no model provider) |
| Sequence views, v1 presentations, execution/simulation, parametric solving, merge, review, XMI | Planned |

## Contract change requests

| ID | Request | Status |
| --- | --- | --- |
| CR-SYSML-01 | SDK `PlatformServices.sysml` | Approved in principle for SDK 1.6; the coordinator makes the SDK change. The tool keeps its local client until then |
| CR-SYSML-02 | `{ module: 'sysml', kind: 'sysml-model-element', id: '<projectId>/<elementId>', revision: <commit number> }` | **Approved** (api-and-integration.md §5.2) |
| CR-SYSML-03 | Part-to-CAD mapping references `{ module: 'cad', kind: 'cad-modeler-entity', id: '<documentUuid>/<entityId>', revision: <document revision> }`, stored in SysML as SysML-owned references, no CAD copies, mass read on demand | **Decided**; implemented in the model (EWS::CadRepresentation doc, rule SYSML-CAD-REFERENCE, `cadRepresentations`) and documented (§5.3). Picker and mass read wait for a CAD read service in `PlatformServices` |
| CR-SYSML-04 | boundaries entries | Accepted (on main) |
| CR-SYSML-05 | `CapabilityModule` gains `'sysml-modeler'` | Accepted (on main) |
| CR-SYSML-06 | Shared service infrastructure | Deferred |
| CR-SYSML-07 | Entitlement exception | Accepted: `shared` map (cad-modeler→tool:cad, sysml-modeler→tool:sysml) |

## Integration needs for the coordinator

1. Review the sprint 2 COORDINATOR REVIEW commits: 3ca1977 (capability entries `sysml-modeler.matrix`,
   `.coverage`, `.action-flow`, `.state-transition`; append-only) and 6fe7121 (CodeMirror 6
   dependencies in `docs/dependencies.md` and `package-lock.json`).
2. Lockfile effect of 6fe7121: the root copies of `@codemirror/view` and `@codemirror/language`
   (already installed for `@scalar/api-reference`) move to 6.43.13 and 6.12.4, the newest releases at
   least two weeks old, so that one copy serves both (two copies break CodeMirror). Scalar's ranges
   accept them.
3. The existing capability entry `sysml-modeler.validate` says "17 rules"; it is now 18
   (SYSML-CAD-REFERENCE). Not edited (append-only file).
4. CAD read contract: to show CAD names and on-demand mass next to `@EWS::CadRepresentation`, the tool
   needs a CAD read service in `PlatformServices` (get entity summary and mass properties at a document
   revision), like `requirements`. Proposal for the SDK 1.6 round together with CR-SYSML-01.
5. Settings contribution (SDK 1.6 `SettingsContribution`): list below; ready to add once the contract lands.
6. Unchanged from sprint 1: `services/api/scripts/db.ts` does not know schema `sysml`; the illustrative
   `tool-sysml` and the SysML Modeler share `tool:sysml`.

## Settings the SysML Modeler would contribute (SettingsContribution, SDK 1.6)

| Setting | Scope | Values (default) | Effect |
| --- | --- | --- | --- |
| Model storage | user | API (when the host provides it) / local in this browser (API) | Which client the tool uses; local mode is for demos and offline work |
| Assistant proposals: validation policy | project | refuse proposals that add errors / allow with warning (refuse) | `propose_commands` / `propose_text` behaviour (today fixed to refuse) |
| Show library elements in the browser | user | on / off (off) | Browser tree and search include platform library packages |
| Diagram layout direction | user | left to right / top to bottom (left to right) | ELK `elk.direction` for all views |
| Fit diagrams to width when opened | user | on / off (on) | The automatic zoom on first display |
| Text editor font size | user | 12–18 px (13) | CodeMirror font size |
| Text editor: completion while typing | user | on / off (on) | Off = only Ctrl+Space |
| Text editor: indentation unit | user | 2 / 4 spaces (4) | Indentation of new lines and serialization indent |
| Coverage: default filter | user | all / only gaps (all) | Initial state of the Coverage view |
| Default matrix | user | satisfy / allocate / connect (satisfy) | Initial matrix kind |

## Licensing review

| Item | Licence | Use | Decision |
| --- | --- | --- | --- |
| elkjs 0.11.1 | EPL-2.0 OR GPL-3.0-or-later | Shipped, unmodified, used under EPL-2.0 | Pre-authorized (contracts §4) |
| @codemirror/state, view, language, autocomplete, commands; @lezer/highlight | MIT | Shipped (text editor) | Recorded in docs/dependencies.md (6fe7121) |
| SysML-v2-Release 2026-08 (library, examples, training) | EPL-2.0 | Read locally for measurement (`.data/`, not committed). The official library is **not bundled**: it is large, the kernel part is KerML (not readable yet), and shipping it needs EPL-2.0 notices and a source offer. Proposal: an optional, admin-installed official library for the service, decided by ADR when the KerML reader exists | Allowed (fixtures/oracle) |
| OMG specifications | OMG copyright | Read, not reproduced | n/a |
| Platform library subset | Written for this module | Shipped | n/a |

## Risk register

Full register: [docs/modules/sysml/risks.md](../modules/sysml/risks.md). Top risks: R-01 grammar
coverage (47% parse-clean; 25% fully clean with the official library); R-03 large models (whole-model
loading in the browser; completion scans all element names); R-05 shared contracts (SDK 1.6 items
above); R-08 editor (now CodeMirror; Tab does not indent by design, for keyboard users); R-10 AI
proposals that are valid but wrong (preview, reject-new-errors, provenance, explain). New: R-15
implied specializations are a subset (typed usages do not also subset the base feature), so a few
names resolvable in the specification still fail.

## Backlog (prioritized, traced to research sources)

Source of truth: [docs/research/sysml/backlog.md](../research/sysml/backlog.md).

| Item | Status |
| --- | --- |
| BL-001, 002, 005, 007, 008, 010, 013, 015, 019, 022, 041 | Done (subset) |
| BL-012 editor with completion, BL-016 matrices, BL-017 behaviour views (action flow, state transition), BL-021 coverage, BL-006 implied specializations | Done this sprint (subset) |
| BL-003 official library loader, BL-004 parser coverage, BL-009/011 pilot oracle | Partial (measurement loads the official SysML files; KerML files not read) |
| BL-014 schema-driven inspector, BL-020 CAD link UI, BL-024 saved queries, BL-029 branch/diff UI, BL-030 merge | Next |
| BL-018 KPAR, BL-023 roll-ups, BL-025…BL-040 | Later |

Recommended next increments: (1) CAD entity picker and on-demand mass once a CAD read service exists;
(2) branch/diff UI and merge (BL-029, BL-030); (3) control nodes and send/accept in action flows;
(4) a KerML reader for the kernel libraries, then an optional official library in the service;
(5) matrix editing and export; (6) Settings contribution (SDK 1.6).

## Handoff log

- 2026-10-14: research and architecture committed (c66a899, 48bf1ff).
- 2026-10-15 (sprint 1): foundation, modeling environment, workspace registration, requirements
  link, parser round 2; merged into `main` as 5a43297.
- 2026-10-15 (sprint 2): `git merge main` (eceba15); idempotency 4807ad8; matrices, coverage and
  behaviour views 759a2e8 (+ COORDINATOR REVIEW 3ca1977); implied specializations, parser and
  official-library measurement 0fe81b6; CodeMirror editor cb7aba1 (+ COORDINATOR REVIEW 6fe7121);
  CAD references and this file in the following commit.
