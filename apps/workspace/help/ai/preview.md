---
help_id: ai.preview
title: Previews, Apply and Undo
kind: guide
summary: The assistant never changes the model by itself; you review a preview and choose Apply or Reject.
keywords: [preview, apply, reject, undo, proposal, change, saved, reopen, earlier session, stale, project]
operations: [propose_changes]
related: [ai.overview]
---

1. Ask for a change, for example "Change the rod diameter to 28 mm."
2. The assistant shows a **preview**: every field, its current and proposed value, and the revision it
   was based on.
3. Choose **Apply** to save it as one change, or **Reject**.
4. An applied change can be undone; undoing creates a new revision rather than erasing history.

If the model changed after the preview was made, Apply is refused and the preview is refreshed. The
assistant acts within your subscription: it explains instead of acting when a tool is not included.

### Saved proposals

Every preview is saved by the application's server (when the workspace uses the backend), so it is not lost
when you reload, open a new browser session or the server restarts. Open proposals of the current project
appear under **Proposals from earlier sessions** in the panel, labelled *From an earlier session*.

- **Saved; applied by the … API**: the change is described as data. On Apply the server checks again who you
  are, your role and subscription, that the proposal belongs to the current project, and that nothing it was
  based on has changed ("CON-012 changed since the preview: revision 3 → 4"). Only then does it run the change
  through the module's own API, once: applying again never repeats it. A stale proposal is never applied with
  a changed meaning; ask the assistant again for a current preview.
- **Fallback: applies only in the window that prepared it**: some modules still prepare changes in the browser.
  Such a preview can be applied only in the window and session that prepared it; later it is shown for
  reference, and you ask again to prepare it.
- A proposal belongs to one project. In another project it is refused, and nothing is applied.

