# AI connection: progress

## Status (one page; initial block by the context-optimization agent, 16 Oct 2026, main d146f22; the module agent keeps it current)

- **State:** ready for owner review (owner acceptance pending)
- **Branch:** feature/ai-connection @ 24f6a83, level with main
- **Done:** all checklist items below are done, checkpoint report in section 7
- **Next actions:** owner tries the real ChatGPT sign-in and a live-model run (needs the owner's account)
- **Blockers:** owner's account for the live run
- **Archive:** the sections below are the detailed record and are read on demand, not at session start. Format and the archive split: [handoff template](../agents/handoff-template.md#2-status-block-top-of-every-module-progress-file-kept-current-at-each-checkpoint).

Brief and contracts: [ai-connection.md](ai-connection.md). Maintained by the AI connection agent.
Decisions: [ADR-0047](../decisions/0047-ai-provider-backend-and-account-connection.md) (provider backend,
account connection, access policy), [ADR-0048](../decisions/0048-ai-settings-framework.md) (settings
framework). Status: **ready for owner review** (owner acceptance pending; the real ChatGPT sign-in and a
real-model run need the owner's own account and were not performed by the agent).

- [x] Research: official account-connection options for third-party apps (OpenAI), decision recorded (§1)
- [x] Provider-neutral backend (`services/assistant`), OpenAI adapter, fake provider
- [x] Settings framework: SDK 1.6 `SettingsContribution`, settings service, Settings centre beside Help, Platform page
- [x] AI and reasoning page: connection, model, access policy (server-enforced), data sharing, limits, audit
- [x] Remote assistant wired to the backend; assistant panel links to the AI settings page
- [x] Drill bit holder example: tutorial (real model) and labelled demo plan
- [x] Tests, help pages, capability inventory, browser flow
- [x] Checkpoint report (§7)

## 1. Account connection: what OpenAI offers third parties (checked 15 October 2026)

Sources (official): [Sign in with ChatGPT](https://developers.openai.com/siwc),
[Request a client ID](https://developers.openai.com/siwc/request-client-id) ("currently offered to a select
group of commercial partners", waitlist), [ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source),
[Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions),
[Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
[Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery),
[Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations),
[UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines),
[OpenAI cookbook: Sign in with ChatGPT in your open-source app](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
(availability: "open-source projects, personal projects that run locally, and selected private apps"; paid or
remotely hosted apps join the waitlist first), [OIDC discovery](https://auth.openai.com/.well-known/openid-configuration),
[Models](https://developers.openai.com/api/docs/models) (default `gpt-6.1-sol`, "a balance of intelligence and
cost"), [Function calling](https://developers.openai.com/api/docs/guides/function-calling).

Decision (ADR-0047): implement **both** compliant options.

1. **Sign in with ChatGPT, ChatGPT plan usage** (OAuth code + PKCE, dynamic registration with
   `dynamic_agent_client` → issued `oaiapp_…` client, loopback redirect `http://127.0.0.1:<API port>/auth/callback`,
   no client secret, no partner key). Offered only when the API host runs locally (127.0.0.1) and not in
   production, which is the use OpenAI documents for it. It uses the owner's Plus/Pro plan.
2. **OpenAI API key** (project key from platform.openai.com), for hosted deployments or as an alternative;
   billed to the API account, separate from ChatGPT Plus/Pro (said in the UI and help).

No other product's client ID is used; chatgpt.com is never automated; the owner signs in personally.

**Owner decision needed (not blocking local use):** plan usage is a *preview* for local / personal /
open-source apps. If the platform is to be **hosted remotely or sold**, OpenAI's interest form
(https://openai.com/form/sign-in-with-chatgpt-interest/) must be completed first, and until approval only
the API key method should be offered there (the code already hides Sign in with ChatGPT outside a loopback,
non-production host). Approved OpenAI logo assets for the button are not included (the UI/UX page does not
state their licence); the button uses the required label "Continue with ChatGPT".

## 2. What was built

| Area | Paths | Notes |
| --- | --- | --- |
| SDK 1.6 settings contract | `packages/platform-sdk/src/contract/settings.ts`, `ToolDefinition.settings`, `ToolApi.settings`, `useSetting`, harness | COORDINATOR REVIEW commit with the 1.6.0 CHANGELOG paragraph |
| Settings service | `services/settings` | schema `settings`, `/api/settings/v1`, OpenAPI 3.1, Scalar reference `/api/settings/v1/docs` |
| Assistant service | `services/assistant` | schema `assistant`, `/api/assistant/v1`, `/auth/callback`, OpenAPI 3.1, reference `/api/assistant/v1/docs` |
| API host | `services/api/src/server.ts`, `main.ts` | COORDINATOR REVIEW; key from `EWS_ASSISTANT_KEY` (dev: `.data/assistant.key`), `EWS_ASSISTANT_FAKE_PROVIDER=1` |
| Workspace | `apps/workspace/src/settings/**`, `src/assistant/**`, `src/shell/assistant/**` | Settings centre, AI page, connected assistant, policy mirror, drill demo plan |
| Workspace (coordinator files) | `Header.tsx`, `main.tsx`, `BottomDock.tsx`, `help/manifests.ts`, `help/platform/settings.md`, `platform/capabilities.ts` | COORDINATOR REVIEW commits |
| Help | `apps/workspace/help/ai/{connect,models,policy,privacy,drill-bit-holder}.md`, overview, troubleshooting | |

Provider interface (`services/assistant/src/providers/types.ts`): `listModels`, `validateCredential`,
`respond({ credential, method, model, instructions, messages, tools, maxOutputTokens, signal }) →
{ type: 'final', text } | { type: 'tool_calls', calls }` with usage. Server-side callers (design reasoning
model gateway, CR-A3) use `AssistantBackend.complete()`; `ApiServer.assistant()` exposes the backend.

## 3. Settings contract summary (SDK 1.6, additive)

- `SettingDefinition`: `id` (`<module>.<area>.<item>`, lowercase), `label`, `description`, `helpId?`, `scope`
  (`user` | `project`), `requiresPermission?` (`editor` | `reviewer` | `administrator`; project values default
  to administrator), `ceiling?` (ID of a project setting of the same type that bounds a user setting),
  `group?`, and a type: `boolean`, `enum` (`options` ordered narrow → wide), `number` (`unit`, `min`, `max`,
  `step?`, `integer?`), `string` (`maxLength`, `pattern?`), `secret-reference` (`owner`; value is
  `owner:<id>`, never a secret; written only by the owner service).
- `SettingsContribution { page: { id, title, description? }, definitions }` as `ToolDefinition.settings`.
- Reading: `ToolApi.settings.get(id)` / `subscribe`, `useSetting(id)`: effective value = stored value clamped
  to its ceiling, else default.
- Shared validation: `checkSettingValue`, `withinCeiling`, `clampToCeiling`, `validateSettingDefinitions`,
  `SETTING_ID_PATTERN`, `RESERVED_SETTING_NAMESPACES` (`ai.reasoning.*`), `createMemorySettingsService`.
- HTTP: `GET /definitions`; `GET /values?projectId=` (user, project, effective, ETags, `canEditProject`);
  `PUT /users/me/values?projectId=` and `PUT /projects/{projectId}/values` with `If-Match` (412 stale, 428
  missing), body `{ values: { id: value | null } }`, atomic, 422 with `details.fields`.
- AI page settings: `ai.connection.active` (secret-reference), `ai.access.<module>` (off / read / propose;
  modules workspace, requirements, conceptualize, sysml-modeler, cad-modeler, illustrative, help),
  `ai.operations.<class>` (read, search, calculate, propose, export, external-generation),
  `ai.sharing.{selection,open-tools,requirement-text,element-details,history-length}`,
  `ai.limits.{tool-calls,output-tokens,timeout}`, `ai.audit.store-prompts`, each with a project ceiling
  (`ai.ceiling.*`, `ai.operation-ceiling.*`, `ai.sharing-ceiling.*`, `ai.limits-ceiling.*`, `ai.audit-ceiling.*`).
  Note: a "Shared model and navigation" (`workspace`) module was added to the brief's list because the
  platform operations (read_object, propose_changes, …) belong to no tool.

## 4. Change requests to the coordinator

| ID | To | Request |
| --- | --- | --- |
| CR-AI-1 | Conceptualize | `conceptualize.develop_alternatives` should accept model-supplied alternatives (name, principle, statements) and trade-study criteria, weights and scores, so a real model can record named alternatives in an alternative set. Today its scripted principle library also misclassifies requests: "belt-clip" matches the *power transmission* library (gear train, belt drive, chain drive). The drill example therefore records alternatives as child Concepts and shows the trade study in the answer |
| CR-AI-2 | Conceptualize | `conceptualize.propose_requirement` should accept model-supplied requirement wording (it generates "shall meet size 6.35 mm"); and quantity labels from `draftConcept` ("Size", "Time") could carry the phrase |
| CR-AI-3 | Coordinator (platform) | Register module settings definitions on the API host: tool packages are React packages, so the host cannot import `ToolDefinition.settings`. Proposal: each module exports framework-free definitions (e.g. `@ews/tool-x/settings` or from its service) that `services/api` registers with `SettingsRegistry` |
| CR-AI-4 | Coordinator | `packages/platform-sdk/package.json` is still version 1.5.0 while `SDK_VERSION` is 1.6.0; my packages depend on `^1.5.0` until it is bumped |
| CR-AI-5 | Coordinator (root docs) | Update the root rule "do not claim real ChatGPT access" at integration: the product now offers "connect your own OpenAI account" (help and UI say exactly that) |
| CR-AI-6 | Coordinator / Requirements | In API mode requirements are projected from the Requirements service, so `propose_changes` on a requirement's status cannot apply (existing coverage finding 1); a model will try it. The real-model path is `requirements.update` |
| CR-AI-7 | Coordinator | `docs/roadmap.md` and `docs/architecture.md` §6: AI development-plan sprint 4 (backend provider integration) is delivered by this sprint |
| CR-AI-9 | Conceptualize | No assistant operation returns a constraint's UUID and revision: `search_design` and `traverse` return keys, while `getConstraint`, the constraints route and the CAD `bind_parameter` / `check` references need `{id: UUID, revision}`. A real model therefore cannot bind a CAD parameter or check against a constraint. Proposal: return `id` and `revision` with each constraint in `search_design` / `traverse` (or add `conceptualize.get_constraint` accepting a key). The D1 plumbing script works around it by passing the UUID and revision in the person's message (`${user.N}`), labelled as such |
| CR-AI-10 | Requirements | `services/requirements/src/events/hub.ts` `close()` is not idempotent: a second call runs `UNLISTEN` and `listener.release()` on an already released client ("Release called on client which has already been released"). Proposal: return early when `closed` is already true and clear `listener` after release. It is in the Requirements package, so I have not edited it |

## 5. Settings seen in module code (suggestions for module agents; not implemented)

| Module | Candidate settings (scope) |
| --- | --- |
| Requirements | default filter mode (selection / all), default sort (key…), default visible columns, include archived by default, default status/type filters (user); default requirement type for new requirements, quality-check rules on/off (project) |
| Conceptualize | default explorer mode (tree / graph), default maturity filter (user); default number of alternatives, trade-study default weights and scales, units for estimates (project) |
| SysML Modeler | default view (general …), default zoom, metaclass filter (user); validation policy for commits (reject new errors / warn) (project) |
| CAD Modeler | show edges, default units (mm), STEP export defaults, regeneration timeout (user / project) |
| Illustrative SysML / CAD | text pane shown by default; dimension ranges are product rules, not settings |
| Platform (already) | theme, density, service mode, development user, demo subscription, layout, windows (browser-local) |

## 6. Verification

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | passed: 702 tests, 1 skipped (pre-existing) | typecheck + unit tests (SDK settings, assistant policy/wire/OpenAI adapter/OAuth/crypto, workspace settings and connection) |
| `npm run build`, `npm run build:harnesses` | passed (workspace, GLB viewer; 6 harnesses) | |
| `npm run req:test:db` | passed: 188 tests, 1 skipped (the opt-in live test) | settings API (defaults, If-Match 412/428, invalid values atomic, ceilings, admin only, history append-only) and assistant API with the fake provider (invalid key, encrypted storage, never returned or logged, models, test, policy off / read-only / subscription refusals, signed calls and forged results, data sharing and preview, provider errors 429/502/504, audit and prompt storage, OAuth start/callback, disconnect, host mounting) |
| Live OpenAI smoke test | not run | opt-in: `OPENAI_LIVE_TEST_KEY=… npx vitest run --config services/api/vitest.db.config.ts services/assistant/test/live.test.ts` (no key available to the agent) |
| Browser flow (fake provider), Chrome headless, ports 5202 / 8801 / 54343 | passed (35 checks), repeated | Settings beside Help; Platform theme via the page = header state; search; deep links; Continue with ChatGPT offered locally; invalid key refused; connect shows only "key ending 1234"; key never in the page and sent only to `/connection/api-key`; test connection; preview of what is sent; panel shows the connected provider and the dock drops "Demo"; ask → `propose_changes` preview → nothing changes → Apply → one new model revision; browser never calls a provider; module "AI off" → operation not offered; audit lists calls; Disconnect → demo; drill demo: create → apply → decompose → apply → three alternatives + trade study → draft requirements applied ("Created 3 draft requirement(s) and linked them to CON-…"); phone (390 px) deep link without overflow; dark theme screenshot |
| Real Sign in with ChatGPT round trip | not possible for the agent | the authorize URL is built as documented; OpenAI's bot protection blocks headless browsers and the sign-in needs the owner's account |

## 7. Checkpoint and owner walkthrough

- Tested candidate: `e12d165` on `feature/ai-connection` (the documentation commit after it changes docs only).
  Not pushed, not merged.
- Startup (main checkout ports): `npm install`, then `npm run dev`; open http://localhost:5173/workspace/.
  The first start generates `.data/assistant.key` (credential encryption key, git-ignored). For a hosted
  or production server set `EWS_ASSISTANT_KEY` (32 bytes, base64) instead. To try the flow without any
  account: `npm run ai:dev:fake` (registers the scripted fake provider; any key starting with `fake-`).

### Connect your account (owner, personally)

1. Header → **Settings** (gear, beside ?) → **AI and reasoning**.
2. Either **Continue with ChatGPT** (your Plus/Pro plan; a new tab opens at auth.openai.com: sign in, review
   and allow "Engineering Workspace", including ChatGPT plan usage; the tab returns to
   `http://127.0.0.1:8787/auth/callback` and says *Account connected*), or paste an **OpenAI API key** from
   platform.openai.com → API keys and choose **Connect** (billed to the API account).
3. The page shows *Connected* with your e-mail or "key ending …". Pick a **Model** (default gpt-6.1-sol if
   your account offers it) and choose **Test connection**.
4. Optional: adjust **What the AI may access**, **Data sharing** (use *Preview what is sent*), **Limits**.

### Run the drill bit holder example

Development user **eli** or **ada** (Settings → Platform), Service mode API. Open the ChatGPT panel; the
banner shows your provider and model. Follow Help → AI Interface → *Tutorial: drill bit holder concept*
(prompts for need statement → decomposition → three alternatives with a trade study → draft requirements),
choosing **Apply** on each preview. Without an account, the demo assistant runs the labelled scripted plan:
*Start the drill bit holder example*, *Decompose the drill bit holder*, *Propose alternatives for the drill
bit holder*, *Draft requirements for the drill bit holder*.

### Known limitations and risks

- Sign in with ChatGPT round trip and real-model behaviour are unverified by the agent (owner's account;
  OpenAI bot protection). The parameters follow OpenAI's documentation; namespaced tool replay over the
  plan-usage route is the least certain detail (documentation does not show namespaced call items).
- Plan usage is an OpenAI preview for local / personal / open-source use; hosting needs OpenAI approval.
- `max_output_tokens` is not sent with ChatGPT plan usage (not accepted there); the plan's limits apply.
- Calls the model requests that the policy refuses are reported in the answer metadata but the model is not
  told on its next turn (stateless replay).
- Platform preferences remain per browser. Module settings pages need CR-AI-3. Requirement edits through
  `propose_changes` fail in API mode (CR-AI-6). Conceptualize alternatives and requirement wording are
  constrained by its scripted operations (CR-AI-1, CR-AI-2).
- Credential key rotation is not implemented (re-connect after changing the key); the development key file
  is protected only by the user profile's file permissions on Windows.
- Data migrations: new schemas `settings` and `assistant` only (append-only migrations); no existing data changed.

### Sprint record (template fields)

- Goal: connect the owner's own OpenAI account, provider-neutral backend, Settings centre with AI access
  policy, drill bit holder example. Baseline: `eceba15` (merged with main `6651e39`).
- Acceptance: all brief §9 items covered by tests and the browser flow except the live provider and real
  sign-in (owner). Owner acceptance: pending.
- Next increment: owner connects and runs the tutorial; then CR-AI-1/2 (Conceptualize operations for named
  alternatives and requirement wording), CR-AI-3 (module settings registration), streaming answers.

## 8. Sprint 2: headless AI operation boundary (integration milestone 1 I5, C9, C13)

Status: **ready for coordinator review** (merged base: main `be2bb2a`). Decision: [ADR-0049](../decisions/0049-ai-persisted-proposals-and-headless-contributions.md).
Status vocabulary per [integration-milestone-1.md](integration-milestone-1.md): items below are **implemented** and
**tested**; none is **integrated** (not on main) or **owner-accepted** yet.

| Scope item | State | Ran against |
| --- | --- | --- |
| Headless contribution registry (`registerPlatformModule`, CR-PM-WS-2 moved to AI) feeding assistant, Help Service, Settings centre; `assistantContributions()` single read path | implemented, tested (`platformModules.test.ts`; a module without a view runs its operation, shows help and settings) | unit, browser flow |
| SDK 1.8.0 (pending): `DeclarativeProposal`, `ModuleOperation`, `ExpectedRevision`, `ActionEffect`, `PlatformModuleContribution` | implemented (COORDINATOR REVIEW commit) | — |
| Proposals persisted, versioned (`assistant.proposals`, schema 1), project- and actor-scoped; declarative, twin and closure kinds | implemented, tested | real service, real PostgreSQL |
| Apply gateway: identity, membership, entitlements, confirmation, C13 project scope, operations re-validated against module OpenAPI, expected revisions, idempotency, placeholders, resumable partial failure | implemented, tested (`proposals.api.test.ts`, 10 tests) | real Conceptualize and Requirements APIs on PostgreSQL |
| Proposal reopened after a **server restart** and applied | tested (restart test builds a new server on the same database) | real services |
| Proposal reopened in a **fresh browser session** (declarative applied by the server; twin refused as stale with explanation, refreshed preview applied) | tested (`tests/e2e/flows/ai-fake-provider.mjs`) | real services, **fake provider** |
| Stale proposal refused with explanation ("… changed since the preview: revision 1 → 2"), nothing written | tested (API and browser) | real services |
| C13: proposal of project A refused while the current project is B (server and browser); operations whose path names another project refused when stored | tested | real services; browser unit test |
| Refusals told to the model on its next turn (and shown to the person) | implemented, tested (unit, browser flow) | fake provider |
| UI/AI validation parity: the same invalid input refused identically through the UI path and the AI path | tested for Conceptualize (`createConcept`) and Requirements (`createRequirement`) | real services |
| Every engineering operation available and succeeding with **all tool tabs closed** | tested (`tests/e2e/flows/ai-headless.mjs`): 22 operations of workspace, help, illustrative SysML/CAD and Conceptualize succeed; a Conceptualize change applied with no view mounted. Known failing (listed with CRs, flow passes while they fail, fails if a passing one regresses): Requirements (`search`, `explain_quality` need the view connection; `read_for_component`, `update` already pass), SysML Modeler (`sessionFor`), CAD Modeler (`cadSession.active`) | real services |
| Engineering-operation vs view-control coverage measured separately | implemented, tested (`capabilities.test.ts`; coverage dialog shows both) | unit |
| Conversations keyed by project (one stored conversation per project; switching project switches it) | implemented; not exercised end to end (no project switcher on main yet) | — |

### What is still a fallback or missing

- No product module returns `DeclarativeProposal` yet: Conceptualize, Requirements and SysML Modeler changes are
  closure fallbacks (labelled; applicable only in the preparing window). The browser flow proves the declarative
  path with a clearly labelled test-only module. **CR-AI-8 (Conceptualize, Requirements, SysML Modeler):** return
  `DeclarativeProposal` with `ifMatch` and `expected` instead of `apply` closures; the gateway already allows their APIs.
- Requirements, SysML Modeler and CAD Modeler operations that depend on a view (assigned by the coordinator to
  their agents).
- Declarative undo (compensating operations), multi-module atomicity (reported and resumable instead), and the
  SDK 1.7 `confirmation` prompt in the card (the server enforces it; the card has no input for the phrase yet).
- Requirements event hub `close()` is not idempotent: filed as CR-AI-10.

### Verification (this sprint)

See §8.1 below (filled after the full run).

## 9. Demonstration D1, AI part (D1-AI)

Brief: [demo-ai-engineering.md](demo-ai-engineering.md) §3 D1-AI. Boundaries: ADR-0070 (AI output stays distinguishable).

| # | Item | State | Evidence |
| --- | --- | --- | --- |
| 1 | `registerPlatformModule` for headless modules (Project Management `projects.*`, design reasoning `reasoning.*`) | implemented, tested | `apps/workspace/src/platform/platformModules.ts`, `platformModules.test.ts`; server catalogue knows `projects.` and `reasoning.` |
| 2 | Generic engineering-workflow instructions; multi-step budget | implemented, tested | `services/assistant/src/wire.ts` `INSTRUCTIONS` (material questions only, explicit assumptions, origin labels user constraint / AI-proposed / derived, read before proposing, previewed proposals, checks as measured or computed, never compliance or adequacy); defaults 24 operations per answer (max 60), 4000 output tokens, 90 s, 12 history items, all with project limits; `policy.test.ts` checks the rules and that no example content is in the instructions |
| 3 | Persisted declarative proposals, revalidation at Apply; survive reload and restart | implemented, tested | §8; `proposals.api.test.ts` (server restart), `ai-fake-provider` flow (fresh browser session) |
| 4 | Drill example isolated | implemented, tested | `apps/workspace/fixtures/demo-plans/drill-bit-holder.json` read by the generic `scriptedPlans.ts`; `exampleIsolation.test.ts` scans product source (workspace, assistant and settings services) for the example's vocabulary |
| 5 | `tests/e2e/flows/demo-d1.mjs` (fake provider replaying a recorded tool-call script; plumbing only, not D1 acceptance) | implemented, tested (passes against main f68369c services) | Script `tests/e2e/fixtures/fake-scripts/d1-plumbing.json` (fake provider `replay.ts`: `${user.N}`, `[field=value]` selectors; `replay.test.ts`). It applies 26 previews against the real services: `projects.create` and `open` (the window reloads into the new project); Concept, function, two constraints and an assumption; `requirements.create` (stakeholder, ai-proposed) and `allocate` to a product element; `projects.create_product_element`; `sysml-modeler.create_project` and `link_product_element`; alternatives; CAD `run_commands` with a regular polygon, pocket cut, linear pattern and `bind_parameter`, with the CAD view closed; `cad-modeler.check` (measured 6.6 mm and 2.4 mm, satisfied) and `conceptualize.record_evidence`; `revise_constraint`, then `check_bindings` (revision 1 superseded by 2), update and re-bind, check again (6.8 mm against revision 2); STEP export with read-back (1 solid, valid, 0 differences) and download; the transcript; read-back from the services in a fresh browser session. PENDING lines: CR-AI-9 (constraint UUIDs typed by the person), CR-AI-1, CR-PM-SDK-4 |
| 6 | Live-run guide with transcript and tool-call evidence capture; D1 spec §5 How to run | implemented | [d1-live-run.md](../modules/ai-interface/d1-live-run.md) (updated for the new project, headless CAD and the CR-AI-9 gap); [demo-ai-engineering.md](demo-ai-engineering.md) §5 (plumbing test and live run); panel **Export transcript**; audit with stored prompts. The live run itself needs the owner's account and is **not done** |

### D1-AI fixes and findings (checkpoint after main f68369c)

- (a) A refusal caused by the AI access policy names the access settings and the policy reason, not the subscription
  (`DemoAssistantService.notInSubscription`, `scriptedPlans.ts`; test in `connection.test.ts`).
- (b) Requirements event hub `close()` is in the Requirements package: filed as CR-AI-10 instead of editing it.
- (c) Leftover open proposals from earlier sessions: **Dismiss all** in the panel's earlier-proposals section. Each
  one is recorded as rejected on the server (`proposalSync.test.ts`).
- Large operation results: strings longer than 2000 characters are shortened before the 24000-character cut, so a
  STEP export returned to the model keeps its read-back report as valid JSON. It also sends less data
  (`wire.test.ts`).
- Findings from the plumbing run:
  - `conceptualize.record_evidence` accepts a CAD source only as `cad-modeler-entity` (`<document>/<part>`), not as
    the registered `cad-document` kind. The script uses the part.
  - `run_commands` saves the document revision on Apply when the document is stored, so a following
    `save_document` reports "No changes".
  - Documents created by `run_commands` are titled "Untitled 1".
  - In the dev server, the first CAD use makes Vite optimise `replicad` and reload the page, which interrupts the
    running reply. Proposal to the coordinator: add `replicad` and `replicad-opencascadejs` to
    `optimizeDeps.include` of the workspace Vite config.

### Verification (checkpoint after main f68369c)

- `npm run check`: typecheck clean; 1107 tests passed, 1 skipped.
- `npm run build` and `npm run build:harnesses`: pass.
- `npm run req:test:db`: 380 passed, 2 failed.
  - `services/projects/test/acceptance.i1.test.ts` passes when run alone: timing (artifact registry confirmation).
  - `services/api/test/sprint002.test.ts` "requirements.collection-changed is emitted after commit…" times out, also
    when run alone. This branch has no changes in `services/api`, `services/requirements` or the Requirements
    packages compared with main f68369c. I have not checked whether it also fails on main.
- Browser flows against my stack (API 8801 with the fake provider, PostgreSQL 54343, workspace 5202): all 14 pass,
  including `demo-d1` and `ai-headless`. `platform` failed once with a search-option timeout and passed on the rerun.

## 10. Concept visualization: image generation (contracts: concept-visualization-contracts.md §1, §3, §6)

The owner decided (contracts §6): **structured layouts only for now**. Image generation is built and tested
with the fake adapter and stubbed HTTP, but **no live generation has been run**. Developer documentation:
[image-generation.md](../modules/ai-interface/image-generation.md). Help: `ai.images`.

| Item | State | Evidence |
| --- | --- | --- |
| `services/visualization` (schema `visualization`, `/api/visualization/v1`, OpenAPI 3.1, hosted by services/api) | implemented, tested | jobs (pending, running, succeeded, failed, cancelled), derived idempotency key with a unique index, retry, cancel, batches with per-item outcomes, interrupted recovery without automatic re-run, outbox and SSE events, assets in the Project Management blob store |
| Client contract `@ews/visualization-client` (types and HTTP client) | implemented; accepted by the coordinator and forwarded to Conceptualize | `packages/visualization-client/src/types.ts`, `client.ts` |
| Adapter registry: OpenAI Images API (API key) and fake test adapter (development and tests only, labelled SVG) | implemented, tested (stubbed HTTP) | `src/adapters/*.ts`, `src/adapters.test.ts` |
| Credential port to services/assistant; settings `ai.images.enabled` (off by default), `ai.images.quality`, `ai.images.daily-limit` | implemented, tested | `AssistantBackend.imageAccess()`, `policy.ts`; the key never appears in responses, events or the database (`test/visualization.api.test.ts`) |
| Clear refusal without a provider (409 `generation-unavailable`, `details.reason`); no placeholder images | implemented, tested | not-connected, images-disabled, method-unsupported (Sign in with ChatGPT), provider-missing, 429 daily-limit |
| Documentation of configuration, cost and limitations | done | image-generation.md, help ai/images.md |
| Live generation with the owner's account | **not done** (owner decision) | enabling steps: image-generation.md §5 |

Finding: OpenAI's Sign in with ChatGPT preview lists image generation as unsupported on plan usage, so
illustrations need an OpenAI API key. The connection port carries `purpose` (`assistant` | `images`), so a later
image-only key does not change the visualization service. It is not built (owner decision).

### Verification (visualization checkpoint, branch after main e2b6dcd)

- `services/visualization` tests:
  - unit: `src/adapters.test.ts`, 8 tests;
  - database: `test/visualization.api.test.ts`, 9 tests, all passing. They cover idempotency (including concurrent
    requests), retry, cancel (running and pending), a batch where one item fails and one is refused while the others
    keep their images, interrupted recovery, validation and roles, refusals without a job, and generation through the
    assistant's credential port with stubbed OpenAI. The key does not appear in responses, events or tables.
- `npm run check`: 1136 passed. 3 tests failed, all timeouts under parallel load, and all pass when run alone:
  - `connection.test.ts` refusal wording;
  - two SysML Modeler tests.
- `npm run build` and `npm run build:harnesses`: pass.
- `npm run req:test:db`: the failing files are startup or plugin timeouts under the machine's parallel load ("Plugin
  did not start in time"). Each one passed when run serially. The remaining timing assertions were
  `assistant.api` "stops a call at the request timeout" (20.8 s against 20 s) and `acceptance.i1`.
- Browser flows on 5202/8801/54343, all pass:
  - `visualization` (new);
  - `ai-headless`: 62 operations, after following the Conceptualize changes on main;
  - `demo-d1`: the constraint IDs now come from `conceptualize.list_constraints`;
  - `ai-fake-provider`: the drill demo plan records its alternatives with `develop_alternatives`;
  - every other flow. `vision` failed once inside the full run and passed alone.
- No live image generation was run (owner decision).
