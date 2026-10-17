---
help_id: cad-modeler.ai
title: Working with the assistant
kind: api
summary: The assistant reads the CAD model through structured queries and proposes the same typed commands people use; nothing changes until you apply the preview.
keywords: [assistant, ai, chatgpt, automation, commands, query, proposal, preview]
related: [cad-modeler.commands, cad-modeler.history]
operations: [cad-modeler.describe_model, cad-modeler.query, cad-modeler.run_commands, cad-modeler.redo]
---

The assistant uses these operations:

- `cad-modeler.describe_model`: features with status, parameters, bodies (volume, mass, bounding
  box, topology) and failures.
- `cad-modeler.query`: one structured read (sketch status and degrees of freedom, faces with stable
  names, dependencies, operation log, the native document, the command catalogue).
- `cad-modeler.run_commands`: a transaction of commands. The model is regenerated on a copy and the
  preview shows each command and the predicted result (volumes, faces, failures).
- `cad-modeler.undo`, `cad-modeler.redo`, `cad-modeler.new_document`, `cad-modeler.open_document` and
  `cad-modeler.export`. Redo re-applies the transaction you or the assistant just undid; it is refused
  when nothing was undone.
- Lost references: the query `get_reference_repairs` lists features whose face or edge is gone with the
  candidates that exist now; the assistant proposes `repair_reference` inside `cad-modeler.run_commands`
  with a replacement. It never re-binds silently: the choice is a proposal you apply
  ([repair a lost reference](help:cad-modeler.repair-reference)).

Every change is a proposal. **Apply** runs it through the same command executor as the toolbar,
against the model version the preview was made for; if you changed the model meanwhile, it is
refused. **Undo** on an applied proposal restores the previous state if nothing changed since.

**With CAD closed.** Every operation also works when no CAD tab is open. The
assistant picks the document like this:

- the document you name;
- otherwise the open document of this project;
- otherwise the project's only stored document.

If the project has several documents, it asks which one you mean. A document that is not open is
loaded from the project, and regeneration and previews run in the kernel worker as usual.

While no CAD tab is open, applying a change also saves it as a new revision in the project,
with the conversation and proposal as its provenance. The preview shows the revision it will create.
If someone else saved a newer revision first, the save is refused and the change is not kept.

Documents stored in another project are never used.

No language model is connected: the scripted demo assistant understands requests such as "create a
plate 80 x 40 x 10 with a 12 mm hole in the CAD modeler", "set thickness to 15", "describe the CAD
part" and "export STEP".
