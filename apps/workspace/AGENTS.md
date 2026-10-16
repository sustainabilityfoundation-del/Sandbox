# AGENTS.md: @ews/workspace (platform shell)

Owned by platform work. The shell hosts tools; it never contains tool-specific code.

## Responsibilities

- Navigation and docking (Focused Canvas, docs/modules/design-system/shell.md): header, navigation rail,
  explorer, location bar (no tab strip; tools switch from the rail), split view, toolbar rendering (overflow), command palette, global search, inspector,
  AI Assistant (right or bottom; presentation in src/shell/assistant, logic in src/assistant), bottom panel
  (Activity, Validation), status bar, layout presets and persistence, phone navigation.
- Tool discovery: `src/platform/registry.ts` (SDK compatibility check), `src/platform/tools.ts`
  (the catalogue).
- Subscriptions: `src/platform/entitlements.ts` (mock service, plans, `toolAccess`). Every way of
  opening a tool goes through `activateTool` / `toolAccess`; rendering checks again
  (`ToolViewHost`).
- Shared context and private view state: `src/platform/store.ts`; the SDK implementation
  (`ToolApi`, `PlatformHost`) in `src/platform/api.ts`.
- Windows: `src/session/*` (BroadcastChannel notifications, detached windows, presence).
- Assistant execution: `src/assistant/*` (platform operations, tool actions, validation against
  entitled tools' rules, previews, apply with revision and entitlement checks).

## Rules

- Render tools only through the registry and the SDK. No `if (tool.id === '…')` branches
  (`boundaries.test.ts` checks the shell).
- Import a tool only through its package entry point (`@ews/tool-x`).
- Retired tools (Analysis, Verification, Geometry, 3D Model Viewer) keep readable names in
  `RETIRED_TOOLS`; their data is shown read-only and never deleted.
- Subscription checks here are client-side UX only. Production checks belong on the server.
- Any change to what tools can call is a contract change: see the root `AGENTS.md`.

## Commands

```bash
npm run dev                       # http://localhost:5173/workspace/
npm run typecheck -w @ews/workspace
npx vitest run apps/workspace
npm run check
```

Design-system, model identity and revision rules: see the root `AGENTS.md`.

## Help system (platform-owned)

`src/help/`: Help Service (`helpService.ts`, `workspaceHelp.ts`), Help menu, Help Centre, F1
(`contextual.ts`), tours (`tours.ts`, Driver.js), Markdown renderer. Platform and AI Interface help pages
are in `help/platform/` and `help/ai/`. The toolbar sets `data-help-id` from each tool's manifest. Keep
`read_help` (assistant) on the same service. Spec: docs/modules/help.md.
