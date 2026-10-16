# Multi-agent context and token optimization: brief (owner's text, verbatim)

Received 16 October 2026. Coordinator notes: §A at the end. Progress: [context-optimization-progress.md](context-optimization-progress.md).

---

Claude Code Command — Audit and Optimize Multi-Agent Context Usage

Objective

Audit the entire multi-agent development environment for unnecessary token consumption, context duplication, inefficient agent orchestration, and excessive use of expensive AI models.

The current coordinating session has consumed approximately 884k of its 1M-token context window. This raises concerns about context efficiency, particularly as the project grows.

Spawn a dedicated Context & Token Optimization Agent to investigate and implement improvements. The existing coordinating agent must retain overall architectural authority.

This task must not interrupt or compromise ongoing engineering tool development.

Phase 1 — Audit Current Architecture

Inspect the repository, Claude configuration, agent definitions, CLAUDE.md files, agent instructions, hooks, MCP configurations, and available session usage information.

Determine:

1. How many agents are configured and how many are actively running.
2. Whether subagents receive unnecessarily large context payloads.
3. Whether architecture documents are repeatedly loaded by multiple agents.
4. Whether agents duplicate source-code inspection, research, testing or documentation.
5. Whether the coordinator retains excessive historical information.
6. Whether agent outputs contain unnecessary verbose information.
7. Whether expensive models are being used for tasks that less expensive models can reliably perform.
8. Whether conversation compaction and session handoffs are configured effectively.
9. Whether agents unnecessarily reread files or repeatedly regenerate large outputs.
10. Whether parallel agent execution increases total token consumption without proportional productivity improvements.

Use actual usage data where available. Where token-level telemetry is unavailable, explicitly identify the limitation and use clearly labelled estimates rather than invented measurements.

Produce a baseline report before implementing changes.

Phase 2 — Optimize Agent Context Architecture

Implement a hierarchical context-management strategy.

Level 1 — Global Context

The coordinating agent should retain only:

- Project vision and primary objectives.
- High-level system architecture.
- Module ownership and interface definitions.
- Current development priorities.
- Critical architectural decisions.
- Integration status and blockers.

Avoid loading detailed implementation history from every module into the coordinator.

Level 2 — Module Context

Each module agent should receive:

- Its module-specific architecture.
- Relevant API and interface contracts.
- Applicable development standards.
- Current tasks and acceptance criteria.
- Only the dependencies required to perform its work.

An agent developing the CAD module should not need to load the entire requirements management implementation, for example.

Level 3 — Task Context

Short-lived implementation agents should receive minimal task-specific context.

They should return structured results consisting of:

- Changes made.
- Files modified.
- Tests performed and results.
- Architectural decisions.
- Unresolved issues.
- Recommended next actions.

Avoid returning complete source files, large tool logs, or extensive reasoning transcripts unless explicitly necessary.

Phase 3 — Persistent Project Memory

Ensure critical information is stored in version-controlled repository files rather than depending on conversation history.

Establish or improve:

- "CLAUDE.md" — concise global agent instructions.
- "docs/architecture/" — authoritative architecture documentation.
- "docs/decisions/" — architectural decision records.
- "docs/interfaces/" — API contracts.
- "docs/agents/" — agent roles and responsibilities.
- "docs/status/" — concise module status and handoff records.

Reuse existing structures where suitable. Do not create duplicate documentation systems.

Implement a standard handoff format that allows a fresh Claude Code session to resume work with minimal context.

Maintain links to authoritative documentation instead of copying large documents into agent prompts.

Phase 4 — Model Routing and Agent Efficiency

Review model selection across the agent architecture.

Recommend an appropriate model for each task based on complexity and reliability.

As a general policy:

- High-capability reasoning models: architecture, difficult engineering reasoning, cross-module integration, critical code reviews.
- Mid-tier models: routine implementation, debugging, test development and documentation.
- Lower-cost models: simple file searches, formatting, straightforward transformations and repetitive maintenance.

Use only models actually available in the current environment.

Avoid unnecessary model switching where it increases overhead or reduces reliability.

