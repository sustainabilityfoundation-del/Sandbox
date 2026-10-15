# SysML / MBSE program: progress

Maintained by the SysML agent. Brief: [sysml-program.md](sysml-program.md) (do not edit).
Contracts and governance: [sysml-program-contracts.md](sysml-program-contracts.md).

Branch: `feature/sysml` (based on `main` 75eec81). Worktree: `C:\Users\kimge.000\Documents\Sandbox-sysml`.
Status of everything below: **ready for coordinator review**; nothing is accepted yet.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| Research and architecture (brief §14 items 1–10) | Done (proposed) | `docs/research/sysml/*` (11 files, sources S-01…S-77), `docs/modules/sysml/*` (requirements, semantic model and persistence, API and integration, UI, AI commands, roadmap, risks, test strategy, conformance), ADR-0030…0038 (Proposed) |
| 1 Foundation | Done (subset), ready for review | `packages/sysml-core` (metamodel subset, store, parser/serializer, resolution, library subset, 17 validation rules, units, typed commands, transactions, queries; 98 tests), `services/sysml` (schema `sysml`, API, events; 21 DB tests incl. client contract), `packages/sysml-client` (HTTP + local adapters, contract suite), AI access (9 assistant operations) |
| 2 Modeling environment | First usable slice done | `packages/tool-sysml-modeler`: browser, text editor (preview/apply), General and Interconnection views, inspector, validation and history panels with undo, create/connect dialogs, help (17 topics, tutorial), harness; registered in the workspace; browser checks (harness 20 checks, workspace 18 checks) |
| 3 Engineering integration | Started | Managed-requirement link (UUID + pinned revision, live text, stale pin) and `link_requirement`. Conceptualize and CAD links wait for CR-SYSML-02/03 |
| 4–6 | Not started (syntax for behaviour, cases and views is parsed and stored, without views or execution) | |

## Major architectural decisions (sent to the coordinator 14 October 2026)

ADR-0030 placement and packages; ADR-0031 TypeScript core with hand-written parser (pilot only as an
oracle); ADR-0032 stored model = KerML/SysML abstract syntax; ADR-0033 versioned repository aligned
with the Systems Modeling API; ADR-0034 typed commands and transactions as the only write path;
ADR-0035 views as projections, v1 diagrams as labelled compatibility presentations; ADR-0036 model
library (platform subset now, official library loadable); ADR-0037 cross-module references through
metadata and ArtifactRef; ADR-0038 AI access through assistant actions and service proposals.
**Awaiting approval**: CR-SYSML-01…05 below (no new shipped runtime; no licence outside §4).

## Standards conformance (supported / unsupported language features)

Full list: [docs/modules/sysml/conformance.md](../modules/sysml/conformance.md). Summary: no
conformance claim. Supported: packages, imports, aliases, comments, all main definition/usage kinds
(part, attribute, enum, item, port incl. conjugation, connection, interface, allocation, flow, action,
state, constraint, requirement, calc, occurrence, metadata, use case, verification, analysis, case,
concern, viewpoint, view, rendering), specialization/typing/subsetting/redefinition/references (incl.
feature chains), multiplicities, values, connectors, successions and `then`, perform/exhibit, accept,
transitions, requirement constructs, expressions with units, metadata. Unsupported (reported, never
dropped): send/message/event, individual/snapshot/timeslice, variant members, control nodes, loops and
assign, include, dependency, filter, `new`, casts. Official corpus (SysML-v2-Release 2026-08): 17.9%
of 196 files with no diagnostics, 45.9% parse-clean apart from library names; library 63.8% parses.
API: aligned subset (no merge, no saved queries, no PUT/DELETE).

## Capability status (implemented / partial / experimental / planned)

| Capability | Status |
| --- | --- |
| Abstract-syntax model store, standard JSON, text parse/serialize (subset) | Implemented |
| Name resolution (inheritance, redefinition, imports, aliases, visibility, chains, conjugation) | Implemented (no implicit library specializations) |
| Model library | Partial (platform subset; official library only syntax-measured) |
| Validation (17 rules), units and quantity checks, expression evaluation | Implemented (subset) |
| Typed commands (16), transactions, dry run, diagnostics delta, undo (revert), provenance, idempotency, element-level concurrency | Implemented |
| Repository: projects, commits, branches, tags, history reads, diff, impact, events (SSE) | Implemented (no merge) |
| Systems Modeling API aligned endpoints | Partial (subset, see conformance §6) |
| Browser, text editor, General View, Interconnection View, inspector, validation, history | Implemented (first slice; plain text editor) |
| Requirements link (ManagedRequirement) | Implemented |
| AI: schema discovery, find, read, validate, impact, explain commit, propose commands, propose text, link requirement | Implemented (demo planner is scripted; no model provider) |
| Tables and matrices, behaviour views, sequence views, v1 presentations | Planned |
| Execution and simulation, parametric solving, trade studies | Planned |
| Semantic merge, review/approval, element-level access control, XMI, v1→v2 | Planned |
| Conceptualize and CAD links | Planned (waiting for CR-SYSML-02/03) |

## Contract change requests

