---
help_id: cad-modeler.handoff
title: Starting a part from a concept handoff
kind: guide
summary: Start a CAD document from Conceptualize's revision-pinned CAD handoff package; parameters arrive bound to their constraints, missing definitions are listed as gaps, and the document shows when its concept has changed since.
keywords: [handoff, concept, conceptualize, parameters, constraints, gaps, provenance, outdated, stale, source]
related: [cad-modeler.parameters, cad-modeler.checks, cad-modeler.document]
operations: [cad-modeler.start_from_handoff]
---

When a concept is ready for CAD, Conceptualize builds a **CAD handoff package** (HND-…). It is a fixed
record of one concept revision: components, interfaces, parameters with their basis, envelopes,
constraints, requirement and decision links, and a list of unresolved items.

The assistant operation **cad-modeler.start_from_handoff** proposes a new CAD document from it.

What the document gets:

- One part, named after the concept's part component.
- A CAD parameter for every handoff parameter that has a nominal value in a length (mm, cm, m, in, ft),
  angle or count unit. Each one is **bound** to its design constraint at the revision recorded in the
  package.
- The **source concept** and handoff on the document, shown in the header as "From …", and a
  *realizes* reference to the concept.

What it does not get:

- **No geometry is invented.** Model the features afterwards with the usual commands; sketches and
  dimensions can use the parameters by name.
- **Nothing incomplete is filled in.** These are listed as **gaps** in the preview:
  - parameters given only as a range;
  - parameters in other units;
  - constraints that are not in the package;
  - interfaces that have no geometry yet;
  - open questions and unvalidated assumptions;
  - everything Conceptualize listed as unresolved.

**Possibly outdated.** When the source concept is revised after the document was started, the header
shows **Possibly outdated (concept r…)**. The tooltip lists what changed. `describe_model` and
`check_bindings` report it as `source.staleness`.

Nothing is regenerated or updated automatically. Review the changes, then either change the model
(bound parameters are re-bound in the same proposal) or start from a new handoff.
