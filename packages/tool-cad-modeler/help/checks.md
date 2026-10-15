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
  - a pattern's gap: the material left between neighbouring occurrences, measured by the kernel.

Units are converted where they are compatible: mm, cm, m, in; g, kg, lb; mm³, cm³; deg and rad.

Each result states:

- the quantity, the measured value and its unit, and the method used;
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
