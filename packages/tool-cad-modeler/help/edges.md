---
help_id: cad-modeler.edges
title: Fillet and chamfer
kind: guide
summary: Round or bevel edges of a body. Edges are chosen by stable names, so the feature keeps working when dimensions change; lost edges are reported, never guessed.
keywords: [fillet, round, chamfer, bevel, edge, radius, blend, reference lost]
related: [cad-modeler.viewport, cad-modeler.features, cad-modeler.repair-reference, cad-modeler.troubleshooting]
operations: [cad-modeler.run_commands]
---

**Fillet** rounds edges with a radius; **Chamfer** bevels them with an equal distance. Both work on
an existing body (the latest one, or the one you choose when there are several).

**Choosing edges.** Edges are named by the two faces they join, for example
`edge(ext-5/cap-end|ext-5/side:ln-8)`; see [face names](help:cad-modeler.viewport). You can:

- click an edge in the 3D view (it is highlighted), then **Add picked edges**;
- select a face in the 3D view and use **Add edges of the selected face**;
- tick edges in the list (filter by a face name such as `cap-end`);
- in **Inspect**, choose **Fillet this edge** or **Chamfer this edge** for a selected edge.

**Preview** shows the predicted volume and faces before anything changes. The rounded or bevelled
faces get stable names too: `fil-9/blend:<edge name>`.

**When dimensions change**, the feature looks the edges up again by name. If an edge no longer
exists (for example the faces it joined were removed), the feature fails with *reference lost* and
lists the edges that exist now; nothing is applied to other edges. Choose the edges again with
**Edit**, or use **Diagnostics → Repair reference** to pick the replacement for the lost edge from the
candidates ([repair a lost reference](help:cad-modeler.repair-reference)). The replacement is always your
choice; it is never re-bound automatically.

**Limits:** constant radius or distance only; a size larger than an adjacent face allows fails with
a kernel message. Variable fillets, setbacks and face fillets are planned.
