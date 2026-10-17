# ADR-0085: Context package, module selectors and server-side assembly: build, integrate or extend

Status: Proposed (17 October 2026, CE-0 architect; for coordinator acceptance with [ECII plan Amendment 2](../specifications/ecii-plan.md#amendment-2-16-october-2026-context-engineering-layer-owner-augmentation))
Module: Platform (SDK types, coordinator); AI connection (assembler, snapshots, injection); each module (its selector)

## Capability and requirements

The [context engineering brief](../specifications/ecii-context-engineering-brief.md) §1-4 and §8 asks for task-specific, provider-independent
context packages built from the project's authoritative, revisioned artifacts and delivered through the existing gateway. Essential
requirements:

- per-operation selection; structured graph traversal for explicit relationships first; mandatory items (safety-relevant constraints,
  critical interfaces, material unknowns) never dropped or summarised; numbers never compressed;
- an execution snapshot of references with exact revisions plus bounded projections, never a second source of truth or a copy of
  document bytes;
- assembly as the signed-in person, so module permissions and project scope apply (brief §13);
- traceability artifact → proposal → snapshot; reuse across follow-up requests; deterministic, testable without a model;
- server-only; no new provider connection, billing path or database.

## Candidates considered

Licences verified on 17 October 2026 from package registry metadata (PyPI `license`/`license_expression`, npm `license`) and, for
pgvector, the repository LICENSE file. Registry text is treated as untrusted data and was only read for the licence fields.

| Candidate | Upstream (URL) | Version checked | Licence (verified, with source) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| LlamaIndex | github.com/run-llama/llama_index; TS port `llamaindex` | llama-index-core 0.14.25 (PyPI); llamaindex 0.12.1 (npm) | MIT (PyPI `license_expression: MIT`; npm `license: MIT`) | Very active, large community | Retrieval framework centred on document ingestion, chunking, embeddings and vector indexes. Our selection is graph traversal over typed, revisioned records owned by several modules, called as the person through module APIs; its index and node store would duplicate data we must only reference. Main implementation is Python (the TS port lags) |
| LangChain | github.com/langchain-ai/langchain; langchainjs | langchain-core 1.6.12 (PyPI); @langchain/core 1.2.18 (npm) | MIT (PyPI `license: MIT` and OSI classifier; npm `license: MIT`) | Very active | Orchestration plus retriever and vector-store abstractions and its own model clients. Overlaps our gateway (ADR-0079 ledger, AI-C `gateway.call`) and would be a second model path; retrievers assume an embedding store; no notion of revision pinning, mandatory-first packing or module ownership |
| Haystack | github.com/deepset-ai/haystack | haystack-ai 3.4.0 (PyPI) | Apache-2.0 (PyPI `license_expression: Apache-2.0` and classifier) | Active, company-backed | Pipeline framework for retrieval and RAG with document stores. Python only (a separate service in a TypeScript server); document-store-centred; would add a process and a store for data that must stay in the owning modules |
| DSPy | github.com/stanfordnlp/dspy | dspy 3.4.1 (PyPI) | MIT (PyPI `license` field: MIT licence text, "Copyright (c) 2023 Stanford Future Data Systems") | Active research project | Prompt-program optimisation (signatures, optimisers). Addresses prompt tuning, not selection of revisioned engineering records; useful later for evaluation or ranking research (P2), Python only |
| pgvector (P2 candidate) | github.com/pgvector/pgvector | repository `master` LICENSE | PostgreSQL License (repository LICENSE file: "Portions Copyright (c) 1996-2026, PostgreSQL Global Development Group") | Mature, widely deployed | Vector similarity inside our existing PostgreSQL: semantic retrieval over unstructured documents (brief §4) without a new database. Not needed for P0, where selection is structured |
| Internal development | this repository | main 47f9cda | n/a | Reuses Design Reasoning core (`ContextManifest`, `explainSelection`, `assessChangeImpact`), the module APIs, `ModuleCaller` and the gateway | Small: selectors are module read operations; the assembler is ranking, packing and persistence |

## Licence assessment

All candidates are in the preferred category (MIT, Apache-2.0, PostgreSQL/BSD-style). None is adopted now, so no notices or
`docs/dependencies.md` rows are added. If pgvector is adopted in P2 it runs as a PostgreSQL extension on the server (no linking into
our code); the PostgreSQL License requires keeping the copyright notice. Apache-2.0 (Haystack) would need its NOTICE handling if ever
distributed. No owner approval is required for any of them.

## Integration design

1. **Contract (SDK 1.15, coordinator).** `contract/context.ts`: `ContextPackage` (schema 1), `ContextSnapshotItem` (the
   Design Reasoning `ContextManifestItem` promoted to the SDK; DR core aliases it as `ContextSnapshotItem<AnyRef>`), `ContextBudget`,
   `ContextBlock`/`ContextBundle`, `SelectContextRequest`/`SelectContextResponse` and `ServerModuleDescriptor.selectContext`.
   Types only; behaviour comes in CE-1.
2. **Selectors (each module).** One read operation per module, POST `<basePath><selectContext.path>`, declared in its
   `ServerModuleDescriptor`. It returns ranked items with section, `mandatory` flag, exact revision and bounded projection
   (quantities with unit, tolerance and datum; summaries up to 2,000 characters). Selection is per operation (brief §3); modules
   traverse their explicit relationships, never text similarity alone. Conceptualize and Projects in P0 (CE-1); Requirements,
   System Model and CAD in P1 (CE-5).
3. **Assembler (AI connection, `services/assistant/src/context/`).** Calls the selectors in-process through the existing
   `ModuleCaller` as the signed-in person; merges, de-duplicates by reference key, packs mandatory-first then by rank, flags stale
   items (never rewrites them), records omissions with their references for `context.retrieve`. Budget: the smaller of setting
   `ai.context.maxTokens` (12,000) and a quarter of the model's context limit; at most 400 items and 256 KB per snapshot. If the
   mandatory items alone exceed it, the package is `overBudget` and they are kept.
4. **Snapshots.** Immutable rows in `assistant.context_snapshots`; `proposals.context_id` and `usage_events.context_id` give the
   chain artifact → proposal → snapshot. References only; the owning modules stay the source of truth.
5. **Path to the model.** The browser sends only `turn.task` (operation and target refs). Each turn gets a standing digest (active
   intent, hosts, interfaces, readiness); `context.assemble` / `context.retrieve` is a read operation for targeted retrieval.
   Injection is `RespondInput.context` (neutral blocks with trust `platform-data` or `external-data`; external text is labelled
   untrusted and never treated as instructions), translated per provider by the adapters; the fake provider ignores it, so D1
   replays are unchanged. Setting `ai.context.mode = off | digest | full`, default `off` until CE-1 passes D1.
6. **Tests at the boundary.** Selector contract tests per module (fixtures with ground truth), packing tests (mandatory-first,
   overBudget, numbers intact), permission tests (no item from another project or without access), and the existing D1 replays.

## Decision

**Develop internally; adopt none of the frameworks now; keep pgvector as the P2 candidate for semantic retrieval over unstructured
documents.** LlamaIndex, LangChain and Haystack are built around ingesting content into their own document or vector stores and
calling models through their own clients; here the knowledge is typed, revisioned and owned by several modules that must be called
as the person, and model calls must go through the one gateway. Adopting them would add a second data store or a second model
path, which the brief forbids (§1, §12). DSPy addresses prompt optimisation, not selection. The internal part is small because it
reuses Design Reasoning core and the module APIs; ranking engineering relationships is product differentiation (strategy §1).

## Contribution opportunities

None now. Nothing is published or submitted upstream without explicit owner authorization.

## Consequences

- No dependency added. SDK 1.15.0 (additive). DR core's `ContextManifestItem` becomes an alias with no change to its users.
- CE-1 builds the Conceptualize and Projects selectors, the assembler, snapshots, digest and `context.assemble` behind
  `ai.context.mode = off`; D1 replays and `demo-d1` gate the merge.
- Semantic retrieval for unstructured documents is deferred to P2 (pgvector evaluation then, with its own ADR row and dependency entry).
- Risk: selector ranking quality is unmeasured until the benchmark (ADR-0087); no improvement is claimed before a recorded live run.