| ID | Request | Status |
| --- | --- | --- |
| CR-SYSML-01 | SDK `PlatformServices.sysml?: SysmlModelService` (resolve element refs, summaries, list, subscribe) so other modules can use SysML Modeler data and the host supplies the client | Proposed; until then `createSysmlModelerTool(options)` builds its client in `tools.ts` |
| CR-SYSML-02 | `ArtifactRef` for SysML Modeler elements: `{ module: 'sysml', kind: 'sysml-model-element', id: '<projectId>/<elementId>', revision: <commit number> }` | Proposed (needs Conceptualize agreement) |
| CR-SYSML-03 | CAD mapping contract (api-and-integration.md §5.3) | Proposed; coordinator to reconcile with the CAD agent |
| CR-SYSML-04 | `boundaries.test.ts` entries; `services/api` may import `@ews/sysml-service`; package.json dependencies | **Applied in a separate commit labelled COORDINATOR REVIEW (fa8dba7)** for review/acceptance |
| CR-SYSML-05 | `CapabilityModule` gains `'sysml-modeler'` | Applied in 89fa0bc (one-token union change) |
| CR-SYSML-06 | Shared service infrastructure package (migrations, outbox/SSE hub, route/idempotency helpers) | Proposed (non-blocking) |
| CR-SYSML-07 | Platform test `every tool declares … tool:<id>` conflicts with contracts §1 (`sysml-modeler` uses `tool:sysml`) | Exception added in fa8dba7; coordinator decides the permanent rule |

## Integration needs for the coordinator

1. Review the two COORDINATOR REVIEW commits: fa8dba7 (boundaries, deps, tool-enumerating tests:
   platform.test tool list, help.test module list and 'baseline' search, designSystem.test tool
   packages) and d0c9405 (executor returns `proposalId` for service proposals; identical to the
   Conceptualize branch change, without it service-proposal cards never render on `main`).
2. `apps/workspace/src/platform/capabilities.ts` ("About this platform") and `docs/roadmap.md` should
   list the SysML Modeler with its honest status (not edited: coordinator-owned).
3. Decide the replacement path of the illustrative `tool-sysml` (contracts §1); both tools share
   `tool:sysml` meanwhile.
4. `services/api/scripts/db.ts` (migrate/seed/status) does not know schema `sysml`; the plugin migrates
   and seeds at start. Consider adding it when CR-SYSML-06 lands.
5. Idempotency records are written after the handler's own transaction (not inside it as in
   Requirements): a crash between commit and record could let a retry create a second commit.
   CR-SYSML-06 would let the shared helper do it in one transaction.

## Licensing review

| Item | Licence | Use | Decision |
| --- | --- | --- | --- |
| elkjs 0.11.1 | EPL-2.0 OR GPL-3.0-or-later | Shipped, unmodified, used under EPL-2.0 | Pre-authorized (contracts §4) |
| SysML-v2-Release ≥ 2026-04 (library, examples, training) | EPL-2.0 (README and LICENSE read by the research agent) | Test fixtures fetched locally, not committed; the script refuses earlier (LGPL-3.0) tags | Allowed (oracle/fixtures); bundling the official library would also be allowed unmodified (EPL-2.0) but is not done |
| OMG specifications | OMG copyright | Read, not reproduced | n/a |
| SysML v2 Pilot Implementation | EPL-2.0 since 2026-04 | Not used yet (candidate external oracle) | Allowed as oracle |
| Platform library subset | Written for this module | Shipped | n/a |

## Risk register

Full register: [docs/modules/sysml/risks.md](../modules/sysml/risks.md). Current top risks: R-01 grammar
coverage (mitigated: corpus measurement 46% parse-clean, explicit unsupported list); R-03 large models
(baseline: 31 500 elements load in ~0.5 s in the core and commit a rename in ~50 ms; the database
stores 31 500 elements in ~4.5 s and commits a rename in ~29 ms; the browser loads whole models);
R-05 shared contracts (CR list above); R-08 plain text editor; R-10 AI proposals that are valid
but wrong (mitigated by preview, reject-new-errors, provenance, explain).

## Backlog (prioritized, traced to research sources)

Source of truth: [docs/research/sysml/backlog.md](../research/sysml/backlog.md) (BL-001…BL-042 with
sources). Status against it:

| Item | Status |
| --- | --- |
| BL-001 core, BL-002 JSON, BL-005 serializer, BL-007 repository, BL-008 REST subset, BL-010 typed operations, BL-013 browser, BL-015 General/Interconnection (elkjs in a worker; manual positions not yet), BL-019 requirements link, BL-022 units (subset), BL-041 help | Done (subset) |
| BL-003 official library loader, BL-006 implied specializations, BL-004 parser coverage, BL-009 validation vs. pilot, BL-011 oracle in CI | Partial (corpus measurement exists; no pilot oracle; no implied specializations) |
| BL-012 editor with completion, BL-014 schema-driven inspector, BL-016 matrices, BL-017 behaviour views, BL-021 coverage, BL-024 saved queries, BL-029 branch/diff UI | Next (Phase 2–3) |
| BL-018 KPAR, BL-020 Conceptualize/CAD links, BL-023 roll-ups, BL-025…BL-040 | Later phases |

Recommended next increments: (1) CR decisions and merge of the foundation; (2) Grid View matrices
(satisfy/allocate/connect) and requirement coverage (BL-016, BL-021); (3) Action Flow and State
Transition views (BL-017); (4) implied library specializations and the official library loader
(BL-003, BL-006); (5) editor with highlighting/completion (BL-012); (6) branch/diff UI and merge
(BL-029, BL-030).

## Handoff log

- 2026-10-14: research and architecture committed (c66a899, 48bf1ff); decisions sent to the coordinator.
- 2026-10-15: foundation (core ee0e27e, harness c663c9b, service 8e71031, client bc73337), modeling
  environment (tool c5af61f, a0f8e8e, 0fe8275, 57a06d4), workspace registration (89fa0bc) and
  COORDINATOR REVIEW commits (fa8dba7, d0c9405), requirements link (4620f3d), parser round 2
  (59c12db). Validation results and demonstration steps: see the final report and the commit after
  this file's update.
