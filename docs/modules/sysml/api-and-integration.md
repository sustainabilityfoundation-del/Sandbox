# API and integration contracts

Status: Proposed. Implementation: `services/sysml` (Fastify plugin hosted by `services/api` at
`/api/sysml/v1`), `packages/sysml-client`. The OpenAPI 3.1 document is generated from the route
definitions and served at `/api/sysml/v1/openapi.json` (interactive: `/api/sysml/v1/docs`); it is the
authoritative reference, this page explains the design.

## 1. Conventions (shared with the platform services)

- Identity: development `X-Dev-User` (refused in production); production integration point is the
  host's OIDC `authenticate`, unchanged. Authorization: entitlement `tool:sysml` **and** membership of
  the SysML project's platform project (`platform.project_memberships`); roles: reader = read,
  editor/reviewer/administrator = write; project creation = editor or higher.
- Errors: `{ "error": { "code", "message", "details" } }` with codes `invalid` (400 malformed /
  422 semantic), `unauthenticated` 401, `forbidden` 403, `not-found` 404, `conflict` 409,
  `unavailable` 503/500 (internal errors carry an `errorId`, never SQL or stack traces).
- Concurrency: branch ETag = head commit ID; writes send `baseCommitId` (body) or `If-Match`.
- Idempotency: `Idempotency-Key` on POST writes; the first outcome is replayed for 24 h.
- Events: transactional outbox; SSE at `/projects/{projectId}/events`, resume with `Last-Event-ID`;
  delivery may repeat (dedupe by `eventId`).
- Pagination: `?limit` (1–1000, default 100) and an opaque `?cursor`; responses `{ items, nextCursor }`
  for platform extensions. Aligned endpoints return arrays as the OMG API does, with paging through
  `page[size]`/`page[after]` query parameters and a `Link` header (`rel="next"`).

## 2. Systems Modeling API alignment

The OMG *Systems Modeling API and Services* defines a platform-independent model and a REST/HTTP PSM
(endpoints verified by research: [standards.md](../../research/sysml/standards.md)). We implement an
**aligned subset**: same resource model, same paths and JSON shapes (`@id`, `@type`), same semantics for
commits as immutable change sets. Deviations are listed explicitly; we do not claim conformance.

| Aligned endpoint | Verb | Notes |
| --- | --- | --- |
| `/projects` | GET, POST | POST creates the project with an empty default branch `main`; body adds `platformProjectId` (extension field) |
| `/projects/{projectId}` | GET | |
| `/projects/{projectId}/branches` | GET, POST | POST `{ name, head: { "@id": commitId } }` |
| `/projects/{projectId}/branches/{branchId}` | GET | |
| `/projects/{projectId}/tags` | GET, POST | Tags are baselines |
| `/projects/{projectId}/commits` | GET, POST | POST `{ "@type": "Commit", change: DataVersion[], previousCommit? }` + `?branchId`. Every change is validated by the core (well-formed elements, references resolve) before it is accepted; raw commits bypass typed commands but not validation |
| `/projects/{projectId}/commits/{commitId}` | GET | Adds `number`, `source`, `description` |
| `/projects/{projectId}/commits/{commitId}/changes` | GET | DataVersions of the commit |
| `/projects/{projectId}/commits/{commitId}/elements` | GET | Paged |
| `/projects/{projectId}/commits/{commitId}/elements/{elementId}` | GET | `?derived=true` adds computed attributes (qualifiedName, owner, …) |
| `/projects/{projectId}/commits/{commitId}/elements/{elementId}/relationships` | GET | `?direction=in|out|both` |
| `/projects/{projectId}/commits/{commitId}/roots` | GET | Root namespaces' owned elements |
| `/projects/{projectId}/query-results` | POST | Query body: a subset of the API `Query` (`where` with `PrimitiveConstraint` on `@type`, `declaredName`, `owner`, `qualifiedName`; `CompositeConstraint` `and`/`or`) |

Known deviations (also in conformance.md): no `DELETE` of projects/branches yet; no merge endpoint
(Phase 5); queries support the listed constraints only; `Commit.change` accepts full element payloads
only (no partial updates); derived properties are opt-in.

## 3. Platform extensions (`x-ews` in OpenAPI)

