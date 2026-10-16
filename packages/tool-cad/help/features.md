---
help_id: cad.features
title: Mock CAD controls and dimensions
kind: reference
summary: Navigate the drawing, edit dimensions and save snapshots.
keywords: [cad, demo]
---

| Control | Behaviour |
| --- | --- |
| Select | Select a shape and its represented component. |
| Pan | Drag to move the drawing; dragging also pans in Select mode. |
| Zoom in / Zoom out | Scale this view; zoom is limited to 0.5–8. Scroll/pinch also zooms. |
| Fit | Restore the whole-assembly camera. |
| Dimensions | Open/close the selected part's demonstration dimension panel. |
| Visibility | Show/hide parts in this view without deleting model data. |

Dimension inputs are finite numbers in millimetres. Only parameters already present on a representation are editable.

| Parameter | Range (mm) | Component mapping, if present |
| --- | --- | --- |
| `diameter` | 5–200 | `diameter` |
| `outerDiameter` | 20–300 | `outerDiameter` |
| `length` | 50–2000 | `effectiveLength`, otherwise `length` |

Apply validates all edits and submits the representation plus mapped properties atomically with base revisions. Reset discards pending inputs. The panel's Save snapshot requires pending edits to be applied or reset. It saves an immutable `cad-representation` artifact, schema 1, containing the component and representation and their input revisions. Later edits can make a snapshot stale; they do not overwrite it.
