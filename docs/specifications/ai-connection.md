# AI connection: brief, agreed contracts and governance

Status: agreed by the coordinator, 15 October 2026, before delegation.
Progress: [ai-connection-progress.md](ai-connection-progress.md).

## 1. Owner's request (verbatim)

> Start an agent working on the AI connection. Connection to ChatGPT to start byt be ready to attachnother
> AI models. . Allow me to sign into my account and implement a simple example of the drill bit holder
> conceptual design for a milwaukee drill

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
| AI connection agent | `services/assistant/**`, `apps/workspace/src/assistant/**`, `apps/workspace/src/shell/assistant/**`, `docs/modules/ai-interface/**` (new pages; keep existing decisions), workspace help pages for the assistant, `docs/specifications/ai-connection-progress.md`, new ADRs `docs/decisions/00NN-ai-*.md` (status **Proposed**; use numbers from 0047 upwards; do not edit the index) |
| Agent, limited (append only; mark each in a `COORDINATOR REVIEW:` commit) | `services/api/src/server.ts`, `main.ts`, `package.json`s (dependencies; root scripts prefixed `ai:`), `docs/dependencies.md`, `packages/platform-sdk/src/boundaries.test.ts` (rules for the new service), platform test lists if they enumerate services |
| Coordinator | Everything else: `packages/platform-sdk` contract, `packages/model-service`, other tools and services (Conceptualize, Requirements, CAD, SysML), the rest of `apps/workspace`, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/decisions/README.md`. The drill example uses Conceptualize, Requirements and CAD Modeler through their existing operations; if they need changes, write a change request in the progress file |

## 8. Licensing

Pre-authorised: MIT, BSD, Apache-2.0, ISC. Prefer the official `openai` npm SDK (Apache-2.0) or plain `fetch`.
Anything else, or a paid service other than the owner's own provider account, needs approval.

## 9. Tests and definition of done

- Unit and service tests use a **fake provider**; no test calls a real provider by default. An opt-in live smoke
  test runs only when an environment variable with a key is present (never committed).
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
