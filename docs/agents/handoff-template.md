# Handoff and report templates

Use these instead of free-form summaries. Keep each filled-in instance short; link to files, commits and sections.

## 1. Task report (a short-lived agent to its caller, or a module agent to the coordinator)

Under 300 words. No source files, no logs, no reasoning transcript.

```markdown
**Task:** <one line, with the assigned brief or file>
**Result:** done | partial | blocked
**Changes:** <what changed, 1-5 bullets>
**Files modified:** <paths, or a commit range `abc123..def456`>
**Tests and checks:** <command: result, for each; say what was not run and why>
**Decisions:** <decision and where recorded (ADR, progress file); or "none">
**Unresolved issues:** <blockers, contract change requests, risks>
**Recommended next actions:** <ordered, each small enough to assign>
```

## 2. Status block (top of every module progress file; kept current at each checkpoint)

Allows a digest (`node scripts/status-digest.mjs`) and a fresh session to resume without reading the whole file.

```markdown
## Status (updated <date>, commit <sha>)
- **State:** active | waiting for <whom> | ready for review | paused
- **Branch / worktree:** `<branch>` / `<path>`; based on main <sha>
- **Done since last checkpoint:** <1-3 lines>
- **In progress:** <one item, with the file or test being worked on>
- **Next actions:** <1. ... 2. ... 3. ...>
- **Blockers and open change requests:** <or none>
- **Decisions needing the coordinator:** <or none>
- **Verification:** <last `npm run check`/build result, date>
```

## 3. Session handoff (coordinator or any agent ending or restarting a session)

Stored in `docs/status/<role>.md` (the coordinator's is [coordinator.md](../status/coordinator.md)), committed. A fresh session
must be able to resume from this file, `AGENTS.md` and the links in it alone. Target size: under 4 KB of text.

```markdown
# <Role>: session handoff (<date>, commit <sha>)
## Mission and priority          <2-3 lines and links to the brief / current milestone>
## State                          <table: area, state, evidence link>
## Decisions in force             <list of ADR / decision links, newest first; one line each>
## Assigned work                  <table: agent, task, branch/worktree, started, expected result>
## Open items and blockers        <numbered, each with owner and next step>
## Next actions                   <ordered, first one is what to do on resuming>
## How to resume                  <files to read in order; commands to run; what not to re-read>
## Not yet verified               <claims that need checking before relying on them>
```

Rules: no copied documents; every fact has a link or a command that reproduces it; unknowns are written as unknown;
owner acceptance is never recorded unless the owner said so.

## 4. Brief for a new agent (coordinator to agent)

Under 2k tokens.

```markdown
**Agent / definition:** module-agent | task-worker | researcher | scout | reviewer
**Goal and acceptance criteria:** <3-6 lines>
**Read:** <files, in order, with sections>
**Own (may change):** <paths>   **Do not touch:** <paths / modules>
**Branch / worktree:** <...>
**Checks to run:** <commands>
**Report as:** task report; checkpoint after <milestone>
**Limits:** <max turns or sprint scope; retry limit 3>
```
