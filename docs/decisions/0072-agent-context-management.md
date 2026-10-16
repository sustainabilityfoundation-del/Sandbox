# ADR-0072: Agent context management

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context
Measured on 15 agent transcripts on 16 October 2026 ([baseline](../status/context-baseline.md)): 97% of processed tokens are cache reads, every long-running agent
sat near the 967k auto-compaction ceiling, all agents ran on Opus, and the coordinator reached 90% of its window. Context size, not briefs or
output, drives cost. Memory lived in conversations and large progress files.

## Decision
1. Three context levels (global, module, task) with explicit read sets; links instead of pasted content ([docs/agents](../agents/README.md)).
2. Durable state in repository files: module progress files with a short status block, `docs/status/` for coordinator and cross-module handoffs.
3. Model routing by task through `.claude/agents/` definitions (Opus for architecture, integration and review; Sonnet for routine work; Haiku for lookups), adopted as a trial.
4. Controls: at most 3 concurrent implementation agents (a policy, [docs/agents](../agents/README.md); the setting is `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=6` in `.claude/settings.json`), nesting depth 2, `maxTurns` on helpers, three attempts per step, an assignment register.
5. Context lifecycle through documented Claude Code features only: status line, hooks (`SessionStart`, `PreCompact`, `UserPromptSubmit`, `PostToolUse`), warnings at 70, 85 and 95%. Hooks never block or terminate work.

## Consequences
Smaller contexts and traceable handoffs; model reliability on Sonnet is unmeasured and must be reviewed; hooks add a small fixed cost per tool call
and reach only sessions started with this configuration. Changes nothing in the product or its architecture. Supersedes nothing.

## Amendments on acceptance

- 14 transcripts corrected to 15 (`docs/status/context-baseline.md:7`) and dated 16 October 2026.
- The 3-agent cap is a policy; the configured setting is `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=6`.
