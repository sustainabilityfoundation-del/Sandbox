---
help_id: cad-modeler.settings
title: CAD settings
kind: reference
summary: Personal display settings in the Settings centre (measurement units, display tessellation tolerance, initial view, edges). The model is always stored in millimetres.
keywords: [settings, units, inches, centimetres, tolerance, tessellation, view, edges, preferences]
related: [cad-modeler.viewport, cad-modeler.document]
---

Open **Settings → CAD**. The settings are personal (user scope) and change only how the
model is shown.

| Setting | Values | Default | Effect |
| --- | --- | --- | --- |
| Measurement units | mm, cm, m, in | mm | Units for measured results: body volume, surface area, bounding box and mass in the Model and Inspect panels and in previews. Mass is shown in kg, g (cm) or lb (in) |
| Display tessellation tolerance | 0.01–1 mm | 0.05 mm | How closely the displayed triangles follow curved faces. Changing it re-tessellates the visible bodies |
| Initial view | Isometric, Front, Top, Right | Isometric | Direction of the 3D view when a document is first shown |
| Show edges | on, off | on | Whether new views draw body edges. The view's Edges button still toggles them |

What the settings do not change:

- **Dimensions and parameters** are entered and stored in millimetres, whatever the display units.
- **Modelling tolerances** (sketch solver convergence and the tolerance for stable face names) are
  fixed. A stored revision therefore regenerates identically for everyone, and measurements and
  exports always use the exact geometry, not the displayed triangles.
- Settings are stored by the platform's settings service. In demo mode (no backend) the defaults
  apply.
