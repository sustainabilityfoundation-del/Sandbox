# AI connection: brief, agreed contracts and governance

Status: agreed by the coordinator, 15 October 2026, before delegation.
Progress: [ai-connection-progress.md](ai-connection-progress.md).

## 1. Owner's request (verbatim)

> Start an agent working on the AI connection. Connection to ChatGPT to start byt be ready to attachnother
> AI models. . Allow me to sign into my account and implement a simple example of the drill bit holder
> conceptual design for a milwaukee drill

Follow-up from the owner (verbatim, same day):

> The AI connection brief should include the creation of a settings menu in the same area as the help menu. The
> settings should include configurable items for all modules but the AI reasoning layer setting page should
> allow the connection to the external AI service and allow configuration of what access the AI tool is given.

## 2. Outcome of this sprint

1. The owner connects **their own** OpenAI account from the workspace and the assistant panel ("ChatGPT")
   answers with a real model, using the existing tool-calling loop (`RemoteAssistantService`, `toolSpecs.ts`,
   `executor.ts`): reads run directly, changes are previewed proposals the owner applies.
2. The backend is **provider-neutral**: OpenAI is the first adapter; another provider (for example Anthropic,
   Azure OpenAI, or a local OpenAI-compatible server) can be added by writing one adapter, without touching the
   workspace, the tools or the executor. Demonstrate this with a test-only fake provider.
3. A worked example: **conceptual design of a drill bit holder for a Milwaukee drill**, done through the
   Conceptualize module and the assistant, which the owner can run with the real model and which also runs
   (labelled as a demo) without an account.
4. A **Settings menu** in the workspace header next to the Help (?) menu, with one page per module (see §5a).
   The **AI and reasoning** page is where the owner connects the external AI service (§4) and configures what
   access the AI is given. The assistant panel links to that page instead of having its own connect flow.

## 3. Security constraints (owner's words, binding)

- "Keep API credentials on the server. The browser should communicate with our application backend. Do not add
  secrets to frontend code."
- "Send only the context and model information needed for the request."
- "Treat model descriptions and imported documents as data, not instructions. Validate every requested
  operation in application code; the assistant cannot bypass permissions or field validation."
- Client-side entitlements are prototype only; production checks are server-side.

