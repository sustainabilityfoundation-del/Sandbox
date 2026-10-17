# Browser flows (`@ews/e2e`)

Committed end-to-end flows that drive the real workspace and API in Chrome with `playwright-core`
(Apache-2.0; it does not download a browser). Plan: [integration milestone 1](../../docs/specifications/integration-milestone-1.md).

```
npm run dev            # workspace :5173 + API :8787 + embedded PostgreSQL
npm run e2e            # every flow
npm run e2e -- platform help    # selected flows
```

| Variable | Default | Use |
| --- | --- | --- |
| `E2E_BASE` | `http://localhost:5173/workspace/` | Workspace URL |
| `E2E_API` / `API_PORT` | `http://127.0.0.1:8787` | API origin |
| `CHROME_PATH` | Chrome's default install path | Browser executable |
| `E2E_OUTPUT` | `tests/e2e/.output` (git-ignored) | Screenshots |
| `E2E_HEADED` | unset | Show the browser |

**AI mode.** Flows must run against an API started in mock mode: `npm run ai:dev:fake` (sets `EWS_AI_MODE=mock`), or your own
`npm run dev:api` with `EWS_AI_MODE=mock` (and `EWS_ASSISTANT_FAKE_PROVIDER=1`, `EWS_ASSISTANT_FAKE_SCRIPTS` for `demo-d1`). Mock mode
ignores every stored connection, so a flow can never reach a person's connected AI account. A plain `npm run dev` is `user` mode
(people's own connections, as before): do not point flows at it. After a run `GET /api/assistant/v1/usage?period=month` must list
simulated rows only.

Flows (`flows/*.mjs`, one process each, exit code 0 = pass): `platform` (subscriptions, shared context, upgrade
of version 0.1 data, retired illustrative tools absent and their data kept, detached windows, failure isolation, icons), `help`, `coverage`,
`integration`, `vision`, `conceptualize`, `sysml-modeler`, `cad-modeler` (the workspace AI path, then click-to-draw by mouse, touch and keyboard, and Repair reference; fixture `fixtures/cad/slotted-block.ewscad`), `cad-modeler-persistence` (CAD service revisions,
concurrency, edge features, deep link, units setting), `cad-d1` (regular polygon, pocket and linear pattern in the
UI, volumes checked analytically), `ai-headless` (every engineering operation with all tool tabs closed; modules
still tied to a view are listed as known-failing), `ai-fake-provider` (needs the API started with the fake provider:
`npm run ai:dev:fake`; connect, ask, proposal reopened in a fresh session, access policy and refusals, audit,
disconnect, drill bit holder demo), `concept-visual` (visual concept exploration in a clean project: three alternatives with structured layouts through the assistant operation, comparison cards, annotation and refinement into new revisions, staleness, selection and rejection, CAD handoff, illustration refusal and an in-page FAKE TEST image port; fixture `fixtures/concept-visual/drill-holder.json`), `projects` (Project Home, new project, switcher, reopen), `demo-d1` (plumbing test of demonstration D1: the fake
provider replays the recorded script in `fixtures/fake-scripts/d1-plumbing.json`; start with `npm run ai:dev:fake`;
not D1 acceptance), `visualization` (image generation jobs with the fake test adapter only: idempotent repeats,
a batch with one failing item, retry, cancel, SSE events, the labelled test asset in a browser; start with
`npm run ai:dev:fake`; it never requests the real adapter). Several flows change the
development database (the seeded `PRJ-ACT100` project); run them against a development database, not one
holding real work.

Module agents add their flows here. The milestone workflow (empty database, new project, restart) will be
`flows/milestone-1.mjs` and starts its own API on a fresh database.
