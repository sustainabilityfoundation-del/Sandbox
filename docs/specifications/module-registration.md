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

### I3 result (16 October 2026)
I3 (SDK 1.11.0, branch feature/manifests-i3): `services/api/src/modules.ts` holds `INSTALLED_SERVER_MODULES` (`ServerModuleManifest<ApiModuleHost>[]`:
requirements, conceptualize, sysml-modeler, cad-modeler, visualization) and replaces `INSTALLED_MODULES`; `buildServer` loops over it (docs page, then `register`),
collects artifact sources, provisioning and settings, then composes projects, settings and assistant as before. `services/assistant` has
`createPolicy(extraModules, extraCatalogue)` returning a `Policy` (`modules`, `catalogue`, `settingDefinitions`, `classify`, `policyFromSettings`, `decide`);
the host passes it to `assistantPlugin({ policy })`. Duplicate AI module IDs or operation names throw. The policy completeness test moved to
`services/api/src/modules.test.ts`; `services/api/test/modules.test.ts` (DB suite) checks that every manifest base path serves `/openapi.json` and `/docs`.

What `ServerModuleHost` now exposes (SDK 1.11, additive, types only): `app: unknown`, `production?`, `eventPollMs?`, `context?`. The manifest is generic,
`ServerModuleManifest<H extends ServerModuleHost>`, so the host types its own host object: `ApiModuleHost` (services/api) adds `app: FastifyInstance`, `pool`,
`auth` (authenticate, roleOf), `options` (`ServerOptions`), the requirements and Conceptualize event hubs, the blob store and `assistant()`.
`artifactSource` is `ArtifactSource`; `settings` is `{ page, definitions }`; `provisioning` is `{ module?, lazyReason }` (`module` defaults to the manifest `id`;
SysML and CAD keep their provisioning IDs `sysml` and `cad` while their manifest IDs are the AI module IDs `sysml-modeler` and `cad-modeler`).

Changes from the plan and notes for the M-steps:
1. The I3 manifests declare no `operations` or `aiModule` yet: the existing entries stay in `AI_MODULES` and `OPERATION_CATALOGUE` (legacy) and an M-step moves
   a module's entries into its manifest in the same change as deleting the legacy ones (a duplicate fails `createPolicy`, tested). The platform-owned entries
   (workspace, illustrative, projects, reasoning, help) stay in policy.ts.
2. Plugin order is as before: requirements, conceptualize, sysml, cad, then projects, settings, assistant, then visualization. Visualization starts its job runner while registering and needs the running assistant, so its manifest has `phase: 'after-host'` (additive SDK 1.11 field; such a module cannot contribute an artifact source, settings or provisioning). `ApiServer.registrationOrder` records the order and `services/api/test/modules.test.ts` asserts it. Artifact sources are ordered requirements, conceptualize, sysml, cad (was requirements, sysml, cad, conceptualize); `services/projects/test/registry.test.ts` asserts the new order exactly.
3. Kept in the host as the plan's Risks list says: the requirements twin (`composeTwinDirectories(productTwinDirectory, options.twin ?? SAMPLE_TWIN)`) and SysML
   directory sit inside the requirements adapter; the SysML/CAD `onReady` services stay inside their adapters; `prepareDatabase` (migration and seed order) is unchanged,
   so `migrate`/`seed` of the manifest are not used yet. `SAMPLE_TWIN` moved to `services/api/src/sampleTwin.ts` (still exported from `server.ts`).
4. The assistant proposal APIs (entitlement and project parameter per module) are a small table in `server.ts` (`PROPOSAL_APIS`); the first M-step that moves a module to its own package adds an optional manifest field `proposals?: { entitlement; projectParam? }` and removes the table.
5. `@ews/platform-sdk` ranges of `services/api` and `services/assistant` are now `^1.11.0`.

### I2 result (16 October 2026)
I2 (branch feature/manifests-i2, workspace side, no SDK change): `apps/workspace/src/platform/installedModules.ts` holds `INSTALLED_MODULES` (`ClientModule[]`, thin adapters around the existing factories; each maps `ModuleHostEnv` to its own options: CAD files|api, SysML local|api), a pure `collect(modules, env)` returning tools, platform modules, capability entries, help sources and default-open IDs (it throws on duplicate module or capability IDs, an entry for another module, or a tool ID that differs from its manifest), and `installed()` (the workspace collection, built once). `tools.ts` registers the collected tools and platform modules in list order and derives `DEFAULT_OPEN_TOOLS` from `defaultOpen`. The 130 module capability entries moved unchanged to `platform/installedCapabilities.ts` (one array per module); `assistant/capabilities.ts` keeps the 30 platform and assistant entries as `PLATFORM_CAPABILITIES`, uses the SDK entry types (`ImplementationStatus` is an alias of `CapabilityStatus`) and builds `CAPABILITIES = mergeCapabilities(legacy, collected)`, which throws when a legacy entry and a manifest define the same ID. Tests: capabilities, help and platform tests derive their expectations from `collect()` (platform tool list with a minimum of 6); `installedModules.test.ts` adds a fixture module to the list and passes inventory, help and registry checks with no shared-file edit.
Notes for the M-steps: (1) each module moves its `*_CAPABILITIES` array and its `ClientModule` into its own package and is replaced by an import in `INSTALLED_MODULES`; (2) the manifest `entitlement` and `name` duplicate the tool definition and are not yet cross-checked; (3) `collect()` default env reads `serviceSettings`, so it imports `./services`; (4) `help.test.ts` line 129 (Requirements-only subscription) stays hard-coded; (5) `help.mjs` fails on main-equivalent stale expectations (fallback, about), unrelated to I2.


