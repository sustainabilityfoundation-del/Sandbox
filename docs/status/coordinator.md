# Coordinator: session handoff (16 October 2026, `feature/context-optimization` based on main d146f22)

Written by the context-optimization agent from `docs/specifications/*-progress.md` and `git log`; items marked **unconfirmed** were not
determinable from the repository and need the coordinator's correction. The coordinator session that existed before this file was at
898k tokens (90% of 1M) after 6 compactions.

## First message to send in the fresh coordinator session (paste)
> You are the coordinator of this repository. Read AGENTS.md, then docs/status/coordinator.md, then run `node scripts/status-digest.mjs` and `git log --oneline -15 main`. Do not read whole progress files, screenshots or module source; use the scout, integration-runner and reviewer agents (.claude/agents). Confirm the "Assigned work" table with me, then continue demonstration D1 per integration-milestone-1.md. Keep each report to about 300 words plus links, and write decisions to the repository before context passes 70%.

## Mission and priority
AI engineering platform (monorepo). Primary objective: [demonstration D1](../specifications/demo-ai-engineering.md), the smallest
end-to-end AI-driven workflow (concept, requirements, system model, CAD, STEP) within
[integration milestone 1](../specifications/integration-milestone-1.md). Milestone work D1 does not need waits. E-ASSURE is deferred
([ADR-0070](../decisions/0070-development-assurance-boundaries.md)). Rules: [AGENTS.md](../../AGENTS.md). Context rules: [docs/agents](../agents/README.md).

## State (main d146f22; digest: `node scripts/status-digest.mjs`)
| Area | Branch | State | Evidence |
| --- | --- | --- | --- |
| Requirements | feature/requirements-management | Stages 1-7 done; assistant operations `requirements.get`, `get_conventions` added | [progress](../specifications/requirements-management-progress.md) |
| Conceptualize | feature/conceptualize | Visual exploration merged; SDK 1.9 ConceptsService proposal open | [progress](../specifications/conceptualize-progress.md) |
| Design Reasoning | feature/design-reasoning | Real-service checkpoint documented; HTTP binding and two scenarios implemented | [progress](../specifications/design-reasoning-progress.md) |
| CAD Modeler | feature/cad | Parametric foundation, fillet/chamfer, concept handoff items 2-3 done | [progress](../specifications/cad-program-progress.md) |
| SysML Modeler | feature/sysml | Sprint 3 (milestone 1) ready for coordinator review | [progress](../specifications/sysml-program-progress.md) |
| AI connection | feature/ai-connection | Ready for owner review; real ChatGPT sign-in and live-model run need the owner's account | [progress](../specifications/ai-connection-progress.md) |
| Project Management | feature/project-management | Increment I1 ready for coordinator review; I2-I5 open | [progress](../specifications/project-management-progress.md) |
| UI Focused Canvas | feature/ui-focused-canvas | Phases 1-4 done, phase 5 (assistant panel) docs committed; 3 commits ahead of main; agent running | [progress](../specifications/ui-focused-canvas-progress.md) |
| Context optimization | feature/context-optimization | Phases 1-7 in progress (this work) | [progress](../specifications/context-optimization-progress.md) |

Branch check at d146f22 (measured with `git rev-list` and `git status` in each worktree): the seven module branches have no commits that main lacks and no uncommitted files (they are 30-241 commits behind main, last commits 15-16 Oct); `feature/ui-focused-canvas` is 3 commits ahead of and 3 behind main with no uncommitted files. Which module agents are still running besides ui-ux-design-system: **unconfirmed**. Main also holds the owner approval of the recommendations (brief section B) and the per-module registration manifests specification (scheduled after the UI merge).

## Decisions in force
[ADR index](../decisions/README.md) (55 ADR files; newest 0070 assurance boundaries, 0071 browser data import, 0072 agent context management, proposed).
Many module ADRs are still "Proposed" for coordinator review (list in the ADR index). Owner decisions on design reasoning: operational autonomy only.

## Assigned work
| Agent | Task | Worktree |
| --- | --- | --- |
| ui-ux-design-system | Focused Canvas UI phase 5-6 | Sandbox-ui |
| context-optimization | This work | Sandbox-context |
| Others | **unconfirmed** (module agents may be idle or finished) | Sandbox-{ai,cad,conceptualize,projects,reasoning,requirements,sysml} |

## Open items and blockers
1. Review SysML sprint 3 and Project Management I1 checkpoints (progress files).
2. Decide the proposed ADRs and SDK 1.9 ConceptsService proposal.
3. Owner acceptance of the AI connection (needs the owner's ChatGPT account); never record acceptance without the owner's words.
4. Review [recommendations](../agents/recommendations.md) (items 5, 8, 9, 10 need decisions; item 7 needs a one-line `package.json` script).
5. Merge `feature/ui-focused-canvas` (3 commits), then schedule per-module registration manifests (owner-approved, not started).
6. Merge `feature/context-optimization` when approved; module worktrees pick up `.claude/` agents and hooks after the merge (running sessions need a restart).

## Next actions
1. Read this file, then `git log --oneline -15 main` and the digest. 2. Confirm the assigned-work table. 3. Continue D1 integration per the milestone plan.

## How to resume
Read in order: AGENTS.md, this file, the digest, then only the contract or ADR relevant to the decision at hand. Do not load whole progress
files, screenshots or module source. Delegate verification to `integration-runner`, lookups to `scout`.

## Not yet verified
Running state of the module agents; whether all module branches are fully merged (branch heads equal main, so the code is, but their later local work is unknown); real test status on main (no suite was run for this record).
