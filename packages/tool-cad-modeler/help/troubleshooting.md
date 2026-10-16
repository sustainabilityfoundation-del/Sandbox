---
help_id: cad-modeler.troubleshooting
title: Troubleshooting
kind: troubleshooting
summary: What common messages mean and how to fix them, from conflicting constraints and open profiles to failed features, kernel and file errors.
keywords: [error, problem, failed, conflict, open profile, kernel, webgl, version conflict]
related: [cad-modeler.regeneration, cad-modeler.sketch, cad-modeler.repair-reference]
---

- **Conflicting constraints:** the listed constraints cannot all hold. Remove or change one of them
  (often a duplicate dimension) or make a dimension driven.
- **Redundant constraints:** consistent, but one is unnecessary; delete it to keep the sketch clear.
- **The profile is open / edges do not form a closed loop:** connect the endpoints (use shared
  points or Coincident) or mark helper lines as construction.
- **The profile crosses the revolution axis:** move the profile to one side of the axis.
- **Blocked:** an earlier feature failed or is suppressed; the message names it and the root cause (Diagnostics has a **Show** button). Fix that one first.
- **Reference lost:** a face or edge a fillet, chamfer or sketch used no longer exists. Open **Diagnostics → Repair reference**, choose the replacement, preview and repair; nothing is re-bound for you ([details](help:cad-modeler.repair-reference)).
- **Must be greater than zero:** a length, radius or distance evaluated to zero or less; check the
  parameter values.
- **Version conflict:** the model changed after a proposal or command was prepared; read it again.
- **Loading the geometry kernel:** the first use downloads the kernel (about 23 MB) once.
- **3D view unavailable:** the browser has no WebGL; modelling, queries and exports still work.
- **Cannot open … proprietary:** export STEP AP242 from the original CAD system.
