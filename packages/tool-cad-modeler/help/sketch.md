---
help_id: cad-modeler.sketch
title: Sketching and constraints
kind: guide
summary: Create sketches on planes, add lines, circles, arcs, points and rectangles, constrain them and read the degrees of freedom.
keywords: [sketch, constraint, dimension, dof, degrees of freedom, rectangle, circle, arc, line, fully constrained]
related: [cad-modeler.sketch-draw, cad-modeler.constraints, cad-modeler.parameters, cad-modeler.features]
---

**Create a sketch:** toolbar **Sketch**, choose the plane (XY, XZ or YZ) and an optional offset
along its normal (a number or an expression). Every sketch has a fixed **origin**, **x-axis** and
**y-axis** you can constrain to.

**Draw by clicking.** Choose **Line**, **Rectangle**, **Circle** or **Polygon** in the bar above the sketch and click or
tap two points (they snap to the grid and to existing points, and joined shapes get their constraints
automatically). See [drawing in the sketch](help:cad-modeler.sketch-draw).

**Add geometry** (Edit tab, for exact values; the same commands the clicks use): Rectangle, Circle, Line, Arc (counter-clockwise from start to end) and
Point, by coordinates in millimetres. A rectangle comes with horizontal and vertical constraints and,
optionally, width and height dimensions; at corner 0, 0 it is fixed to the origin.

**Constrain:** select one or two entities (click them in the sketch, press Enter on a focused
entity, or tick them in the entity list), choose a constraint that applies to that selection and,
for dimensions, a value. The order matters, for example *point, then line*. See the
[constraint reference](help:cad-modeler.constraints).

**Read the status:** the badge shows **Fully constrained** (0 DOF), **Under-constrained** (n DOF;
free points are highlighted), **Redundant constraints** (consistent but unnecessary) or
**Conflicting constraints** (they cannot all hold; the list names the candidates to remove). Driven
dimensions (in parentheses) only measure.

**Profiles:** non-construction curves that form closed loops become the profile; loops inside loops
are holes. Open or crossing loops are reported. Mark helper lines (for example a revolution axis) as
construction.

**Regular polygon.** In the sketch tools choose **Polygon** and enter the centre, the number of sides,
the size (**Across flats** or **Circumradius**) and the rotation of the first vertex in degrees. The
polygon is fully constrained and stays editable:

- N lines with equal-length and point-on-circle constraints on a construction circumcircle;
- the centre dimensioned from the origin;
- the rotation fixed;
- the size as one driving dimension. Across flats is the diameter of a tangent construction circle,
  so the dimension reads exactly the across-flats value and can be an expression such as `hex_af`.

Command: `add_regular_polygon { sketchId, center, sides, size: { acrossFlats | circumradius }, rotation }`.
