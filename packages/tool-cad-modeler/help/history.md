---
help_id: cad-modeler.history
title: Undo, redo and the operation log
kind: guide
summary: Every change is a transaction that can be undone and redone; the operation log records who did what.
keywords: [undo, redo, history, log, transaction, version]
related: [cad-modeler.ai, cad-modeler.document]
operations: [cad-modeler.undo, cad-modeler.redo]
---

Every change (yours or an applied assistant proposal) is one **transaction**: all its commands apply
or none. **Undo** (Ctrl+Z) restores the state before the last transaction; **Redo** (Ctrl+Y or
Ctrl+Shift+Z) re-applies it. Undo and redo create a new model **version**, so an assistant proposal
prepared on an older version is refused instead of silently overwriting your work.

**Assistant.** `cad-modeler.undo` and `cad-modeler.redo` prepare the same actions as proposals with a
preview. Redo is available only right after an undo in the open document, before any new change;
otherwise it is refused with the reason. When no CAD tab is open, an applied undo or redo is
saved as a new revision in the project.

**Diagnostics → Operation log** lists recent transactions with their source (user or assistant),
version numbers, and rejected attempts with the reason. The undo history is kept while the document
is open.
