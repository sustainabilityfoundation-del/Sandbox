# A. Architecture overview

Status: Proposed. Index: [README.md](README.md).

## 1. Principle: problem, solution, implementation

The brief's principle is that the platform distinguishes the **engineering problem**, the **proposed
solution** and the **implemented design**. Each has one owner:

| Layer | What it holds | Authoritative owner |
| --- | --- | --- |
| Problem | Requirements (formal, approved), Functions (what must be accomplished), conceptual Constraints, objectives | Requirements (formal requirements); Conceptualize (functions, conceptual constraints) |
| Solution | Concepts, alternatives, architectures (decompositions), design decisions, assumptions, evidence, calculation models, explorations | Conceptualize |
| Implementation | SysML elements, CAD representations, physical components, analyses, verification records | SysML, CAD, platform twin, a future Analysis module |
| Reasoning (operational) | Runs, plans, tool invocations, budgets, checkpoints, context-used manifests, draft proposals | Design Reasoning Engine |

`ConceptImplementation` (Conceptualize) is the only bridge from solution to implementation; it holds
version-pinned `ArtifactRef`s, never copies.

## 2. Four cooperating capabilities

```mermaid
flowchart LR
  subgraph AI["AI Interface (apps/workspace/src/assistant, SDK assistant.ts)"]
    conv[Conversation and proposal preview]
    exec[Executor: operations, entitlements, Apply]
    gw[Model gateway, later server-side]
  end
  subgraph DR["Design Reasoning Engine (services/design-reasoning)"]
    ctx[Context Resolver]
    plan[Reasoning Planner]
    orch[Tool Orchestrator]
    ev[Evidence Evaluator]
    imp[Change Impact Analyzer]
    prop[Proposal Drafter]
    runs[(schema reasoning: runs, plans, invocations, manifests, drafts)]
  end
  subgraph CZ["Conceptualize (services/conceptualize)"]
    know[(schema conceptualize: functions, concepts, constraints, assumptions, evidence, decisions, explorations, calc models, links)]
    graph[Graph traversal API]
  end
  calc["@ews/engineering-calc (deterministic, framework-free)"]
  subgraph EM["Engineering modules"]
    req[Requirements service]
    twin[Twin: components, SysML, CAD (browser repository today)]
    ana[Analysis: test adapter only]
  end
  conv --> exec
  exec -- "reasoning.* operations" --> DR
  gw -. "phase 3: model steps" .- plan
  ctx --> graph
  ctx --> req
  ctx -. "client-attested snapshot" .- twin
  orch --> calc
  orch --> ana
  prop -- "declarative proposal" --> exec
  exec -- "Apply: module API" --> CZ
  exec -- "Apply: module API" --> req
  CZ --> calc
```

- **Conceptualize** stays useful without any AI: everything the engine proposes is an ordinary
  Conceptualize (or Requirements) write that a person could make in the UI.
- **The Reasoning Engine** is reusable and headless; it has no UI of its own. Its results are shown
  in the Conceptualize UI and the AI Interface (see [user-experience.md](user-experience.md)).
- **The AI Interface** owns conversation, model access, the operation registry, previews and Apply.
  The engine contributes typed operations to it ([ai-tools.md](ai-tools.md)).
- **Engineering modules** remain authoritative and are reached only through their SDK contracts and
  HTTP APIs. There is no Analysis module; analysis is a labelled test adapter behind a port.

## 3. Packages and placement

| Package | Name | Role | New? |
| --- | --- | --- | --- |
| `packages/engineering-calc` | `@ews/engineering-calc` | Expression parsing and validation, dimensional analysis, deterministic evaluation, constraint checks, interval bounds; mathjs inside a restricted instance. Framework-free, no database | New (phase 1) |
| `packages/design-reasoning-core` | `@ews/design-reasoning-core` | Framework-free domain of the engine: plan and run schemas, tool schemas, impact traversal, basis rules, comparison (dominance), context-manifest types. Usable in the server and, for twin-side impact, in the browser | New (phase 1, library only) |
| `services/design-reasoning` | `@ews/design-reasoning-service` | Runs, persistence (schema `reasoning`), Fastify plugin at `/api/reasoning/v1`, OpenAPI, outbox and events, tool orchestration, adapters to module APIs | New (phase 2) |
| `packages/reasoning-client` | `@ews/reasoning-client` | Browser client of the reasoning API and the headless assistant contribution (`reasoning.*` operations) | New (phase 2) |
| `services/conceptualize`, `packages/conceptualize-client`, `packages/tool-conceptualize` | existing (Conceptualize agent) | Extended through CR-C1…C13; the reasoning UI views live in `tool-conceptualize` | Changed by its owner |
| `services/api` | existing | Hosts the reasoning plugin next to Requirements and Conceptualize | Registration only |

Phase 1 deliberately has **no reasoning database and no reasoning service**: the brief's phase 1 is
persistent engineering knowledge, which is Conceptualize work plus two libraries. The service arrives
with tool-assisted reasoning in phase 2 ([roadmap.md](roadmap.md)).

