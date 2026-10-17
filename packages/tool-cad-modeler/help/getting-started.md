---
help_id: cad-modeler.getting-started
title: Getting started with CAD
kind: tutorial
summary: Create a part, sketch a constrained rectangle, extrude it, change a dimension and save the model.
keywords: [getting started, first part, tutorial, sketch, extrude]
related: [cad-modeler.sketch, cad-modeler.features, cad-modeler.parameters, cad-modeler.document]
---

1. Open **CAD** (Ctrl+K, then type "CAD"). Choose **New part**. A document with
   one empty part opens and the **Edit** tab shows **New sketch**.
2. Keep plane **XY** and choose **Create sketch**. The sketch view replaces the 3D view.
3. Under **Add geometry** choose **Rectangle**, keep corner 0, 0, enter width 80 and height 40, and
   choose **Add rectangle**. The rectangle is fixed to the origin with width and height dimensions,
   so the badge shows **Fully constrained, 0 DOF**.
4. Choose **Extrude this sketch**, enter distance 10 and choose **Create**. The 3D view shows the
   plate; **Model** lists *Sketch 1* and *Extrude 1* with status **OK**.
5. Optional: in **Model → Parameters** add `thickness` = `10`, then edit *Extrude 1* (⋮ → Edit) and
   set the distance to `thickness`. Change `thickness` to 15 and press Enter: the extrusion
   regenerates and the sketch is reused from the cache (see **Diagnostics**).
6. Choose **Save** to download the `.ewscad` file, and **Export STEP** for an exchange file.

The guided tour *Your first part* walks through steps 1–4.
