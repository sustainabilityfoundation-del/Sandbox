---
help_id: cad-modeler.export-step
title: Export STEP AP242
kind: guide
summary: Export exact solid geometry as STEP AP242 with part names, millimetre units and colours; what STEP does and does not carry.
keywords: [export, step, ap242, iso 10303, exchange, interoperability]
related: [cad-modeler.interoperability, cad-modeler.native-format]
operations: [cad-modeler.export]
---

**Export STEP** writes the current bodies of the part as STEP AP242 (ISO 10303-242): exact B-rep
solids, the part name, millimetre units and colour. After the export, **Diagnostics → Last STEP
export** shows a structural check of the file: schema, solids, faces, entities and unit.

STEP carries exact geometry and product structure but **not the feature history**: parameters,
sketches and features stay in the `.ewscad` file, which remains the authoritative model. PMI and
GD&T are not exported yet.
