---
help_id: conceptualize.visual.refine
title: Refining a Concept from annotations
kind: tutorial
summary: Add a numbered pin or rectangle with an instruction to one visual revision, then apply Concept changes as a new Concept revision and a new layout revision. Annotations stay on the revision they were made on.
keywords: [annotation, pin, rectangle, region, refine, instruction, revision, component ID, inferred]
operations: [conceptualize.annotate_visual, conceptualize.refine_from_annotations]
related: [conceptualize.visual, conceptualize.history]
---
1. On a card, choose **Refine**.
2. Choose **Numbered pin** and click the layout, or choose **Rectangle (two clicks)** and click two
   opposite corners. Without a pointer, pick **Or place the pin on a component**.
3. Write the instruction ("Move this hinge toward the rear", "Reduce the overall width while keeping the
   clearances") and choose **Save annotation**. It is stored on this exact revision with normalized
   coordinates (0–1 from the top left) and, on a layout, the exact component ID under the pin.
4. Change parameter values in **Change the definition**, or ask the assistant: "Refine VIS-003 from
   annotation 1". It proposes the changes (`conceptualize.refine_from_annotations`) and shows each
   before and after.
5. **Apply** creates a new Concept revision and a new layout revision drawn from it. The new revision
   records which annotations it answers; the annotations themselves stay on the earlier revision and are
   never moved onto the new drawing.

## Components on images

On a layout every element carries its stable component ID, so a pin names the component exactly
(*structured*). On an illustration the component under a region is an **inference**: the assistant
records it as *inferred* and asks you when the region is ambiguous. Image edits never preserve exact
geometry; the definition and the layout carry the engineering values.

Other visuals of the Concept become possibly outdated after the change; they are not regenerated.
