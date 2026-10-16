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
| Baseline verification of main (586c635) | integration-runner role (Sonnet) | main checkout, no e2e on 5173/8787 | running |
| Open item 1: registration manifests, design plan | architect role (Opus), read-only | — | running; plan to be recorded in [module-registration.md](../specifications/module-registration.md) |
| Open item 4: ai-fake-provider last step | task-worker role (Sonnet) | isolated worktree, branch fix/fake-provider-drill-constraints | running; not merged until verified |

Note: `.claude/agents` definitions load only when the session starts in the repository folder; a session started elsewhere
uses built-in agent types with the same model and the definition file as instructions.

Next work (start as new agents, at most 2-3 implementers at once):

## Open items (priority order)
1. **Per-module registration manifests** (owner-approved architecture change): [spec](../specifications/module-registration.md); one architect agent (Opus).
2. **D1 owner acceptance**: ask the owner to try D1 (or review the live run); record acceptance only in the owner's words.
3. **SDK 1.9**: Conceptualize's ConceptsService additions (definition, getHandoff, listHandoffs, revisionStaleness; exact TypeScript in conceptualize-progress.md, "Visual concept exploration") and CR-PM-SDK-4 FilesService (exact TypeScript in project-management-progress.md). Then remove the interim handoff port block in apps/workspace/src/platform/services.ts.
4. **Fix**: tests/e2e/flows/ai-fake-provider.mjs last step fails, "Prepare draft requirements failed: CON-030 has no quantified constraints" (drill demo plan fixture apps/workspace/fixtures/demo-plans/drill-bit-holder.json vs conceptualize.propose_requirement).
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
Running state of the module agents; whether all module branches are fully merged (branch heads equal main, so the code is, but their later local work is unknown); real test status on main (no suite was run for this record).
