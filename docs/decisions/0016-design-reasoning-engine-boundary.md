# ADR-0016: Design Reasoning Engine as a separate service owning only operational state

Status: Proposed (2026-10-14)

## Context

The owner asked for an engineering design reasoning layer (brief: docs/specifications/design-reasoning.md)
with four cooperating capabilities: Conceptualize (persistent conceptual knowledge), a reusable Design
Reasoning Engine, the existing AI Interface, and the engineering modules. Conceptualize (ADR-0015) already
owns concepts, alternatives, decisions, trade studies, assumptions-as-statements, evidence and
implementations, and is being implemented by its own agent. A second knowledge store would split the
design record; an engine embedded in Conceptualize would tie reasoning (and later model use) to one module
and make Conceptualize depend on AI.

## Decision

- The engine is a separate, headless service `services/design-reasoning` (`@ews/design-reasoning-service`,
  PostgreSQL schema `reasoning`), hosted by `services/api` at `/api/reasoning/v1`, with a framework-free core
  `packages/design-reasoning-core`. It has no UI; its views live in the Conceptualize tool and the assistant panel.
- It owns **only operational state**: runs, plans, tool invocations, budgets, checkpoints, context-used
  manifests, justifications and draft proposals before Apply.
- **Durable design knowledge is Conceptualize data**; gaps are filled by contract change requests to
  Conceptualize (ADR-0017), never by engine tables.
- It reads other modules only through their public APIs, **as the requesting user**, and writes nothing:
  durable changes are drafts that the platform previews and the user applies through the owning module
  (ADR-0019).
- The service is introduced in phase 2. Phase 1 needs only the core library and the calculation package.

## Consequences

- Conceptualize remains complete and useful without AI or the engine.
- The engine can serve other modules (Requirements impact, SysML formalization) without owning their data.
- Cross-module reasoning depends on module APIs being sufficient; the CR list records what is missing.
- Run records are not design knowledge: purging them under a retention policy does not lose rationale,
  because explorations keep investigation summaries and run references.
- Alternatives considered: (a) engine inside Conceptualize: rejected (couples AI to the knowledge module,
  harder reuse); (b) engine inside the AI Interface (workspace): rejected (browser-only, mixes model access
  with engineering orchestration, contrary to the brief's separation); (c) engine with its own design
  knowledge tables: rejected (duplicates Conceptualize; governance §2).
