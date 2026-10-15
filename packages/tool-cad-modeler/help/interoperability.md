---
help_id: cad-modeler.interoperability
title: File formats and interoperability
kind: reference
summary: Which formats open, import and export today, which are planned, and what to do with proprietary native CAD files.
keywords: [import, formats, solidworks, catia, nx, creo, inventor, iges, stl, 3mf, dxf, parasolid, jt]
related: [cad-modeler.export-step, cad-modeler.document]
---

| Format | Today | Planned |
| --- | --- | --- |
| ews-cad (`.ewscad`) | Open and save (full design intent) | Server-side revisions |
| STEP AP242 | Export (exact solids, names, units, colours) | Import as a base body without history |
| IGES, STL, OBJ, 3MF, glTF, DXF, Rhino 3DM, FreeCAD | Recognised and explained | Phase 5 (some need a separate decision) |
| SOLIDWORKS, Inventor, Solid Edge, CATIA, NX, Creo, Fusion native | Recognised and explained | Only through licensed translators or vendor APIs (needs approval) |
| Parasolid XT, ACIS, JT, DWG | Recognised and explained | Only with licensed libraries (needs approval) |

The fidelity levels are separate: exact solids, surfaces, meshes, assembly structure, metadata,
PMI and feature history. No neutral format carries a parametric history. For native files of
another system, export STEP AP242 from that system.
