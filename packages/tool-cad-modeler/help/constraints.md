---
help_id: cad-modeler.constraints
title: Constraint reference
kind: reference
summary: Every geometric and dimensional sketch constraint, the entities it takes and what it enforces.
keywords: [constraint, coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, distance, length, radius, diameter, angle]
related: [cad-modeler.sketch]
---

| Constraint | Entities (in order) | Enforces |
| --- | --- | --- |
| Coincident | point, point | Same position |
| Horizontal / Vertical | line, or point + point | Parallel to the x / y axis |
| Parallel / Perpendicular | line, line | Directions parallel / at 90° |
| Equal | line + line, or circle/arc + circle/arc | Same length / radius |
| Fixed | point | Stays at its drawn position |
| Point on line | point, line | The point lies on the (infinite) line |
| Point on circle | point, circle/arc | The point lies on the circle |
| Midpoint | point, line | The point is at the middle of the segment |
| Tangent | line + circle/arc, or two circles/arcs | Touching without crossing |
| Concentric | circle/arc, circle/arc | Same centre |
| Distance | point + point, or point + line | Straight-line distance (≥ 0) |
| Horizontal / Vertical distance | point, point | Signed x / y offset from the first point to the second |
| Length | line | Segment length (> 0) |
| Radius / Diameter | circle or arc | Size (> 0) |
| Angle | line, line | Angle between the lines, 0–180° |

Dimension values are numbers (mm, degrees) or expressions over parameters. Making a dimension
**driven** turns it into a measurement that does not constrain.
