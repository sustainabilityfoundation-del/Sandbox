---
help_id: requirements.api
title: Requirements API
kind: api
summary: The versioned HTTP API (OpenAPI 3.1) and the SDK service other tools use.
keywords: [api, openapi, http, rest, sdk, integration, endpoint]
related: [requirements.roles]
---

- **HTTP API**: `/api/requirements/v1`, described by OpenAPI 3.1 at
  `/api/requirements/v1/openapi.json`. The interactive reference (Scalar) is at
  `/api/requirements/v1/docs`. Writes need an expected revision (ETag / If-Match) and accept an
  Idempotency-Key.
- **SDK**: other tools use `RequirementsService` from `@ews/platform-sdk` (`get`, `resolve`, `list`,
  `create`, `update`, `traceLinks`, `subscribe`). They never read the Requirements database.
- **Validation rules** are the server's, for every caller (this tool, other tools, the assistant):
  the title is required (1 to 300 characters) and the statement may be at most 20 000 characters.
  A draft may have an **empty statement** (imported ReqIF objects can have no text), but requesting
  review refuses it ("… has no statement to review"). An edit based on an older revision is refused
  with a conflict, and nothing is overwritten.
- **Assistant**: edits prepared by the assistant are shown as a preview in the platform and saved
  only when you choose Apply, with the same rules and revision check as your own edit. This works
  with the Requirements tab closed.
- **Open links** from other modules (for example the project's artifact list): a selected
  requirement is highlighted in the table; a selected collection opens in the Collections panel; a
  selected baseline opens as the read-only historical view.

Developer documentation: `docs/specifications/requirements-api.md` and
`docs/specifications/requirements-sysml-mapping.md` in the repository.