Proposed dependency rules (additions to `boundaries.test.ts`, coordinator-owned):

```
engineering-calc            → @ews/platform-sdk (framework-free entry: quantities), mathjs
design-reasoning-core       → @ews/platform-sdk (framework-free entry), @ews/engineering-calc
design-reasoning-service    → @ews/platform-sdk, @ews/design-reasoning-core, @ews/engineering-calc
conceptualize-service       → @ews/platform-sdk, @ews/engineering-calc   (CR-C8: validate models, re-verify calculated evidence)
reasoning-client            → @ews/platform-sdk (types, errors)
api                         → … existing …, @ews/design-reasoning-service
apps/workspace              → … existing …, @ews/reasoning-client
```

No service imports another service; the engine reaches Conceptualize and Requirements over their HTTP
APIs (in the same host process this can be an in-process HTTP call, but always through the public
routes, with the user's identity, never through their tables).

## 4. Major data flows

### 4.1 Assistant-driven reasoning (phase 2)

The conversation model in the AI Interface decides what to do; the engine supplies typed tools,
records the run and keeps the evidence honest.

```mermaid
sequenceDiagram
  actor U as Engineer
  participant AI as AI Interface (executor)
  participant M as Model (via AI Interface)
  participant DR as Reasoning Engine
  participant CZ as Conceptualize API
  participant RQ as Requirements API
  U->>AI: "What happens if REQ-001 rises to 15 kN?"
  AI->>M: turn + operations (incl. reasoning.*)
  M-->>AI: call reasoning.assess_change_impact
  AI->>DR: POST /runs (question, captured context)
  DR->>RQ: get REQ-001, traceLinks
  DR->>CZ: graph traverse from constraints formalizing REQ-001
  DR->>DR: re-evaluate affected calculation models (engineering-calc)
  DR-->>AI: impact report (possible vs demonstrated) + draft proposal
  AI-->>U: report, proposal preview (basis, evidence, uncertainty)
  U->>AI: Apply
  AI->>CZ: declarative proposal operations (If-Match, Idempotency-Key, provenance)
  CZ-->>AI: committed; events
```

### 4.2 Engine-driven investigation (phase 3)

Long-running explorations run as background runs with budgets. The planner asks for model steps
through the AI Interface's server-side model gateway (CR-A3), deterministic tools do the numbers,
alternatives accumulate as **drafts** in the engine, and a bundled proposal reaches the user. No
authoritative record changes until the user applies it ([exploration.md](exploration.md)).

### 4.3 Without a model

All engine capabilities that do not need language (context resolution, calculation, comparison,
impact analysis, rationale retrieval) are plain API operations usable from the Conceptualize UI.
"Why was this design selected?" is answered from records, not generated ([user-experience.md](user-experience.md)).

## 5. What the layer does not do

- It does not store a second copy of any Concept, requirement or model element.
- It does not call a model provider or hold credentials ([ADR-0045](../../decisions/0045-reasoning-runs-and-model-access.md)).
- It does not write to any module except through previewed proposals applied by the user
  ([ADR-0042](../../decisions/0042-declarative-service-proposals.md)); the preview policy is unchanged.
- It does not build a symbolic mathematics engine, a CAD kernel, an analysis solver or a chat UI.
- It does not introduce a graph database, a vector database, a queue or a workflow engine in
  phases 1–2 ([ADR-0041](../../decisions/0041-relational-knowledge-and-graph-api.md)).
- It does not store private model reasoning; it stores explicit justifications, tool inputs, results
  and evidence references ([ADR-0045](../../decisions/0045-reasoning-runs-and-model-access.md)).

## 6. Conflicts with existing designs (summary)

Detailed in the [progress file §16 report](../../specifications/design-reasoning-progress.md#4-conflicts-with-existing-designs).

1. Conceptualize models functions, constraints and assumptions as Concepts or statements, not as
   separately identifiable entities; its `explorations` are atomic bulk-create logs, not structured
   investigations; decisions lack invalidation conditions. Resolved by CR-C1…C7 with additive migrations.
2. Service proposals carry `apply` closures that live in one browser window; a server-side engine cannot
   produce them. Resolved by declarative proposals (CR-A1, ADR-0042).
3. The twin (components, SysML, CAD) lives in the browser repository; a server-side engine cannot read it.
   Interim: client-attested twin snapshots with revisions; impact traversal for twin links runs in the
   browser through `@ews/design-reasoning-core` (CR-P1).
4. ADR-0013 (proposed) plans a registry and execution gateway; this architecture uses today's
   `AssistantContribution` and is designed to move into that registry unchanged.
5. No Analysis module; analysis is a port with a labelled test adapter.
6. Conceptualize records the source kind the browser declares (`X-Source-Kind`); provenance of reasoning
   writes is only as strong as that until the gateway exists (governance-security.md §3).
