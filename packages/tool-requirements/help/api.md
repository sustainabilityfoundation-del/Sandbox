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

Developer documentation: `docs/specifications/requirements-api.md` and
`docs/specifications/requirements-sysml-mapping.md` in the repository.
