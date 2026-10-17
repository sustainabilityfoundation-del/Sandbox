---
help_id: cad-modeler.repair-reference
title: Repair a lost reference
kind: guide
summary: When a fillet, chamfer or sketch loses the face or edge it used, choose the replacement yourself in Diagnostics; nothing is re-bound automatically.
keywords: [repair, reference lost, edge, face, fillet, chamfer, naming, topological naming, diagnostics, replace]
related: [cad-modeler.edges, cad-modeler.regeneration, cad-modeler.troubleshooting, cad-modeler.planes]
operations: [cad-modeler.run_commands, cad-modeler.query]
---

Fillets and chamfers refer to **edges**, and sketches or datum planes can sit on a **face**, by stable names (see
[face names](help:cad-modeler.viewport)). If an upstream change removes that face or edge (for example fewer pockets in a
pattern, so a strip of the top face no longer exists), the feature fails with *reference lost*. The CAD Modeler never
guesses a replacement: a wrong guess would silently change the shape you designed.

**Repair it.**

1. Open **Diagnostics**. Under *Failures* the message names the lost reference. **Repair reference** lists each feature
   with a lost face or edge and, for each lost name, the candidates that exist now, best name match first (the
   percentage only compares names; it does not mean the geometry is the same).
2. Choose the replacement in the list. There is no default.
3. **Preview** regenerates a copy of the model with that replacement and shows whether the problems are gone. Nothing is
   committed.
4. **Repair reference** applies it as one undoable change (`repair_reference`). If the replacement does not exist, the
   feature reports *reference lost* again.

Other reasons a feature stops (a blocked feature) name the feature whose own failure caused it and its message; use
**Show** in the failure notice to select that feature, fix it first and the dependent features recover.

**Assistant.** The query `get_reference_repairs` returns the same lost names and candidates. A repair is a command inside
`cad-modeler.run_commands`:
`{ "command": "repair_reference", "input": { "featureId": "fil-9", "from": "edge(ext-5/cap-end~4|ext-5/side:ln-8)", "to": "edge(ext-5/cap-end~3|ext-5/side:ln-8)" } }`.
It is a proposal with a preview like any other change; the choice stays with you.

**How names survive.** Names come from the design intent of each feature. Where a later feature splits a face into
pieces (a row of slots cuts the top face into strips), the piece that still contains the feature's own sample point keeps
the name and the kernel's shape history numbers the others `~2`, `~3`, … by position (for example `ext-5/cap-end~2`); a
number stays with its piece, so adding or removing slots later keeps the existing strips and their fillets. A name never
moves to another piece: a reference is lost only when its face really disappears or the piece carrying the sample point
is cut away, and then it is listed here.
