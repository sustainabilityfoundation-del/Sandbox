# Module: Requirements Management

Status: **Implemented** on branch `feature/requirements-management` (pending coordinator
integration into the workspace). Brief: [requirements-management.md](../specifications/requirements-management.md);
contracts: [requirements-contracts.md](../specifications/requirements-contracts.md); progress and
acceptance evidence: [requirements-management-progress.md](../specifications/requirements-management-progress.md).

## Packages

| Package | Role |
| --- | --- |
| `packages/tool-requirements` (`@ews/tool-requirements`) | UI: table, collections, detail tabs, matrix, baselines, quality, import/export; assistant actions; standalone harness |
| `packages/requirements-client` (`@ews/requirements-client`) | Browser client: HTTP and explicit demo adapters of the SDK `RequirementsService`, the module's full typed client, SSE client, adapter contract tests |
| `packages/reqif` (`@ews/reqif`) | ReqIF 1.2 reading/writing, XHTML sanitising, `.reqifz`, schema validation (no React, no database) |
| `services/requirements` (`@ews/requirements-service`) | Domain rules, PostgreSQL schema `requirements` (migrations, seed), Fastify plugin with OpenAPI 3.1, outbox and events, quality checks, exchange |
| `services/api` (`@ews/api`) | API host: development identities, roles and entitlements (schema `platform`), embedded or external PostgreSQL, `db:*` scripts |

## Owns (contracts §2)

Requirement identity (UUID) and key, revisions, canonical fields (title, statement, rationale,
type, source, owner, priority, applicability, verification methods, acceptance criteria, custom
attributes), lifecycle and reviews, comments, external references, collections (headings,
membership, order), `derives-from` / `decomposes` / `depends-on` / `allocated-to` relationships,
requirements baselines, change history, quality findings and dismissals, exchange sources and
mappings, import/export jobs and attachments. It never stores components, SysML elements or CAD
representations; allocation targets are twin IDs.

## Key rules

- Every canonical edit creates an immutable revision; writes need an expected revision (ETag /
  If-Match) and fail with 409 instead of overwriting; retryable writes take an Idempotency-Key.
- Lifecycle: draft → in-review (review on an exact revision) → approved (by a reviewer who did not
  author that revision) → retired; editing an in-review or approved requirement creates a new
  draft revision. Approval, verification results (twin artifacts), compliance assessment and
  modelled satisfaction (`satisfies`, SysML) are separate records.
- Collection hierarchy never implies derivation or decomposition.
- Baselines pin requirement revisions, relationship revisions and collection structure; they are
  immutable (database triggers) and separate from platform (twin) baselines.
- Committed changes emit events through a transactional outbox and SSE.
- Permissions (reader, editor, reviewer, administrator) and entitlements are enforced by the server;
  the matrix is in the progress file and in OpenAPI (`x-permissions`, `x-roles`).

## Documentation

- API, setup and conventions: [requirements-api.md](../specifications/requirements-api.md); live
  OpenAPI 3.1 at `/api/requirements/v1/openapi.json`.
- SysML mapping and SDK examples: [requirements-sysml-mapping.md](../specifications/requirements-sysml-mapping.md).
- ReqIF support and interoperability report: [requirements-reqif.md](../specifications/requirements-reqif.md).
- Research: [docs/research/requirements/](../research/requirements/research-note.md).

## Not in scope yet (backlog)

Requested next: [Requirements navigation and filtering at scale](../specifications/requirements-navigation-filtering.md).
Adds a bounded left submenu (10 visible by default), contextual/structured filters and AI query
operations. Reuse existing table pagination/saved views. The sidebar is Platform-owned; Requirements
owns query semantics and service extensions. Status: planned, not implemented by this specification.

Streams/branches and merge, reuse with synchronisation, automatic suspect links, formal change
requests, electronic signatures, document reports (PDF/Word), OSLC, glossary checks, a real AI
provider. See [acceptance-and-backlog.md](../research/requirements/acceptance-and-backlog.md) §5.
