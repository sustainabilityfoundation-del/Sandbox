# Conceptualize: agreed contracts and ownership

Status: agreed by the coordinator, 14 October 2026, before delegation. Brief:
[conceptualize.md](conceptualize.md). Progress: [conceptualize-progress.md](conceptualize-progress.md).
Decision: [ADR-0015](../decisions/0015-conceptualize-module.md).

The Conceptualize agent may **propose** changes (progress file, "Contract change requests"); the
coordinator decides and edits coordinator-owned files.

## 1. Placement (modularization decision)

Same pattern as Requirements (ADR-0011), so the module is independently buildable, testable and
deployable inside the monorepo (ADR-0001) and movable to its own repository later:

| Package | Name | Role |
| --- | --- | --- |
| `services/conceptualize` | `@ews/conceptualize-service` | Domain rules, PostgreSQL schema `conceptualize`, migrations, seed, Fastify plugin, OpenAPI 3.1, outbox and events. No React. Imports only `@ews/platform-sdk` (framework-free entry) |
| `packages/conceptualize-client` | `@ews/conceptualize-client` | Browser client: HTTP adapter and explicit demo adapter of the SDK `ConceptsService`, the module's full typed client, event stream client, adapter contract tests |
| `packages/tool-conceptualize` | `@ews/tool-conceptualize` | UI (Concept Explorer, Workspace, Alternative Explorer, AI collaboration, Engineering integration), assistant contribution, help manifest, standalone harness |

`services/api` hosts the plugin at `/api/concepts/v1` (it already hosts Requirements). Boundary rules are
in `packages/platform-sdk/src/boundaries.test.ts`.

## 2. File ownership during the Conceptualize work

| Owner | Paths |
| --- | --- |
| Conceptualize agent | `services/conceptualize/**`, `packages/conceptualize-client/**`, `packages/tool-conceptualize/**` (incl. `help/`), `docs/specifications/conceptualize-*.md` except this file and the brief, `docs/modules/conceptualize.md` |
| Conceptualize agent, limited (coordinator reviews) | `services/api/src/server.ts` and `services/api/src/main.ts`: register the plugin and its API docs (`registerApiDocs`), nothing else. `services/api/src/platform/migrations/`: one **additive** migration granting `tool:conceptualize` per §6. `apps/workspace/src/platform/tools.ts`: register the tool. `apps/workspace/src/platform/services.ts`: construct the concepts adapter from the existing service settings. `apps/workspace/src/assistant/capabilities.ts`: **append** Conceptualize entries (its completeness tests require them). Root `package.json`: scripts prefixed `concept:`. `docs/dependencies.md`: append rows |
| Coordinator | Everything else, in particular `packages/platform-sdk`, `packages/model-service`, `packages/design-system`, the other tools and services, the rest of `apps/workspace` (assistant execution, conversation, inspector, shell, help service), root `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/` |

The Requirements module is idle; do not edit its packages. Request what you need.

## 3. Identity and data ownership

- Concept identity: UUID; `key` (`CON-001`) is display text. Concepts never take an artifact's identity.
- Conceptualize owns: Concepts and their immutable revisions, typed Concept↔Concept relationships,
  alternatives and decomposition structures, design-decision records, trade studies and scores,
  assumptions, open questions, evidence records, ConceptImplementations and their artifact references,
  lifecycle (maturity) events.
- Other modules stay authoritative for their artifacts. Conceptualize stores **references**
  (`ArtifactRef`: module, canonical ID, optional pinned revision, kind), never copies of their data.

| Referenced artifact | `module` | `id` |
| --- | --- | --- |
| Requirement | `requirements` | requirement UUID (Requirements service) |
| SysML element | `sysml` | twin object ID (`SYS-…`) |
| CAD representation | `cad` | twin object ID (`CAD-…`) |
| Physical component (part, assembly) | `twin` | twin object ID (`ROD-120`, `ACT-100`) |
| Saved result, calculation, verification record | `twin` | artifact ID (`OUT-…`) |
| Analysis model or study | `analysis` | no Analysis module exists today (retired): use a test adapter, label it |
| Anything else | `external` | URL or document reference |

## 4. Cross-module contract (SDK 1.5)

`packages/platform-sdk/src/contract/concepts.ts`: `ConceptsService` (`get`, `list`, `conceptsForArtifact`,
`implementations`, `subscribe`), `ConceptSummary`, `ConceptMaturity`, `ConceptAbstraction`, `ArtifactRef`,
`ConceptImplementationSummary`, `ConceptsEvent`, `ConceptsServiceError`. Tools receive it as
`ToolApi.services.concepts`. Other modules use only this; the Conceptualize tool may use its own client.

