# Conceptualize: progress

Maintained by the Conceptualize agent. Brief: [conceptualize.md](conceptualize.md) (do not edit).
Contracts: [conceptualize-contracts.md](conceptualize-contracts.md).

Branch: `feature/conceptualize`. Worktree: `C:\Users\kimge.000\Documents\Sandbox-conceptualize`.
Base: `main` 6b7ea34.

## Implementation plan and milestones

Same architecture and conventions as Requirements (ADR-0011, ADR-0015): `services/conceptualize`
(schema `conceptualize`, migrations, seed, Fastify plugin, TypeBox schemas → Ajv + OpenAPI 3.1,
outbox + SSE, idempotency, ETags), `packages/conceptualize-client` (transport, full module client,
HTTP and demo adapters of the SDK `ConceptsService`, contract test suite, natural-language and unit
helpers), `packages/tool-conceptualize` (UI, assistant contribution with `demo` planner, help,
harness). No new third-party dependencies: TypeBox, Fastify, pg, Ajv are already used by Requirements;
the graph view is plain SVG.

| # | Milestone | Content | Status |
| --- | --- | --- | --- |
| M0 | Plan | This plan, conflicts, ownership check | done |
| M1 | Domain and persistence | Schema: concepts, immutable revisions, typed statements (intent, assumptions, questions, with basis and provenance), relationships (9 types, validated, no containment cycles), decompositions, alternative sets, decisions, trade studies (criteria, options, append-only scores), evidence, implementations + artifact refs + realization requests, concept↔artifact links (requirements), maturity events, audit, outbox, idempotency. Unit-aware quantities with dimension checks | done (f5fd9eb) |
| M2 | HTTP API | CRUD, revisions/compare/history, maturity and verification status, branch, assessment, graph, relationships, decompositions, alternatives, decisions (approval gate), trade studies with computed results, evidence, implementations, links, artifact→concepts, explorations (atomic AI/UI bulk create + compensating undo), permissions, SSE, OpenAPI + docs; registered in services/api | done (f5fd9eb) |
| M3 | Client | HTTP adapter (SDK), module client, demo adapter (SDK read contract), contract tests on both | done (c40a038) |
| M4 | Tool UI | Concept Explorer (search, filters, tree and graph), Concept Workspace (intent, structure, history, decisions), Alternative Explorer (side-by-side trade study, branching, decisions), AI collaboration (hypotheses to confirm, assumptions, questions, next steps, provenance), Engineering integration (implementations, requirement traceability, stale/broken links, change notifications, realization requests); harness; workspace registration | |
| M5 | AI | `concepts.*` actions returning service proposals (apply via API with idempotency key and provenance, undo), scripted `demo` planner for the actuator prompt and similar, preliminary calculations computed (not invented) and labelled estimates | |
| M6 | Integration | Draft requirements proposed through `services.requirements`; SysML/CAD links through twin IDs and the model index; CAD generation as recorded realization request; analysis via labelled test adapter | |
| M7 | Documentation and tests | Help manifest and pages, capability inventory entries, docs/modules/conceptualize.md, real-PostgreSQL tests, browser flows | |
| M8 | Remaining functionality | See backlog | |

Vertical slice = M1–M5 plus the help/test parts of M7, working end to end in the workspace on the
real API and PostgreSQL.

## Domain model (summary; full description in docs/modules/conceptualize.md)

- **Concept**: UUID + key `CON-001`; record (maturity, verification status, current revision) and
  immutable **revisions** (name, summary, description, abstraction, classifications, purpose,
  attributes as quantities, statements). Provenance on every revision: actor, source kind
  (`user`, `assistant` with conversation/proposal/message IDs, `import`, `system`), reason.
- **Statements** (hybrid semantic representation): kind (`function`, `behavior`, `principle`,
  `effect`, `input`, `output`, `constraint`, `interface`, `mechanism`, `problem`, `capability`,
  `performance`, `assumption`, `uncertainty`, `question`, `rationale`, `note`), text, optional quantity
  `{value, unit, min, max}`, and **basis**: `user-assertion`, `ai-hypothesis`, `assumption`,
  `estimate`, `evidence` (needs an evidence record), `decision` (needs a recorded decision). Stable
  statement IDs across revisions. The server refuses assistant-sourced writes that set
  `user-assertion`, `evidence` or `decision`, and refuses promoting an AI hypothesis to evidence or
  decision without the record. Confirming a hypothesis is an explicit user action.
- **Maturity** (idea … archived) separate from **implementation status** (derived from
  implementations) and **verification status** (recorded, needs verified evidence). No mandatory
  sequence; `selected` and later, and superseding such a Concept, need reviewer or administrator.
- **Relationships**: contains (inverse part-of), depends-on, interfaces-with (with interface
  definition), alternative-to, derived-from, refines, implements, conflicts-with, replaces. Many to
  many, across abstraction levels; no self links; acyclic types refuse cycles (containment over the
  union of all decompositions); symmetric types refuse duplicates in either direction.