Consequences: credentials are stored by the backend (encrypted at rest with a key from the server environment,
never logged, never returned to the browser after entry; the UI shows only "connected as … / last 4
characters"); the provider is called only from the backend; tool definitions sent to the model are those the
current user's entitlements allow; every tool call the model returns is executed by the existing executor with
its validation, revision checks and proposal preview. The current proposal-preview policy stays unchanged.

## 4. "Sign into my account" (decide from current, official documentation)

Research what OpenAI officially offers **to third-party applications** today and pick the best compliant option:

- If OpenAI documents an OAuth / "Sign in with ChatGPT" flow that third-party apps may register for, implement
  it (authorization code with PKCE, tokens held server-side, refresh, sign out).
- Otherwise implement **account connection with the owner's OpenAI API key** (platform.openai.com project key):
  entered once in a Connect dialog, sent over the session to our backend, validated with a cheap API call,
  stored server-side, revocable (Disconnect). Explain plainly in the UI and help that API usage is billed to the
  OpenAI API account and is separate from a ChatGPT Plus/Pro subscription.
- Not allowed: reusing another product's OAuth client ID, scraping or automating the chatgpt.com web session,
  or any method contrary to the provider's terms. If the best option needs the owner to register an app or
  accept terms, stop and report what the owner must do.

Credentials are per platform user (development identities `ada`, `rui`, `eli`, `rho`, `nia`; header
`X-Dev-User`). Model choice: configurable per connection; default to a current model you verify in the
provider's documentation (do not hard-code a model from memory).

## 5. Architecture and placement

| Package | Role |
| --- | --- |
| `services/assistant` (`@ews/assistant-service`) | Hosted by `services/api` at `/api/assistant/v1`: connections (create, validate, list, delete), the respond endpoint the existing `RemoteAssistantService` calls, provider registry, provider adapters (OpenAI first), credential encryption, request limits/timeouts, an audit record per call (user, provider, model, token counts, tool names; no credentials, no full prompts unless the owner turns on debugging). PostgreSQL schema `assistant`, outbox only if needed, OpenAPI 3.1 and Scalar docs via `registerApiDocs` |
| `apps/workspace/src/assistant/**`, `apps/workspace/src/shell/assistant/**` | Provider selection (demo vs connected), Connect / Disconnect dialog and status in the assistant panel, wiring `RemoteAssistantService` to `/api/assistant/v1` when the user is connected, error states (no connection, invalid key, rate limit, timeout, provider down). Keep `DemoAssistantService` as the offline fallback and keep it labelled |

Provider interface (server side, framework-free): `listModels`, `validateCredential`, `respond({ messages,
tools, model, signal }) → { type: 'final', text } | { type: 'tool_calls', calls }`, with a mapping layer from
the workspace `AssistantRequest`/`AssistantResponse` (`apps/workspace/src/assistant/types.ts`) so the browser
contract does not change per provider. Streaming is optional for this sprint.

Read first: `docs/modules/ai-interface.md`, `docs/modules/ai-interface/features.md`,
`docs/modules/ai-interface/development-plan.md`, `docs/modules/ai-interface/coverage.md`, ADR-0010, ADR-0013,
`apps/workspace/README.md` ("Connecting ChatGPT"), `docs/specifications/conceptualize-contracts.md`,
`docs/development-workflow.md`, root `AGENTS.md`.

## 5a. Settings menu and the AI access policy

**Settings framework (platform, built by this agent under coordinator review).**
- Header: a Settings button (gear icon from the design-system registry, accessible label "Settings") beside
  the Help menu. It opens a Settings centre (dialog or full-height panel, same pattern as the Help Centre) with
  a page list grouped by module, search, and deep links (`?settings=<page-id>`); keyboard, phone, tablet,
  desktop, both themes.
- Contract: an **additive SDK 1.6 change** that you are authorised to make, in one `COORDINATOR REVIEW:`
  commit with the CHANGELOG migration note: `SettingsContribution` in the tool definition (`settings?:`), a
  list of typed setting definitions (`id` namespaced `<module>.<area>.<item>`, label, description, help ID,
  type: boolean | enum | number with unit and range | string | secret-reference, default, scope: user |
  project, `requiresPermission?`), plus `useSetting(id)` / `ToolApi.settings` for reading. Pages are rendered
  by the platform from the definitions with design-system controls; a module may supply a custom panel only for
  what definitions cannot express. Validation runs on the server.
- Storage: a small **settings service** (`services/settings`, `@ews/settings-service`, schema `settings`,
  `/api/settings/v1`, OpenAPI, ETag/If-Match) for user- and project-scoped values. It answers the open
  preference-service question in `requirements-navigation-filtering.md`. Secrets are never stored there: the AI
  credentials live in `services/assistant` and settings only hold a reference/status.
- Pages delivered in this sprint: **Platform** (theme, density, layout and window preferences currently in the
  Display and layout menu, service mode, demo subscription: keep the existing header controls working, the
  Settings page uses the same state), and **AI and reasoning**. Pages for Requirements, Conceptualize, SysML
  Modeler, CAD Modeler and the illustrative tools are contributed by their module agents after the contract
  lands: list in the progress file the settings you see in each module's code (filters, units, defaults) as
  suggestions; do not edit their packages. No placeholder pages: a module without definitions is simply absent.

**AI and reasoning page.**
- Connection: provider (OpenAI now; other adapters appear automatically), Connect / Disconnect, status
  ("connected as … · key ending …"), model selection from the provider's model list, test connection.
- **Access policy**, enforced on the server when the tool list for a request is built and again when a tool
  call is executed (the browser view of the policy is only UX):
  - per module (Requirements, Conceptualize, SysML Modeler, CAD Modeler, illustrative tools, Help): AI off /
    read only / read and propose changes. Applying always needs the person (unchanged policy);
  - per operation class: read objects, search, run calculations, propose changes, export files, request
    external generation;
  - data sharing: which context may be sent to the provider (selection, open-tool state, requirement text,
    model element details, conversation history length), with a preview "what is sent with each request";
  - limits: maximum tool calls per answer, maximum tokens, request timeout;
  - an audit view: recent AI calls (time, model, tools called, tokens) from the assistant service's records.
- The policy is per user, with project-level ceilings an administrator (`ada`) can set; a user can only narrow
  the project ceiling. The design reasoning layer (`docs/specifications/design-reasoning*.md`, in review) will
  add its settings to this page later; reserve the `ai.reasoning.*` namespace and do not implement reasoning.
- Defaults: read and propose for every module the user is entitled to; history length and limits conservative.

## 6. Drill bit holder example

A concept for an accessory that holds hex-shank drill bits / driver bits on or with a Milwaukee cordless drill
(for example an M18 or M12 drill/driver). Through the assistant and Conceptualize:

1. Create the concept from a natural-language need statement, with purpose and statements whose basis is shown
   (assumption vs. stated).
2. Decompose (for example retention, attachment to the tool, capacity/organisation, access).
3. Develop 2–3 alternatives (for example a magnetic clip-on holder on the belt-clip mount, a holder sleeve on
   the battery foot, a separate holster), a small trade study with criteria and weights, and a proposed decision.
4. Draft requirements as proposals (for example capacity, retention under drop, fits 1/4" hex shank) for the
   Requirements module, through the existing service proposals.
5. Optional, if time allows: a simple CAD Modeler part (a bit holder block with hex pockets) via
   `cad-modeler.run_commands`, linked as an implementation.

Rules: "Milwaukee" only as a compatibility description; no logos or trade dress; dimensions of the drill are
**assumptions** marked as such unless taken from a cited public source; no claim of endorsement. Provide the
example as (a) a help tutorial the owner follows with the real model, and (b) a scripted demo plan
(`AssistantContribution.demo` or the demo service) clearly labelled as a demo, so it works without an account.

## 7. File ownership

| Owner | Paths |
| --- | --- |
| AI connection agent | `services/assistant/**`, `services/settings/**`, `apps/workspace/src/settings/**` (new), the Settings button in the shell header, `apps/workspace/src/assistant/**`, `apps/workspace/src/shell/assistant/**`, `docs/modules/ai-interface/**` (new pages; keep existing decisions), workspace help pages for the assistant, `docs/specifications/ai-connection-progress.md`, new ADRs `docs/decisions/00NN-ai-*.md` (status **Proposed**; use numbers from 0047 upwards; do not edit the index) |
| Agent, limited (append only; mark each in a `COORDINATOR REVIEW:` commit) | `services/api/src/server.ts`, `main.ts`, `package.json`s (dependencies; root scripts prefixed `ai:`), `docs/dependencies.md`, `packages/platform-sdk/src/boundaries.test.ts` (rules for the new service), platform test lists if they enumerate services |
| Coordinator | Everything else: `packages/platform-sdk` contract, `packages/model-service`, other tools and services (Conceptualize, Requirements, CAD, SysML), the rest of `apps/workspace`, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/README.md`. The drill example uses Conceptualize, Requirements and CAD Modeler through their existing operations; if they need changes, write a change request in the progress file |

## 8. Licensing

Pre-authorised: MIT, BSD, Apache-2.0, ISC. Prefer the official `openai` npm SDK (Apache-2.0) or plain `fetch`.
Anything else, or a paid service other than the owner's own provider account, needs approval.

## 9. Tests and definition of done

- Unit and service tests use a **fake provider**; no test calls a real provider by default. An opt-in live smoke
  test runs only when an environment variable with a key is present (never committed).
- Settings tests: definitions validated (unique namespaced IDs, defaults within range); server rejects invalid
  values and stale writes; a user cannot widen a project ceiling; with a module set to "off" its tools are not
  sent to the model and a forged tool call for it is refused; with "read only" a propose call is refused.
- Tests: credential never returned or logged; encrypted at rest; only allowed tools are sent; a model tool call
  outside the user's entitlements is refused; a proposal from a real-model tool call still needs Apply; provider
  errors map to clear messages; the second provider (fake) works without workspace changes.
- `npm run check`, `npm run build`, `npm run build:harnesses`, `npm run req:test:db` green; the existing browser
  flows keep passing; a browser flow for Connect → ask → proposal → Apply → Disconnect against the fake provider.
- Help pages: connecting an account, choosing a model, privacy (what is sent), troubleshooting, the drill bit
  holder tutorial. AI capability inventory updated. `KNOWN_DOCUMENTATION_GAPS` may only shrink.
- Honest status everywhere: the root rule "do not claim real ChatGPT access" is the coordinator's to update at
  integration; until then describe it as "connect your own OpenAI account".

## 10. Environment

Worktree `C:\Users\kimge.000\Documents\Sandbox-ai`, branch `feature/ai-connection`. Ports: workspace 5202 and
5203, API 8801, embedded PostgreSQL 54343 (other agents use 5191–5201, 8787–8800, 54329–54342). Do not push and
do not merge to `main`; report a committed checkpoint. The owner signs in personally: never ask for, store in
files, or print the owner's credentials; give the owner the steps instead.
