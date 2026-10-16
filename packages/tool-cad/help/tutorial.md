---
help_id: cad.tutorial
title: Edit a demo rod dimension
kind: tutorial
summary: Change a mock representation and preserve a snapshot.
keywords: [cad, demo]
---

1. Open the actuator demo project in CAD and select the rod shape. Expect its physical component to become the shared selection.
2. Choose Dimensions (`cad.features`). Read the current diameter, then enter a value within 5–200 mm, for example 30 mm.
3. Apply the edit. Expect the representation and the component's mapped diameter to change together. Inspect the resulting side elevation; it remains mock geometry.
4. Choose Save snapshot after applying or resetting all pending edits. Expect a saved immutable representation artifact with input revisions.
5. Choose Visibility (`cad.features`) to hide and restore the rod. This changes only this view, not the shared component or saved snapshot.

This exercise demonstrates shared parameters and provenance, not a manufacturable part.
