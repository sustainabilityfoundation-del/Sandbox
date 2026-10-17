# CAD document service (`services/cad`, `@ews/cad-service`)

Status: implemented on `feature/cad` (CR-CAD-2, approved). Developer documentation. The OpenAPI
document generated from the route definitions is authoritative. The API host serves it at
`/api/cad/v1/openapi.json`, with a reference page at `/api/cad/v1/docs`.

## Responsibility

- Stores native ews-cad documents (format 1.x) per platform project, as immutable revisions.
- Validates every write with the published JSON Schema and cad-core's referential rules, the same
  checks the client runs.
- Resolves CAD entity references (CR-CAD-1).
- Announces committed changes through a transactional outbox and Server-Sent Events.

It does not regenerate geometry. Regeneration stays in the client (the kernel worker); see
[architecture](architecture.md).

The service is a Fastify plugin (`cadPlugin`) mounted by the API host (`services/api`) under
`/api/cad/v1`. The host supplies the pool, `authenticate` and `roleOf`. Only this plugin touches the
`cad` schema. On registration it migrates that schema itself, under an advisory lock, with checksums
and append-only `NNNN_name.sql` files.

## Data (`cad` schema)

| Table | Content |
| --- | --- |
| `documents` | `id` (document UUID = the file's `documentId`), `project_id` (platform project, text), title, current revision, archived, created/updated at and by |
| `document_revisions` | (`document_id`, `revision`), the native content as jsonb, format and model version, title, part and feature counts, content hash, message, actor, provenance (`source_kind`, conversation, proposal, message IDs). A trigger makes rows append-only |
| `idempotency_keys` | (actor, key) → request hash, status, response, ETag. Written in the same transaction as the change |
| `outbox` | Committed-change events (see below), with delivery order assigned by a single publisher |

A new project starts empty: the service seeds nothing. Archiving hides a document from lists and
refuses saves. It never deletes anything, and restoring it is a write announced as an event.

Migrations:

- `0001_cad.sql`: the tables above.
- `0002_event_descriptors.sql`: the outbox gains `kind`, `name` and `parts`, so events describe the
  entity they announce. It is additive; older events get the document title as `name` and
  `parts = null`. It is tested on a 0001 fixture (`test/migration.test.ts`).

## Operations

| Operation | Method and path (under `/api/cad/v1`) | Role |
| --- | --- | --- |
| `listDocuments` | `GET /projects/{projectId}/documents[?includeArchived=true]` | reader |
| `createDocument` | `POST /projects/{projectId}/documents` (`Idempotency-Key` required, 201 + `Location`) | editor |
| `getDocument` | `GET …/documents/{documentId}[?revision=n]` (`ETag: "<revision>"`) | reader |
| `saveRevision` | `PUT …/documents/{documentId}` (`If-Match: "<revision>"` or `expectedRevision`) | editor |
| `archiveDocument` | `POST …/documents/{documentId}/archive` `{ archived, expectedRevision }` | editor |
| `listRevisions` | `GET …/documents/{documentId}/revisions` (newest first, with provenance) | reader |
| `resolveEntity` | `GET …/documents/{documentId}/entities/{entityId}[?revision=n]` | reader |
| `cadEvents` | `GET /projects/{projectId}/events` (SSE, `Last-Event-ID` or `?after=`) | reader |

### Access and writes

- **Access.** The server checks the `tool:cad` entitlement and the caller's project role through the
  host's `roleOf`. Writes need editor, reviewer or administrator. When the host reports reader, every
  write is refused with 403; the planned behaviour for archived projects relies on this, and it is
  tested with a stub host.
- **Concurrency.** A save without an expected revision is refused (428). A body and `If-Match` that
  disagree give 400. A stale revision gives 409 with `details.currentRevision`. A save whose content
  hash and title equal the current revision returns `unchanged: true` and writes nothing.
- **Idempotency.** The key and its response are recorded inside the commit transaction. A replay
  returns the recorded response. A failed request records nothing, so retrying it runs again.
- **Provenance.** The `X-Source-Kind` header (`user`, `assistant`, `import`) is stored on the
  revision. Assistant writes must also send `X-Conversation-Id` and `X-Proposal-Id`.

### Errors

Errors use the platform shape, `{ error: { code, message, details? } }`, with these codes:

| Code | Status |
| --- | --- |
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `not-found` | 404 |
| `conflict` | 409 |
| `invalid` | 400 or 422 |
| `unavailable` | 503 or 500 |

Internal failures return an error reference and never SQL text.

## Summaries and events

A document summary carries:

- `id` and `kind: 'cad-document'`;
- `projectId`, `title`, `revision` and `archived`;
- format and model version, part and feature counts;
- `parts: [{ uuid, id, name }]`;
- created and updated at and by.

Events have the types `cad.document-created`, `cad.revision-created`, `cad.document-archived` and
`cad.document-restored`. Each event carries:

- `eventId`, `type`, `projectId`, `documentId`, `kind` and `name`;
- `revision`, `occurredAt` and `actor`;
- `updatedAt` and `updatedBy`, the same values as `occurredAt` and `actor`;
- `sourceKind` and `parts`.

This is enough to list and describe CAD entities without rereading the documents. The Project Management artifact source below
consumes it.

Delivery may repeat. Consumers deduplicate by `eventId` and reread the document. An unknown resume
point starts the stream with `event: reset`.

**Stable UUIDs.** The document UUID is `documentId`. The part UUID is RFC 9562 version 5 of the part
ID in the document UUID namespace (`entityUuid`, `@ews/cad-core`). It is deterministic, reproducible
from the native file, and never changes while the part ID stays the same. See ADR-0026.

## Artifact source for Project Management (CR-PM-REG-4)

`createCadArtifactSource(pool, events)` implements the SDK 1.7 `ArtifactSource` (contract 1.0.0). It
is read-only over the `cad` tables; `events` is the service's `CadEventHub`. The API host wires it
into the Project Management plugin. That wiring is the coordinator's and is not done on this branch.

| Aspect | Behaviour |
| --- | --- |
| Kinds | `cad-document` (id = document UUID) and `cad-modeler-entity` (id = `<documentUuid>/<partId>`, CR-CAD-1, container = the document). Both are category `geometry`. `navigable: true`; `open` is the workspace link `?tool=cad-modeler&document=<uuid>` (parts open their document). Assemblies and configurations do not exist in ews-cad 1.1; they will use `cad-modeler-entity` when added |
| `list` | Current revisions, ordered by document UUID, then the document and its parts in file order. At most 500 per page, with an opaque cursor; an invalid cursor is an error. Optional `kinds` filter. An unknown or new project gives an empty page. Archived documents and their parts are listed with lifecycle `retired` and moduleState `archived`; others are `working` / `active` |
| Descriptor | key `CAD <first 8 of UUID>[/<partId>]`; title (document title or part name); version `{ value: revision, label: 'Revision n', at }`; created and modified at and by. Part times are the document's, because the service versions whole documents. `relations` come from the document's outbound references whose subject is that part or document (for example `represents` → `product` / `product-element`) |
| `describe` | The requested refs that exist in that project; others are absent |
| `subscribe` | Every project's events, delivered in delivery order. Mapping: `cad.document-created`, `cad.revision-created` and `cad.document-restored` → `upserted` (the document and the parts of that revision); a revision that drops parts → `retired` for those parts (eventId `<eventId>:removed-parts`); `cad.document-archived` → `retired`; events stored before migration 0002 → `reconcile` |
| `provision` | `not-needed`: data is keyed by project ID, and a new project has no CAD documents |

Tests: `services/cad/test/artifacts.test.ts` covers the contract behaviours above. It also checks
that the adapter writes nothing.

## Clients

`@ews/cad-client` provides `createHttpCadClient` (this API) and `createLocalCadClient` (explicit
in-memory store for the harness and demos). Both pass the same contract tests
(`defineCadClientContract`). The CAD uses the client until SDK 1.6 adds
`PlatformServices.cad`.

## Testing

- `npm run cad:test:db` runs the service against a disposable embedded PostgreSQL. It covers:
  access, revisions, validation, idempotency rollback, provenance, immutability and archiving,
  entity resolution, the outbox, OpenAPI, descriptors and UUIDs, refusal for reader and archived
  projects, migration 0002, and the HTTP client contract.
- `npm run req:test:db` includes the same tests.
