---
help_id: ai.preview
title: Previews, Apply and Undo
kind: guide
summary: The assistant never changes the model by itself; you review a preview and choose Apply or Reject.
keywords: [preview, apply, reject, undo, proposal, change]
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
