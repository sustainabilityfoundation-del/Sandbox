---
help_id: cad-modeler.ai
title: Working with the assistant
kind: api
summary: The assistant reads the CAD model through structured queries and proposes the same typed commands people use; nothing changes until you apply the preview.
keywords: [assistant, ai, chatgpt, automation, commands, query, proposal, preview]
related: [cad-modeler.commands, cad-modeler.history]
operations: [cad-modeler.describe_model, cad-modeler.query, cad-modeler.run_commands]
---

The assistant uses these operations:

- `cad-modeler.describe_model`: features with status, parameters, bodies (volume, mass, bounding
  box, topology) and failures.
- `cad-modeler.query`: one structured read (sketch status and degrees of freedom, faces with stable
  names, dependencies, operation log, the native document, the command catalogue).
- `cad-modeler.run_commands`: a transaction of commands. The model is regenerated on a copy and the
  preview shows each command and the predicted result (volumes, faces, failures).
- `cad-modeler.undo`, `cad-modeler.new_document`, `cad-modeler.open_document` and
  `cad-modeler.export`.

Every change is a proposal. **Apply** runs it through the same command executor as the toolbar,
against the model version the preview was made for; if you changed the model meanwhile, it is
refused. **Undo** on an applied proposal restores the previous state if nothing changed since.

No language model is connected: the scripted demo assistant understands requests such as "create a
plate 80 x 40 x 10 with a 12 mm hole in the CAD modeler", "set thickness to 15", "describe the CAD
part" and "export STEP".
