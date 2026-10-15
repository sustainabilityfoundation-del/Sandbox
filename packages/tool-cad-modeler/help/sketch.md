---
help_id: cad-modeler.sketch
title: Sketching and constraints
kind: guide
summary: Create sketches on planes, add lines, circles, arcs, points and rectangles, constrain them and read the degrees of freedom.
keywords: [sketch, constraint, dimension, dof, degrees of freedom, rectangle, circle, arc, line, fully constrained]
related: [cad-modeler.constraints, cad-modeler.parameters, cad-modeler.features]
---

**Create a sketch:** toolbar **Sketch**, choose the plane (XY, XZ or YZ) and an optional offset
along its normal (a number or an expression). Every sketch has a fixed **origin**, **x-axis** and
**y-axis** you can constrain to.

**Add geometry** (Edit tab): Rectangle, Circle, Line, Arc (counter-clockwise from start to end) and
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
