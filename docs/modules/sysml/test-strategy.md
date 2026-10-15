# Test and standards-conformance strategy

Status: Proposed; commands verified as they are implemented (see progress file for results).

## 1. Layers and commands

| Layer | What | Where | Command |
| --- | --- | --- | --- |
| Core unit | Lexer, parser, serializer round trips, name resolution, each validation rule, units, commands, transactions, inverse/undo, text reconciliation, diff, queries | `packages/sysml-core/src/**/*.test.ts` | `npm test` (root) or `npm run sysml:test` |
| Conformance (subset) | Our corpus of textual-notation cases per supported construct (`src/conformance/cases`) with expected element structure; unsupported constructs must produce a clear diagnostic, never silent loss | `packages/sysml-core/src/conformance` | `npm run sysml:test` |
| Conformance (official) | Parse the official SysML v2 release examples and library when fetched locally (`npm run sysml:library`); report per-file pass/fail and the unsupported constructs; tests skip with a reason when the files are absent | `packages/sysml-core/test/official.test.ts` | `npm run sysml:conformance` |
| Client contract | The same suite against the local adapter (unit) and the HTTP adapter (real API + PostgreSQL) | `packages/sysml-client/src/contractTests.ts` | `npm test`, `npm run req:test:db` |
| Service (DB) | Migrations, commit/branch/tag semantics, concurrency (parallel transactions), idempotency, permissions (entitlement, roles, membership), events, OpenAPI response conformance, large-model baseline | `services/sysml/test/*.test.ts` | `npm run req:test:db` (includes services/*/test) |
| Tool | Projection functions (diagram graph from model), command building from UI actions, assistant actions and service proposals (apply/undo against the local adapter), help manifest validity | `packages/tool-sysml-modeler/src/**/*.test.ts` | `npm test` |
| Workspace | Capability inventory and help tests (existing, coordinator-owned) | `apps/workspace` | `npm test` |
| Browser | Human workflow in workspace and harness (Playwright scripts outside the repo); AI workflow through the demo assistant | scratchpad `pw/sysml` | manual run, results in progress file |

## 2. Conformance principles

- **No conformance claim.** We report "aligned subset" with an explicit supported/unsupported list
  ([conformance.md](conformance.md)); AGENTS.md forbids claiming SysML v2 compliance.
- **Round-trip property**: for every case, `parse → serialize → parse` yields an equal semantic model
  (same metaclasses, names, relationships, values; IDs aside).
- **JSON property**: `toJson → fromJson` is identity for supported metaclasses; unknown metaclasses are
  preserved opaquely.
- **Unsupported constructs**: the parser reports `SYSML-SYNTAX-UNSUPPORTED` with the construct name,
  so the list of unsupported features is testable.
- Official examples are not committed to the repository (licence review); they are fetched by a script
  and the test prints a summary table.

## 3. Brief §13 coverage map

| Brief §13 item | Tests |
| --- | --- |
| Syntax and semantics | core parser, resolution, validation tests |
| Parser and serializer correctness | round-trip suite, official corpus summary |
| Standards conformance | conformance cases + official corpus |
| Model validation | one test per rule (positive and negative) |
| Referential integrity | delete refuses referenced elements; raw commits with dangling references refused |
| Cross-module relationships | Phase 3 (managed requirement metadata resolution) |
| Transaction safety | atomic failure (no partial change), DB rollback test |
| Concurrent editing | parallel transactions on one branch: non-overlapping rebase, overlapping conflict |
| Import/export round trips | text and JSON round trips |
| AI-generated modifications | assistant action tests (proposal → apply → commit provenance → undo) |
| Diagram/model synchronization | projection tests: model change → projected graph change |
| Large-model performance | generated model baseline (timings logged, thresholds generous) |
| Permissions and security | entitlement/role/membership tests; production refuses X-Dev-User |