| Endpoint | Verb | Purpose |
| --- | --- | --- |
| `/commands` | GET | Schema discovery: every typed command with its JSON schema, effect and description; supported metaclasses and their attributes |
| `/projects/{projectId}/branches/{branchId}/transactions` | POST | Typed command transaction: `{ baseCommitId, commands[], dryRun?, validationPolicy?, reason?, source? }` → change set, diagnostics delta, created IDs, commit (unless dry run) |
| `/projects/{projectId}/commits/{commitId}/revert` | POST | Undo: compensating commit on a branch (`?branchId`) |
| `/projects/{projectId}/commits/{commitId}/text` | GET | Textual notation of the model or of one namespace (`?elementId`) |
| `/projects/{projectId}/commits/{commitId}/validation` | GET | Diagnostics |
| `/projects/{projectId}/commits/{commitId}/children` | GET | Lazy browser: owned members of `?ownerId` (or roots) with counts |
| `/projects/{projectId}/commits/{commitId}/model` | GET | Bulk snapshot (all elements) for editors; paged for large models |
| `/projects/{projectId}/commits/{commitId}/diff` | GET | Element-level semantic diff with `?baseCommitId` |
| `/projects/{projectId}/commits/{commitId}/impact` | GET | Incoming references of `?elementId`, transitively to `?depth` |
| `/projects/{projectId}/events` | GET | SSE |
| `/project-lookup` | GET | SysML projects of a platform project (`?platformProjectId`) |

## 4. Client contract (`@ews/sysml-client`)

`SysmlClient` is the one interface the tool and the assistant actions use. Two adapters pass the same
contract test suite (`@ews/sysml-client/contract-tests`): `createHttpSysmlClient` (mode `api`) and
`createLocalSysmlClient` (mode `local`: in-browser repository on the same core engine, for the
standalone harness, demos and offline experiments; explicit, never a silent fallback).

## 5. Cross-module integration

### 5.1 Requirements (authoritative: Requirements service)

- A SysML `requirement` usage or definition that stands for a managed requirement carries platform
  metadata `@EWS::ManagedRequirement { requirementId = "<uuid>"; revision = 3; }` (a standard
  `MetadataUsage`; the metadata definition is in the platform library). Its documentation shown in the
  editor is read from `RequirementsService.get(uuid, {revision})`; SysML stores **no** statement copy.
  Satisfaction (`satisfy R by x;`) and verification (`verify`) are SysML relationships to that usage.
- Without `revision` the link deliberately follows the latest revision (platform rule).
- Creating a managed requirement from SysML: `RequirementsService.create` (draft), then the metadata.
- ReqIF stays in Requirements. Coverage/impact (Phase 3) combine `traceLinks` with SysML satisfy/verify.

### 5.2 Conceptualize (CR-SYSML-02, approved 15 October 2026)

`ArtifactRef` scheme for System Model elements (the twin's `SYS-…` objects keep `module: 'sysml'`
with their own kinds):

```ts
{ module: 'sysml', kind: 'sysml-model-element', id: '<projectId>/<elementId>', revision: <commit number> }
```

`revision` is the per-project commit number (integer, increasing) at which the reference is pinned;
absent = latest. The pair (projectId, elementId) is stable across renames and textual re-editing.
`conceptsForArtifact` works unchanged. The design reasoning layer stays in Conceptualize; SysML
records only modelling assumptions it needs as `comment`/metadata on elements.

### 5.3 CAD (CR-SYSML-03, decided 15 October 2026)

A part-to-CAD mapping references a **CAD Modeler entity** with exactly this `ArtifactRef`:

```ts
{ module: 'cad', kind: 'cad-modeler-entity', id: '<documentUuid>/<entityId>', revision: <document revision> }
```

- **Owned by SysML, stored in the SysML model** as a reference on the part definition or usage (the
  `from` end): `@EWS::CadRepresentation { cadRef = "<documentUuid>/<entityId>"; revision = 4; role = "part"; }`.
  `module` and `kind` are fixed by the metadata definition; `revision` is the CAD document revision
  (absent = follow the latest revision, the platform rule). No CAD data (geometry, names, mass) is
  copied into the SysML model.
- Validation rule `SYSML-CAD-REFERENCE` refuses anything else (for example a twin ID such as
  `CAD-120` or a name). `cadRepresentations(model, elementId?)` in `@ews/sysml-core` returns the
  references in the `ArtifactRef` shape above, for the tool, the assistant and other modules.
- **Mass properties are read on demand from CAD** (through the platform service CAD exposes, at the
  pinned revision) and shown next to the modelled `mass` attribute; they are not synchronised and
  never written back into the SysML model.
- Not done yet: the Properties panel action to pick a CAD entity, and the on-demand mass read. Both
  wait for a CAD read contract in `PlatformServices` (like `requirements`); until then links can be
  written with the `setMetadata` command (UI, text or assistant) and are validated.
- Interface traceability for ports (a `CadInterface` metadata) is a proposal for a later sprint.

### 5.4 Project Management registration (CR-PM-REG-3, SDK 1.7 `ArtifactSource`)

`createSysmlArtifactSource(repo, events)` in `@ews/sysml-service` implements the SDK 1.7 `ArtifactSource`
(docs/modules/projects/registration-and-provisioning.md §4). The API host wires it into the Project
Management plugin; Project Management never writes SysML data through it.

