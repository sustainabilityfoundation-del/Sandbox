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
