---
help_id: conceptualize.visual.handoff
title: CAD handoff package
kind: reference
summary: A revision-pinned package of the selected Concept for the CAD Modeler, with parameters, interfaces, envelopes, constraints, requirement and decision links, and the list of unresolved items. Missing information is listed, never invented.
keywords: [CAD, handoff, package, envelope, parameters, unresolved, gaps, HND]
operations: [conceptualize.create_cad_handoff]
related: [conceptualize.visual, conceptualize.integration, conceptualize.decision]
---
Choose **CAD handoff** on a card and **Build handoff**. The package (`HND-001`, schema
`conceptualize.cad-handoff/1`) is immutable and pinned to the Concept revision it was built from.

| Section | Content |
| --- | --- |
| concept | Key, name, revision, stage, maturity |
| intent, components, relationships, interfaces, parameters | The engineering definition, with each value's basis |
| envelopes | Per placed component: width, height and position, from a parameter (with its symbol and basis) or a schematic layout number (marked as such) |
| constraints | With coverage: intended, checked (preliminary) or verified |
| requirements | Concept links to Requirements and requirements formalized by constraints (intended unless verified) |
| decisions, assumptions | Recorded or proposed decisions on the Concept; assumptions with their validation status |
| visuals | References only; images are illustrative |
| unresolved | Open questions, uncertainties, missing definition (no components, parameters or layout), ranges without a nominal value, unplaced components, interfaces without parameters, unchecked constraints, unvalidated assumptions, not the recorded selection |

The CAD Modeler reads the package (`GET …/handoffs/{id}`) and records the Concept and revision it used.
When the definition changes, the package and the CAD documents made from it are marked **possibly
outdated** (`GET …/concepts/{id}/staleness?revision=N`); nothing is regenerated automatically. Ask the
assistant to propose the missing definition instead of guessing it.
