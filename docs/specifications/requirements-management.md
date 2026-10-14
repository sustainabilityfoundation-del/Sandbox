# Requirements Management Module — Implementation Specification

Research, implement, and integrate the Requirements Management module in our existing modular engineering workspace.

Combine established requirements-engineering practices with the fundamental capabilities of industry-leading tools. Implement a real PostgreSQL-backed API, integration with our SysML module, and ReqIF import/export.

Inspect the existing repository and architecture instructions first. Extend the current platform rather than rebuilding it. Preserve the shared digital twin, platform SDK, design system, subscriptions, ChatGPT integration, responsive layouts, and detached windows.

## 1. Research And Implementation Basis

Research these references using official publishers, author resources, standards organizations, and legally accessible material:

- Requirements Engineering — Jeremy Dick, Elizabeth Hull, Ken Jackson, 4th edition.
- Requirements Engineering for Software and Systems — Phillip A. Laplante, Mohamad H. Kassab, 4th edition.
- Requirements Engineering: Fundamentals, Principles, and Techniques — Klaus Pohl, 2nd edition.
- Requirements Engineering: From System Goals to UML Models to Software Specifications — Axel van Lamsweerde.
- Software Requirements — Karl Wiegers, Joy Beatty, 3rd edition.
- Writing Better Requirements — Ian Alexander, Richard Stevens.
- INCOSE Guide to Writing Requirements, version 4.
- ISO/IEC/IEEE 29148.
- NASA Systems Engineering Handbook, particularly Appendix C.
- The official OMG Requirements Interchange Format (ReqIF) specification, schemas, and supporting resources.
- Official OMG SysML v2 specifications for relevant integration mappings.

Verify applicable editions and versions. Distinguish full-text findings from previews and summaries. Do not claim access to inaccessible material or reproduce substantial copyrighted content.

Also research current official documentation for:

- IBM DOORS and DOORS Next, distinguishing the products.
- Siemens Polarion Requirements.
- Jama Connect.
- PTC Codebeamer.

Create a source-backed capability matrix covering authoring, hierarchy, attributes, reuse, traceability, baselines, reviews, change control, configurations, verification links, search, bulk editing, permissions, audit, APIs, reporting, and ReqIF exchange.

Separate documented capabilities from interpretations, paid extensions, and integrations.

Translate research into implementation acceptance criteria. Identify product choices and unresolved questions. Do not claim standards compliance or enterprise feature parity without supporting evidence.

## 2. Domain And Core Functionality

Implement typed entities for:

- Stable requirement identity and separate human-readable identifier.
- Immutable requirement revisions.
- Title, statement, type, rationale, source, owner, and priority.
- Lifecycle status and review records.
- Configuration applicability.
- Verification method and acceptance criteria.
- Custom attribute definitions and typed values.
- Collections, headings, membership, and ordering.
- Typed relationships.
- Baselines, comments, change records, and external references.

Keep normative text separate from rationale and comments.

Keep approval, verification results, compliance assessment, and modeled satisfaction claims distinct.

Define the meaning, direction, and permitted endpoints of decomposition, derivation, dependency, allocation, satisfaction, and verification relationships.

Document hierarchy must not automatically imply engineering derivation or decomposition.

Implement:

- Structured requirements collections.
- Searchable/filterable tables and configurable columns.
- Detail editing, creation, archival, and restoration.
- Custom attributes.
- Component allocation and relationship editing.
- Traceability matrices.
- Draft, in-review, approved, and retired workflows.
- Immutable baselines and revision comparisons.
- Change history with actor, timestamp, and reason.
- Impact assessment showing potentially affected linked items.
- Saved views and validated bulk operations.
- JSON and ReqIF import/export.

Reuse shared React Aria controls, Tailwind tokens, and Phosphor icons. Support desktop, tablet, and phone layouts.

## 3. Requirement Quality Assistance

Provide explainable checks for:

- Multiple obligations.
- Vague wording.
- Missing units or undefined references.
- Missing acceptance criteria.
- Missing source or rationale.
- Potential duplicates.
- Missing expected traceability.

