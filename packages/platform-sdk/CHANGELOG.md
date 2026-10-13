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
