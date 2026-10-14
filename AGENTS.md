# AGENTS.md: engineering platform monorepo

Guidance for people and coding agents working in this repository. Each package has its own
`AGENTS.md` with the rules for that package; read it before changing the package.

Direction and decisions live in `docs/`, not here: [architecture vision](docs/architecture-vision.md)
(proposed, long term), [architecture](docs/architecture.md) (approved, current),
[roadmap](docs/roadmap.md), [module specifications](docs/modules/),
[decisions](docs/decisions/README.md) and [dependencies](docs/dependencies.md). Record a new
architecture decision as an ADR; record a new dependency with its licence in `docs/dependencies.md`.
Specifications for work in progress are in `docs/specifications/` (brief, agreed contracts and a
progress file per module).

## Short sprints and working software

Follow [the development workflow](docs/development-workflow.md) and use
[the sprint template](docs/sprints/template.md). These rules apply to every package:

- Work in short sprints: one bounded, demonstrable outcome with acceptance criteria agreed before
  implementation. Prefer a usable end-to-end slice over disconnected layers or placeholder UI.
- Keep `main` buildable and runnable. Develop unfinished work on task branches or isolated
  worktrees; integrate small, coherent changes only after `npm run check` and the relevant builds
  pass. Documentation-only changes follow the lighter verification described in the workflow.
- Preserve existing workflows and stored data. Fix regressions introduced by the sprint before
  adding more features; conceal unfinished functionality behind disabled flags when needed.
- For user-facing changes, exercise the real application workflow as well as automated tests.
  Distinguish checks actually performed from checks that remain blocked or require owner review.
- End each sprint with a committed checkpoint, exact revision, startup commands, a short owner
  walkthrough, verification results and known limitations. Never fabricate owner acceptance.
- When multiple agents are explicitly requested, the coordinator owns sprint scope, shared
  contracts and integration; implementation agents own bounded areas and separate files/worktrees.

## Ownership

| Area | Packages | Owns |
| --- | --- | --- |
| Platform | `apps/workspace`, `packages/platform-sdk`, `packages/model-service`, `packages/design-system` | Shell, navigation, tool registry, subscriptions and entitlements, shared context, windows, assistant execution, the SDK contract, the shared twin and repository, the component library and icons |
| Requirements tool | `packages/tool-requirements` | Requirements views, toolbar, commands, private view state, requirement domain logic, assistant actions |
| SysML tool | `packages/tool-sysml` | Diagram, property panel, text notation, SysML domain logic, assistant actions |
| CAD tool | `packages/tool-cad` | Mock geometry, dimensions, visibility, CAD domain logic, assistant actions |
| GLB viewer | `apps/glb-viewer` | Standalone viewer (not part of the platform) |

Work on one area at a time. A tool change must not require changes in another tool. If it needs a
platform change, make that a separate, explicit platform change (see *Contract changes*).

## Permitted dependencies

```
tool-*         → @ews/platform-sdk (incl. /react, /harness, /testing), @ews/design-system
platform-sdk   → @ews/model-service, @ews/design-system
design-system  → (no @ews packages)
model-service  → (no @ews packages, no React)
apps/workspace → every package; a tool only through its package entry point
```

- Tools never import another tool, `apps/workspace`, `@ews/model-service`, the repository,
  `localStorage`, React Aria or icon packages directly.
- Relative imports never leave a package.
- `packages/platform-sdk/src/boundaries.test.ts` enforces these rules.

## SDK and versions

- SDK version **1.2.0** (`packages/platform-sdk/src/contract/version.ts`). Tools declare
  `sdkVersion: '^1.0.0'` or `'^1.1.0'` (needed for revisions and baselines); the registry refuses tools built for another major version.
- Entry points: `@ews/platform-sdk` (framework-free contract and domain model),
  `@ews/platform-sdk/react` (`defineTool`, hooks, engineering UI helpers),
  `@ews/platform-sdk/harness` (`mountHarness`, mock host), `@ews/platform-sdk/testing` (`sampleModel`).
- Package versions are semver; a tool's version is recorded with the artifacts it saves.

## Contract changes

A change to anything exported by `@ews/platform-sdk`, `@ews/model-service` types, the design-system
component APIs or semantic icon names is a **shared contract change**:

