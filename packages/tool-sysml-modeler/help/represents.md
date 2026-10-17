---
help_id: sysml-modeler.represents
title: Product elements and CAD entities a part represents
kind: guide
summary: Link a part or item to the product element it represents (Project Management) and see its CAD references. SysML stores references only, never copies.
keywords: [represents, product element, product structure, breakdown, cad, traceability, project management]
related: [sysml-modeler.properties, sysml-modeler.requirements, sysml-modeler.api]
operations: [sysml-modeler.propose_commands]
---

Select a `part def`, `part`, `item def` or `item`. Under **Represents** in Properties:

- **Link a product element** lists the product elements Project Management has registered for the
  project. Choosing one stores `@EWS::ProductElement { productElementId = "<uuid>"; revision = n; }` on the
  element in a new commit. The key and title shown are read from Project Management each time; the
  model keeps only the identifier and the pinned revision.
- When the product element has a newer revision, a warning offers **Update pin**. **Unlink product
  element** removes the link.
- **CAD entity** rows show the CAD references of the element
  (`@EWS::CadRepresentation { cadRef = "<document UUID>/<entity ID>"; revision = n; }`). Picking a CAD
  entity and reading its mass are not available yet; references can be written in text.

Rules:

- One product element per SysML element. Several SysML elements may represent the same product
  element (for example a definition and its usage in a configuration).
- Names and keys are never identity: validation rule `SYSML-PRODUCT-REFERENCE` refuses a link that is
  not a product element UUID, and `SYSML-CAD-REFERENCE` one that is not `<document UUID>/<entity ID>`.
- Project Management receives these links through the SysML artifact source as `represents`
  relations, so its traceability views and impact analysis include them.

If Project Management is not available (not provided by the host, or not in your subscription), the
links stay in the model and can be edited in text, but cannot be listed or shown with their titles.
