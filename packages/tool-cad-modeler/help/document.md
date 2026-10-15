---
help_id: cad-modeler.document
title: Documents, saving and opening
kind: guide
summary: New documents, opening and saving the open native .ewscad file, multiple open documents and unsaved changes.
keywords: [new, open, save, file, ewscad, native format, document, unsaved]
related: [cad-modeler.native-format, cad-modeler.export-step, cad-modeler.history]
operations: [cad-modeler.new_document, cad-modeler.open_document]
---

- **New** creates a document with one empty part and makes it active in this window.
- **Open** reads a file from your computer. Native `.ewscad` files open with their complete feature
  history and regenerate. Other formats are identified from their content and explained (for example
  a SOLIDWORKS part or a STEP file); only the native format opens in this version.
- **Save** downloads the native file. The header shows **Unsaved changes** until you save; closing
  or reloading the window with unsaved changes asks for confirmation.
- Documents live in this window's memory until saved: save regularly. A server-side store with
  revisions is planned.
- Several documents can be open; each view shows one (the active document).

The document title is edited in **Model → Document title**. It is a command, so it can be undone.
