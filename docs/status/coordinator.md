# Coordinator: session handoff (16 October 2026, updated by the coordinator after merging all branches)

Maintained by the coordinator. Updated 16 October 2026 after all branches were merged; the previous coordinator session ended at about 90% of its context window.

## First message to send in the fresh coordinator session (paste)
> You are the coordinator of this repository. Read AGENTS.md, then docs/status/coordinator.md, then run `node scripts/status-digest.mjs` and `git log --oneline -15 main`. Do not read whole progress files, screenshots or module source; use the scout, integration-runner and reviewer agents (.claude/agents). Re-create the owner-approved hourly check-in described under "Owner rules to keep", then work through "Open items" in order (start with the per-module registration manifests), keeping demonstration D1 the priority. Keep each report to about 300 words plus links, and write decisions to the repository before context passes 70%.

## Mission and priority
AI engineering platform (monorepo). Primary objective: [demonstration D1](../specifications/demo-ai-engineering.md), the smallest
end-to-end AI-driven workflow (concept, requirements, system model, CAD, STEP) within
[integration milestone 1](../specifications/integration-milestone-1.md). Milestone work D1 does not need waits. E-ASSURE is deferred
([ADR-0070](../decisions/0070-development-assurance-boundaries.md)). Rules: [AGENTS.md](../../AGENTS.md). Context rules: [docs/agents](../agents/README.md).

## State (coordinator-verified, 16 October 2026)
All module branches are merged into main; no module agent is running. The old coordinator session (7c17f988…) ends after
this handoff; its subagents cannot be messaged from a new session, so start new, short-lived agents (.claude/agents) briefed
from the repository.

| Area | State | Evidence |
| --- | --- | --- |
| D1 demonstration | Live run with the owner's real model (ChatGPT plan, gpt-6.1-sol, dev user eli) completed all 9 steps on the real services in project 9ae9a5ad-e5f1-4fb8-ba59-77ab126a8864 (DRILL-BIT-HOLDER-D1), then survived a service restart and reopened in a fresh browser. Gaps found were fixed and merged (empty optional arguments, ChatGPT-route stream parsing, requirement refusal details, SysML links in one proposal, CAD re-bind). **Owner acceptance not yet given.** Plumbing replay: tests/e2e/flows/demo-d1.mjs (fake provider) | [D1](../specifications/demo-ai-engineering.md), [live-run guide](../modules/ai-interface/d1-live-run.md) |
| Visual concept exploration | Merged: engineering definition, layouts, annotations, refinement, comparison cards, staleness, CAD handoff; CAD starts a part from a handoff. Images: **owner decision, layouts only** (service built, off) | [brief](../specifications/concept-visualization.md), [contracts §6](../specifications/concept-visualization-contracts.md) |
| Focused Canvas UI | Phases 1-6 merged (design system 1.1.0, shell, workspace frame, AI Assistant panel) | [progress](../specifications/ui-focused-canvas-progress.md) |
| Context optimization | Merged: .claude/agents, hooks, status line, verify script, this handoff | [brief §B](../specifications/context-optimization.md), [docs/agents](../agents/README.md) |
| Project Management | I1 plus D1 items merged; I4 (baselines, export/import) waits for D1 acceptance | [progress](../specifications/project-management-progress.md) |

## Assigned work
Coordinator session resumed 16 October 2026 (fresh session; hourly check-in recreated, :13 past each hour).

| Item | Agent | Where | State |
| --- | --- | --- | --- |
| Baseline verification of main (586c635; same code as 595b376) | integration-runner role (Sonnet) | main checkout | done: typecheck, unit (1244), db:req (458, after one load-related rerun), db:concept (86), db:reasoning (15), db:cad (39), db:projects (31), db:ai (64), build all pass; e2e not run (verify.mjs targets 5173/8787) |
| Open item 1: registration manifests, design plan | architect role (Opus), read-only | — | done; plan and decisions in [module-registration.md](../specifications/module-registration.md); owner decisions (a)-(c) pending; implementation after SDK 1.9 |
| Open item 3: SDK 1.9 (ConceptsService additions, FilesService) | task-worker role (Sonnet) | merged to main via integrate/codex | done: review (Opus) merge; integration run green (see below). Interim handoff port removed. Optional follow-ups: services.ts:1 `type` imports, services.ts:136 listHandoffs swallows errors, `as never` casts (services.ts:132-140, tool-cad-modeler handoff.ts:62-63); project-management-progress.md:349-353,420 still describes stageFile (PM owner) |
| Open item 4: ai-fake-provider last step | task-worker role (Sonnet) | worktree branch | done, merged 75c9919: fixture now writes quantified concept statements; flow passed on fake ports 18787/15173/54399 |
| Open item 5: Codex PRs #4-#7 (CX-001..004) | reviewer role (Opus) | merged to main via integrate/codex | done with owner agreement (16 October 2026): #4, #6 (+ wording fixes), #5 (+ generated docs/reference pages) merged; #7 to be closed on GitHub by the owner (no gh CLI here); CX-004 rewritten to send-only |

