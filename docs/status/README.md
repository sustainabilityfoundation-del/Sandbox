# Status and handoff records

Concise, committed state that lets a fresh session resume without conversation history.

| File | Owner | Purpose |
| --- | --- | --- |
| [coordinator.md](coordinator.md) | Coordinator | Session handoff: priorities, state per module, decisions in force, assigned work, next actions |
| [context-baseline.md](context-baseline.md) | Context optimization | Measured token and context baseline (16 Oct 2026) |
| `docs/specifications/<module>-progress.md` | Module agent | Module status, with the status block at the top ([format](../agents/handoff-template.md#2-status-block-top-of-every-module-progress-file-kept-current-at-each-checkpoint)) |

Reuse, not duplication: module detail stays in the progress files; this directory holds only cross-module state and
handoffs. Read module state with `node scripts/status-digest.mjs`. Formats and rules: [docs/agents](../agents/README.md).