### M-step recipe (how to move a module; learned in M1, 16 October 2026)
Same behaviour, IDs and operation names. One change per module, with the legacy entries deleted in the same commit.
1. **Client side.** Put the module's `*_CAPABILITIES` array (from `apps/workspace/src/platform/installedCapabilities.ts`) in its client package
   and export a factory returning `{ manifest, tool?(env) | platformModule?() }`. The factory takes whatever the module needs from the window
   (for example `projectsModule({ switchProject })`); the workspace owns window behaviour (`currentProject`, `serviceSettings`). Then replace
   the module's line in `INSTALLED_MODULES` (`apps/workspace/src/platform/installedModules.ts`) with a call to the factory and delete the
   array from `installedCapabilities.ts`. Never import `ClientModule` into a package that the boundary test restricts to `@ews/platform-sdk`
   (the type lives in `/react`): type the return value with `ModuleManifest` and `PlatformModuleContribution`/`AnyToolDefinition`; it is
   structurally a `ClientModule`. A tool package (`packages/tool-*`, allowed `@ews/platform-sdk/react`) exports a `ClientModule` factory from its entry point; the factory maps `ModuleHostEnv` itself (M2, M3).
2. **Help and assistant move with the module.** `help.ts`, `help/*.md` and the assistant actions go into the same package (`import.meta.glob('../help/*.md', ...)`,
   source paths `packages/<pkg>/help/...`). Update the path mentions in docs (`grep -rn "<old path>" docs`).
3. **Server side.** Export a `ServerModuleManifest` (or, for a host-composed module, a `ServerModuleDescriptor`) from the service package (`src/manifest.ts`): `id`, `name`, `basePath`, `docs`, `aiModule`,
   `operations`, `proposals`, and for a module the host does not compose, `register`. Move the module's `AI_MODULES` entry and its
   `OPERATION_CATALOGUE` lines out of `services/assistant/src/policy.ts` into the manifest (delete them there; `createPolicy` throws on a
   duplicate). Operations missing from the catalogue take the default class `propose`; keep that unless the owner decides otherwise.
   Move the module's `PROPOSAL_APIS` row (`services/api/src/server.ts`) to `proposals`; the host uses `m.proposals ?? PROPOSAL_APIS[m.id]`.
   A module that the host composes itself (projects, because it consumes the other modules' artifact sources) is listed in
   `ALL_SERVER_MODULES` (`services/api/src/modules.ts`) next to `INSTALLED_SERVER_MODULES`; the host reads docs, operations and
   `aiModule` from the manifest and keeps the plugin registration. Do not reorder registration: `services/api/test/modules.test.ts` asserts the order.
4. **SDK.** Only if the manifest needs a new optional field: bump `version.ts`, `platform-sdk/package.json`, `package-lock.json` (the
   `packages/platform-sdk` entry), the AGENTS.md "SDK version" line, CHANGELOG, and the version assertions in `modules.test.ts` and `sdk19.test.ts`;
   raise the `@ews/platform-sdk` range of packages that use the field and run `npm install`.
5. **Tests that must stay green unchanged:** `installedModules.test.ts` (proof test, runs the real checks from `assistant/capabilityChecks.ts` and
   compares `helpSources()` with `collect().help`), `capabilities.test.ts`, `help.test.ts`, `services/api/src/modules.test.ts` (its "new installed module" case already uses
   `ALL_SERVER_MODULES` plus fixtures and `base.slice(0, 7)` since M2/M3; add a per-module manifest test) and `services/api/test/modules.test.ts`.
   Tests that use the default policy for a moved module's operations or `ai.access.<id>` settings (`services/assistant/src/policy.test.ts`,
   `wire.test.ts`, `test/env.ts`) must build their policy from manifests; the assistant service never imports another service, so tests
   there use an inline module descriptor (M2). Tests that import the moved files by relative path (`services/projects/test/assistant.actions.test.ts`
   imported `apps/workspace/src/projects/assistant`) must import the package entry point instead. Do not touch `boundaries.test.ts` or
   `designSystem.test.ts` (I4); a new package outside `ALLOWED` is unchecked and `apps/workspace` may only import packages in its regex, so
   put a module into its existing `*-client` package rather than creating a new one.
