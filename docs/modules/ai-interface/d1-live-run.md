# Demonstration D1: live run with a real model, and evidence capture

Status: guide for the owner (or the coordinator, after the owner has connected an account). Demonstration:
[demo-ai-engineering.md](../../specifications/demo-ai-engineering.md). The committed `tests/e2e/flows/demo-d1.mjs`
replays a recorded script with the fake provider; it proves the plumbing and is **not** D1 acceptance. Acceptance
needs this live run.

## 1. Prepare (once)

1. `npm install`, then `npm run dev`. Open http://localhost:5173/workspace/.
2. **Settings** (gear beside ?) → **Platform**: Service mode **API**, development user **eli** (or **ada**).
3. **Settings → AI and reasoning → Connection**: the owner connects their own account, either
   **Continue with ChatGPT** (Plus/Pro plan, local installation) or an **OpenAI API key**
   ([how](../../../apps/workspace/help/ai/connect.md)). The credential stays encrypted on the server; whoever runs
   the steps below as the same development user uses the connection without ever seeing the credential. API usage
   is billed to the owner's account.
4. Same page, for evidence and a multi-step session:
   - **Store prompts for debugging**: on (the audit then keeps the full request sent to the provider).
   - **Operations per answer**: 24 or more; **Request timeout**: 120 s; **Conversation history**: 12 or more.
   - Leave module access at *Read and propose changes*. Applying always needs a person.
5. **Model**: keep the default, or choose another from the account's list. Write down the model ID.

## 2. Run the steps

Open the **ChatGPT** panel. The banner must show the provider and model, not "Demo". Send each message, review every
preview (title, items, basis, assumptions) and choose **Apply** for the ones that are right; reject the others and
say why. The model chooses the operations; the prompts state the engineering intent only.

| D1 step | Message to send (adapt freely) |
| --- | --- |
| 1 Project | "Create a new empty project for a drill bit holder, then open it." (Apply both; the window reloads into the new project; open the panel again: the conversation of the new project is empty.) |
| 2 Concept | "Conceptual design of a drill bit holder: a small block holding six 1/4-inch hex-shank bits, mounting to the accessory interface of a Milwaukee-compatible cordless drill (compatibility description only). Treat the drill's interface dimensions as assumptions unless I give values. Capture the need as a Concept with its function, constraints, interfaces, assumptions and open questions; ask me only what changes the design." |
| 2 Constraints | "First interpret the engineering intent and identify the host and its mounting features (research or ask before assuming; never invent interface values). Then add the constraints with bounds: number of pockets, hex width across flats with clearance, wall thickness between pockets, overall size and mass, and the mounting interface only once the host is identified. Label each as user constraint, AI-proposed or derived." |
| 3 Requirements | "Draft a few measurable requirements from these constraints and link them to the Concept." |
| 4 Architecture | "Propose a proportionate functional and physical decomposition: product elements, a SysML model whose parts represent them, and allocate the requirements." |
| 5 Alternatives | "Identify the host and mounting architectures first, then develop two or three layout alternatives of the selected architecture, compare them with weighted criteria and propose a decision with its rationale." |
| 6 CAD | (The CAD view may stay closed: the CAD operations work headless.) "Model the selected design as an editable part with named parameters for the pocket size, spacing, wall thickness and mounting holes." |
| 7 Check | "Check the model against the constraints: report measured or computed values, the CAD document revision, and which assumptions remain open." |
| 8 Change | "Change: the holder must take eight bits. Show what is affected, update it, and rerun the affected checks." |
| 9 Save, export | "Save the CAD document to the project and export a STEP file." Then restart (`Ctrl+C`, `npm run dev`), open a private browser window, and check that the Concept, requirements, decisions and CAD document reopen. |

Steps the operations cannot do yet are listed by the `demo-d1` flow (PENDING lines) and in the D1 increments
table; the model should say so when it cannot do a step. Record what it did instead. Known gap: binding a CAD
parameter to a constraint and checking against it need the constraint's UUID and revision, and no assistant operation
returns them yet (CR-AI-9). Until that lands, the model may not be able to complete steps 6 and 7 on its own. If it
asks for the IDs, take them from `GET /api/concepts/v1/projects/<project>/constraints`. Report this as
adapter-backed.

## 3. Capture the evidence

1. **Transcript**: in the panel, **Export transcript** downloads `assistant-transcript-<conversation>.json`. It holds
   every message, every operation the model requested with its arguments, status and response round, every proposal
   with its outcome, the provider, model and method (never a credential), and `replayScript`, the same run in
   the fake provider's replay format.
2. **Audit**: Settings → AI and reasoning → **Audit** lists each model call (time, model, operations called and
   refused, tokens, outcome). The full records, including stored prompts, come from
   `GET /api/assistant/v1/audit?limit=200` with header `X-Dev-User: eli`. Prompts are stored only while the setting
   is on; turn it off afterwards.
3. **Artifacts**: the module APIs show what was committed in the new project. Its ID is in the window URL
   (`?project=<id>`). For example:
   - `GET /api/projects/v1/projects/<id>/artifacts`: every registered artifact across the modules;
   - `GET /api/concepts/v1/projects/<id>/concepts?text=holder` and `…/constraints`;
   - `GET /api/cad/v1/projects/<id>/documents`;
   - the downloaded STEP file.
4. Report, for each step, whether it ran with the **live AI provider** against the **real service**, or was
   adapter-backed, scripted or not available.

## 4. Turn the recorded run into a regression test (optional)

Copy `replayScript` from the transcript into `tests/e2e/fixtures/fake-scripts/<name>.json` after reviewing it for
personal data. With `npm run ai:dev:fake` the fake provider then replays exactly those operations, so a flow like
`demo-d1.mjs` can repeat the run without a model. Values typed in a message can be read with `${user.N}` (capture
groups of the turn pattern). An array item can be selected with `[field=value]` or `[field^=value]` in a path, for
example `${cad-modeler.check.data.results.[quantity=parameter af].measured.value}`.
