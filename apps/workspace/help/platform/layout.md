---
help_id: platform.layout
title: Workspace layout, panels and presets
kind: guide
summary: Arrange the explorer, canvas, inspector, assistant and bottom panel; use presets, maximize the canvas and restore the default layout.
keywords: [layout, panels, dock, docking, preset, engineering, ai-assisted, review, maximize, resize, rail, status bar, explorer, inspector, assistant]
related: [platform.getting-started, platform.shortcuts, ai.overview]
---

The workspace is arranged around the **engineering canvas**, the active tool's view in the centre.

| Area | Where | What it is for |
| --- | --- | --- |
| **Header** | Top (dark) | Project, configuration and scenario, baselines, module navigation (wide screens), search, commands (Ctrl+K), notifications, subscription, Requirements service, windows, display, settings, help and your account |
| **Navigation rail** | Left edge (dark) | **Project** shows or hides the explorer; one entry per module you can use (the active one is highlighted; this is the only place tools are switched, there is no second tab strip, and a tool is closed with Ctrl+K, **Close** and the tool's name; on phones use **Tools** in the bottom bar); **Assistant**; the **layout menu** at the bottom |
| **Explorer** | Left | The product tree (example project) or the project's artifacts by module. Type in **Search project…** to filter; matches are shown with their parents |
| **Canvas** | Centre | The location bar above the canvas (project › configuration › module › selection), the tool's compact toolbar and its view |
| **Inspector** | Right | Identity, type and status of the selection, properties, relationships and history |
| **AI Assistant** | Right or bottom | The conversation with the assistant (see [the assistant](help:ai.overview)) |
| **Bottom panel** | Below the canvas | **Activity**, **Validation** (potentially stale saved artifacts and save failures) and, when docked there, the assistant |
| **Status bar** | Bottom edge | Save state (with the repository controls), configuration, model revision, validation issues, background work, the active module and the selection |

## Resize, collapse and dock

- Drag the thin gutters between panels to resize them, or focus a gutter and use the arrow keys (Home and End for
  the minimum and maximum, Enter or a double-click to reset).
- Hide or show the explorer, inspector and assistant with the toggles at the right end of the location bar, the rail
  (**Project**, **Assistant**) or the panels' own hide buttons.
- **Maximize the canvas** (location bar, layout menu or Ctrl+K) hides every panel; choose it again to restore them.
- Move the assistant between the right side and the bottom panel with the dock button in its header, the layout
  menu or Display and layout.

## Presets

| Preset | Shows |
| --- | --- |
| **Engineering** (default) | Explorer, a large canvas and the inspector; assistant and bottom panel collapsed |
| **AI-assisted** | Explorer, canvas and the assistant expanded on the right |
| **Review** | A large canvas with the inspector (relationships, traceability) and the Validation panel |

Choose a preset in the rail's layout menu, in Display and layout, or with Ctrl+K ("Layout preset"). Presets keep
your panel sizes. After you change a panel the layout reads **Custom**. **Restore the default layout** resets
sizes too.

## What is saved

Layout preferences (open panels, sizes, presets, assistant position, rail labels) are saved per browser window with
your session, separately for wide and narrow screens. They never change project or engineering data. On laptop
screens below 1440 px the rail shows icons only (hover or focus them for names); on tablets the explorer and
inspector open as drawers; on phones the areas become the tabs at the bottom.