6. **Verify:** `npm run check`, `npm run build`, the module's DB suite plus `ai:test:db` and `req:test:db`, and the e2e flows `projects platform help
   coverage ai-headless demo-d1` on your own ports (see tests/e2e/README.md): `API_PORT=.. EMBEDDED_PG_PORT=.. EMBEDDED_PG_DIR=.. STORAGE_DIR=..
   npm run ai:dev:fake -- --port <p> --strictPort`, then `E2E_BASE=http://localhost:<p>/workspace/ E2E_API=http://127.0.0.1:<api> API_PORT=<api> npm run e2e -- <flows>`.
7. **Pitfalls.** (a) The Help Centre lists tools first, then headless platform modules (the registry keeps them apart), while `collect()` keeps list
   order; both build their sources with `toolHelpSource`/`platformModuleHelpSource` (`platform/helpSources.ts`). (b) `ProjectsModuleHost`-style hooks
   keep the package free of workspace imports. (c) `register` belongs to `ServerModuleManifest`; a host-composed module exports a `ServerModuleDescriptor` instead and the
   host registers its plugin itself and reads `proposals`, `docs` and policy from the descriptor. (d) The tool-package assistant-action test in `services/api/src/modules.test.ts` only scans `packages/tool-*`; headless
   modules are covered by the capability inventory test. (e) Files in this repository mix CRLF and LF; edit in place.

### M1 result (16 October 2026)
M1 (branch feature/manifests-m1-projects, SDK 1.12.0): Project Management moved out of the workspace and the assistant policy.
- Client: `packages/projects-client` exports `projectsModule({ switchProject })` (`src/module.ts`: manifest with `src/capabilities.ts`, platform module
  with `src/assistant.ts` and `src/help.ts`, help pages in `help/*.md`). `INSTALLED_MODULES` calls it; `apps/workspace/src/projects/{assistant,help}.ts`,
  `projects/help/` and `PROJECTS_CAPABILITIES` in `installedCapabilities.ts` are gone. Behaviour, IDs and operation names are unchanged.
- Server: `services/projects/src/manifest.ts` exports `projectsServerManifest` (base path, docs title, AI module descriptor). The legacy `projects` entry in
  `AI_MODULES` is deleted; the host registers the plugin as before (registration order unchanged) and reads docs and policy from the manifest via
  `ALL_SERVER_MODULES`. Projects has no `OPERATION_CATALOGUE` lines (all `projects.*` operations take the default class `propose`; unchanged) and no
  `PROPOSAL_APIS` row, so `proposals` is declared by no module yet.
- SDK 1.12.0 (additive): `ServerModuleManifest.proposals?: { entitlement; projectParam? }` (`ServerModuleProposals`). `server.ts` uses
  `m.proposals ?? PROPOSAL_APIS[m.id]`; the table shrinks as the modules of M2-M4 move.
- Tests: the I2 proof test now registers the fixture, runs `toolbarProblems`, `operationProblems` and `honestyProblems` (shared with `capabilities.test.ts`,
  `assistant/capabilityChecks.ts`) on the collected list, and asserts that `helpSources()` (the Help Centre, `help/workspaceHelp.ts`, built with the same
  `platform/helpSources.ts` functions as `collect()`) lists the fixture and returns the very same source object. A new policy test covers the projects manifest.
- Review fixes (same day): (1) the AI settings page and `Policy.modules` keep the pre-manifest order (workspace, requirements, conceptualize, sysml-modeler,
  cad-modeler, illustrative, projects, reasoning, help) wherever an entry is defined: `createPolicy` orders by a fixed presentation list in
  `services/assistant/src/policy.ts` (`MODULE_ORDER_HEAD`, `MODULE_ORDER_TAIL`); a module not listed there follows the listed ones in installed-list order and
  precedes the platform tail (`reasoning`, `help`). `services/api/src/modules.test.ts` asserts the module and settings-row order. **Recipe rule:** an M-step never
  changes this order; a genuinely new module needs no entry in the lists unless the owner wants a fixed position. (2) SDK 1.12.0 also adds `ServerModuleDescriptor`
  (`ServerModuleManifest` extends it); projects exports a descriptor without `register`, and `ALL_SERVER_MODULES`, `assertUniqueManifests` and `collectPolicyContributions` take descriptors.
  (3) The host reads `proposals` from every descriptor in `ALL_SERVER_MODULES`. (4) Placement: the client module lives in the existing `packages/projects-client`
  (not a new package) because the workspace's boundary rule lists only existing packages and `boundaries.test.ts` is out of scope until I4; the coordinator adds the
  Project Management ownership row to AGENTS.md.

