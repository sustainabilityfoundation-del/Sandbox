# Per-module registration manifests (architecture change)

Status: approved by the owner (16 October 2026, [context-optimization.md](context-optimization.md) §B). Start after the
Focused Canvas UI work (phases 5-6) is merged. Owner of the change: a short-lived architect agent (Opus) with the
coordinator's review; module owners review their own manifest.

## Problem

Every module edits the same shared, append-only files when it adds an operation, a tool or a package:
`apps/workspace/src/assistant/capabilities.ts` (capability inventory), `services/assistant/src/policy.ts`
(`OPERATION_CATALOGUE`), `packages/platform-sdk/src/boundaries.test.ts` (package rules), `apps/workspace/src/platform/
tools.ts` (registration), the platform and design-system test lists, the help module list and `services/api/src/
server.ts` (plugin registration). These caused most merge conflicts and much coordinator work, and they make adding a
module a cross-cutting change.

## Change

1. Each module package exports one **module manifest** (typed in the SDK, additive): its capability-inventory entries,
   AI operation classes, package boundary rules for its own packages, help manifest, settings contribution, tool or
   platform-module registration, and the e2e flows it owns. Server-side modules export a server manifest (plugin,
   base path, docs, artifact source, policy entries).
2. The platform collects manifests from one list of installed modules (workspace and API host), and the existing tests
   (inventory completeness, policy catalogue, boundaries, help, tool lists) iterate over them instead of hard-coded
   lists. The tests keep their strength; only the source of the expected values changes.
3. Adding a module becomes: add the package, add it to the installed-modules list. No other shared file changes.
4. Non-destructive: same behaviour, same IDs, same operation names; migrate module by module with the current files as
   the fallback until each module has moved.

## Acceptance

All tests, DB suites, builds and e2e flows unchanged in result; a test module added in a test proves no shared-file edit
is needed; docs (architecture, AGENTS.md "Contract changes", docs/agents) updated.

## Implementation plan (architect proposal, 16 October 2026)

Status: **proposed**. Coordinator decisions taken; owner decisions (a)-(c) below are pending and block increment I4 and the
`package.json` part of M1-M6 only.

### Types (SDK 1.10, after SDK 1.9)
- Root entry point, new `contract/modules.ts`: `ModuleManifest` (`schemaVersion: 1`, `id`, `name`, `entitlement?`,
  `capabilities?: CapabilityEntry[]`, `operations?: Record<string, OperationClass>`, `aiModule?`, `defaultOpen?`);
  `CapabilityEntry` moves from `apps/workspace/src/assistant/capabilities.ts`, `OperationClass`/`AiModuleDescriptor` from
  `services/assistant/src/policy.ts`. `ServerModuleManifest` (`id`, `name`, `basePath`, `docs?`, `operations?`, `aiModule?`,
  `settings?`, `provisioning?`, `migrate?`, `seed?`, `register(host)` returning `{ artifactSource? }`) with a structural
  `ServerModuleHost` (no Fastify dependency in the SDK).
- `/react`: `ClientModule = { manifest; tool?(env); platformModule?() }`. Help, settings and assistant stay on the tool
  definition or contribution.

### Collection
- Workspace: `apps/workspace/src/platform/installedModules.ts` (`ClientModule[]`) and a pure `collect(modules)` for registry,
  inventory and help. API host: `services/api/src/modules.ts` (`ServerModuleManifest[]`) replacing `INSTALLED_MODULES` in
  `server.ts`. `services/assistant` gets `createPolicy(extraModules, extraCatalogue)` from the host.
- Platform-owned entries (platform, assistant, workspace, help, illustrative mock tools) stay where they are. Projects,
  settings and assistant remain composed by the host and consume what server manifests return; registration follows list order.

### Tests (same strength, new source of expected values)
Inventory iterates `collect().capabilities`; policy test moves to `services/api` and checks tool sources against the merged
catalogue; help order is `platform`, installed list, `ai` (`KNOWN_DOCUMENTATION_GAPS` stays and may only shrink); tool lists in
`platform.test.ts` and `designSystem.test.ts` are derived with a minimum count; each server manifest's `basePath` serves
`/openapi.json`. A test fails if a legacy entry and a manifest define the same ID. Proof test: `installedModules.test.ts`
adds a fixture client and server module and passes every check without shared-file edits.

### Increments
| # | Scope | Order |
| --- | --- | --- |
| I1 | SDK types, version 1.10, CHANGELOG | after SDK 1.9 is merged |
| I2 | workspace `installedModules.ts`, `tools.ts`, `capabilities.ts`, three tests, proof test | after I1 |
| I3 | `services/api` modules list and loop, `services/assistant` `createPolicy`, policy test move | after I1, parallel with I2 |
| I4 | boundaries and design-system tests (stricter: every package needs a rule) | after owner decision (a)/(b) |
| M1-M6 | modules in order: projects (pilot), conceptualize, sysml-modeler, cad-modeler, visualization (server), requirements | after I2/I3, at most 2-3 at once |
| F | delete legacy entries; update architecture, AGENTS.md, docs/agents | last |

### Decisions
- Coordinator (16 October 2026): SDK 1.9 (ConceptsService additions, FilesService) merges first; manifests go in **1.10**,
  so 1.9 is not held up by manifest review. Migration order as above.
- **Owner, pending:** (a) may modules declare their own allowed imports in `package.json`, bounded by fixed platform rules
  (`tool-*` only SDK, design system and own module packages; `services/*` never `tool-*`, React or design system)? This changes
  how "Permitted dependencies" is governed. (b) the `package.json` `"ews"` block convention (`allowedImports`, `e2eFlows`).
  (c) Requirements' server wiring stays composed in the host (architect recommendation) rather than in its manifest.
- Unchanged by this work: entitlement plans (`apps/workspace/src/platform/entitlements.ts`).

### I1 result and notes for I2/I3 (16 October 2026)
I1 (SDK 1.10.0, branch feature/manifests-i1, 5372578): types in `packages/platform-sdk/src/contract/modules.ts` and
`src/react/modules.ts`, contract tests in `modules.test.ts`. Notes for the next increments:
1. The status union is exported as `CapabilityStatus` (the plan's `ImplementationStatus` collides with a type in
   `contract/concepts.ts`); I2 switches `apps/workspace/src/assistant/capabilities.ts` to it (same members).
2. Existing inventory entries are not yet proven assignable (boundaries forbid importing the workspace and service arrays
   in SDK tests); I2/I3 prove it by typing the existing arrays with the SDK types.
3. `ServerModuleHost` is minimal (`app: unknown`, `context?`); `settings`, `provisioning` and `artifactSource` are `unknown`.
   I3 defines what the host exposes and tightens these shapes additively (SDK minor bump if exported shapes change).
4. `ModuleHostEnv` is `{ requirementsMode: 'demo' | 'api'; devUser }`; the CAD ('files' | 'api') and SysML ('local' | 'api')
   factories map the env to their own option shapes inside their `tool(env)` factory.
