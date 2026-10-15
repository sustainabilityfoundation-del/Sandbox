---
help_id: sysml-modeler.getting-started
title: Getting started
kind: guide
summary: Open the example model, find a part, look at it in a view, change a value, and undo the change.
keywords: [start, first steps, tutorial, example, begin]
related: [sysml-modeler.example, sysml-modeler.tutorial.first-model, sysml-modeler.history]
---

1. Open **SysML Modeler** from the tools menu. In development the API seeds the example
   *Electromechanical linear actuator* for project PRJ-ACT100 ([the example](help:sysml-modeler.example)).
2. The status bar shows the project, the **branch** (`main`), the **commit number**, and whether
   you work against the **API (PostgreSQL)** or **Local (this browser)**.
3. In the **browser** (left), expand `ActuatorSystem › Architecture` and select `LinearActuator`.
4. Choose **Interconnection** in the toolbar to see its parts, ports and connections.
5. In the browser, open `ActuatorSystem › Mechanical › Rod` and select `stroke`. In **Properties**,
   change the **Value** to `160 [mm]` and choose **Save value**.
6. The change becomes a new commit. Choose **History** to see it, with you as the author, then
   choose **Undo** to revert it with a compensating commit.

On a phone the three panes (Browser, View, Properties) are shown one at a time. Switch between
them with the control under the status bar.

If no project exists for the current platform project, the view offers **New SysML project**.
