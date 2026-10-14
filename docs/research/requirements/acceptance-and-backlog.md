# Requirements Management: acceptance criteria, product choices and backlog

Derived from the [research note](research-note.md), the [capability matrix](capability-matrix.md),
the [brief](../../specifications/requirements-management.md) and the
[agreed contracts](../../specifications/requirements-contracts.md). Status and evidence for each
criterion are tracked in the [progress file](../../specifications/requirements-management-progress.md).

## 1. Acceptance criteria

IDs are stable; tests reference them in their names where practical.

### Domain (brief §2)

| ID | Criterion |
| --- | --- |
| AC-D1 | A requirement has a canonical UUID and a separate key (`REQ-001`) unique per project; keys can be renumbered without changing identity; legacy twin IDs resolve as aliases |
| AC-D2 | Every committed change of canonical fields creates an immutable revision (1, 2, …); stored revisions cannot be updated or deleted (database trigger) |
| AC-D3 | Title, statement, rationale, type, source, owner, priority, verification methods, acceptance criteria, applicability and custom attribute values are separate fields; comments are separate records |
| AC-D4 | Lifecycle (draft, in-review, approved, retired), review records, verification results (twin artifacts), compliance assessment and modelled satisfaction (`satisfies`, SysML) are separate records; approval never implies verification or satisfaction |
| AC-D5 | Relationship types have documented meaning, direction and permitted endpoints; invalid endpoints, self-links, duplicates and cycles in `derives-from`/`decomposes` are refused |
| AC-D6 | Collection hierarchy (headings, membership, order) never creates or implies `derives-from` or `decomposes` |
| AC-D7 | Archival and restoration are explicit, recorded, and never delete data |
| AC-D8 | Custom attribute definitions are typed; values are validated against their definition (type, range, enumeration, multiplicity) |

### Core functionality and UI (brief §2)

| ID | Criterion |
| --- | --- |
| AC-U1 | Table with search, filters (status, type, collection, archived), configurable columns, cursor pagination ("Load more") |
| AC-U2 | Detail editing with unsaved/saving states; a failed save keeps all input and shows the error and a retry |
| AC-U3 | Collections tree with headings, ordering (move up/down without drag), add/remove membership |
| AC-U4 | Relationship editing (typed), including allocation to twin components chosen from the shared model |
| AC-U5 | Traceability matrix (rows × columns by relationship type), configurable |
| AC-U6 | Lifecycle transitions and review decisions with role checks surfaced in the UI and enforced on the server |
| AC-U7 | Baselines: create, list, open read-only historical view (clearly labelled), compare with another baseline or the working state; revision comparison per requirement |
| AC-U8 | History shows actor, timestamp and reason per change |
| AC-U9 | Impact assessment lists potentially affected linked items (requirements, twin components, SysML references known to the host) |
| AC-U10 | Saved views; validated bulk operations with explicit atomic or per-item semantics |
| AC-U11 | JSON and ReqIF import/export from the UI with preview |
| AC-U12 | Desktop, tablet and phone layouts using design-system components and tokens; no essential action depends on hover, right-click or drag |

### Quality assistance (brief §3)

| ID | Criterion |
| --- | --- |
| AC-Q1 | Checks for multiple obligations, vague wording, missing units/tolerances, undefined references (TBD/TBR, unknown keys), missing acceptance criteria, missing source or rationale, potential duplicates, missing expected traceability |
| AC-Q2 | Each finding states its class: deterministic validation, heuristic suggestion or optional assistant review; shows issue, explanation and a proposed improvement |
| AC-Q3 | Findings can be dismissed with a reason; dismissals are recorded per requirement revision and reappear when the text changes |
| AC-Q4 | Writing conventions (modal verbs, vague-term list, unit requirement, rule enablement) are configurable per project; "shall" is not enforced universally |
| AC-Q5 | The system never rewrites or approves a requirement automatically and states that necessity, feasibility, correctness and completeness need engineering judgement |

### Backend (brief §4, §5, §8)

