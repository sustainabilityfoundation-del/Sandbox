# Platform: shell, contract and shared services

Packages: `apps/workspace`, `packages/platform-sdk` (1.6.0), `packages/model-service`,
`packages/design-system`. Architecture: [architecture.md](../architecture.md).

## Owns

- Shell: navigation, tool registry, windows and layouts, inspector, command palette, activity,
  baselines UI, assistant panel, "About this platform" capability labels.
- Product structure: `assembly`, `part`, `scenario` (module `product`, written by `platform`).
- Shared context: project, configuration, scenario, revision, selection.
- The repository and its rules: ownership, relationship validation, revision history, baselines,
  migrations.
- Subscriptions and entitlements (client-side prototype).

## Shared services implemented (minimal)

| Service | API |
| --- | --- |
| Revision history | `repository.listHistory(projectId, id)`, `getRevision(projectId, id, revision)`; SDK `ToolApi.getObjectRevision` |
| Baselines | `repository.createBaseline`, `listBaselines`; SDK `ToolApi.getBaselines`, `useBaselines`; `compareWithBaseline` |
| Change impact | `changeImpact(model, artifacts, baselines, id)`: linked objects, dependent artifacts (inputs), referencing artifacts (exact references), pinning baselines |
| Ownership | `ARTIFACT_OWNER`, `DELEGATIONS`, `RELATIONSHIP_RULES`; violations fail with `forbidden` / `invalid` |
| Artifacts | Immutable, with provenance, `schemaVersion`, input revisions and revision-qualified `references` |

## Baselines

A baseline pins `{id, revision}` for every object and scenario in the project and copies the
relationships at that moment, for one configuration. Names are unique (case-insensitive). Baselines
are not editable and cannot yet be released, locked or deleted. Comparison lists changed, added and
removed objects and relationship differences; the inspector shows the pinned value of each changed
property next to the current one.

## Inspector

For the selected object: owning module, properties, change impact and revision history.
