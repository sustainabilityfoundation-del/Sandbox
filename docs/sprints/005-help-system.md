# Sprint 005: Unified help system

## Plan

- Status: merged into `main` on owner instruction (14 October 2026); owner acceptance pending
- Goal: people and the assistant get help from one documentation source: a Help menu with dynamic
  module submenus, a searchable Help Centre, contextual help (F1), guided tutorials and an
  interactive API reference; every module agent is instructed to document its module.
- Baseline commit: `c7e9a90` (`main`).
- Owner/coordinator: coordinator session (owns the help architecture and contracts). Module
  documentation beyond the Requirements example belongs to module agents.
- Scope: SDK 1.4 help contract; Help Service; Help menu, Help Centre, F1, tours (Driver.js), Markdown
  renderer; Scalar API reference; `read_help` for the assistant; Requirements as the example
  integration; platform and AI Interface help; architecture, ADR, agent instructions; tests.
- Exclusions: Docusaurus portal, Storybook and TypeDoc set-up (adopted in ADR-0014, planned); SysML and
  CAD documentation (module agents; tracked as known gaps); semantic search.
- Affected modules: `packages/platform-sdk` (contract), `packages/design-system` (icons),
  `apps/workspace` (service and UI), `packages/tool-requirements` (help content, two `data-help-id`
  attributes), `services/api` (API reference route). Additive only; no data migration.

## Acceptance criteria

- [x] The Help button is visible in the upper-right corner, has an accessible name, and opens the menu
      with Help Centre, Contextual help (F1), Getting started, Keyboard shortcuts, module submenus, API
      documentation and About.
- [x] Module submenus come from the registry and the subscription; a module without documentation says
      so; tools outside the subscription are not listed.
- [x] F1 opens the topic for the focused control (toolbar Add → "Create a requirement"), else the
      active tool, else the workspace guide.
- [x] Help links resolve; manifests conform to the schema; every toolbar item and assistant operation of
      a documented module has a help mapping.
- [x] Search works across installed modules; the assistant retrieves documentation through `read_help`
      with module, version and source, filtered by subscription.
- [x] Missing documentation produces a graceful fallback; version mismatches are flagged; registration
      and removal take effect immediately.
- [x] A guided tutorial highlights the documented control; the API reference renders offline with no
      external requests.
- [x] Keyboard navigation and screen-reader labels (menu, submenus, Help Centre links, search).
- [x] Agent instructions and architecture documents updated; existing workflows unaffected.

## Verification evidence

| Check | Result | Evidence or reason |
| --- | --- | --- |
| `npm run check` | passed | 21 files, 351 tests (14 help tests, 2 `read_help` tests, inventory) |
| `npm run build`, `npm run build:harnesses` | passed | help text bundled in the app; Driver.js in its own chunk, loaded on demand |
| `npm run req:test:db` | passed | 106 tests (API host with the docs route) |
| Browser: help flow | passed | 32 checks: button position and label, all menu entries, Requirements submenu, SysML "No documentation yet", Help Centre navigation and help: links, cross-module search, F1 on Add and elsewhere, tour highlights the Add button, About with versions, subscription hides SysML/CAD, phone without horizontal scrolling, no console errors |
| Browser: API reference | passed | renders the Requirements API from the local bundle, 0 external requests, hosted AI/MCP/share/deploy/telemetry off |
| Regression flows | passed | platform, full Phase 1 workflow, integration, AI coverage, SysML workspace flow |
| Web and desktop | partly | Web verified (dev server and production bundle). No desktop build exists yet; the offline strategy (bundled help, locally served API reference) is designed for it and recorded in docs/modules/help.md |

## Runnable checkpoint and walkthrough

- Candidate commit: the commit on `feature/help-system` that adds this file (see `git log`).
- Startup: `git checkout feature/help-system`, `npm install`, `npm run dev`, open
  http://localhost:5173/workspace/.
- Owner walkthrough:
  1. Choose **?** (top right): see the menu; hover **Requirements** for its submenu, **SysML** shows
     "No documentation yet".
  2. Requirements → **User guide**: read the overview, follow a link, search "baseline".
  3. Close; focus **Add** in the Requirements toolbar (Tab) and press **F1**: "Create a requirement".
  4. **?** → Requirements → **Tutorial: Create your first requirement**: the Add button is highlighted.
  5. **?** → **API documentation** → open the interactive reference link.
  6. Switch the subscription to "Requirements only": SysML and CAD leave the Help menu.
  7. In the assistant panel the assistant can read the same pages (operation `read_help`).
- Known limitations: SysML and CAD have no documentation yet; Docusaurus, Storybook and TypeDoc are
  not set up; search is keyword-based; filtering is client-side like subscriptions.

## Owner feedback and next increment

- Owner acceptance: pending. Merged into `main` on the owner's instruction.
- Next increments: SysML and CAD help (module agents); Docusaurus portal from the same sources;
  TypeDoc for the SDK; Storybook for the design system.
