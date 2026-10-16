# System Model (MBSE module): architecture documents

Status: **Proposed** (SysML agent, 14 October 2026). Brief: [sysml-program.md](../../specifications/sysml-program.md).
Contracts: [sysml-program-contracts.md](../../specifications/sysml-program-contracts.md). Progress, decisions,
risks and backlog status: [sysml-program-progress.md](../../specifications/sysml-program-progress.md).

`docs/modules/sysml.md` is the historical specification of the **illustrative** SysML tool (`tool-sysml`, ID `sysml`), retired from the interface by ADR-0076 (package and data kept).
This folder specifies the new MBSE environment, tool ID **`sysml-modeler`**, displayed as **System Model**
(ADR-0076; IDs, operation names, API paths and entitlements keep the `sysml` spelling).

| Document | Brief item (§14) | Content |
| --- | --- | --- |
| [../../research/sysml/README.md](../../research/sysml/README.md) | 1 | Research and competitive analysis (standards, reference implementations, open-source landscape, tool benchmark, capability catalog, workflows, persistence, weaknesses, sourced backlog) |
| [requirements.md](requirements.md) | 2 | Formal functional requirements (`SYS-FR-…`), traced to the brief and phased |
| ADRs [0030](../../decisions/0030-sysml-module-placement-and-packages.md)–[0038](../../decisions/0038-sysml-ai-access.md) | 3 | Architecture decisions (status Proposed) |
| [semantic-model.md](semantic-model.md) | 4 | KerML/SysML v2 semantic model, model library, persistence and versioning |
| [api-and-integration.md](api-and-integration.md) | 5 | Systems Modeling API alignment, platform extensions, Requirements / Conceptualize / CAD contracts and change requests |
| [ui-architecture.md](ui-architecture.md) | 6 | Editors, browser, SysML v2 views vs. legacy SysML v1 diagram compatibility |
| [ai-commands.md](ai-commands.md) | 7 | Typed commands, schema discovery, dry run, preview, transactions, undo, version checks, provenance, validation |
| [roadmap.md](roadmap.md) | 8 | Phased roadmap with milestones and exit criteria |
| [risks.md](risks.md) | 9 | Risk register |
| [test-strategy.md](test-strategy.md) | 10 | Test and standards-conformance strategy |
| [conformance.md](conformance.md) | 10 | Living list of supported and unsupported language features, with the tests that prove them |

## Architecture in one page

```
                 ┌────────────────────── packages/tool-sysml-modeler ─────────────────────┐
 person ───────▶ │ model browser · textual editor · views (general, interconnection, …)    │
                 │ property inspector · validation · history/undo · assistant actions · help│
                 └──────────────┬──────────────────────────────────────┬────────────────────┘
                                │ SysmlClient (typed commands, queries) │ same commands
 AI assistant ─ service proposal┘                                      │
                 ┌──────────────▼───── packages/sysml-client ──────────▼────────────────────┐
                 │ HTTP adapter (/api/sysml/v1)          │ local adapter (in-browser, demo/  │
                 │                                        │ standalone; same core engine)     │
                 └──────────────┬─────────────────────────┴──────────────┬───────────────────┘
                 ┌──────────────▼───── services/sysml (Fastify plugin) ──┐│
                 │ Systems Modeling API subset: projects, branches, tags, ││
                 │ commits, elements, relationships, queries             ││
                 │ platform extensions: transactions (dry run), text,    ││
                 │ validation, revert, command schemas, SSE events       ││
                 │ PostgreSQL schema `sysml`: commits, element versions, ││
                 │ branch head index, references index, outbox, audit    ││
                 └──────────────┬────────────────────────────────────────┘│
                 ┌──────────────▼───── packages/sysml-core (framework-free) ▼──────────────┐
                 │ metamodel (KerML + SysML metaclasses) · element store · standard JSON    │
                 │ lexer/parser/serializer (textual notation subset) · name resolution      │
                 │ model library (platform subset; official library loadable) · validation  │
                 │ typed commands · transactions · change sets · inverse (undo) · diff      │
                 │ queries · units and quantities · expression evaluation (subset)          │
                 └──────────────────────────────────────────────────────────────────────────┘
```

The ten concerns the brief asks to separate (§9) map as follows: (1) semantic core, (2) parsing and
interchange, (4) query and validation, (5) commands and transactions: `sysml-core`; (3) repository,
(10) versioning and security: `services/sysml` (+ platform identity); (6) editors: `tool-sysml-modeler`;
(7) simulation and analysis: `sysml-core/analysis` (expression evaluation now; execution engines in
Phase 4, separate package); (8) AI interface: assistant contribution in the tool over the same client
commands; (9) cross-module adapters: `tool-sysml-modeler/src/integration` over SDK services.

## Running and testing

| Command | Use |
| --- | --- |
| `npm run sysml:dev` | Standalone harness (port 5200): local in-browser repository by default; `?mode=api&user=eli` uses the API |
| `npm run dev:api` | API host incl. `/api/sysml/v1` (migrates schema `sysml`, seeds the actuator example outside production); docs at `/api/sysml/v1/docs` |
| `npm run sysml:test` | Core, client and tool tests |
| `npm run req:test:db` | Includes `services/sysml/test` (real PostgreSQL) and the HTTP client contract suite |
| `npm run sysml:library` / `npm run sysml:conformance` | Fetch the official SysML-v2-Release (EPL-2.0, ≥ 2026-04) into `.data/` and measure parser coverage |

## Placement recommendation (brief §15)

Keep SysML as **a clearly isolated module inside this monorepo** (four packages, ADR-0030), not a separate
repository, for now: the platform contracts (SDK, help, assistant, identity, API host) still change
weekly, and one commit pinning all packages is the cheapest way to keep integration consistent. The
module is already shaped for extraction: framework-free core, plugin-hosted service with its own
schema and OpenAPI, a client with an explicit adapter interface, and a tool that imports only the SDK,
the design system and its own client. Moving to a separate repository becomes worthwhile once the SDK
is published as a versioned package (compatibility manifest per docs/development-workflow.md §4).
