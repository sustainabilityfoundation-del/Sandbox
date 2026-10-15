---
help_id: sysml-modeler.matrix
title: Relationship matrices
kind: guide
summary: Grid views of satisfy, allocate and connect relationships, computed from the model. Select a header or a cell to open the element or relationship in Properties.
keywords: [matrix, grid view, satisfy, allocation, connection, traceability, dsm, n2]
related: [sysml-modeler.coverage, sysml-modeler.views, sysml-modeler.requirements]
operations: [sysml-modeler.matrix]
---

**Matrix** in the toolbar shows a grid view of one kind of relationship. Like diagrams, a matrix is
**computed from the model** at every change: it holds no data of its own, and editing happens in
the model (text, Properties or assistant proposals).

| Matrix | Rows | Columns | Cell |
| --- | --- | --- | --- |
| **Satisfy** | Every requirement usage in the scope, including unsatisfied ones | The features named in `satisfy R by x` | One button per `satisfy` relationship |
| **Allocate** | Allocation sources (for example functions) | Allocation targets (for example parts) | One button per `allocate a to b` |
| **Connect** | Parts of the definition shown in the Interconnection View | The same parts | Connections, interfaces, flows and bindings between the two parts (or their ports) |

- **Scope**: satisfy and allocate use the namespace shown in the General View (the first package
  by default; open a package or definition to narrow it). Connect uses the part definition of the
  Interconnection View; select a part definition or one of its usages first.
- Feature chains (for example `act100.controller`) are shown as their dotted path.
- An empty satisfy row is a requirement nothing satisfies in the model. Use **Coverage** for the
  full gap analysis including verification.

## Assistant

`sysml-modeler.matrix` returns the same grid (rows, columns, filled cells and rows without any
relationship). Example prompts: “Show the satisfy matrix”, “Show the connection matrix”.

## Limits

- Satisfy, allocate and connect only. Other relationship kinds (dependency, typing, derivation)
  are planned.
- Matrices are read-only; adding a relationship from a cell is planned.
- No CSV export yet; the assistant operation returns the data in structured form.
