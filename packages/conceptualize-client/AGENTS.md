# AGENTS.md: @ews/conceptualize-client

Browser client of the Conceptualize API. Owner: the Conceptualize module. Imports only `@ews/platform-sdk`.

- `createHttpConceptsService` (SDK `ConceptsService`, mode `api`) and `getConceptsModuleClient` (full
  typed client for the Conceptualize tool only). Failures are thrown, never replaced by demo data.
- `createDemoConceptsService` (mode `demo`): explicit example data, SDK reads only.
- `draftConcept` and helpers: deterministic natural-language drafts (no language model).
- `contract-tests`: run `defineConceptsServiceContract` for every adapter (demo in `src/demo.test.ts`,
  HTTP in `services/conceptualize/test/http.contract.test.ts`).
- Types in `src/types.ts` mirror `services/conceptualize/src/http/schemas.ts`; change both together.

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Conceptualize and AI assignment (strategy §10): investigate reusable open-source reasoning, search, graph, visualization and orchestration infrastructure while preserving the proprietary design reasoning and cross-module intelligence.
