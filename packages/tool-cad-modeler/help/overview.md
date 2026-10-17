---
help_id: cad-modeler.overview
title: CAD Modeler
kind: overview
summary: Parametric part modeling with constrained sketches, extrude and revolve on an exact B-rep kernel, an open native format, STEP AP242 export and the same commands for people and the assistant.
keywords: [cad, modeler, parametric, solid, b-rep, kernel, part, opencascade]
related: [cad-modeler.getting-started, cad-modeler.sketch, cad-modeler.features, cad-modeler.ai]
---

The **CAD Modeler** builds solid parts from a **feature history**: sketches with geometric and
dimensional constraints, then **Extrude** and **Revolve** features that create, join or cut bodies,
**Fillet** and **Chamfer** on edges chosen by stable names, and **datum planes**; sketches can lie
on standard planes, datum planes or planar faces.
Change a parameter or dimension and the model **regenerates**: only the features that depend on the
change are rebuilt, and failures are reported per feature.

What is real in this version (Phase 1):

- An exact boundary-representation kernel: **Open CASCADE Technology 8.0** (read from the library's
  own STEP writer; replicad 1.1.0), compiled to WebAssembly and running in a **Web Worker**, so
  modelling never blocks the interface.
- **Click-to-draw sketching** (lines, rectangles, circles, polygons) with snapping, and a **Repair
  reference** panel for faces and edges lost after an upstream change.
- A numerical **sketch constraint solver** with degrees-of-freedom analysis, redundant and
  conflicting constraint detection, and driven (reference) dimensions.
- **Parameters and expressions** (`width / 2`, `1 in`) used by dimensions and features.
- **Stable face names** derived from design intent (for example `ext-5/cap-end`), kept when
  dimensions change.
- The open native format **ews-cad** (`.ewscad`, JSON) that keeps the complete design intent,
  **revisions stored in the project** by the CAD service (workspace with backend), and **STEP AP242**
  export of exact geometry.
- Every action is a typed command; the assistant proposes the same commands and you apply them.

Not yet available (planned, see the CAD program roadmap): shells, drafts, holes, patterns,
sweeps and lofts, assemblies and mates, drawings, STEP import as a base body, other exchange
formats, section views and measurement tools. The separate **CAD** tool (mock geometry) is unchanged.

Start with [Getting started](help:cad-modeler.getting-started).