- **Decompositions**: named alternative decomposition structures of a parent; contains links may
  belong to one; shared children allowed.
- **Alternative sets**: a question under a parent Concept with member Concepts (each its own identity,
  so branches never overwrite each other). Member status changes only through decisions.
- **Design decisions**: `DEC-001`, outcomes per Concept (accepted, rejected, deferred) with rationale,
  status proposed → recorded / withdrawn, supersession preserves the old record.
- **Trade studies**: criteria (performance, mass, cost, complexity, manufacturability, risk, custom;
  weight, direction, unit or qualitative scale), options, append-only scores (value or range, qualitative
  1–5, basis, rationale). Results computed by the server with ranges and coverage; labelled
  preliminary unless every score is evidence.
- **Evidence**: calculations, analyses, tests, references, estimates; inputs, outputs, units,
  assumptions, model/artifact revision; immutable.
- **ConceptImplementation**: `IMP-001`, realizes one or more Concepts, status, artifact refs (SDK
  `ArtifactRef`, revision-pinned), realization requests (pending CAD generation and similar).
- **Concept links**: Concept ↔ requirement (satisfies, derives, refines, proposes) or any artifact
  (references), revision-pinned.

## Roles and permissions (server-enforced, documented in OpenAPI `x-permissions`)

| Permission | reader | editor | reviewer | administrator |
| --- | --- | --- | --- | --- |
| read (everything, events, assessment) | ✓ | ✓ | ✓ | ✓ |
| author (Concepts, statements, relationships, decompositions, alternative sets, trade studies, evidence, implementations, links, explorations, maturity up to `evaluated`, proposed decisions, deferred decisions) |  | ✓ |  | ✓ |
| decide (record accepted/rejected decisions, select alternatives, maturity `selected` and later, supersede or archive Concepts that are `selected` or later, verification status) |  |  | ✓ | ✓ |

Entitlement `tool:conceptualize` on every route.

## Vertical slice acceptance (brief §13)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Create a Concept from natural language | | |
| 2 | Persist and retrieve it | | |
| 3 | Decompose into child Concepts | | |
| 4 | Generate multiple alternatives | | |
| 5 | Compare and select alternatives | | |
| 6 | Link to a mock or real artifact through the contract | | |
| 7 | Concept identity preserved when the implementation changes | | |
| 8 | Traceability of AI-generated modifications | | |
| 9 | Visualization of hierarchy and alternatives | | |
| 10 | Unit, integration and API contract tests pass | | |

## Contract change requests

None yet.

## Integration needs for the coordinator

None yet.

## Architectural conflicts found

(Beyond contracts §9.)

1. **Registering a fourth tool breaks coordinator-owned tests** that enumerate the tools:
   `packages/design-system/src/theme/designSystem.test.ts` ("finds the tool packages" expects exactly
   cad, requirements, sysml) and `apps/workspace/src/platform/platform.test.ts` (expects the registry
   to be exactly requirements, sysml, cad). Registration is allowed (contracts §2), so these
   expectations must change with it; see integration needs.
2. **Fresh databases do not get `tool:conceptualize`** from an additive migration alone: platform
   migrations run before `seedPlatform` creates the development users, so a migration can only grant
   the entitlement to users that already exist (the coordinator's dev database). See integration needs.
3. **Service proposals are prepared together, applied later**: the demo planner plans all calls up
   front and the user applies each proposal separately, so later calls cannot reference records
   created by earlier applies. Multi-record AI work is therefore one atomic *exploration* proposal.
4. **No SDK dimension helpers**: the SDK has `Quantity` and `formatQuantity` but no dimensional
   analysis; the service implements unit parsing and dimension checks (contract change request).
5. **No Concept icon** in the design system; the tool uses an existing semantic icon (request).
6. **Provenance is asserted by the browser**: service proposals run in the browser, so the server
   records the source kind the client declares (`X-Source-Kind: assistant`). It enforces the stricter
   rules for assistant-sourced writes, but cannot prove a request did not come from the assistant
   until the execution gateway of ADR-0013 exists.

## Limitations and risks

## Feature backlog (prioritized)

## Handoff log

- f5fd9eb: service, schema, API (≈50 operations), seed, host registration, platform migration 0002, 19 real-PostgreSQL API tests, domain unit tests.
- c40a038: client package (HTTP + demo adapters, module client, NL drafts), contract tests on both adapters (29 DB tests green). Contracts §3 clarification applied (cad = CAD-…, sysml = SYS-…, twin = components and saved results).
- Next (coordinator priority, 14 Oct): vertical slice in the real workspace: tool-conceptualize (Explorer tree/graph, Workspace, Alternative Explorer, implementation linking), assistant actions with service proposals and demo planner, workspace registration (tools.ts, services.ts, capabilities.ts), help, seed the 500 N example, browser check; then message the coordinator ("main") and continue with M6–M8.