| ID | Criterion |
| --- | --- |
| AC-B1 | Real PostgreSQL; version-controlled SQL migrations; reproducible seed; secret-free `.env.example`; Docker Compose and an npm-started real PostgreSQL |
| AC-B2 | Reset command refuses any database other than `ews_dev` or a test database |
| AC-B3 | Demo persistence only when explicitly chosen; API failures are shown, never replaced by demo data |
| AC-B4 | Normalised tables with foreign keys, unique constraints, indexes and explicit deletion policies; JSONB only for extensible metadata |
| AC-B5 | Optimistic concurrency: ETag / If-Match or `expectedRevision`; mismatches return 409 with the current revision |
| AC-B6 | Idempotency-Key on POST/PATCH replays the first outcome for 24 h; reuse with a different request is refused |
| AC-B7 | Transactional outbox; events are emitted only after commit; SSE endpoint with resume; events carry event ID, entity ID, committed revision, configuration |
| AC-B8 | Entitlements and roles enforced on every endpoint; permissions matrix documented in OpenAPI and the progress file; development identities refused in production |
| AC-B9 | Audit events append-only through the API (database trigger refuses update/delete) |
| AC-B10 | Attachments through an object-storage abstraction with metadata and provenance in PostgreSQL; local filesystem adapter |
| AC-B11 | OpenAPI 3.1 with explicit schemas, examples, error model, permissions and bulk semantics |
| AC-B12 | Search and pagination remain correct and stable on a generated dataset of at least 5 000 requirements |

### SysML integration (brief §6)

| ID | Criterion |
| --- | --- |
| AC-S1 | SDK `RequirementsService` adapters (HTTP and demo) pass one reusable contract test suite |
| AC-S2 | SysML can create and edit canonical fields through the same API validation (`tool:sysml` subset) |
| AC-S3 | Baseline-aware and configuration-aware `get`/`list` |
| AC-S4 | Mapping to SysML v2 constructs documented with unsupported mappings listed; no conformance claim |
| AC-S5 | SDK usage examples for SysML and CAD consumers, using only `ToolApi.services.requirements` |

### ReqIF (brief §7)

| ID | Criterion |
| --- | --- |
| AC-R1 | Secure parsing: DOCTYPE/entity declarations refused, no external resolution, size limits |
| AC-R2 | Validation against the official OMG ReqIF schemas (downloaded, checksum-pinned) |
| AC-R3 | Header, datatypes, attribute definitions, spec object types, objects, specifications with ordered hierarchy, relations, relation types, relation groups, enumerations, XHTML, external IDs and LAST-CHANGE are read and written |
| AC-R4 | Import preview classifies records as new, changed, unchanged or conflicting, shows attribute and relationship mappings, validation findings and unsupported content |
| AC-R5 | Mapping is keyed by exchange source; re-import updates matched records without duplicates and without colliding with another source |
| AC-R6 | Absence from a file never deletes local requirements; policies are explicit |
| AC-R7 | XHTML sanitised; attachment paths constrained to the package; attachments stored via object storage |
| AC-R8 | Export of a selection, a configuration or a baseline; schema-valid; lossy or unsupported mappings reported |
| AC-R9 | Semantic round trip preserves identifiers, attribute values, enumeration selections, hierarchy, relationships and supported rich text |
| AC-R10 | Externally produced samples imported; the interoperability report states exactly which real-tool exchanges were and were not tested |

## 2. Product choices (made, with reason)

| Choice | Reason |
| --- | --- |
| Lifecycle: `draft → in-review → approved → retired`, plus `in-review → draft` (rejected/withdrawn), `approved → draft` (reopened), `retired → draft` (reinstated) | Matches the SDK contract statuses. Editing canonical fields of an `in-review` or `approved` requirement creates a new draft revision and supersedes the open review, so an approval always refers to the exact revision approved |
| Approval needs a review with an `approve` decision by a reviewer or administrator who did not author that revision | Separates authorship from approval (DOORS Next, Jama and Polarion document reviews; the separation rule is our choice) |
| Relationship types `derives-from`, `decomposes`, `depends-on` (requirement → requirement) and `allocated-to` (requirement → twin component) are stored here; `references`, `satisfies` are SysML-owned; `verifies` belongs to verification artifacts | Contracts §2 |
| Collections are reference structures; one requirement may appear in several collections, at most once per collection | ReqIF allows multiple occurrences; we restrict to one per collection to keep ordering and baseline comparison simple (lossy case reported on import) |
| Baselines are project-wide or scoped to selected collections, optionally tagged with a configuration | Contracts §8 |
| Bulk operations: `atomic: true` (all-or-nothing, default) or `atomic: false` (per-item outcomes) | Brief §5 asks us to define this |
| Quality checks run on the server; the demo adapter does not run them | One implementation of the rules; the demo is an explicit, limited mode |
| ReqIF: version 1.2 namespace (`…/20110401/reqif.xsd`); `.reqif` and `.reqifz` (ZIP) | Only one ReqIF namespace exists for 1.0.1–1.2 |
| Absent records on re-import are reported as "absent from file" and left unchanged | Brief §7 |

