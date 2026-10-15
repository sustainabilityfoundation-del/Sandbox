---
help_id: cad-modeler.features
title: Extrude and revolve
kind: guide
summary: Turn closed sketch profiles into solids with Extrude and Revolve; create new bodies, join or cut; edit, suppress and delete features.
keywords: [extrude, revolve, pad, pocket, cut, join, boolean, body, feature, suppress]
related: [cad-modeler.sketch, cad-modeler.regeneration]
operations: [cad-modeler.run_commands]
---

**Extrude** sweeps the sketch profile along the plane normal: distance (a number or an expression),
direction (along the normal, reverse, or symmetric) and operation.
**Revolve** rotates it about an axis: the sketch x-axis or y-axis or a line of the sketch, up to
360°. The profile must not cross the axis.

Operations: **New body**, **Join** (add material to the latest body or a chosen one) and **Cut**
(remove material). **Preview** regenerates the change on a copy and shows the predicted volume,
faces and failures without changing the model. **Create** applies it.

In **Model**, ⋮ on a feature offers **Edit**, **Suppress** (skipped by regeneration; features that
need it are blocked) and **Delete** (refused while other features depend on it).
