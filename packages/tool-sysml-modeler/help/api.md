---
help_id: sysml-modeler.api
title: API and integration
kind: api
summary: The SysML Modeler HTTP API (aligned with the OMG Systems Modeling API, plus platform extensions), modes, events, and the integration with other modules.
keywords: [api, rest, openapi, systems modeling api, integration, events, sse, local mode, requirements, conceptualize, cad]
related: [sysml-modeler.commands, sysml-modeler.history]
---

**Interactive reference:** `/api/sysml/v1/docs` (OpenAPI 3.1 at `/api/sysml/v1/openapi.json`).

- **Aligned endpoints** follow the paths and JSON shapes (`@id`, `@type`) of the OMG Systems
  Modeling API and Services: projects, branches, tags, commits (with `change` data versions),
  elements at a commit, relationships, roots, diff, query results. This is an aligned subset, not a
  conformance claim.
- **Platform extensions:** `POST …/branches/{id}/transactions` (typed commands, dry run, validation
  policy, element-level concurrency), `POST …/commits/{id}/revert`, text, validation, children,
  search, impact, model snapshot, `GET /commands` (schemas) and the Server-Sent Events stream
  `…/events`.
- **Access:** the `tool:sysml` entitlement and membership of the project's platform project.
  Readers read; editors, reviewers and administrators change models. Development uses the
  `X-Dev-User` header.
- **Writes** send the commit they are based on (`baseCommitId` or `If-Match`) and an
  `Idempotency-Key`, so retries are safe.

**Modes.** In the workspace, the SysML Modeler uses the API when the Requirements service runs in
API mode, and a local in-browser repository in demo mode. The standalone harness defaults to local
mode (`?mode=api` uses the API). Local mode has no access control and keeps data in this browser.

**Integration.**
- Requirements: link requirement usages to managed requirements with `ManagedRequirement` metadata
  (UUID and revision); the requirement text stays in Requirements Management.
- Conceptualize and CAD: references to SysML Modeler elements (project UUID, element UUID and
  commit number) are a proposed platform contract and are not available yet.