## 5. AI integration (SDK 1.5)

- Assistant actions are contributed by `packages/tool-conceptualize` (`concepts.*` names) and run
  through the platform executor.
- **Mutations return `ServiceProposal`** (`kind: 'service-proposal'`): the platform shows the preview
  (items with `basis`: user statement, AI hypothesis, assumption, estimate, evidence) and calls `apply`
  only when the user chooses Apply. `apply` uses the Concepts API with idempotency keys and expected
  revisions and records provenance (`conversationId`, `proposalId`). Offer `undo` as a compensating
  change where possible. The preview policy is unchanged.
- **Demo only**: `AssistantContribution.demo` may map prompts such as the actuator example to a
  sequence of `concepts.*` actions, because no model provider is connected. Generated content must be
  marked `ai-hypothesis` or `estimate`, never presented as fact, and the UI must say it is a scripted demo.
- Add every Conceptualize capability and assistant action to `apps/workspace/src/assistant/capabilities.ts`.
- The assistant reads Conceptualize help through `read_help`; ship a complete help manifest (§8).

## 6. Identity, roles and entitlements (development)

Entitlement `tool:conceptualize` (in the "All tools" demo plan). Additive platform migration grants it to
`ada` (administrator), `rui` (reviewer), `eli` (editor) and `rho` (reader); `nia` stays without it. Roles
reuse project membership: reader reads; editor creates and edits Concepts, alternatives, trade studies,
implementations and proposed decisions; **reviewer or administrator** records accepted/rejected decisions,
selects alternatives and supersedes Concepts that are `selected` or later (approval gate). Document the
permissions matrix in OpenAPI and the progress file. The server enforces all of it.

## 7. HTTP and events

- Base path `/api/concepts/v1`; OpenAPI 3.1 at `/api/concepts/v1/openapi.json`; interactive reference at
  `/api/concepts/v1/docs` via `registerApiDocs` (services/api).
- Same conventions as Requirements (contracts §5): error body, ETag/If-Match or `expectedRevision`,
  `Idempotency-Key`, cursor pagination, RFC 3339 UTC, explicit bulk semantics.
- Transactional outbox; SSE at `/api/concepts/v1/projects/{projectId}/events` with resume and reset;
  event types per `ConceptsEventType`.
- Units: numerical properties are `{ value, unit }` with dimension checks; use the SDK's quantity helpers.

## 8. Help, inventory and tests (definition of done)

- Help manifest with topics in `packages/tool-conceptualize/help/` (overview, getting started, every
  feature, AI collaboration, alternatives and trade studies, implementation links, troubleshooting, API);
  every toolbar item and assistant action mapped; significant controls with `data-help-id`.
- Real-PostgreSQL tests through `npm run req:test:db` (its config already includes `services/*/test`) or a
  `concept:test:db` script; contract test suite for both adapters.

## 9. Known conflicts and decisions (recorded before delegation)

| Topic | Decision |
| --- | --- |
| No Analysis module (retired) | Analysis references use a labelled contract-compliant test adapter; no claim of analysis integration |
| CAD has no generation API (mock geometry) | "Initiate CAD generation" is a recorded *realization request* on the implementation, shown as pending; a CAD API is future coordinator work. No CAD kernel in Conceptualize |
| Conceptualize may not write CAD/SysML/Requirements data | Creating artifacts in other modules goes through their APIs and their owners' rules (Requirements: `RequirementsService.create` creates a **draft**, through a service proposal the user applies). Concept↔artifact links are Conceptualize data |
| Staleness of artifact links | Links pin revisions; v1 detects stale and broken links in the client through the SDK (`requirements.get`, the model index) and shows impact notifications; a server-side resolver is a later contract change |
| No model provider | Scripted demo via `AssistantContribution.demo`; outputs labelled as AI hypotheses; provider integration is AI development-plan sprint 4 |
| "Concept" in the AI interface docs (concept gallery, AI-009/010) | Those concepts are Conceptualize Concepts; the AI interface uses this module rather than its own store |
| Workspace inspector and product tree | Showing Concepts for a selected object is coordinator integration work (request it with the API ready) |

## 10. Validation commands

```bash
npm install
npm run check
npm run build
npm run build:harnesses
npm run req:test:db       # real PostgreSQL (includes services/*/test)
```

## 11. Handoff format

Completed functionality per milestone, acceptance criteria with evidence, contract changes requested,
migrations, exact test commands and results, limitations, risks, backlog, integration needs, commits.