Note: `.claude/agents` definitions load only when the session starts in the repository folder; a session started elsewhere
uses built-in agent types with the same model and the definition file as instructions.

Next work (start as new agents, at most 2-3 implementers at once):

| Integration run on integrate/codex (4e3239f) | integration-runner role (Sonnet) | main checkout | green: typecheck, unit 1255, all six DB suites, build, e2e demo-d1 and ai-fake-provider on fake ports 18787/15173/54399 |
| Owner request: remove top workspace tabs (keep left), tab Inspector and AI Assistant in one right panel | module-agent role (Sonnet), UI | merged to main via integrate/ui | done: typecheck, unit 1265, all DB suites, build, 14 e2e flows pass on fake ports. Not checked: tablet, dark theme, compact density screenshots. Two e2e flows fail independently of the UI change (help.mjs expects no SysML docs since PR #6; concept-visual refusal reason undefined): fix assigned |
| Open item 1, increment I1: SDK 1.10 module manifest types | task-worker role (Sonnet) | merged to main | done: typecheck, unit (after one load-related rerun), build pass. Known flaky test under load: packages/tool-sysml-modeler/src/tool.test.ts CodeMirror completion (20 s timeout), seen twice |
| Open item 1, increment I3: API host module list, createPolicy, SDK 1.11.0 | task-worker role (Sonnet) | merged to main 125e466 | done after Opus review fixes (start order restored: visualization after assistant, ServerModuleManifest.phase); integration run green: unit 1272, all DB suites, build, all 16 e2e flows, concept-visual and visualization after an API-only restart |
| Open item 1, increment I2: workspace installed modules | task-worker role (Sonnet) | merged to main | Opus review: merge (160 capability entries identical by script; rail, default-open and help order unchanged). Coordinator accepts one visible change: projects entries now listed last in the Coverage dialog. Follow-up for M1: proof test should assert helpSources() (workspaceHelp.ts:60) and run the real capability checks; make workspaceHelp use collect().help. Integration run green: unit 1279, all DB suites, build, 16/16 e2e |
| Recurring failure of services/projects/test/acceptance.i1.test.ts | task-worker role (Sonnet) | merged to main | done, test-only: the artifact registry is eventually consistent (ADR-0062); the reference snapshot was taken before all 10 artifacts were registered (counts.artifacts 7 or 9 vs 10). The test now waits for all 10; strict toEqual unchanged. Repro 2/24 failures before, 0/24 under four-way load and 0/10 alone after |
| Open item 1, step M1: projects pilot | task-worker role (Sonnet) | merged to main 4f11cfb | done after Opus review fixes (AI settings order identical via fixed presentation order; SDK 1.12.0 ServerModuleDescriptor, proposals; M-step recipe in module-registration.md). Integration run green: unit 1281, all DB suites, build (notice ships), 16/16 e2e. Owner question: projects.* reads classify as propose (unchanged) |
| Open item 1, steps M2 (conceptualize) and M3 (sysml-modeler) | task-worker role (Sonnet), one each | merged to main | done: Opus reviews merge (identity by script; classify differs on 0 of 83 operations; policy decisions identical). Coordinator resolved five conflicts (union of deletions; M3 test line). Recipe corrections in module-registration.md. Integration run green: unit 1287, all DB suites, build, 16/16 e2e. Note for F: services/assistant/test/env.ts imports ../../api/src (pre-existing pattern, extended in M2) |
| Open item 1, step M4 (cad-modeler) | task-worker role (Sonnet) | merged to main | done: Opus review approve (identity by script, classify differs on 0 of 83). Known weak assertion: services/api/src/modules.test.ts CAD settings length > 0 (exact check would need a cad-client dependency) |
| Open item 1, step M5 (visualization, server only) | task-worker role (Sonnet) | merged to main | done: manifest object only (no legacy entries); phase after-host unchanged. Integration run with M4 and OSS-2 green: unit, all DB suites (db:req after one load-related Windows EPERM rerun), build, deps register current, licence check, SBOM, 16/16 e2e, API-restart reruns |
| CT-2a: SDK 1.13.0 registry contract, CommandBar, harness | task-worker role (Sonnet) | worktree branch feature/ct-2a-registry-contract | running |
| Flaky tool-sysml-modeler completion test (20 s timeout under load) | task-worker role (Sonnet) | merged to main | done, test-only: dynamic imports in the test body moved to static imports (87 ms to 17 ms; assertions and timeout unchanged). Likely cause, not proven: the 20 s stall was not reproduced; if it recurs, look at per-file transform cost under load |
| Fix e2e help.mjs (stale after PR #6) and concept-visual refusal reason | task-worker role (Sonnet) | merged to main | done, test-only: help.mjs expects SysML/CAD help; concept-visual was not refused because the fake stack registers the test-only fake-test image adapter (server.ts:312, never in production), so the flow hides test-only adapters for the refusal check. help, concept-visual, platform, demo-d1 and npm run check pass |
## ADR triage (16 October 2026, architect, read-only; not yet decisions)
Index repaired: 0049, 0060-0069 and 0071 were missing from docs/decisions/README.md. Triage was based on reading 0027 and 0030 in full
and the rest by targeted search, so each acceptance still needs the ADR read against main (one reviewer pass per group).
- Coordinator may accept after that check: 0013, 0020, 0022-0026, 0030-0038, 0048, 0049, 0060-0063, 0066, 0068, 0072; 0021 too unless
  licence or hosting cost matters to the owner. Defer: 0039-0046 (design reasoning, phase B), 0064, 0067, 0069, 0071 (not built).
- Owner decisions: 0027 phase 4 (hide the mock CAD tool; data stays readable), 0047 account terms, 0065 retention and deletion,
  and whether to write an ADR retiring the illustrative SysML tool (none exists; ADR-0030 line 20 defers it).
- Spec gap: I2 put the illustrative sysml and cad tools in INSTALLED_MODULES (installedModules.ts:51-52, defaultOpen), contrary to
  module-registration.md "stay where they are"; no M-step covers them. Fix the spec after M1 merges; ADR-0027 phase 4 and any SysML
  retirement become "flag or drop the manifest entry", keeping the cad and sysml IDs (demo-d1.mjs:202 checks cad).
Coordinator decisions after two full reviews against main 186db1c (16 October 2026): **accept with factual amendments** 0020,
0022-0026, 0030-0036, 0038, 0048, 0049, 0060-0062, 0066, 0068, 0072 (merged to main 46e9f2a; 22 ADRs incl. 0034 and 0049 without amendments). **Keep Proposed**: 0013
(registry not built); 0021 (technically sound; owner: LGPL-2.1 suitability and 23 MB WASM hosting cost; the required licence notice now ships as apps/workspace/public/THIRD_PARTY_NOTICES.txt; OCCT 7.6 series inferred); 0037 and 0063 (conflict with AGENTS.md identity rules: second server record with alias for
ACT-100/ROD-120; SysML-to-product links by metadata instead of represents) need an architecture decision. AGENTS.md is out of date on
tools importing their own module packages: recorded as an exception pending owner decision (a).

## Open-source-first directive (owner, 16 October 2026; standing requirement)
Recorded in [OPEN_SOURCE_STRATEGY.md](../architecture/OPEN_SOURCE_STRATEGY.md); mandatory section in AGENTS.md; propagated to every package AGENTS.md
(with its section 10 domain assignment), the .claude/agents definitions, docs/agents/README.md and the sprint template;
[evaluation template](../architecture/open-source-evaluation-template.md) published. D1 and the manifest migration keep priority.
Backlog (tracked here until done):
- OSS-1 Section 12 assessment: done, recorded in [open-source-assessment-2026-10.md](../architecture/open-source-assessment-2026-10.md)
  (no GPL/AGPL in the lockfile; OCCT LGPL ships to browsers; notices incomplete; backlog OSS-6..17, owner decisions OSS-7, 13, 14, 17).
- OSS-2 done on branch infra/oss-register-sbom (aa2a66b, ADR-0073 Proposed): npm built-ins for SBOM and audit, own policy layer, register.json
  from the lockfile, CI licence check. 578 preferred, 17 conditional, 0 restricted, 1 unknown (webgl-constants, MIT text, pending); 15 entries
  pending review incl. OCCT (ADR-0021). npm audit: 14 advisories, 1 high (follow-up OSS-18). Merged with M4/M5 after the green integration run.
- OSS-6 and OSS-18 merged: generated THIRD_PARTY_NOTICES.txt (33 shipped packages; npm run notices, --check); audit triage in
  docs/dependencies.md: all 14 advisories from @scalar/api-reference (services/api), high one (undici) not reachable in the shipped
  product. OSS-19: raise that pin once a fixed release (1.75.0, 16 Oct) is two weeks old (about 30 October). Line-ending fix: the
  register test ignores CRLF; .gitattributes keeps generated files LF.
- CT-2a merged (c094b12) with M6, after a green run: unit 1369, all DB suites, build, deps checks, harnesses, CommandBar
  browser tests 11, 16/16 e2e. Evidence rule: bound entries without verifiedBy stay partial everywhere (evidenceGaps labels them).
  Notices generator fixed to write LF and compare content.
- OSS-3 Module assessments (Phase 2), one per module agent, in priority order set by OSS-1; each ends in an ADR and backlog entries.
- OSS-4 Shared integration interfaces (solver, geometry, simulation, visualization) documented, after OSS-1.
- OSS-5 Upstream contribution workflow: nothing is published without explicit owner authorization.

## Capability-complete toolbars directive (owner, 16 October 2026; standing requirement)
Recorded in [CAPABILITY_TOOLBARS.md](../architecture/CAPABILITY_TOOLBARS.md); mandatory section in AGENTS.md; one line in every package AGENTS.md,
the module-agent and reviewer definitions. Implemented by extending the manifest capability inventory (and ADR-0013), not a second registry.
Backlog: CT-1 done: [capability-registry.md](../specifications/capability-registry.md), ADR-0074 accepted (amends ADR-0013). CT-2a (SDK 1.13.0 contract,
CommandBar component) next when an implementer slot frees; CT-2b (checks, shell, palette, AI list_capabilities, strict policy, Requirements
pilot) after M6 and F. Owner decisions: how much planned scope to show; inventories for the mock and illustrative tools. CT-3..n per-module inventories and toolbars (module agents, after CT-2;
research feeds OSS-3). D1 keeps priority.

## CAD sprint C1 status (16 October 2026)
Implemented on cad/c1-sketching-reliability (4e403d8, includes OSS-9). Review (Fable) blocked the merge: the new face-naming rule
(OcctKernel.ts inheritNames) silently moves a stored fillet to another edge when a saved 1.3.0 document is opened (reproduced:
46 mm strip at x=37 becomes 10 mm strip at x=5). Fix running: probe-containing piece keeps the name, others get ~k; old-format
fixture test from main; ADR-0075 corrected. C1 merges only after the fix, a re-review of the naming and an integration run.

## Owner focus (16 October 2026)
Owner: "focus on getting the cad working better woth more functionality". CAD Modeler work takes priority after D1: a CAD sprint plan is recorded in
[cad-sprints-c1-c3.md](../specifications/cad-sprints-c1-c3.md): C1 sketching by clicks and reliability (after OSS-9 merges), C2 part features
(holes, mirror, circular pattern, shell, draft, body booleans), C3 measurement, STEP import, STL, loft and sweep. Owner decisions listed there.

## Integration queue (16 October 2026, 22:15 EDT)
Integration runs use the separate worktree ../Sandbox-integration; the main checkout stays on main (the owner's dev server).
Order (reviewer): (1) ui/retire-illustrative-rename-system-model (approved; review fixes in, main merged at 3dc5291);
(2) feature/ct-2c2-sdk (contains CT-2c1 2b0e82c; approved, required fixes and browser-test robustness running);
(3) cad/c1-sketching-reliability (OSS-9 + C1; naming fix re-review approved at 5c64c5a/23d2014; follow-ups: probe-less `~k`
names can still move on a later split, fixture regeneration note, worker details test). One full integration run per step.
AI infrastructure: brief and plan on main; commercial research merged (cbfc4a4); increment A (contract, registries, ledger)
running on feature/ai-infra-a-core; B and C after A; ADRs 0078-0080.

## Merging to main (owner, 16 October 2026)
Owner: "I take bake the command to not push to main. It is ok for you to automatically do this." The coordinator merges verified
work to main automatically again (after review where required and a green integration run); feature branches stay the working
model for agents. The AI infrastructure brief's "never push directly to main" is withdrawn.

Fable usage limit reached at about 19:45 EDT; the Fable window ended at 21:45. Stopped Fable work was preserved (C1 naming fix
committed 5c64c5a; CT-2c2 snapshot committed) and continues on the normal routing.

## Model routing override (owner, 16 October 2026)
Owner: "Can you switch to fable for a sprint to maximize usage for this week?" All newly started agents use Fable
(`model: fable`) until 21:45 EDT on 16 October 2026 (owner: "It resets in 3 hours so only run fable until then"), instead of the AGENTS.md routing (Opus review and architecture, Sonnet
implementation and runs). Agents already running keep their model. Reviews and integration runs still gate every merge. The
coordinator's own model is switched by the owner with /model.

## Owner decisions, 16 October 2026 (owner's words in the session)
- Old illustrative tools: "Yes remove the two old ones" (hide from UI and AI; data and IDs kept). Running on branch
  ui/retire-illustrative-rename-system-model, ADR-0076.
- "change the SysMl Menu to System Model, I think it's better to have it agnostic of the underlying language" (display name only;
  IDs unchanged). Same branch.
- CAD name: "yes leave it CAD" (display "CAD", dropping "Modeler", after sprint C1 merges).
- Toolbars: "That's what the toolbars shoul be like", referring to the No Magic user interface
  (https://docs.nomagic.com/spaces/MD2021xR2/pages/82747994/Understanding+the+user+interface). Interpreted as structure and
  completeness (main menu, main toolbar, contextual diagram palettes, browser, specification panel) in our design system;
  confirmed by the owner ("yes please do that"). Feeds CT-2b (CommandBar may need a menu bar and a vertical palette) and the per-module
  inventories. Research merged (System Model 155 commands, CAD 206). CT-2c amendment accepted in
  capability-registry.md (menu bar, palettes, context sets, edit sessions, split buttons, panels; SDK 1.14, design system 1.3).
  Order: F, CT-2b, CT-2c1-3, then CT-3 System Model and CAD. CT-2c1 (design system components) started.
- Module migration M1-M6 complete; next step F (cleanup), then CT-2b.

## Open items (priority order)
1. **Per-module registration manifests** (owner-approved architecture change): [spec](../specifications/module-registration.md); one architect agent (Opus).
2. **D1 owner acceptance** (16 October 2026: the owner has no time now and will review D1 later; keep working on the other items meanwhile, do not ask again until the owner returns): ask the owner to try D1 (or review the live run); record acceptance only in the owner's words.
3. ~~SDK 1.9~~ merged 16 October 2026. Was: **SDK 1.9**: Conceptualize's ConceptsService additions (definition, getHandoff, listHandoffs, revisionStaleness; exact TypeScript in conceptualize-progress.md, "Visual concept exploration") and CR-PM-SDK-4 FilesService (exact TypeScript in project-management-progress.md). Then remove the interim handoff port block in apps/workspace/src/platform/services.ts.
4. ~~Fix ai-fake-provider last step~~: done (75c9919).
5. **Codex tasks** CX-001..004 in [docs/codex](../codex/README.md): review and merge the owner's Codex pull requests; add new isolated tasks there.
6. Proposed ADRs awaiting review (ADR index), incl. mock CAD replacement ADR-0027 and the SysML illustrative-tool retirement.
7. UI follow-ups listed in ui-focused-canvas-progress.md §6 (units in status bar, per-tab close, context menus).

## Owner rules to keep
- Never let automated runs reach the owner's connected AI account: e2e flows use `demoAssistantContext` (tests/e2e/lib/env.mjs); fake-provider runs use their own ports and database folders, never 5173/8787.
- No live image generation (owner decision). No use of the owner's account beyond what the owner agreed.
- Recreate the hourly check-in (CronCreate, owner-approved on 15 October 2026) in the new session: resume stopped agents, merge verified checkpoints, continue the plan, owner decisions stay with the owner.
- The owner runs the local site with `npm run dev` at http://localhost:5173/workspace/.

## How to resume
Read in order: AGENTS.md, this file, the digest, then only the contract or ADR relevant to the decision at hand. Do not load whole progress
files, screenshots or module source. Delegate verification to `integration-runner`, lookups to `scout`.

## Not yet verified
Resolved 16 October 2026: all nine feature branches have 0 commits ahead of main and their worktrees are clean.
Running state of the module agents; whether all module branches are fully merged (branch heads equal main, so the code is, but their later local work is unknown); real test status on main (no suite was run for this record).

Update 16 October 2026 (fresh session): unit, DB suites and build verified green on main (see Assigned work). Watch item:
`services/projects/test/acceptance.i1.test.ts` (I1 restart acceptance) failed once with a deep-equal mismatch while another
worktree ran suites in parallel and passed on rerun; if it recurs, check for a timing-dependent field. Gap: `verify.mjs` has no
e2e mode on fake-provider ports, so e2e on main is only covered by agents that start their own stack.
