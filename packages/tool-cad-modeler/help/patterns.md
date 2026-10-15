---
help_id: cad-modeler.patterns
title: Linear patterns
kind: guide
summary: Repeat an extrude or revolve (for example a pocket cut) along a direction with a count and spacing that can come from parameters; occurrences keep stable face names.
keywords: [pattern, linear pattern, repeat, array, count, spacing, pitch, pocket, gap, wall]
related: [cad-modeler.features, cad-modeler.parameters, cad-modeler.edges]
operations: [cad-modeler.run_commands]
---

**Pattern** (toolbar) repeats a solid feature of the part along a model direction:

| Field | Meaning |
| --- | --- |
| Feature to repeat | An earlier extrude or revolve, for example the cut that makes one pocket |
| Direction | Model x, y or z, positive or negative. Commands also accept any `[x, y, z]` vector |
| Count | Occurrences including the original, an integer of at least 2. A number or an expression such as `n_pockets` |
| Spacing | Distance between neighbouring occurrences in mm. A number or an expression such as `pitch` |

How it works:

- Each occurrence is rebuilt from the original sketch on a plane shifted by the spacing, then applied
  with the same operation (cut or join) to the same body. Changing the original's sketch or a
  parameter updates every occurrence.
- Faces of occurrence *k* (k = 2 … count) are named `<pattern>/i<k>-<feature>-<role>`, for example
  `pat-12/i3-ext-9-side:ln-4`. These names are as stable as the original's, so fillets and sketches
  can refer to them.
- After regeneration, the pattern reports its count, its spacing and the **gap between neighbouring
  occurrences**: the smallest distance between their tool solids, measured by the kernel. For
  pockets this is the material left between them.

Failures: a count below 2 (or not a whole number), a spacing of 0 or less, or a failed source feature
fails the pattern, and later features are then blocked. The message names the value at fault.

Command: `pattern_linear { features, direction, count, spacing }`. Change an existing pattern with
`edit_feature { featureId, count?, spacing?, direction?, features? }`.
