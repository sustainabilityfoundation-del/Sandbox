# ADR-0014: Unified help system with module-owned documentation

Status: Accepted (2026-10-14)

## Context

The owner asked for a platform-wide help system: a Help menu with dynamic module submenus, contextual
help (F1), searchable documentation, tutorials, API documentation, and AI access to the same
documentation. Modules are developed by separate agents and may move to separate repositories.

## Decision

- **Contract in the SDK (1.4.0):** a versioned `HelpManifest` (schema 1) per module and a `HelpService`
  interface (`packages/platform-sdk/src/contract/help.ts`). Tools declare `help` in their definition.
- **Module-owned content:** Markdown with front matter in `packages/<module>/help/`, next to the code.
  Stable namespaced help IDs (`<module>.<area>.<item>`).
- **Platform Help Service** in the workspace, driven by the tool registry and the subscription check,
  offered as `services.help`; Help menu, Help Centre, F1 and tours on top of it.
- **AI** reads documentation through the `read_help` operation of the same service; executable actions
  remain defined only by the operation registry.
- **Technology:** Driver.js (MIT) for tours, loaded on demand; Scalar (MIT) served locally by the API
  host for OpenAPI documentation. Docusaurus (portal and versioning), Storybook (components) and
  TypeDoc (TypeScript APIs) are adopted as the tools for those jobs and will be set up in later sprints,
  reading the same sources. None of them is a runtime dependency of modules.
- **Definition of done:** documentation and contextual mappings are part of every module feature
  (AGENTS.md); tests enforce manifest validity, toolbar/operation coverage and a shrinking list of
  known gaps.

## Consequences

- One source serves people, the assistant and the future portal; there is no second copy to drift.
- The app bundle includes the help text (small), so help works offline in web and desktop builds.
- Modules without documentation are visible as gaps, not hidden.
- Filtering is client-side today, like subscriptions (ADR-0008); a server-side documentation service
  would need the same entitlement checks.
- Adding Docusaurus, Storybook and TypeDoc adds build-time dependencies only; record them in
  docs/dependencies.md when set up.