## 3. Unresolved questions

| Question | Owner |
| --- | --- |
| Production identity provider (OIDC) and how platform roles are administered | Coordinator |
| Whether twin-owned links (`references`, `satisfies`, `verifies`) should be served by the Requirements API or merged by the host | Coordinator (integration need) |
| Whether verification records should pin the UUID and API revision once requirements are projected into the model index | Coordinator |
| Legally binding electronic signatures for approvals | Product decision; not implemented |
| How many characteristics and rules from INCOSE GtWR v4 and ISO/IEC/IEEE 29148 should become built-in checks | Needs the documents (not accessible) |

## 4. Provisional items depending on inaccessible sources

These are implemented as **configurable** behaviour and must be checked against the full texts
when available:

- Characteristics of individual requirements and sets (ISO/IEC/IEEE 29148:2018 §5.2; INCOSE GtWR v4
  §2). Our quality rules cite NASA Appendix C instead.
- Rule set R1–R42 of INCOSE GtWR v4 (vague terms, combinators, purpose phrases, absolutes,
  pronouns, units and tolerances, decimal format R40). Our vague-term and combinator lists come from
  NASA Appendix C C.4 and are editable per project.
- Requirement attribute sets recommended by 29148 §5.2.8 and GtWR v4 (our built-in fields plus
  custom attributes cover the common ones: identifier, rationale, source, owner, priority, status,
  verification method, acceptance criteria).
- Rich traceability and satisfaction arguments (Dick, Hull, Jackson, 4th ed., ch. 7): backlog.

## 5. Backlog (researched, not in the first release)

### Requested navigation enhancement

Owner request, 14 October 2026: [Requirements navigation and filtering at scale](../../specifications/requirements-navigation-filtering.md).
Status: planned. Deliver a configurable bounded left submenu (default 10), scroll/page navigation,
contextual/structured filters and AI-accessible criteria in small usable increments. Existing table
cursor pagination and saved views remain the starting point. Platform owns the left navigation;
Requirements owns query/filter semantics. Acceptance IDs NAV-R01–NAV-R12 and the staged backlog
are maintained in the specification, not counted as completed AC-U1 or AC-U10 work.

### Other backlog

| Item | Seen in | Notes |
| --- | --- | --- |
| Streams/branches of requirements, merge | DOORS Next (DN1), Polarion (PO1) | Configuration applicability only, for now |
| Reuse with synchronisation (copy plus sync status) | Jama (J1), Polarion (PO1) | Membership in several collections covers shared use |
| Suspect links (automatic when an endpoint changes) | Jama (J1), Codebeamer (C1) | Impact view and revision pins exist; automatic suspect flags not yet |
| Formal change requests / change sets | DOORS Next (DN1) | Change reasons and history exist |
| Electronic signatures | DOORS Next, Jama, Polarion | Not legally binding in any form here |
| Document-style reports (PDF/Word) | DOORS Next, Polarion, Jama | JSON and ReqIF export only |
| Rich traceability (satisfaction arguments) | Dick, Hull, Jackson (TOC) | — |
| ReqIF tool-extension profiles (e.g. DOORS, Polarion conventions) | D1, PO2 | Tool extensions are preserved, not interpreted |
| ReqIF relation groups as first-class exportable objects | ReqIF 1.2 | Imported and preserved; export writes them only when preserved |
| OSLC provider | DOORS Next (DN1) | — |
| Glossary-backed terminology checks | NASA App. C C.4 Consistency | Needs a glossary service |
| Real AI review provider | — | The platform assistant is a scripted demo (ADR-0010) |
