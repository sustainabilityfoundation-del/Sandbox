# Agents: roles, context levels, model routing and controls

Owner brief: [context-optimization](../specifications/context-optimization.md). Evidence: [baseline](../status/context-baseline.md).
Decision: [ADR-0072](../decisions/0072-agent-context-management.md). Lifecycle and monitoring: [session-lifecycle.md](session-lifecycle.md).
Formats: [handoff-template.md](handoff-template.md). Recommendations and their status: [recommendations.md](recommendations.md). Agent definitions: `.claude/agents/`.

Principle: **cost follows context size** (97% of measured tokens were cache reads of long contexts), so the rules below keep
contexts small and move memory into version-controlled files. They never trade correctness, traceability or reproducibility
for tokens. The coordinator keeps architectural authority.

## 1. Context levels

| Level | Who | Holds | Does not hold |
| --- | --- | --- | --- |
| 1 Global | Coordinator | Vision, [architecture](../architecture.md), module ownership (AGENTS.md table) and contracts, [integration milestone](../specifications/integration-milestone-1.md), priorities, [ADR index](../decisions/README.md), integration status and blockers ([docs/status/](../status/README.md)) | Module implementation history, full progress files, screenshots, logs, source files |
| 2 Module | Module agent (`module-agent`) | Its brief, contracts, progress file, module AGENTS.md and docs page, the ADRs they link, contract files of the modules it depends on | Other modules' code or progress files |
| 3 Task | `task-worker`, `researcher`, `scout`, `reviewer` | The task statement and the named files | Anything not named; the coordinator's history |

Rules that make the levels real:
- Pass **links, not content**. A brief names files and sections; it does not paste them. Briefs stay under about 2k tokens.
- The coordinator reads status through `node scripts/status-digest.mjs` (about 8 KB for all modules, against about 250 KB of progress files) and opens a full progress file only to decide something specific.
- Each module agent keeps a short status block at the top of its progress file (see the handoff template) so a digest is enough.
- Read images only when the visual result is the subject. In the baseline, 13.2M of 15.2M characters returned to the coordinator were screenshots.
- Read a file once per session; re-read only after it changed. Use `scout` or Grep for "where is X", never a read-through.
- Code, test output and large results are summarised in the report with a link or command, not pasted.

## 2. Roles and read sets

| Role | Model | Reads first | Writes |
| --- | --- | --- | --- |
| Coordinator | Opus (architecture, integration, reviews) | AGENTS.md, [coordinator status](../status/coordinator.md), digest, the contract or ADR being decided | ADRs, integration plan, contracts, status |
| Requirements | module-agent | [brief](../specifications/requirements-management.md), [contracts](../specifications/requirements-contracts.md), [progress](../specifications/requirements-management-progress.md), [module](../modules/requirements.md) | `packages/tool-requirements`, `services/requirements`, `packages/requirements-client`, `packages/reqif` |
| Conceptualize | module-agent | [brief](../specifications/conceptualize.md), [contracts](../specifications/conceptualize-contracts.md), [progress](../specifications/conceptualize-progress.md), [module](../modules/conceptualize.md) | Conceptualize packages and service |
| Design Reasoning | module-agent | [brief](../specifications/design-reasoning.md), [governance](../specifications/design-reasoning-governance.md), [progress](../specifications/design-reasoning-progress.md), [modules/design-reasoning](../modules/design-reasoning/README.md) | Reasoning docs and code in its areas |
| CAD Modeler | module-agent | [brief](../specifications/cad-program.md), [contracts](../specifications/cad-program-contracts.md), [progress](../specifications/cad-program-progress.md), [modules/cad](../modules/cad/README.md) | CAD Modeler packages |
| System Model | module-agent | [brief](../specifications/sysml-program.md), [contracts](../specifications/sysml-program-contracts.md), [progress](../specifications/sysml-program-progress.md), [modules/sysml](../modules/sysml/README.md) | SysML packages and service |
| AI connection | module-agent | [brief](../specifications/ai-connection.md), [progress](../specifications/ai-connection-progress.md), [ai-interface](../modules/ai-interface.md) | `services/assistant`, settings, assistant logic |
| Project Management | module-agent | [brief](../specifications/project-management.md), [contracts](../specifications/project-management-contracts.md), [progress](../specifications/project-management-progress.md), [modules/projects](../modules/projects/README.md) | Project packages |
| UI / design system | module-agent | [brief](../specifications/ui-focused-canvas.md), [contracts](../specifications/ui-focused-canvas-contracts.md), [progress](../specifications/ui-focused-canvas-progress.md), [design system](../modules/design-system/README.md) | `packages/design-system`, shell |
| Context optimization | module-agent | [brief](../specifications/context-optimization.md), [progress](../specifications/context-optimization-progress.md) | `docs/agents`, `docs/status`, `.claude/`, governance sections |

