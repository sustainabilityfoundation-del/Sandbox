# Session lifecycle and context monitoring

Facts below were checked against the Claude Code documentation on 16 October 2026 (hooks, status line, sub-agents, model
configuration, costs). Anything not documented is marked and is not implemented.

**Context window is not subscription usage.** The window is what one conversation holds (about 1M tokens for Opus 5.5 and
Sonnet 5.5). Usage limits (five-hour and weekly windows, spend limits) count tokens processed across all requests. A large
context raises usage on every request (cache reads), but a full window does not mean a limit has been reached, and the status line
percentage shows the window only.

## What is configured in the repository (`.claude/`)

| Item | File | Behaviour | Documented basis |
| --- | --- | --- | --- |
| Status line | `.claude/statusline.mjs` | Shows model, context bar, tokens used/window, branch; colour and label at 70% (plan handoff), 85% (persist state), 95% (handoff now) | `statusLine` setting; stdin JSON `context_window.used_percentage` |
| Context monitor | `.claude/hooks/context-monitor.mjs` on `UserPromptSubmit` and `PostToolUse` (Bash, Edit, Write, Agent, SendMessage) | Adds a one-time message to the model's context when use first crosses 70, 85 and 95% (re-armed after compaction). Never blocks | `additionalContext` output of both events; `transcript_path` input |
| Pre-compaction snapshot | `.claude/hooks/pre-compact.mjs` on `PreCompact` (manual and auto) | Writes branch, HEAD, uncommitted files, recent commits and the context size to `.claude/handoffs/latest.md` (gitignored). Never blocks compaction | `PreCompact` event; exit code 2 would block, deliberately unused |
| Session orientation | `.claude/hooks/session-start.mjs` on `SessionStart` | Prints branch, HEAD, uncommitted count, pointers to the rules and handoff template (about 600 characters), plus the snapshot path after compaction or resume | `SessionStart` stdout is added to context |
| Limits | `.claude/settings.json` `env` | Sub-agent depth 2, 6 concurrent sub-agents | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` |
| Agent definitions | `.claude/agents/*.md` | Model routing, `maxTurns`, no nesting for helpers, `autoCompactWindow: 400000` for `module-agent` | Sub-agent frontmatter fields |

The percentage in the hooks is computed from the last API call in the transcript against 1,000,000 tokens (override with the
environment variable `CTX_WINDOW_TOKENS`); the status line uses the window size Claude Code reports.

## What a hook cannot do (limitations)

- A hook cannot make the model write a handoff. The warnings ask the model to persist state; the pre-compaction snapshot records only
  mechanical state. Decisions must already be in the progress or status files, which is why the rules require updating them at checkpoints.
- Hooks fire in sessions started in a directory whose `.claude/settings.json` has them. Worktrees get them when this branch is merged
  into theirs; a running session needs a restart (or `/hooks` review) to pick up changed settings.
- The warnings reach a sub-agent only if Claude Code runs project hooks inside it, which the documentation does not state; do not
  depend on it. Sub-agents are limited by `autoCompactWindow` and their instructions to update the progress file.
- `PreCompact` input fields other than the common ones (`session_id`, `transcript_path`) were not confirmed; the script reads
  `trigger` if present.
- Blocking automatic compaction with exit code 2 is possible but not used: a full window with compaction blocked stops the session.

## Rules for sessions

1. **70%:** finish the step; update the status block and progress file; commit.
2. **85%:** no new work; write the session handoff ([template](handoff-template.md)); tell the coordinator or owner a fresh session is advisable.
3. **95%:** persist and commit at once. Compaction may happen at any moment. Do not start a task.
4. **Compact versus new session:** `/compact <focus>` is acceptable when the work continues on the same files within one task. Start a fresh session (`/clear` or a new session, resume with the handoff) when the topic changes, when the context holds mostly stale tool output or images, or at a sprint boundary. Compacting a large context is itself a large request.
5. **Never terminate or compact a running agent whose work is not committed.** Before stopping or replacing an agent, ask for its checkpoint report, or read its progress file and `git status` in its worktree.
6. After a restart the first reads are: `AGENTS.md`, the role's handoff or progress status block, and `git log --oneline -10`.

Compaction summaries: the root `CLAUDE.md` has a "Compact instructions" section that tells the summariser what to keep.

## Proposals for the owner (user level, not changed by this agent)

1. **Auto-compact window.** Claude Code compacts native-1M models near 967k tokens, and every agent in the baseline lived at that ceiling.
   Setting a lower window (documented: `autoCompactWindow` in settings, `/autocompact`, `--autocompact`, or
   `CLAUDE_CODE_AUTO_COMPACT_WINDOW`; range 100k to 1M) trades more frequent compaction for cheaper requests. Suggested trial for the
   coordinator session: `/autocompact 500k`, with the coordinator handoff file kept current. `module-agent` already requests 400k in its definition.
2. **Coordinator model and handoff.** Keep Opus for the coordinator. Start a fresh coordinator session when it passes about 70% (the current one
   reached 90%), resuming from [docs/status/coordinator.md](../status/coordinator.md).
3. **Subagent model default.** To force one model for every sub-agent regardless of definition, set `CLAUDE_CODE_SUBAGENT_MODEL` (precedence: invocation parameter, frontmatter, this variable, parent). Not recommended while definitions route models.
4. **Check spend.** Run `/usage` (Session block and, on plans, the attribution breakdown by sub-agent) after the first optimised sprint and compare with the [baseline](../status/context-baseline.md).
5. **Optional user-level status line.** The project status line applies only inside this repository. If you want it everywhere, copy the `statusLine` entry to `~/.claude/settings.json`.
