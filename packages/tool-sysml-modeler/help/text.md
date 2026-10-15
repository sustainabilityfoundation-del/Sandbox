---
help_id: sysml-modeler.text
title: Textual editor
kind: guide
summary: Edit the members of the model root, a package or a definition as SysML v2 textual notation. Preview shows what would change; Apply commits it and keeps the identity of unchanged elements.
keywords: [text, textual notation, editor, code, apply, preview, sysml v2 text]
related: [sysml-modeler.language, sysml-modeler.history, sysml-modeler.troubleshooting]
operations: [sysml-modeler.propose_text]
---

Choose **Text** in the toolbar. The editor shows the members of the selected package or definition
(or of the nearest package or definition that owns the selected element) in canonical SysML v2
notation.

- **Syntax errors** appear while you type, with line and column. Select one to place the cursor.
- **Preview** runs the change as a dry run. Names are resolved, the model is validated, and the
  list shows which elements would be created, updated or deleted and which problems the change
  would introduce. Nothing is written.
- **Apply** commits the change. Elements that still match (same path, kind and name) keep their
  identity, so references from elsewhere, managed-requirement links and history stay intact.
- **Renaming in text** is a deletion plus a creation (a new identity). To rename and keep the
  identity, use **Properties › Name**.
- **Unresolved names** stop the change: the text may refer only to elements that exist or that
  the text defines. Import library packages with `private import ISQ::*;` and similar.
- **Revert text** returns to the committed version. If someone changed the model while you were
  editing, a warning appears, because applying would replace their changes to these members.

The text is a projection like every view. Formatting is canonical, and notes (`//`) are not stored;
use `doc /* … */` or `comment /* … */` for text that should be part of the model.
