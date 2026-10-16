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

## Current priority

Deliver the smallest credible end-to-end AI engineering workflow before broadening individual modules:
[demonstration D1](docs/specifications/demo-ai-engineering.md), within
[integration milestone 1](docs/specifications/integration-milestone-1.md). Implement the smallest reusable increment
that completes the workflow; do not substitute disconnected module demonstrations.

## Ownership

| Area | Packages | Owns |
| --- | --- | --- |
| Platform | `apps/workspace`, `packages/platform-sdk`, `packages/model-service`, `packages/design-system` | Shell, navigation, tool registry, subscriptions and entitlements, shared context, windows, assistant execution, the SDK contract, the shared twin and repository, the component library and icons |
| Requirements tool | `packages/tool-requirements` | Requirements views, toolbar, commands, private view state, requirement domain logic, assistant actions |
| SysML tool | `packages/tool-sysml` | Diagram, property panel, text notation, SysML domain logic, assistant actions |
| CAD tool | `packages/tool-cad` | Mock geometry, dimensions, visibility, CAD domain logic, assistant actions |
| Conceptualize | `packages/tool-conceptualize`, `packages/conceptualize-client`, `services/conceptualize` | Concepts, alternatives, trade studies, decisions, evidence, implementations ([contracts](docs/specifications/conceptualize-contracts.md)) |
| CAD Modeler | `packages/cad-core`, `packages/cad-kernel`, `packages/tool-cad-modeler` | Native parametric model, commands, OCCT kernel adapter, modeler UI ([contracts](docs/specifications/cad-program-contracts.md)) |
| SysML Modeler | `packages/sysml-core`, `services/sysml`, `packages/sysml-client`, `packages/tool-sysml-modeler` | SysML v2 semantic core, repository and API, modeler UI ([contracts](docs/specifications/sysml-program-contracts.md)) |
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

- SDK version **1.10.0** (`packages/platform-sdk/src/contract/version.ts`). Tools declare
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
| `npm run e2e` | Committed browser flows against a running `npm run dev` ([tests/e2e](tests/e2e/README.md)) |

On Windows PowerShell use `npm.cmd` if script execution is disabled.

## Design system requirements (every UI package)

- Use `@ews/design-system` components (React Aria behaviour, Tailwind on design tokens). No raw
  `<button>`, `<select>`, `<textarea>` or `<input>` (a hidden file picker is the one exception).
  The visual direction is Focused Canvas ([design system](docs/modules/design-system/README.md),
  [components](docs/modules/design-system/components.md), [shell](docs/modules/design-system/shell.md),
  [assistant panel](docs/modules/design-system/assistant.md)): modules consume the shared components and do
  not develop competing styles. Package rules: `packages/design-system/AGENTS.md`. A module integrates into
  navigation (the rail), the command palette and help from its registration alone (`registerTool`,
  `registerPlatformModule`); it renders inside the canvas container (`.ws-tool-host`) with any rendering technology
  and contributes toolbar items rather than its own top-level chrome.
- Icons: `AppIcon` with semantic names only. New names go in
  `packages/design-system/src/icons/names.ts` and are mapped in `registry.tsx` (Lucide, or a
  custom engineering glyph made with `createLucideIcon`, same interface). 16 px in toolbars, trees
  and menus, 18–20 px in primary navigation; `filled` for selected states. Icon-only buttons need an
  accessible label (shown as the tooltip, with any shortcut); keep text labels on important actions.
- Typography: IBM Plex Sans; IBM Plex Mono (`font-mono`) for IDs, values, parameters and code.
- Colours, spacing, radii and motion come from tokens (`var(--ws-…)` or semantic Tailwind classes).
  No hard-coded colours or inline styles. Tool CSS lives in `@layer components { … }` and lays out
  against the `tool` container (`@container tool (…)`).
- Light and dark themes, both densities, and phone, tablet and desktop must work. No essential
  action may depend on hover, right-click or dragging.
- `packages/design-system/src/theme/designSystem.test.ts` enforces the rules it can check.

## Help and documentation (definition of done, every module)

Specification: [docs/modules/help.md](docs/modules/help.md), decision: ADR-0014. The coordinator owns
the Help Service and the manifest contract; **each module agent owns its module's documentation and
contextual help mappings**. A feature without its documentation is incomplete.

1. Register the module with the Help Service: export a `HelpManifest` (schema 1) as `help` in the tool
   definition, built from `packages/<module>/help/*.md` (see `packages/tool-requirements/src/help.ts`).