1. Prefer additive changes (new optional fields, new hooks). Bump the minor version.
2. Breaking changes bump the major version and need a migration note.
3. Write the migration note in `packages/platform-sdk/CHANGELOG.md` before merging: what changed,
   why, and the exact steps each tool takes.
4. Validate every affected tool: `npm run check`, and run each tool's harness.
5. Stored data changes need a non-destructive migration in `packages/model-service` (add, never
   rewrite or delete user data) with a test using a fixture of the old format.

## Commands

| Command | Use |
| --- | --- |
| `npm install` | Install and link all workspaces |
| `npm run dev` | Workspace (http://localhost:5173/workspace/) plus backend (Requirements API :8787, embedded PostgreSQL) |
| `npm run dev:workspace` / `dev:api` | Workspace alone / backend alone |
| `npm run req:test:db` | Requirements tests on a real, disposable PostgreSQL |
| `npm run dev:requirements` / `dev:sysml` / `dev:cad` | One tool in its standalone harness (ports 5181–5183) |
| `npm run typecheck` | `tsc` in every workspace |
| `npm test` | All tests (Vitest) |
| `npm run check` | Type check and tests: required for code/configuration changes; see workflow for docs-only checks |
| `npm run build` | Production build (`dist/`, workspace in `dist/workspace/`) |

On Windows PowerShell use `npm.cmd` if script execution is disabled.

## Design system requirements (every UI package)

- Use `@ews/design-system` components (React Aria behaviour, Tailwind on design tokens). No raw
  `<button>`, `<select>`, `<textarea>` or `<input>` (a hidden file picker is the one exception).
- Icons: `AppIcon` with semantic names only. New names go in
  `packages/design-system/src/icons/names.ts` and are mapped in `registry.tsx` (Phosphor, or a
  custom SVG with the same interface). Duotone for tools and object categories, regular for actions,
  `filled` for selected states. Icon-only buttons need an accessible label; keep text labels on
  important actions.
- Colours, spacing, radii and motion come from tokens (`var(--ws-…)` or semantic Tailwind classes).
  No hard-coded colours or inline styles. Tool CSS lives in `@layer components { … }` and lays out
  against the `tool` container (`@container tool (…)`).
- Light and dark themes, both densities, and phone, tablet and desktop must work. No essential
  action may depend on hover, right-click or dragging.
- `packages/design-system/src/theme/designSystem.test.ts` enforces the rules it can check.

## Model identity and revision rules

- Objects are identified by stable IDs (`ROD-120`, `REQ-001`, `SYS-003`, `CAD-120`). Names are for
  display only; never match objects by name.
- Physical components are the identity. SysML elements and CAD representations link to them with
  `represents`; never create a second component to represent an existing one.
- Resolve selections through explicit relationships (`resolveRepresentation`, `componentOf`). If
  nothing is linked, keep the selection and explain the empty view.
- Every write goes through `ToolApi.submitChanges` as one atomic batch. Property edits carry the
  revision they were based on; the repository rejects stale edits. New objects in a batch use
  placeholders (`ref: '$new'`) that later changes in the batch can reference.
- Saved artifacts are immutable; save new ones with `saveArtifact` (kind, schema version, objects,
  input revisions). Staleness is derived from input revisions, never by editing artifacts.
- Shared context (project, configuration, revision, selection, scenario) belongs to the platform.
  View state (camera, filters, scroll, diagram position, visibility) is private to each view instance.
- Every object type has one owning module (`ARTIFACT_OWNER`, `packages/model-service/src/domain/ownership.ts`);
  relationships belong to the module owning the `from` end and must satisfy `RELATIONSHIP_RULES`.
  The repository refuses other writes (`forbidden`, `invalid`). Exceptions are listed in
  `DELEGATIONS` only; adding one is an ADR.
- References from artifacts carry an exact `revision` unless they deliberately follow the latest
  working revision. Verification records pin the requirement revision and configured article.
- Cross-tool mappings must be explicit and documented (today only CAD dimension → component
  property). Do not add implicit synchronisation.
- Subscriptions are platform logic. Tools declare `entitlement` and never check plans themselves.
  Client-side checks are UX only; production checks belong on the server.

## Do not

- Launch additional agents for routine work in this repository unless asked.
- Delete or rewrite user data in migrations.
- Claim SysML v2 compliance, a CAD kernel or real ChatGPT access in UI or docs.
- Present a planned capability as working. Keep `apps/workspace/src/platform/capabilities.ts`
  and `docs/roadmap.md` in step.
