# AGENTS.md: @ews/conceptualize-client

Browser client of the Conceptualize API. Owner: the Conceptualize module. Imports only `@ews/platform-sdk`.

- `createHttpConceptsService` (SDK `ConceptsService`, mode `api`) and `getConceptsModuleClient` (full
  typed client for the Conceptualize tool only). Failures are thrown, never replaced by demo data.
- `createDemoConceptsService` (mode `demo`): explicit example data, SDK reads only.
- `draftConcept` and helpers: deterministic natural-language drafts (no language model).
- `contract-tests`: run `defineConceptsServiceContract` for every adapter (demo in `src/demo.test.ts`,
  HTTP in `services/conceptualize/test/http.contract.test.ts`).
- Types in `src/types.ts` mirror `services/conceptualize/src/http/schemas.ts`; change both together.
