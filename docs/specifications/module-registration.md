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
