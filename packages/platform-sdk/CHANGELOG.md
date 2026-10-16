# @ews/platform-sdk changelog

Every change to the tool contract is recorded here with a migration note. See the root
`AGENTS.md`, "Contract changes", for the process.

## Template

```
## x.y.z (date)

Type: additive | breaking | fix

What changed:
Why:
Migration for tools: (exact steps, or "none")
Validated with: npm run check; harnesses for requirements, sysml, cad
```

## 1.10.0 (2026-10-16)

Type: additive

What changed:
- `contract/modules.ts` (root entry): `ModuleManifest`, `CapabilityEntry` and its unions (`CapabilitySurface`, `CapabilityEffect`,
  `CapabilityStatus`, `AiCoverage`, `CapabilityModule` as `string`), `OperationClass`, `AiModuleDescriptor`,
  `ServerModuleManifest`, `ServerModuleHost` (structural, no Fastify) and `ServerModuleRegistration`.
- `/react`: `ClientModule` and `ModuleHostEnv`.

Why: per-module registration manifests, so adding a module no longer edits shared append-only files
(docs/specifications/module-registration.md). Types only in this version; the workspace and services adopt them in later increments.
Migration for tools: none (no tool steps).
Validated with: npm run check; npm run build

## 1.9.0 (2026-10-16)

Type: additive

What changed:
- `ConceptsService.getDefinition?`, `getHandoff?`, `listHandoffs?`, `revisionStaleness?` (all optional) and the types
  `ConceptDefinitionSummary`, `ConceptRevisionStaleness`, `ConceptHandoffSummary`. `ConceptsEventType` gains
  `visual.created`, `visual.revised`, `visual.annotated`, `visual.generation-changed`, `handoff.created`.
- `contract/files.ts` (CR-PM-SDK-4): `FilesService` (`stage`, `describe`, `read`, `discard`), `StagedFile`, `FileProvenance`,
  `FILES_CONTRACT_VERSION`, and `createMemoryFilesService()` (per window, in memory). `PlatformServices.files?`.
- The workspace host implements the new Concepts members over the Conceptualize module client and provides `files`;
  the harness mock host provides an in-memory `files` by default. The interim `configureConceptHandoffs` port of the
  CAD Modeler is removed; it reads `services.concepts.getHandoff` / `revisionStaleness`.
Why: CAD consumption of Conceptualize handoffs and concept staleness without a private port (visual concept
exploration), and file hand-off (for example STEP export to a project document) without bytes passing through the assistant.
Migration for tools: none required (additive). Tools should handle the optional members being absent. The CAD Modeler
no longer exports `configureConceptHandoffs`.
Validated with: npm run check; npm run build; platform-sdk contract and boundaries tests

## 1.8.0 (2026-10-15)

Type: additive

What changed:
- `contract/cad.ts`: `CadService` (`summary`, `massProperties` at a document revision), `CadArtifactRefInput`,
  `CadReadResult`, `CadEntitySummary`, `CadBodyMassProperties`, `CadMassPropertiesResult`. Implemented by
  `createCadReadService` in `@ews/cad-client`. Results name the kernel that regenerated them.
- `contract/sysml.ts`: `SysmlModelService` (`listProjects`, `resolve`, `find`, `subscribe`), `SysmlElementRef`,
  `SysmlElementSummary`, `SysmlResolution`, `SysmlModelEvent`. Implemented by `createSysmlModelService` in
  `@ews/sysml-client`.
- `PlatformServices.cad?` and `PlatformServices.sysml?`.
- `ConceptsService.getConstraint?` and `ConstraintSummary` (optional; demonstration D1 reads constraint bounds
  from Conceptualize).
Why: milestone C5 (cross-module resolution) and demonstration D1 (checks against authoritative constraints).
Migration for tools: none. Use `useServices().cad` / `.sysml` / `concepts.getConstraint` when present and handle
their absence (module not installed or not entitled).

AI part (AI connection, integration milestone 1 C9, ADR-0042 / design reasoning CR-A1, CR-A2):

