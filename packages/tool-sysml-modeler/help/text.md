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

- **Highlighting**: keywords, names, strings, numbers and comments are coloured as you type
  (the colours follow the light or dark theme).
- **Completion**: type the start of a keyword or name, or press **Ctrl+Space**, to choose from
  keywords, names in the model and library packages and definitions. After `A::` the list shows the
  members of `A` (for example `ISQ::` lists the quantity types). **Enter** accepts, **Escape** closes.
- **Syntax errors** appear while you type, with line and column, and are underlined in the text.
  Select one in the list to place the cursor on it.
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

Keyboard: **Ctrl+Z** / **Ctrl+Shift+Z** undo and redo typing (before Apply), brackets and quotes
close automatically, **Tab** moves the focus out of the editor (it does not indent; type spaces, the
indentation unit is four), and **Ctrl+A** selects all. On phones and tablets the editor uses the
system keyboard; completion appears as you type.

The text is a projection like every view. Formatting is canonical, and notes (`//`) are not stored;
use `doc /* … */` or `comment /* … */` for text that should be part of the model.
