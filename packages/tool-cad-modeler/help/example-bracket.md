---
help_id: cad-modeler.example-bracket
title: "Example: parametric plate with a hole"
kind: tutorial
summary: A worked engineering example with parameters driving a plate and a centred through hole, numeric checks and a design change.
keywords: [example, plate, bracket, hole, parametric, tutorial]
related: [cad-modeler.getting-started, cad-modeler.parameters]
---

Choose **Example: plate with hole** on the start page, or ask the demo assistant to "create a plate
80 x 40 x 10 with a 12 mm hole in the CAD modeler". The example creates:

- parameters `width` = 80, `depth` = 40, `thickness` = 10 and `hole_d` = 12;
- a sketch with a rectangle `width × depth` fixed to the origin, extruded by `thickness`;
- a second sketch with a circle of diameter `hole_d`, located by horizontal distance `width / 2` and
  vertical distance `depth / 2`, cut through the plate.

Check: the body volume is 80 · 40 · 10 − π · 6² · 10 ≈ 30 869.03 mm³, with 7 faces. Set `width` to
120: the plate grows, the hole stays centred (horizontal distance 60), the face names stay the same,
and **Diagnostics** shows which features were rebuilt.
