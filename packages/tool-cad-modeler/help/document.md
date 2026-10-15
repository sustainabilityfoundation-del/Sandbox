---
help_id: cad-modeler.document
title: Documents, saving and opening
kind: guide
summary: Save revisions of a document in the project (CAD service), open any stored revision, save and open open-format .ewscad files, and see when someone else saved a newer revision.
keywords: [new, open, save, file, revision, project, service, ewscad, native format, document, unsaved, conflict]
related: [cad-modeler.native-format, cad-modeler.export-step, cad-modeler.history]
operations: [cad-modeler.new_document, cad-modeler.open_document, cad-modeler.list_documents, cad-modeler.save_document]
---

**In the workspace with the backend running** (API mode), documents are stored in the project by the
CAD service:

- **Save** stores the document as a new **revision** in the current project. The header shows
  **Revision n**. Revisions are never changed or deleted.
- **Open** lists the project's documents. Choose one and a revision (the current one by default).
  Opening an older revision lets you look at it; saving it creates a new revision with that content.
- If someone else saved a newer revision since you opened yours, **Save** is refused and nothing is
  overwritten. A notice offers **Open the latest revision**; with unsaved changes, first use
  **Save file** so you keep them.
- Assistant saves are stored with the conversation and proposal they came from (shown in the revision
  list as *assistant*).

**Files (always available):**

- **Save file** downloads the open, native `.ewscad` file. Without the CAD service (static preview,
  demo mode) **Save** does the same.
- **Open → Open file…** reads a `.ewscad` file. Other formats are identified from their content and
  explained (for example a SOLIDWORKS part or a STEP file); only the native format opens.

**New** creates a document with one empty part. Until it is saved, the header shows **Not saved to a
file** or **Unsaved changes**; closing or reloading the window then asks for confirmation. Several
documents can be open; each view shows one. The standalone harness uses a clearly labelled local store
that is lost when the page reloads.

The document title is edited in **Model → Document title**. It is a command, so it can be undone.