### M3 result (16 October 2026)
M3 (branch feature/manifests-m3-sysml, no SDK change, SDK stays 1.12.0): the SysML Modeler moved; the illustrative `sysml` tool (`packages/tool-sysml`) is untouched.
- Client: `packages/tool-sysml-modeler` exports `sysmlModelerModule()` (`src/index.ts`; capability entries in `src/capabilities.ts`, moved unchanged). It is a tool package, so the `ClientModule` lives in it (the tool may import `/react`); the factory maps `ModuleHostEnv` to local|api itself. `INSTALLED_MODULES` calls it; `SYSML_MODELER_CAPABILITIES` is gone from `installedCapabilities.ts`. The tool's assistant and help were already in the package, so nothing else moved.
- Server: `services/sysml/src/manifest.ts` exports `sysmlServerManifest` (a `ServerModuleDescriptor`: id `sysml-modeler`, base path, docs title, provisioning ID `sysml`, `proposals`, AI module descriptor and the 15 `sysml-modeler.*` operation classes). `services/api/src/modules.ts` spreads it and keeps `register` (the plugin and its `onReady` hand-over) at the same list position, because the plugin needs host objects (pool, auth, options). The `sysml-modeler` entries in `AI_MODULES`, `OPERATION_CATALOGUE` and `PROPOSAL_APIS` are deleted; the fixed AI presentation-order test passes unchanged.
- Tests: `services/api/src/modules.test.ts` gets a SysML policy test. One existing assertion needed a local change: the "new installed module follows the known ones" case built its policy from fixtures only, so with the legacy `sysml-modeler` entry gone it lost that module; it now adds the real manifests (`ALL_SERVER_MODULES`) and expects seven known modules before `x1`. Later M-steps leave this assertion unchanged.
- `@ews/platform-sdk` ranges of `services/sysml` and `tool-sysml-modeler` are `^1.12.0`. There is no sysml-specific DB suite besides `services/api/test/sysml.test.ts` (inside `req:test:db`).

### M2 result (16 October 2026)
M2 (branch feature/manifests-m2-conceptualize, SDK 1.12.0, no SDK change): Conceptualize moved out of the workspace and the assistant policy.
- Client: `packages/tool-conceptualize` (already the tool package, with help and assistant) exports `conceptualizeModule()` and `CONCEPTUALIZE_MANIFEST` (`src/capabilities.ts` holds the 33 moved entries, unchanged; `defaultOpen`, entitlement and name as before). `INSTALLED_MODULES` calls it at the same list position (rail, help and registry order unchanged); `CONCEPTUALIZE_CAPABILITIES` is gone from `installedCapabilities.ts`. No new package: the existing tool package already is the module's client package and the workspace boundary rule lists it.
- Server: `services/conceptualize/src/manifest.ts` exports `conceptualizeServerManifest` (a `ServerModuleDescriptor`: base path, docs title, lazy provisioning, `aiModule`, the 34 `operations` in their old order, and `proposals`). `services/api/src/modules.ts` spreads it into the manifest and keeps only `register` (it needs `ApiModuleHost`). Deleted from the legacy files: the `conceptualize` entry of `AI_MODULES`, its 34 `OPERATION_CATALOGUE` lines and the `conceptualize` row of `PROPOSAL_APIS` (`proposals` is now declared by this module).
- Tests: a new policy test in `services/api/src/modules.test.ts` checks the module descriptor, the operation count and sample classes and `proposals`. The fixed presentation-order test stays green, but its "new installed module" case built its policy from fixtures only and so lost `conceptualize`; it now uses `ALL_SERVER_MODULES` without `projects` plus the two fixtures (same expectation). Tests that used the default policy for `conceptualize.*` changed: `services/assistant/src/policy.test.ts` and `wire.test.ts` build a policy with an inline conceptualize module (the assistant service may not import another service), and `services/assistant/test/env.ts` builds the policy and the settings definitions from the installed server manifests like `buildServer` does.
- Recipe corrections: (1) step 5 should say that every test that classifies a moved module's operations or reads its `ai.access.<id>` settings through the default policy (`policyFromSettings`, `decide`, `AI_SETTING_DEFINITIONS`) must build its policy from the manifests (`createPolicy(collectPolicyContributions(ALL_SERVER_MODULES))`) or, inside `services/assistant`, with an inline module. (2) The "new installed module" case of the presentation-order test must include the real manifests (see above); the next M-steps (sysml-modeler, cad-modeler) need the same only if they touch that line. (3) A module that is already a tool package puts its `ClientModule` in the tool package entry point; `ModuleManifest` and `AnyToolDefinition` are enough there.
