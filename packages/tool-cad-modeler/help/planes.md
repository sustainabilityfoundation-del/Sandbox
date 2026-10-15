---
help_id: cad-modeler.planes
title: Datum planes and sketching on faces
kind: guide
summary: Create datum (reference) planes offset from standard planes, other datum planes or planar faces, and place sketches on datum planes or directly on planar faces.
keywords: [datum, plane, reference plane, sketch on face, offset, work plane]
related: [cad-modeler.sketch, cad-modeler.viewport, cad-modeler.troubleshooting]
operations: [cad-modeler.run_commands]
---

**Datum plane** (toolbar) creates a reference plane based on a standard plane (XY, XZ, YZ),
another datum plane or a planar face, with an offset along its normal (a number or an expression).
Datum planes appear in the feature history; editing the offset moves everything placed on it.

**Sketch on a face or datum plane:** in **New sketch**, choose the plane from the list: standard
planes, datum planes and the planar faces of the model by their stable names. Selecting a face in
the 3D view first preselects it.

How the sketch is oriented on a face: the sketch normal is the face's outward normal; the origin
is the point of the face plane nearest to the model origin; the sketch x axis is horizontal (along
Z × normal), or the model x axis for faces facing up or down. The same rule applies on every
regeneration, so a sketch on a face **follows the face** when upstream dimensions change (for
example a boss on the top face moves up when the plate gets thicker).

**Errors:** a face that is not planar (a cylinder, a fillet) fails with *face not planar*; a face
that no longer exists fails with *reference lost* and lists the planar faces available. A feature
that owns a face used by a sketch cannot be deleted; suppressing it blocks the sketch.

To cut into the body from a sketch on one of its faces, extrude with direction **Reverse** (the
normal points out of the body).