- `contract/assistant.ts`: declarative proposals. New action result kind `DeclarativeProposal`
  (`kind: 'declarative-proposal'`, module, title, explanation, preview, assumptions, inspected, `operations:
  ModuleOperation[]`, `expected?: ExpectedRevision[]`, `projectId?`, `confirmation?`). `ModuleOperation` names
  the module, its OpenAPI `operationId`, method, a path **relative to the module's base path** (validated
  against that operationId, so a proposal cannot target an arbitrary URL), query, body, `ifMatch` and an
  optional `idempotencyKey` (default `<proposalId>:<index>`); `"$result[n].field"` placeholders refer to
  earlier results. `ExpectedRevision` names the artifact, the revision the preview was based on and the read
  operation used to check it again at Apply. The platform persists declarative proposals in the assistant
  service, so they reopen after a reload or restart, and executes them through the module API after
  revalidating identity, permissions, project scope, expected revisions and idempotency.
- `ActionEffect` and `AssistantActionDefinition.effect?` (read, search, calculate, propose, export,
  external-generation, view): separates engineering operations from view controls in coverage.
- `PlatformModuleContribution` (`id`, `name`, `entitlement?`, `assistant?`, `help?`, `settings?`): a module
  without a tool view (Project Management, design reasoning) registers its assistant operations, help and
  settings with the workspace (`registerPlatformModule`), read exactly like tool contributions.
Why: assistant operations must work headless and proposals must survive restarts (integration milestone 1 §4).
Migration for tools: none. Closure `ServiceProposal`s keep working as a labelled fallback (they can be applied
only in the window that prepared them); move a mutation to `DeclarativeProposal` by returning its module API
calls as `operations` with `ifMatch` and `expected` instead of an `apply` closure.
Validated with: npm run check; npm run build:harnesses

## 1.7.0 (2026-10-15)

Type: additive

What changed:

- `contract/projects.ts` (new): the cross-module Project Management contract — `ProjectsService` (`list`, `get`,
  `resolve`, `artifacts`, `subscribe`), `ProjectSummary`, `ArtifactSummary`, `ArtifactAvailability`,
  `ProjectRole`, `ProjectLifecycleStatus`, `ProjectRecordState`, `ProjectsEvent`, `ProjectsEventType`,
  `ProjectsServiceError`, `ProjectsErrorCode`, `CurrentProject`, `PROJECTS_CONTRACT_VERSION`.
  `PlatformServices.projects?: ProjectsService`.
- `contract/artifacts.ts` (new, framework-free, server-side): the artifact registration contract —
  `ArtifactSource` (`describeModule`, `list`, `describe`, `subscribe`, optional `provision`, `exportProject`,
  `importProject`), `NativeRef`, `ArtifactDescriptor`, `ArtifactChange`, `ArtifactPage`, `ArtifactKindInfo`,
  `ArtifactLifecycle`, `ArtifactCategory` (+ `ARTIFACT_LIFECYCLES`, `ARTIFACT_CATEGORIES`), `ProvisionRequest`,
  `ProvisionResult`, `ModulePayload`, `ModuleImportReport`, `ARTIFACT_SOURCE_CONTRACT_VERSION`.
- `SharedContext.project?: CurrentProject` (optional; `projectId` stays authoritative).
- `PlatformArtifactModule` (= `ArtifactModule` | `'projects'` | `'product'` | `'conceptualize'`) and
  `PLATFORM_ARTIFACT_MODULES`. `ArtifactModule` itself is **not** widened in 1.7: `tool-conceptualize` keeps an
  exhaustive `Record<ArtifactModule, string>`, so widening it is source-incompatible for that consumer. It is
  widened in a later minor together with Conceptualize accepting the new values (CR-PM-CON-1).
- `ServiceProposal.confirmation?: { phrase, prompt }` for destructive changes (the person types the phrase
  before Apply).

Why: Project Management (docs/specifications/project-management.md; ADR-0060 to ADR-0062, approved for
implementation 15 October 2026). One project registry and one global artifact identity for every module;
modules register their artifacts by implementing `ArtifactSource` over their own outbox (change requests
CR-PM-REG-1…4, routed by the coordinator).

Migration for tools: none (`ArtifactModule` is unchanged). Service modules implement `ArtifactSource` in their service package when
their change request is scheduled; contract tests will be provided by `@ews/projects-client/contract-tests`.
Validated with: npm run check; npm run build:harnesses

## 1.6.0 (2026-10-15)

Type: additive

What changed: `contract/quantities.ts` exports the platform unit algebra (`parseUnit`, `isValidUnit`,
`sameDimension`, `convert`, `dimensionName`, `quantityProblem`, `UnitError`, `COMMON_UNITS`, `Dims`,
`ParsedUnit`, `QuantityInput`), moved unchanged from `services/conceptualize/src/domain/units.ts`, which now
re-exports it.
Why: one unit system for Conceptualize, the design reasoning calculation engine and other modules (design
reasoning CR-S2, ADR-0044); avoids a second, divergent unit library.