2. Provide: overview and getting started; every significant feature; command and tool reference;
   properties, parameters and configuration; tutorials for major workflows; keyboard shortcuts;
   troubleshooting and error explanations; API and integration notes; engineering examples. Explain
   inputs, outputs, constraints, dependencies and expected behaviour.
3. Use stable namespaced help IDs (`<module>.<area>.<item>`); keep them across redesigns.
4. Map every toolbar item and assistant operation in `contextMappings`, and mark other significant
   controls with `data-help-id`. Tutorials reference controls by help ID, never by CSS selector.
5. Keep user documentation in `help/` and developer documentation in `docs/` and `AGENTS.md`; generate
   from authoritative definitions (OpenAPI, types) instead of copying where possible.
6. Update the help pages in the same change as the feature; tests in
   `apps/workspace/src/help/help.test.ts` must stay green (`KNOWN_DOCUMENTATION_GAPS` may only shrink).
7. Documentation never defines executable behaviour; the assistant acts only through registered operations.
8. Modules in separate repositories receive this section and `docs/modules/help.md` with the SDK.

## AI capability design

Read [AI Interface architecture](docs/modules/ai-interface.md) and
[feature requirements](docs/modules/ai-interface/features.md) for AI-related work.
New UI and backend capabilities must include a typed, discoverable operation or a documented
mapping to an existing operation, with coverage evidence. User and AI paths share validation;
view operations target a view instance and domain writes retain ownership/revision checks.
This is a design policy: complete coverage and autonomous execution are not implemented yet.
Preserve the current proposal-preview policy until its replacement is explicitly reviewed.

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

## Development assurance (deferred epic)

Standards-aware assurance is deferred ([E-ASSURE](docs/roadmap.md#deferred-epic-e-assure-standards-aware-development-assurance-and-safety-engineering));
do not start it. New work must still respect [ADR-0070](docs/decisions/0070-development-assurance-boundaries.md):
no standard-specific terminology, integrity levels or certification gates in generic modules; no conversion
between classification schemes; evidence records the revisions, configuration, inputs and tool versions it
supports; keep validation, implementation, verification, review and evidence currency as separate states; AI
proposals, results and approved records stay distinguishable.

## Agent context and handoffs (every agent)

Rules and formats: [docs/agents](docs/agents/README.md); decision [ADR-0072](docs/decisions/0072-agent-context-management.md). Context size drives cost, so:

1. **Read the minimum authoritative context**: your brief, contracts, progress file and package `AGENTS.md`; link to documents, never paste them. Read a file once per session; use Grep or the `scout` agent for lookups. Do not read screenshots into a coordinator's context; compare images by script and report numbers.
2. **Respect module boundaries** (Ownership table). Another module's contract file, not its implementation, is your interface.
3. **Do not duplicate assigned work**: check progress files, `git log` and the assignment table in `docs/status/coordinator.md`. At most 2-3 implementation agents run at once; helpers cannot start agents; three failed attempts at one step means stop and report.
4. **Short-lived agents**: one agent per sprint, started from the brief and the status block of the progress file, ending in a handoff (do not resume one agent indefinitely). Keep a status block of at most one page at the top of the progress file and move history to an archive file ([template](docs/agents/handoff-template.md)).
5. **Report in about 300 words plus links** (changes, files, tests and results, decisions, open issues, next actions). No pasted source, logs or transcripts. Run suites through `node scripts/verify.mjs` or the `integration-runner` agent and report its table.
6. **Persist decisions in the repository** (ADR, progress file) at every checkpoint and before context passes 70%; at 85% stop new work and write the handoff. Never stop or compact an agent whose work is not committed.
7. **Choose the cheapest adequate model** through `.claude/agents/`: Opus for architecture, integration and review; Sonnet for implementation, tests, docs and research; Haiku for searches and log triage. Do not escalate on your own.
8. **Keep the coordinator informed with compact status reports**; the coordinator owns architecture, shared contracts and integration.

## Do not

- Launch additional agents for routine work in this repository unless asked (the definitions in `.claude/agents/` are for work the coordinator assigns).
- Delete or rewrite user data in migrations.
- Claim SysML v2 compliance or real ChatGPT access in UI or docs. The CAD Modeler uses a real kernel
  (Open CASCADE); describe it with its documented limits, and never present the mock CAD tool as a kernel.
- Present a planned capability as working. Keep `apps/workspace/src/platform/capabilities.ts`
  and `docs/roadmap.md` in step.
