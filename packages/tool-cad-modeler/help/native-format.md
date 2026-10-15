---
help_id: cad-modeler.native-format
title: The ews-cad native format
kind: reference
summary: The openly specified JSON format (.ewscad) that stores parts, parameters, sketches, constraints, features, semantics and references; geometry is regenerated from it.
keywords: [format, ewscad, json, schema, open, native, version]
related: [cad-modeler.document, cad-modeler.export-step]
---

A `.ewscad` file is JSON with `"format": "ews-cad"` and a `formatVersion` (1.0.0). It stores design
intent only: parts, parameters and expressions, sketches (entities, constraints, drawn positions),
features in history order, suppression, materials, engineering annotations and references to other
modules. The exact geometry, meshes and mass properties are **regenerated** from it, so the file is
small, readable and easy to compare.

- Units are millimetres and degrees.
- IDs (`sk-3`, `ext-7`) are deterministic and never reused; the document has a UUID.
- Files of another major version are refused with a clear message; unknown `extensions` are kept.
- The machine-readable JSON Schema is published with the module (`ews-cad.schema.json`); the
  developer specification is `docs/modules/cad/native-format.md`.

STEP files are exchange snapshots and do not contain the feature history.
