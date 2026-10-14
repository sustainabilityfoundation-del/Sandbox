# Sprint <number>: <usable outcome>

Copy this template to `<number>-<short-name>.md`; this template is not an active sprint.

## Plan

- Status: planned / in progress / blocked / ready for owner review / changes requested / accepted
- Goal: <what the owner will be able to do>
- Baseline commit: <exact starting commit>
- Owner/coordinator: <assigned owner>
- Scope and exclusions: <small increment; explicitly deferred work>
- Affected modules and contract/data changes: <areas and compatibility implications>
- Dependencies and blockers: <required inputs or decisions>
- Tasks and agent ownership: <bounded tasks; use agents only when authorized>

## Acceptance criteria

- [ ] <observable action and expected result>
- [ ] <persistence/failure/cross-tool scenario where applicable>
- [ ] <existing workflow that must remain functional>
- [ ] Help pages, help IDs and contextual mappings updated for the changed features (docs/modules/help.md)

## Verification evidence

| Check | Result: passed / failed / not run / blocked | Evidence or reason |
| --- | --- | --- |
| Required automated checks | Not run | <commands and outputs> |
| Actual application/harness workflow | Not run | <actions and observed results> |
| Documentation links and diff | Not run | <checks> |

Use the documentation-only exception only when the change meets that scope.

## Runnable checkpoint and walkthrough

- Candidate commit or tag: <exact tested revision; record after committing>
- Compatible dependency/module versions: <if not pinned by this monorepo commit>
- Startup commands and URL: <reproducible instructions>
- Owner walkthrough: <numbered actions and expected results>
- Known limitations, migrations and recovery: <concrete notes>

## Owner feedback and next increment

- Owner acceptance: pending / accepted / changes requested
- Actual feedback: <leave pending until received>
- Follow-up checkpoint: <if needed>
- Next increment: <recommended usable outcome>
- Handoff/blockers: <what another session needs to resume>