| Kind | `ref.id` | Registered | Lifecycle, version |
| --- | --- | --- | --- |
| `sysml-project` | SysML project UUID | every SysML project of the platform project | working; head commit number of the default branch |
| `sysml-model-element` | `<projectId>/<elementId>` (CR-SYSML-02) | **named definitions and usages** at the default-branch head (no packages, relationships or anonymous features; other branches are not registered) | working; commit number of the element's latest version |
| `sysml-tag` | `<projectId>/<tagId>` | every tag | released; tagged commit number |

- `projectId` in the interface is the **platform** project; SysML projects belong to one platform project.
- Keys are display text: the project name, the element's qualified name, `<project> @ <tag>`. Titles
  carry the keyword (`part def Rod`). Deep links: `{ toolId: 'sysml-modeler', params: { sysmlProjectId, elementId | tagId } }`.
- `relations` report SysML-owned relationships for the link index: `satisfies` and `allocated-to`
  (between registered elements; feature chains are reported from their first feature), `represents`
  (CAD Modeler entities and product elements, §5.3 and §5.5) and `stands-for` (managed requirement,
  with the pinned revision).
- Events: `sysml.project-created` → upserted project; `sysml.commit-created` on the default branch →
  upserted (the project and the changed registered elements) and retired (deleted elements, or
  elements that are no longer named definitions or usages); `sysml.tag-created` → upserted tag. Branch
  creation and commits on other branches register nothing. If an event cannot be itemised, the source
  sends `reconcile`.
- Paging: stable order (projects by creation; within a project the project, its tags, its elements by
  ID), opaque cursor, at most 500 per page. Unknown platform project → empty page; unknown refs are
  absent from `describe`.
- `provision` returns `not-needed`. **A new platform project has no SysML project**; the example is
  seeded only for PRJ-ACT100 in development. The modeler creates a SysML project lazily when a person
  chooses **Start modelling** or **Add** (one empty package `SystemModel`).
- Contract tests: `services/sysml/test/artifacts.test.ts` (real PostgreSQL).

### 5.5 Product elements (CR-PM-SYS-1)

A SysML element may `represent` a product element of Project Management's product registry, with
`{ module: 'product', kind: 'product-element', id: '<product element UUID>', revision?: <revision> }`,
stored in SysML as `@EWS::ProductElement { productElementId = "<uuid>"; revision = 3; }` (SysML-owned, no
copy of product data), validated by `SYSML-PRODUCT-REFERENCE` and returned by `representations()`
together with CAD references. Properties lists the product elements that the Project Management
registry knows (`services.projects.artifacts(projectId, { category: 'product-element' })`) to pick from.

### 5.6 Simulation and analysis (future)

Analysis cases (`analysis def`) and calculations expose parameters; an analysis module receives
`{ projectId, commitId, elementId }` plus evaluated parameter values, and returns results as its own
artifacts referencing the commit (provenance). Phase 4.

## 6. Contract change requests (summary; status in the progress file)

| ID | Change | Owner | Why |
| --- | --- | --- | --- |
| CR-SYSML-01 | SDK: `PlatformServices.sysml?: SysmlModelService` (minimal cross-module read contract: resolve element ref, get element summary, list elements, subscribe) — **approved in principle for SDK 1.6**; the tool keeps its local client until then | Coordinator | Other modules (Conceptualize, CAD, Requirements, inspector) need to resolve System Model refs without importing our client; the tool would also receive its client from the host instead of constructing it |
| CR-SYSML-02 | `ArtifactRef` scheme for System Model elements (§5.2) — **approved** | Coordinator + Conceptualize | Concept-to-model traceability |
| CR-SYSML-03 | CAD mapping contract (§5.3) — **decided**: `cad-modeler-entity` refs owned by SysML, mass read on demand | Coordinator + CAD | Part ↔ CAD traceability, mass properties |
| CR-SYSML-04 | `boundaries.test.ts` entries for `packages/sysml-core`, `services/sysml`, `packages/sysml-client`, `packages/tool-sysml-modeler`, and `@ews/sysml-service` in `services/api` — **accepted** | Coordinator | Hosting the plugin and enforcing our boundaries |
| CR-SYSML-05 | `CapabilityModule` union gains `'sysml-modeler'` (capabilities.ts) — **accepted** | Coordinator | Inventory entries for the new tool |
| CR-SYSML-06 | Shared service infrastructure package (migrations runner, outbox/SSE hub, route/idempotency helpers) instead of per-service copies — **deferred** | Coordinator | We re-implemented the requirements patterns in `services/sysml` to avoid depending on another module's implementation |