Distinguish deterministic validation, heuristic suggestions, and optional AI review.

Show the issue, explanation, and proposed improvement. Allow dismissal with a reason.

Make writing conventions configurable. Do not universally enforce “shall” or one sentence template.

Do not automatically rewrite or approve requirements. Explain that necessity, feasibility, correctness, and completeness require engineering judgement.

## 4. Postgresql And Backend

Implement a real server-side HTTP API backed by PostgreSQL.

Reuse the existing backend stack. If none exists, select a straightforward maintained TypeScript backend and database library after checking current official documentation.

The frontend communicates with the API; only the backend connects to PostgreSQL.

Provide:

- Version-controlled migrations.
- Reproducible seed data.
- Secret-free example environment configuration.
- Local PostgreSQL setup, preferably Docker Compose.
- Commands to start the database, backend, and frontend.
- A reset command explicitly restricted to the development database.

Make API persistence the default development mode. Retain mock persistence only as an explicit demo option. Do not silently fall back after API failures.

Normalize core entities, revisions, relationships, collection ordering, baselines, reviews, and audit records.

Use foreign keys, uniqueness constraints, indexes, and explicit deletion policies. Use JSONB selectively for extensible metadata, not as an opaque whole-project store.

Keep shared digital-twin identities consistent. Do not duplicate CAD components or SysML objects inside the Requirements domain.

Maintain service ownership even if modules initially share one database. Other modules must use public APIs instead of Requirements tables.

Store large attachments through an object-storage abstraction, with metadata and provenance in PostgreSQL. A local development storage adapter is sufficient initially.

## 5. Public Api And Sdk

Expose a typed, versioned Requirements service through platform-sdk and implement corresponding HTTP endpoints.

Cover:

- Requirements, collections, ordering, and custom attributes.
- Search, filters, pagination, and saved views.
- Typed relationships and traceability queries.
- Reviews and lifecycle transitions.
- Baselines, revision comparison, and history.
- Bulk operations.
- Import/export jobs.
- Quality findings and integration notifications.

Publish OpenAPI documentation with explicit schemas and examples.

Define validation, errors, timestamps, identity, configuration, and revision semantics.

Use optimistic concurrency through expected revisions or ETags. Return explicit conflicts instead of overwriting newer changes.

Use transactions for related edits and idempotency for retryable operations. Define whether bulk operations are atomic or produce per-item outcomes.

Keep frontend tools behind the existing service interface with an HTTP adapter.

## 6. Sysml Integration

Inspect the existing SysML package and establish shared contracts before implementing integration.

Ownership:

- Requirements owns canonical text, identifiers, rationale, lifecycle, and requirement baselines.
- SysML owns model structure, diagram layout, expressions, and parameters.
- Shared relationships have explicit ownership and are accessed through common services.

A requirement in a SysML view must reference its canonical requirement ID. Do not create an independent editable copy of its statement.

Implement:

- Placing an existing requirement in a SysML view.
- Creating requirements from SysML through the Requirements API.
- Editing canonical fields from either tool through identical validation.
- Linking requirements to supported SysML elements.
- Navigating between requirements and representations.
- Configuration-aware and baseline-aware retrieval.
- Refreshing affected views after committed changes.

Document mappings to supported SysML v2 constructs. Preserve distinctions between derivation, decomposition, allocation, satisfaction, and verification. Identify unsupported mappings explicitly.

Do not claim full SysML v2 conformance.

## 7. Reqif As A First-Class Exchange Format

Implement ReqIF as a supported interoperability capability, not merely a planned feature.

Use the official OMG specification and schemas as the implementation basis. Choose a suitable maintained library where available; otherwise isolate parsing and serialization in a dedicated adapter package.

Investigate and support the core exchange structures:

- Header and document metadata.
- Datatype definitions and typed attribute definitions.
- Specification object types and requirement objects.
- Specifications and ordered hierarchy.
- Relations, relation types, and relation groups.
- Enumeration definitions and selected values.
- XHTML rich text and referenced attachments where supported.
- External identifiers and change timestamps.

