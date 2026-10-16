# Tasks for ChatGPT Codex

The coordinator (Claude) keeps architectural authority. Codex receives **isolated, test-verifiable tasks** written as
files in `docs/codex/tasks/`. Codex reads the repository's `AGENTS.md` automatically; these rules add to it.

## How the owner runs a task

1. In Codex (connected to this GitHub repository), send: `Do the task in docs/codex/tasks/<file>.md.`
2. Codex works on a branch named `codex/<task-id>` and opens a pull request. It never pushes to `main`.
3. Tell the coordinator the pull request number; the coordinator reviews, verifies and merges (or asks Codex for changes
   through a review comment).

## Rules for Codex

- Change only the paths the task lists. If the task needs anything else, stop and say so in the pull request.
- Run the task's acceptance commands and paste a compact result (pass counts, exit codes) in the pull request.
- No secrets, no network services, no real AI provider accounts; the cloud environment has no browser, so browser flows
  (`npm run e2e`) are run later by the coordinator.
- Keep stored-data migrations additive (AGENTS.md) and do not change shared contracts unless the task says so.
- Pull request description: changes, files, tests and results, open issues (about 300 words).

## Status

| Task | Title | Status |
| --- | --- | --- |
| [CX-001](tasks/CX-001-ci-workflow.md) | GitHub Actions: check, DB suites and builds | ready for review (CI verification pending) |
| [CX-002](tasks/CX-002-api-reference-docs.md) | Generated API reference pages from OpenAPI | open |
| [CX-003](tasks/CX-003-legacy-tool-help.md) | Help pages for the illustrative SysML and mock CAD tools | open |
| [CX-004](tasks/CX-004-sysml-send-accept.md) | SysML parser: send and accept actions | open |
