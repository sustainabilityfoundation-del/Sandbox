---
help_id: cad-modeler.checks
title: Checking the model against design constraints
kind: guide
summary: The assistant measures the regenerated model and compares the results with design-constraint bounds read from Conceptualize; every result records the document revision and kernel version.
keywords: [check, verify, constraint, bound, requirement, measurement, evidence, binding, wall thickness, mass, bounding box, outdated]
related: [cad-modeler.parameters, cad-modeler.patterns, cad-modeler.ai]
operations: [cad-modeler.check, cad-modeler.check_bindings]
---

**cad-modeler.check** (assistant operation, read-only) regenerates the model and measures it. Each
measurement is compared with the **bound of a design constraint as stored in Conceptualize**: the
operator (≤, <, =, ≥, >, range), the limits and the unit. Numbers typed into the request are never
used as bounds.

What is checked:

- **Every bound parameter.** For each parameter bound to a Conceptualize constraint (see
  *Bindings* under Parameters), its value is checked against the constraint's latest revision.
- **The solid validity of every body.**
- **Requested measurements**, each against a constraint:
  - a parameter;
  - a named sketch dimension;
  - the bounding size (x, y, z, the largest or the smallest);
  - volume and surface area;
  - mass (needs a material);
  - a pattern's spacing and count;
  - a pattern's gap: the material left between neighbouring occurrences, measured by the kernel;
  - a pattern's occurrence width: the width of one occurrence along the pattern direction (for a hexagonal pocket with flats facing the direction, its across-flats size), measured by the kernel. It is valid only where two flat faces bound the occurrence along the direction. With corners or curved faces facing the direction the result says so (*not-checkable*, with the reason) instead of reporting a corner-to-corner extent as a pocket width; the bound parameter value is still checked. A pocket-width check normally lists both: the bound parameter (model value) and the kernel-measured width, so a parameter that disagrees with the geometry shows.

Units are converted where they are compatible: mm, cm, m, in; g, kg, lb; mm³, cm³; deg and rad.

Each result states:

- the quantity, the measured value and its unit, and the method used;
- provenance: whether the value was measured on the solid by the kernel or read from the model (a parameter or sketch dimension), the kernel name and version, and what was measured;
- the bound: constraint key, revision, operator and limits;
- the status: **satisfied**, **violated**, or **not checkable** with the reason;
- the CAD document, its stored revision and model version, and the kernel name and version.

**Assumptions** list what limits the results:

- the model has unsaved changes, or is not stored in the project;
- a material is missing, so mass cannot be computed;
- a constraint rests on an assumption, or is not active;
- a binding pins an older revision of its constraint.

Checks report geometry and values only. They do not establish structural adequacy, safety or
compliance.

**cad-modeler.check_bindings** lists parameters whose binding pins a constraint revision older than its
latest one. It shows the bound of the pinned revision and of the latest revision, so the parameter can
be reviewed, changed and re-bound with `bind_parameter`.

**Changing a bound parameter after its constraint was revised.** When `cad-modeler.run_commands` changes
the value of a parameter whose binding pins an older revision of its constraint, the preview shows an
**Outdated binding** item. It gives the pinned and the latest revision with their bounds. The same
proposal also re-binds the parameter to the latest revision, unless the request says `rebind: false`.
Run `cad-modeler.check` afterwards to confirm the new value against that revision.
