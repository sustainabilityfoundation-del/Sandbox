# Requirements Management: progress

Maintained by the Requirements agent. Brief: [requirements-management.md](requirements-management.md)
(do not edit). Contracts: [requirements-contracts.md](requirements-contracts.md).

Branch: `feature/requirements-management`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-requirements`.

## Status by stage

| Stage | Status | Notes |
| --- | --- | --- |
| 1. Research and acceptance matrix | Not started | |
| 2. Shared domain contracts and schema | Contracts agreed (SDK 1.2.0); schema not started | |
| 3. PostgreSQL API | Not started | |
| 4. Core Requirements UI | Not started | Existing tool: table, editor, allocation, verification records (Phase 1) |
| 5. SysML integration | Not started | Coordinator implements SysML-side consumer changes |
| 6. ReqIF exchange | Not started | |
| 7. Quality assistance and refinements | Not started | |

## Already implemented before this work

- Requirements tool (`packages/tool-requirements`) over the shared twin: table with search, status
  filter and allocation filter, edit and allocation, relationships, activity history, verification
  records with stale detection, assistant actions `requirements.read_for_component`,
  `requirements.update`, standalone harness.
- Platform: revision history, baselines, ownership enforcement, change impact (browser demo
  repository only).

## Acceptance checks (brief §10)

| Check | Status | Evidence |
| --- | --- | --- |
| Persistence across restarts | | |
| Clean migrations and seeds | | |
| Concurrent-edit conflicts | | |
| Stable historical baselines | | |
| Relationship constraints | | |
| Backend entitlement and permission enforcement | | |
| Requirements and SysML resolve the same canonical data | | |
| Cross-tool and cross-window refresh | | |
| API failures preserve unsaved input | | |
| Idempotent retries | | |
| ReqIF interoperability and re-import | | |
| Search and pagination on a larger generated dataset | | |

## Contract change requests

None yet.

## Integration needs for the coordinator

None yet.

## Unresolved decisions

None yet.

## Proposed scope changes

None. Any narrowing of the brief is recorded here explicitly, never applied silently.

## Limitations

None recorded yet.

## Handoff log

(Newest first: date, completed functionality, contracts, migrations, tests, limitations, integration needs.)
