---
help_id: cad-modeler.references
title: Materials, engineering semantics and references
kind: guide
summary: Set a material for mass properties, mark named interfaces on faces, and link the part to components, requirements, SysML elements and concepts.
keywords: [product element, project management, material, density, mass, interface, semantics, reference, requirement, concept, sysml, component, traceability]
related: [cad-modeler.viewport, cad-modeler.ai]
---

- **Material** (Inspect): name and density in kg/m³. Bodies then show their mass.
- **Named interface:** select a face and choose **Mark as named interface**; the annotation refers
  to the face's stable name.
- **References to other modules:** link the part to what it represents, a requirement
  (*satisfies*, *verifies*), a SysML element (*traces*) or a concept (*realizes*). The reference
  stores the target's ID (and the revision for twin components) and never copies its data.
- **What a part represents:**
  - In new projects, choose **Product element (Project Management)** and enter the product
    element's ID as shown in Project Management. The ID is not checked here yet.
  - In projects whose twin has components, such as the PRJ-ACT100 example, **Twin component** is
    the default. Pick the component from the list; **Select** then shows it in other tools.

References are owned by the CAD model and saved with the document, in the project or in the
`.ewscad` file. The CAD service reports saved references as relations of the part to
Project Management, once the platform connects the two; that connection is not available yet. Showing CAD links inside other tools is not available yet.
