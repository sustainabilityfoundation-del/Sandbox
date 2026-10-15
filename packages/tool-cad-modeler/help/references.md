---
help_id: cad-modeler.references
title: Materials, engineering semantics and references
kind: guide
summary: Set a material for mass properties, mark named interfaces on faces, and link the part to components, requirements, SysML elements and concepts.
keywords: [material, density, mass, interface, semantics, reference, requirement, concept, sysml, component, traceability]
related: [cad-modeler.viewport, cad-modeler.ai]
---

- **Material** (Inspect): name and density in kg/m³. Bodies then show their mass.
- **Named interface:** select a face and choose **Mark as named interface**; the annotation refers
  to the face's stable name.
- **References to other modules:** link the part to a product component (*represents*), a
  requirement (*satisfies*, *verifies*), a SysML element (*traces*) or a concept (*realizes*). The
  reference stores the target's ID (and the revision for components) and never copies its data. A
  component reference offers **Select** to show the component in other tools.

References are owned by the CAD model and saved in the `.ewscad` file. Showing CAD links in other
modules is part of the platform integration and not available yet.