Introduce controls to prevent duplicate agent work, excessive parallelism and unbounded retry loops.

Phase 5 — Context Monitoring and Session Lifecycle

Investigate Claude Code's supported context-management features and implement appropriate controls.

Where supported:

- Provide warnings as context utilization approaches 70%, 85% and 95%.
- Generate durable handoff summaries before major compaction events.
- Recommend fresh sessions when accumulated context is no longer useful.
- Preserve critical decisions before compaction.
- Avoid automatically compacting or terminating active agents without ensuring their work is safely persisted.

Use documented Claude Code capabilities and hooks rather than unsupported assumptions about internal APIs.

Do not confuse context-window consumption with subscription usage limits.

Phase 6 — Validation

After implementation, run a representative multi-agent workflow and compare it with the baseline.

Evaluate:

- Context loaded by the coordinator.
- Context loaded by subagents.
- Aggregate token consumption, where measurable.
- Duplicate file reads and redundant work.
- Number of agent calls.
- Task completion time.
- Test pass rates.
- Quality of implementation.
- Successful recovery from a fresh session.

Optimization must not compromise engineering correctness, traceability, reproducibility or architectural consistency.

Do not optimize token consumption at the expense of functional quality.

Phase 7 — Permanent Governance

Update the project's agent instructions to enforce the optimized approach for all future agents.

New agents must:

1. Read the minimum authoritative context required.
2. Respect module boundaries.
3. Avoid duplicating work already assigned.
4. Use concise structured handoffs.
5. Persist important decisions in the repository.
6. Avoid unnecessarily expensive model selections.
7. Keep the coordinating agent informed through compact status reports.

Deliverables

Provide:

1. A context-efficiency audit with identified problems.
2. Implemented configuration and agent-instruction improvements.
3. Updated context-management documentation.
4. A reusable agent handoff template.
5. Before-and-after usage comparisons where measurable.
6. Remaining limitations and recommended improvements.

Commit the approved changes to the appropriate branch following existing repository conventions.

Priority: This is an infrastructure optimization task. The coordinator must continue prioritizing the primary engineering software milestone: demonstrating a complete AI-driven engineering workflow from conceptualization through requirements, system modeling and CAD output.

Do not undertake unrelated refactoring or change the product's functional architecture solely for token optimization.

---

## A. Coordinator notes (16 October 2026)

- Agent: `context-optimization`, worktree `C:\Users\kimge.000\Documents\Sandbox-context`, branch
  `feature/context-optimization`. Runs on a mid-tier model; escalates architecture questions to the coordinator.
- Scope: docs (`docs/agents/`, `docs/status/`, handoff template), `CLAUDE.md`/`AGENTS.md` governance sections,
  project-level Claude Code configuration under `.claude/` in the repository (agent definitions, project hooks, status
  line). User-level settings (`~/.claude/…`) are proposed to the owner, never changed by the agent.
- Existing structures to reuse, not duplicate: `docs/architecture.md`, `docs/decisions/`, `docs/specifications/*`
  (briefs, contracts, progress files per module), `docs/modules/*`, package `AGENTS.md` files.
- Data sources: session transcripts under `C:\Users\kimge.000\.claude\projects\C--Users-kimge-000\` (the coordinator's
  `7c17f988-…jsonl` and its `subagents/` folder) contain per-message usage; read them with scripts, never load them
  whole into context.
- No product or functional architecture changes; no interruption of running module agents.

## B. Owner decision (16 October 2026)

The owner approved the coordinator's recommendations ("Yes please make whatever changes are necessary"): short-lived
agents per sprint with lower auto-compact windows; at most 2-3 concurrent implementation agents; model routing (Opus for
architecture, integration and reviews; Sonnet for routine implementation, tests and docs; Haiku for searches and log
triage); an integration-runner agent that returns compact pass/fail tables; automated visual comparison instead of reading
screenshots; report caps and short status files; a compact verify command; generated reference docs; a fresh coordinator
session per milestone; and the architecture change to per-module registration manifests (scheduled after the Focused
Canvas UI work is merged, to avoid conflicts).
