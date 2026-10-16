---
help_id: projects.product-structure
title: Product structure
kind: reference
summary: Product elements (product, system, subsystem, assembly, part, other) and named breakdowns are stored by Project Management; other modules link to them.
keywords: [product structure, product breakdown, product element, assembly, part, system, bill of materials]
related: [projects.assistant, projects.overview]
---

A **product element** is a product, system, subsystem, assembly, part or other item. It has a name, a key
(PE-001 …), typed properties (text, numbers, true or false, lists, or quantities with units such as `0.35 kg`)
and an immutable revision history.

A **breakdown** arranges elements in a tree, for example the *Product breakdown* or a *Physical assembly*.
An element can appear in several breakdowns and under several parents (a part used twice). A position that would
make an element contain itself is refused. Kinds are labels only: a system may sit below a part if that is how
your product is organised.

Other modules refer to elements by their global identity: Requirements allocates requirements to them, and SysML
elements and CAD parts can represent them. The product tree shows the product breakdown of new projects. In the
example project the components ACT-100, HSG-110, ROD-120 and MTR-130 keep their IDs as aliases.

Create elements with the assistant (`projects.create_product_element`, `projects.add_breakdown_edge`) or through
the API (`/api/projects/v1/projects/{projectId}/product-elements` and `/breakdowns`).
