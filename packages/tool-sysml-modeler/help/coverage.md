---
help_id: sysml-modeler.coverage
title: Requirement coverage
kind: guide
summary: For each requirement usage, which features satisfy it, which verification cases verify it, its managed-requirement link and a coverage status.
keywords: [coverage, requirement, satisfy, verify, verification, gap, traceability]
related: [sysml-modeler.matrix, sysml-modeler.requirements, sysml-modeler.validation]
operations: [sysml-modeler.coverage]
---

**Coverage** in the toolbar lists every requirement usage in the scope (the namespace of the
General View) with:

| Column | Source in the model |
| --- | --- |
| Requirement | The requirement usage (with its short name, for example `<R1>`) |
| Managed requirement | The `@EWS::ManagedRequirement` link; key and revision are read from Requirements Management |
| Satisfied by | Features `x` in `satisfy R by x` |
| Verified by | Verification cases whose objective contains `verify R` |
| Status | *satisfied and verified*, *satisfied, not verified*, *verified, not satisfied* or *not covered* |

Choose **Only gaps** to hide requirements that are satisfied and verified. Select a requirement,
a satisfying feature or a verification case to open it in Properties.

## What the status means

- *Satisfied* is a **modelled claim** that a design element satisfies the requirement. It is not
  evidence that it does.
- *Verified* means a verification case is **planned** to verify it (its objective names the
  requirement). Test results and verification records are kept in Requirements Management, which
  pins requirement revisions; the SysML Modeler does not record results.

## Example

In the actuator example, `massLimit` is satisfied by `act100` and verified by `massTest`
(`verification def MassTest { objective { verify massLimit; } }`); the other requirements are
satisfied only, so they appear under **Only gaps**.

## Assistant

`sysml-modeler.coverage` returns the counts and the list (optionally `gapsOnly`). Example prompts:
“Which requirements are not satisfied?”, “Show the requirement coverage”.
