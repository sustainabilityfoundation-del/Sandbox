# AGENTS.md: @ews/projects-client

Browser client of the Project Management API. Owner: the Project Management module. Imports only `@ews/platform-sdk`.

- `createHttpProjectsService` (SDK `ProjectsService`, mode `api`) and `getProjectsClient` / `ProjectsClient` (full
  typed client for the workspace's project screens and `projects.*` actions). Failures are thrown, never replaced
  by demo data.
- `createMemoryProjectsService` (mode `demo`): explicit data for harnesses and tests.
- `contract-tests`: run `defineProjectsServiceContract` for every adapter (memory in `src/memory.test.ts`, HTTP in
  `services/projects/test/http.contract.test.ts`).
- Types in `src/types.ts` mirror `services/projects/src/http/schemas.ts` and `productRoutes.ts`; change both together.
