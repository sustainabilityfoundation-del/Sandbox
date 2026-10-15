# AI operations (`projects.*`)

Status: **Proposed**. Decision: part of ADR-0060 (same command boundary, ADR-0010/0013/0015). Index:
[README.md](README.md).

## 1. Rules

- Every operation is the same HTTP API the UI uses; the assistant never touches tables (brief §8).
- Reads run directly. Changes are **service proposals** (SDK 1.5 `ServiceProposal`): the action calls the
  API with `?dryRun=true`, turns the dry-run result into the preview, and `apply` repeats the call without
  `dryRun`, with `Idempotency-Key`, expected revisions and provenance headers (`X-Source-Kind: assistant`,
  `X-Conversation-Id`, `X-Proposal-Id`, `X-Message-Id`). The preview policy is unchanged.
- Destructive operations (delete, purge, member removal, import replace) additionally need the person to type
  the project key in the preview (proposed additive SDK field `ServiceProposal.confirmation`, CR-PM-SDK-3);
  the server enforces it through `X-Confirm`.
- Assistant-sourced writes cannot release baselines, accept risks or change membership roles (server rule,
  same idea as Conceptualize's approval gates).
- Changes to another module's artifacts are delegated: `projects.propose_change` resolves the artifact and
  returns that module's own assistant action or service proposal; Project Management never writes module data.
- Context sent to a model follows the AI access policy of the settings page (ai-connection.md §5a).

## 2. Operations

| Operation | Effect | API | Brief §8 item |
| --- | --- | --- | --- |
| `projects.list_projects` | query | `GET /projects` | navigate |
| `projects.get_context` | query | `POST {p}/open` (without recording recents) + counts, modules, settings | retrieve project context |
| `projects.create_project` | proposal | `POST /projects?dryRun` | create and configure projects |
| `projects.update_project` | proposal | `PATCH {p}?dryRun` | configure |
| `projects.configure_settings` | proposal | settings API (project scope) | configure |
| `projects.archive_project` / `restore_project` | proposal | `POST {p}/archive|restore?dryRun` | lifecycle |
| `projects.delete_project` | proposal + confirmation | `DELETE {p}?dryRun`, `X-Confirm` | lifecycle (destructive) |
| `projects.search_artifacts` | query | `GET {p}/artifacts` | navigate and query structures |
| `projects.get_artifact` | query | `GET {p}/artifacts/{id}` | navigate |
| `projects.get_view` | query | `GET {p}/views/{viewId}` | query project structures |
| `projects.trace` | query | `POST {p}/trace` | find relationships and dependencies |
| `projects.impact` | query | `POST {p}/impact` | dependencies |
| `projects.history` | query | `GET {p}/activity`, `…/artifacts/{id}/history` | design history |
| `projects.create_work_item` | proposal | `POST {p}/work-items?dryRun` | create tasks and engineering issues |
| `projects.update_work_item` | proposal | `PATCH {p}/work-items/{id}?dryRun` | |
| `projects.link_artifacts` | proposal | `POST {p}/links?dryRun` | create relationships |
| `projects.propose_change` | delegation | registry lookup → owning module's action | propose changes to engineering artifacts |
| `projects.save_alternative` | delegation | Conceptualize `concepts.*` (alternative sets) | save design alternatives |
| `projects.list_alternatives` | query | `ConceptsService` + registry | retrieve design alternatives |
| `projects.explain_decision` | query | Conceptualize decision record (and design-reasoning rationale when available, CR-S3) | explain why a decision was made |
| `projects.check_integrity` | query | `POST {p}/integrity-checks` | identify inconsistent engineering information |
| `projects.create_baseline` | proposal | `POST {p}/baselines?dryRun` (phase C) | configuration |
| `projects.export_project` | proposal | `POST {p}/exports` | export |

`explain_decision` answers only from recorded data (decision, chosen and rejected alternatives, criteria,
assumptions, evidence, linked requirements) and cites each source by key and revision; when nothing is
recorded it says so instead of reconstructing a rationale.

## 3. Where the contribution lives

Assistant actions are contributed by tools today. Project Management is a shell capability, so it needs a
headless contribution (CR-PM-WS-2): `@ews/projects-client` exports `projectsAssistantContribution:
AssistantContribution` and `projectsHelp: HelpManifest`; the workspace registers them next to
`PLATFORM_TOOLS`. Each operation gets an entry in `apps/workspace/src/assistant/capabilities.ts` with module
`'projects'` (CR-PM-WS-3).