Settings contribution (AI connection sprint, docs/specifications/ai-connection.md §5a; additive, same 1.6.0):
`contract/settings.ts` exports `SettingDefinition` (types boolean | enum | number with unit and range |
string | secret-reference; `id` namespaced `<module>.<area>.<item>`, label, description, `helpId`, default,
scope user | project, `requiresPermission?`, `ceiling?` naming a project setting that bounds a user setting,
`group?`), `SettingsContribution` (one page per module), `SettingsService` (`get`, `subscribe`),
`SETTING_ID_PATTERN`, `RESERVED_SETTING_NAMESPACES` (`ai.reasoning.*` for the design reasoning layer),
`checkSettingValue`, `withinCeiling`, `clampToCeiling`, `validateSettingDefinitions` and
`createMemorySettingsService`. `ToolDefinition.settings?: SettingsContribution`; `ToolApi.settings:
SettingsService` (read-only effective values); `useSetting(id)` in `@ews/platform-sdk/react`; the harness
mock host serves the tool's defaults (`createMockHost(tool, { settings })` overrides values). The platform
renders the pages in the Settings centre (header, beside Help) and stores values in the settings service
(`/api/settings/v1`), which validates every write with the same functions.
Migration for tools: none. To contribute settings, add `settings: { page, definitions }` to the tool
definition and read values with `useSetting`; server validation of a module's values needs its definitions
registered on the API host (see docs/specifications/ai-connection-progress.md, change requests).
Validated with: npm run check; npm run build:harnesses
Migration for tools: none. Use these functions instead of writing unit handling. Further 1.6 additions (settings
contribution, platform services for SysML and CAD) are recorded below as they land.
Validated with: npm run check; npm run build:harnesses

## 1.5.0 (2026-10-14)

Type: additive

What changed:

- `contract/concepts.ts`: the cross-module Conceptualize contract — `ConceptsService` (`get`, `list`,
  `conceptsForArtifact`, `implementations`, `subscribe`), `ConceptSummary`, `ConceptMaturity`,
  `ConceptAbstraction`, `ArtifactRef` (version-aware reference to another module's artifact),
  `ConceptImplementationSummary`, `ConceptsEvent`, `ConceptsServiceError`. `PlatformServices.concepts`.
- Assistant: `AssistantActionContext.services`; result kind `service-proposal` (`ServiceProposal`,
  `ServiceProposalItem`) so service-backed modules' changes go through the platform preview and Apply
  (Requirements contract request 3); `AssistantContribution.demo` (scripted demo planning, demo only).

Why: the Conceptualize module (docs/specifications/conceptualize.md, ADR-0015), and a single preview and
Apply path for changes to service-backed modules.

Migration for tools: none. Requirements may move its in-tool proposals to `service-proposal`.
Requirements contract requests 5, 7 and 9 move to SDK 1.6.

Validated with: npm run check.

## 1.4.0 (2026-10-14)

Type: additive

What changed:

- `contract/help.ts`: help and documentation contract — `HelpManifest` (schema version 1),
  `HelpTopic`, `HelpTutorial`, `HelpShortcut`, `HelpContextMapping`, `HelpApiReference`,
  `HelpContext`, `HelpService`, `HELP_ID_PATTERN`, `parseHelpMarkdown`, `validateHelpManifest`,
  `majorVersion`.
- `ToolDefinition.help?: HelpManifest`; `PlatformServices.help?: HelpService`.

Why: unified help system (docs/modules/help.md, ADR-0014). Every module documents itself through
one manifest; people and the assistant read the same documentation.

Migration for tools: add `help` built from Markdown in `packages/<tool>/help/` (see
`packages/tool-requirements/src/help.ts`). Until then the Help Service lists the module with a
"documentation not available yet" page. Contract requests 5, 7 and 9 (approved for "1.4") move to
SDK 1.5.

Validated with: npm run check.

## 1.3.0 (2026-10-14)

Type: additive

What changed:

- `RequirementWriteOptions.projectId?`: lets `RequirementsService.update()` callers name the project,
  so adapters need not look it up (Requirements agent contract request 1).
- `RequirementsEventType` gains `'requirements.collection-changed'` (entityId = collection ID,
  committedRevision = structure revision), so other windows refresh collection trees
  (contract request 2).

Why: requested by the Requirements module; see
`docs/specifications/requirements-contracts.md` §13.

Migration for tools: none. Event consumers that switch over event types should treat unknown types
as "reread what you show".

Validated with: npm run check.

## 1.2.0 (2026-10-13)

Type: additive

What changed:

- `contract/requirements.ts`: the cross-module Requirements service contract —
  `RequirementsService` (`get`, `resolve`, `list`, `create`, `update`, `traceLinks`,
  `subscribe`), `RequirementSummary`, `RequirementRef`, `RequirementsQuery`, `Page`,
  `RequirementTraceLink`, `RequirementsEvent`, `RequirementsServiceError`, `PlatformServices`.
- `ToolApi.services` and `PlatformHost.getServices()`; hook `usePlatformServices()`.
- Harness: `mountHarness(tool, element, { services })` and `createMockHost(tool, { services })`.

Why: the Requirements module moves to a PostgreSQL-backed API; SysML and CAD consume requirements
through this contract only. See `docs/specifications/requirements-contracts.md` and ADR-0011.

Migration for tools: none. `services` is empty in hosts that provide no services; treat an absent
service as unavailable and say so (never substitute other data).

Validated with: npm run check.

## 1.1.0 (2026-10-13)

Type: additive

What changed:

- `ToolApi.getObjectRevision(id, revision)` returns the immutable snapshot of an exact revision.
- `ToolApi.getBaselines()` and the `useBaselines()` hook list the project's baselines.
- `ArtifactInput.references` (`{ id, revision?, role }[]`): revision-qualified references from an
  artifact; with `revision` the reference is exact. The repository rejects unknown IDs and revisions.
- Re-exports `ARTIFACT_OWNER`, `DELEGATIONS`, `RELATIONSHIP_RULES`, `changeImpact` and
  `compareWithBaseline`, and the `Baseline`, `ObjectRevision`, `ArtifactReference` types.
- Behaviour: the repository enforces module ownership and relationship semantics. A write to an
  object the tool's module does not own, outside `DELEGATIONS`, now fails with
  `RepositoryError` code `forbidden`; an invalid relationship fails with `invalid`.
- Stored data: repository schema 3 (revision history, baselines). Schema 2 data is upgraded in place
  additively on load.

Why: architecture vision Phase 1 (baselines, revision-qualified references, ownership, recorded
verification). See `docs/decisions/` ADR-0004 to ADR-0007.

Migration for tools: none for tools that write only their own objects (all current tools). To use
revisions or baselines, declare `sdkVersion: '^1.1.0'`. Handle `forbidden` like any other save
error (keep the user's input, show the message).

Validated with: npm run check; harnesses for requirements, sysml, cad.

## 1.0.0 (2026-10-13)

Type: initial release of the versioned contract.

What changed: the tool contract moved out of the workspace into this package.

- `ToolManifest` (framework-free): `id`, `name`, `description`, `category`, semantic `icon`,
  `version`, `sdkVersion`, `entitlement`, `supportedObjectTypes`.
- `ToolDefinition` (`/react`): manifest plus lazy `view`, `initialViewState`, `toolbar` and optional
  `assistant` contribution (actions, editable fields, relationship and object rules).
- `ToolApi`: context, model, selection, `submitChanges`, `saveArtifact` (replaces `saveOutput`;
  artifacts carry `schemaVersion`), `getArtifacts`, `setReviewStatus`, `getActivity`, `log`,
  `registerCommand`, `openTool` (returns a result instead of always succeeding), private view state.
- Hooks: `useSharedContext`, `useModel`, `useSelection`, `useResolvedSelection`, `useArtifacts`
  (replaces `useOutputs`), `useActivity`, `useToolViewState`, `useToolCommand`, `useRestoredScroll`,
  `useUnsavedChanges`, `useIsActiveTool`, `useViewId`.
- `PlatformHost` lets the same tool run in the workspace and in the standalone harness.
- Toolbar items use semantic icon names (`IconName`) instead of icon components.

Migration for tools: tools written against the in-workspace SDK of version 0.1 import from
`@ews/platform-sdk` and `@ews/platform-sdk/react` instead of `../../sdk`, add `version`,
`sdkVersion` and `entitlement`, use semantic icon names, and replace `saveOutput`/`useOutputs`
with `saveArtifact`/`useArtifacts`.