Document the precise supported version and feature coverage.

Keep canonical internal UUIDs separate from external ReqIF identifiers. Maintain mappings by exchange source so re-import updates matched records without duplicating them or colliding with another source.

Provide import preview with:

- New, changed, unchanged, and conflicting records.
- Attribute and relationship mappings.
- Validation findings.
- Explicit treatment of unsupported content.

Do not delete local requirements merely because they are absent from an imported file. Make deletion and replacement policies explicit.

Validate XML against the applicable official schemas. Use secure parsing with external entity resolution disabled, sanitize rendered XHTML, and constrain attachment paths.

Preserve unmapped content for re-export where practical. Otherwise report unsupported or lossy transformations clearly before import or export.

Implement explicit export mappings for project selections, configurations, and baselines. Do not misrepresent internal lifecycle or traceability semantics when the receiving format lacks a direct equivalent.

Handle ReqIF files and document any supported packaging convention separately, including attachment packaging.

Verify:

- Import of representative external fixtures.
- Schema-valid export.
- Semantic round trips preserving identifiers, attribute values, enumeration selections, hierarchy, relationships, and supported rich text.
- Re-import without duplicate creation.
- Conflict handling.
- Clear reporting of unsupported extensions.

A self-generated round trip alone does not establish interoperability. Use legally available externally produced samples, and report which real-tool exchanges were tested.

## 8. Synchronization, Authorization, And Audit

Emit typed notifications only after committed changes. Include event ID, entity ID, committed revision, and configuration context.

Use a transactional outbox or equivalent reliable committed-change mechanism.

Consumers invalidate caches and reread authoritative records. Handle duplicate delivery safely.

Preserve detached-window synchronization and revision checks.

Baselines must pin requirement revisions, relevant relationship revisions, and collection structure. Clearly distinguish live and historical views.

Preserve historical evidence when changes make assessments potentially stale.

Enforce subscription entitlements and project permissions on the backend. Support reader, editor, reviewer, and administrator roles with a documented permissions matrix.

Reuse authentication if present. Otherwise provide explicit development identities and document the production integration point.

Keep audit events append-only through application APIs without claiming tamper-proof or regulatory-compliant storage.

## 9. Chatgpt And Independent Tool Development

Register Requirements assistant actions through the existing platform mechanism.

Support reading, explaining, suggesting wording, and proposing changes. Retain previews, Apply/Reject, validation, revision checks, activity logging, and Undo.

Keep Requirements independently runnable in its standalone development harness.

Update its README and AGENTS.md with ownership, dependencies, public contracts, and validation commands.

Provide SDK examples for SysML and CAD consumers. Neither should import Requirements implementation internals.

## 10. Execution And Acceptance

### Implementation stages

1. Research and acceptance matrix.
2. Shared domain contracts and schema.
3. PostgreSQL API.
4. Core Requirements UI.
5. SysML integration.
6. ReqIF exchange.
7. Quality assistance and refinements.

Complete the functional first release before adding speculative infrastructure. Track advanced researched capabilities in an explicit backlog.

Test against a disposable real PostgreSQL database and verify:

- Persistence across restarts.
- Clean migrations and seeds.
- Concurrent-edit conflicts.
- Stable historical baselines.
- Relationship constraints.
- Backend entitlement and permission enforcement.
- Requirements and SysML resolving the same canonical data.
- Cross-tool and cross-window refresh.
- API failures preserving unsaved input.
- Idempotent retries.
- ReqIF interoperability and re-import.
- Search and pagination on a larger generated dataset.

Run build, type checks, and relevant tests. Inspect the UI through available browser tooling and report any checks that could not be performed.

### Deliverables

- Research note and competitor capability matrix.
- Working Requirements module and PostgreSQL API.
- OpenAPI and SDK documentation.
- Supported SysML mapping documentation.
- ReqIF support and interoperability report.
- Local setup instructions.
- Implemented acceptance results and remaining backlog.

Make reasonable implementation decisions without stopping for routine clarification. Finish with a concise account of implemented behaviour, verification, sources actually inspected, and limitations.