Package ownership is the table in the root [AGENTS.md](../../AGENTS.md#ownership); this page does not restate it.

## 3. Model routing

Only models available in this environment: `opus`, `sonnet`, `haiku` (Claude Code also lists `fable`, not used here).
All 14 agents in the baseline ran on Opus. The policy below is the owner's, applied to this project; the reliability of the
mid-tier model on this repository was **not measured** (see [limitations](../status/context-baseline.md)), so the first sprint on
Sonnet is a trial that the coordinator reviews before the routing is widened.

| Agent (`.claude/agents/`) | Model | Use when | Limits |
| --- | --- | --- | --- |
| coordinator session | Opus | Architecture, contracts, ADRs, integration decisions | Fresh session per milestone or at 70% context |
| `architect` | Opus | A design question needs options and a recommendation (ADR drafts, SDK or contract changes, integration plans) | Read-only, 30 turns, no sub-agents |
| `reviewer` | Opus | Critical review of a diff, contract or ADR before merge | Read-only, 25 turns |
| `module-agent` | Sonnet | A module sprint with an agreed brief; one per module, one sprint each | `autoCompactWindow` 350k; max 3 at once |
| `task-worker` | Sonnet | One bounded task with named files and checks (fix, tests, docs) | 40 turns, no sub-agents |
| `researcher` | Sonnet | A survey or standards/tool question that ends in a note under `docs/research/` | 30 turns; Write only for the note |
| `integration-runner` | Sonnet | Running check, DB suites, builds, e2e; the caller needs only a table | One suite at a time, 30 turns, cannot edit |
| `scout` (searcher) | Haiku | Where is X defined or used; list or count files | Read-only, 15 turns, `path:line` answers |
| `triage` | Haiku | A log or test output file must be reduced to failing tests and first errors | Read-only, 12 turns |

Do not switch model inside a running task; choose when launching. A module agent that repeatedly fails on a hard design question
reports it to the coordinator instead of retrying on a dearer model by itself. Escalation is the coordinator's decision.

## 4. Controls against duplicate work, parallelism and loops

1. **Assignment register.** Before launching an agent the coordinator checks [docs/status/coordinator.md](../status/coordinator.md) (section "Assigned work") for an agent already on the topic, and adds a row. Agents check their own progress file and `git log` for the topic before starting.
2. **Parallelism budget.** At most 3 module (implementation) agents plus 3 helpers run at the same time (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=6` in `.claude/settings.json` caps total concurrency); more only when the owner asks. Eight concurrent agents caused a load-induced test timeout (commit 1b1c984) and a merge queue at the coordinator; see [recommendations](recommendations.md). Parallel agents need separate worktrees and files, as in the [workflow](../development-workflow.md#5-agent-coordination).
3. **Nesting.** Depth limited to 2 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`); helpers cannot start agents (`disallowedTools: Agent`).
4. **Retry limit.** Three attempts at the same step, then stop and report the blocker with the evidence. No sleep-and-retry loops.
5. **Turn limits.** `maxTurns` is set on every helper definition (15 to 40).
6. **One research question, one note.** Research goes to `docs/research/<topic>/` and is cited afterwards; the next agent reads the note, it does not repeat the survey.
7. **Sprint check.** Before the second parallel agent is launched in a sprint, the coordinator states what finishes sooner because of it; otherwise run sequentially (a measured 8 concurrent near-1M contexts is the most expensive configuration available).

## 5. Reports to the coordinator

Compact status report (about 300 words plus links), at checkpoints and when blocked, under 300 words: use the **Task report** section of the
[handoff template](handoff-template.md). Link progress file sections instead of copying them.

## 6. Where things are kept

| Need | Location |
| --- | --- |
| Architecture, vision, roadmap | [architecture.md](../architecture.md), [architecture-vision.md](../architecture-vision.md), [roadmap.md](../roadmap.md) |
| Decisions | [docs/decisions/](../decisions/README.md) |
| Interface contracts | `docs/specifications/*-contracts.md` and [docs/modules/](../modules/) (the project's existing homes; there is no separate `docs/interfaces/`) |
| Module status and handoffs | `docs/specifications/*-progress.md` (module-owned), [docs/status/](../status/README.md) (coordinator and cross-module) |
| Agent roles and rules | this directory |

## 7. Verification and visual checks without loading output into context

- **Verification table.** `npm run verify -- typecheck test db build e2e` (`scripts/verify.mjs`) runs the steps one after another, prints a pass/fail table by exit code with durations and the first failing lines, and exits 1 on failure. `db` runs every `*:test:db` script; `all` is typecheck, test, db and build. The `integration-runner` agent wraps it; use `triage` for an existing log file. Run suites sequentially: concurrent suites caused a load-induced timeout.
- **Visual comparison (implemented as a helper, adoption proposed).** `tests/e2e/lib/visual.mjs` exports `compareToBaseline(page, name, { maxDiffRatio, perChannelTolerance })`. It screenshots the page, decodes the committed baseline `tests/e2e/baselines/<name>.png` and the new image in a blank browser page (no new dependency), and returns `{ status, diffRatio, diffPixels, width, height }`; on failure it saves the current and a red-highlight diff image to a scratch folder. Defaults: tolerance 8 per channel, 0.2% of pixels. The first run, or `UPDATE_BASELINES=1`, writes the baseline. Flows report the returned numbers; nobody reads the images unless a diff fails and the visual result is the question. Tested on a synthetic page (identical: ratio 0; 40x100 px change: 4000 pixels). Decisions for the owner or coordinator: commit baselines only after owner approval of the look (they change with the design system); fonts and antialiasing differ by machine, so baselines are valid only for the same Chrome build and OS, which suggests keeping them for one reference environment (CI or one machine); no existing flow uses it yet.
- **Generated reference documentation (proposed).** Operation and API reference pages should be generated from the OpenAPI documents and the operation schemas (`services/*`, the operation inventories) into the modules' `help/` and `docs/modules/` references, with a test that fails when the generated output is stale, instead of agents writing and updating the same text twice. Not built: it needs an audit of which pages repeat schema content, and the owning agents' help manifests (`apps/workspace/src/help/help.test.ts`) define what the generator must emit. Smallest first step: one module (the AI operation inventory) as a pilot.

## Open-source first (every agent)

Owner directive: [open-source strategy](../architecture/OPEN_SOURCE_STRATEGY.md). Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation, using the [evaluation template](../architecture/open-source-evaluation-template.md). Reviewers check it before a capability is accepted.
