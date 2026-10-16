# Focused Canvas UI: coordinator contracts and ownership

Status: agreed by the coordinator, 16 October 2026. Brief: [ui-focused-canvas.md](ui-focused-canvas.md). Mockup:
[assets/focused-canvas-mockup.png](assets/focused-canvas-mockup.png).

## 1. Ownership (agent `ui-ux-design-system`)

| Owner | Paths |
| --- | --- |
| UI agent | `packages/design-system/**` (tokens, typography, icons registry, components, docs), the shell in `apps/workspace/src/shell/**` (header, navigation rail, explorer frame, dock and splitters, document tabs, inspector frame, status bar, command palette, dialogs, notifications) and `apps/workspace/src/shell/assistant/**` (the conversation panel's presentation), `apps/workspace/src/App.tsx` layout, workspace layout preferences and presets, `docs/modules/design-system/**`, `docs/specifications/ui-focused-canvas-progress.md` |
| UI agent, COORDINATOR REVIEW commits only | `apps/workspace/src/projects/ProjectExplorer.tsx` (presentation; data access unchanged), tool packages' CSS and toolbar layout files when a change is purely presentational and the owning module agent is informed through the coordinator, `AGENTS.md`/`docs/architecture.md` sections about the design system, `docs/dependencies.md`, `package.json` files for new dependencies |
| Not the UI agent | Domain logic, services, APIs, SDK contracts, `apps/workspace/src/assistant/**` (assistant logic: executor, connection, proposals; AI connection agent), module renderers (SysML diagrams, CAD viewport, Conceptualize layouts), module data. Changes needed there are requests through the coordinator |

## 2. Decisions

- **Icons:** Lucide (ISC) replaces Phosphor behind the existing semantic icon registry (`AppIcon`, `icons/names.ts`,
  `registry.tsx`), so modules keep using semantic names; the AGENTS.md icon rule is updated with the change. Custom
  engineering icons use the same interface.
- **Fonts:** IBM Plex Sans and IBM Plex Mono (SIL Open Font License 1.1) are approved by the coordinator; self-host them
  from the npm packages (no external font CDN), record them in `docs/dependencies.md`.
- **Tokens:** the palette becomes semantic tokens (`--ws-…`); the existing token names stay or are mapped, so module
  CSS keeps working. Light canvas with dark shell is the default; light and dark themes and both densities remain.
- **Preserved behaviour:** every committed browser flow in `tests/e2e` keeps passing (update selectors only where
  markup legitimately changes, never weaken assertions); help IDs (`data-help-id`) and tutorial anchors stay; keyboard
  shortcuts stay; the `tool` container query contract for tools stays.
- **Mockup content:** the photorealistic part renders in the mockup are illustrative. The UI shows real module
  output only; no fabricated previews.
- **AI panel:** presentation only. The executor, proposals, Apply, policy and connection logic stay where they are.
  Attachments are disabled until the file hand-off (CR-PM-SDK-4) exists; voice controls are feature-flagged off with
  documented integration requirements (no mock voice). Model/provider selector uses the existing connection API.
- **Module extension point:** a new or newly entitled module appears in navigation and the workspace from its
  registration (tool registry, `registerPlatformModule`) without shell edits.

## 3. Coordination

Module agents are active (Conceptualize visual exploration, Requirements and SysML live-run fixes, AI visualization
service). Avoid editing their packages; consolidate toolbars through shared components (`Toolbar`, overflow) that
modules adopt. Merge in small increments: design system foundation, then shell, then workspace frame, then assistant.
Each increment: `npm run check`, builds, all `tests/e2e` flows (they pin the demo assistant), screenshots at
1920x1080 and 1366x768 in both themes.

## 4. Environment

Worktree `C:\Users\kimge.000\Documents\Sandbox-ui`, branch `feature/ui-focused-canvas`. Ports: workspace 5210 and 5211,
API 8803, PostgreSQL 54345. Do not push; do not merge.
