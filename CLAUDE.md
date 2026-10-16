@AGENTS.md

# Claude Code orientation

The root AGENTS.md is the authoritative shared instruction file. Do not duplicate or contradict
its rules here. Before changing a package, explicitly read that package's AGENTS.md as well.

Use docs/development-workflow.md for sprint planning, integration and handoff, and
docs/sprints/template.md to record each sprint. Read the relevant architecture, module
specification and ADRs before implementation. Report a usable committed checkpoint at sprint end.

Context discipline: follow "Agent context and handoffs" in AGENTS.md. Role definitions: .claude/agents/ (when to use each:
docs/agents/README.md). Handoff formats: docs/agents/handoff-template.md. Session rules: docs/agents/session-lifecycle.md.
Verification summary: `node scripts/verify.mjs` (alias `npm run verify`). A fresh session resumes from docs/status/coordinator.md
or the module progress file's status block.

# Compact instructions

When compacting, keep: the current task and acceptance criteria, decisions made and where they are recorded, files changed and
their commit ids, test commands with results, open blockers and the next actions. Drop tool output, file contents and screenshots
that are available in the repository.
