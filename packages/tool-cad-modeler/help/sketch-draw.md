---
help_id: cad-modeler.sketch-draw
title: Draw in the sketch by clicking
kind: guide
summary: Draw lines, rectangles, circles and polygons with clicks, taps or the keyboard; points snap to the grid and to existing points and join automatically.
keywords: [draw, click, tap, touch, snap, grid, line, rectangle, circle, polygon, coincident, dimension, keyboard, sketch]
related: [cad-modeler.sketch, cad-modeler.constraints, cad-modeler.shortcuts]
---

While you edit a sketch, the bar above the sketch offers **Select**, **Line**, **Rectangle**, **Circle** and
**Polygon**. Choose a drawing tool, then place two points. The line below the bar says what the next point does.

| Tool | First point | Second point | Result |
| --- | --- | --- | --- |
| Line | start | end | a line; the next click continues the chain from the end |
| Rectangle | one corner | the opposite corner | four lines with horizontal and vertical constraints |
| Circle | centre | a point on the circle | a circle |
| Polygon | centre | a corner (sets the size and the rotation) | a regular polygon with the number of **Sides** you set |

**Snapping.** A grid is shown (its step is chosen from the size of the working area; the sketch area covers at
least 60 by 40 mm). Points snap to an existing sketch point or the origin within a few pixels (the marker turns
to the accent colour), otherwise to the nearest grid node. A circle or polygon size from the grid is a whole number
of grid steps; the polygon rotation is in steps of 15 degrees.

**Automatic constraints.**

- A line that ends on an existing point shares that point, so the shapes are connected: clicking the first point
  again closes the chain, and the profile can be extruded.
- A rectangle whose first corner is clicked on an existing point, or on the origin, gets a **Coincident** constraint
  to it.
- **Dimension new shapes** (on by default) gives a rectangle its width and height and a circle its diameter as driving
  dimensions. A polygon is always fully constrained.
- **Make near-horizontal and vertical lines exact** adds **Horizontal** or **Vertical** to a line whose grid end points
  line up. A line between two existing points keeps its shape.

The badge in the bar shows the sketch status and the remaining **degrees of freedom**, so you see how much is still
open after each shape. Add constraints or edit the dimensions in the **Edit** tab until it reads *Fully constrained*.

**Touch.** Tap to place a point; nothing needs dragging or hovering, so the tools work the same on a phone.
**Mouse.** Click; the preview of the shape follows the pointer. **Keyboard.** Focus the sketch (Tab), move the cursor
with the arrow keys (Shift for five grid steps, Home for the origin), press Enter or Space to place a point and
Escape to cancel the shape (or leave the tool). The cursor position is read out in the line below the bar.

Every shape is made by the same typed commands as the forms in the **Edit** tab (`add_line`, `add_rectangle`,
`add_circle`, `add_regular_polygon`, `apply_constraint`), so each shape is one entry in the undo history and the
assistant can do the same. Use the forms to enter exact coordinates and values.
