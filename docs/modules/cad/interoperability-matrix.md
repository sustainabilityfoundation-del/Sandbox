# Interoperability compatibility matrix

Status: research complete, Phase 1 implemented for the native format and STEP export. Research,
library licences, signatures and test-model sources: [interoperability.md](../../research/cad/interoperability.md)
(subagent research from public sources; read depth in its sources file). This page states what the
CAD does **today** and what is planned, keeping fidelity levels separate (brief §7.1).

Legend: **✔ implemented and tested** · **◐ partial** · **P5** planned for Phase 5 (no approval
needed) · **A** needs coordinator approval (licensed library, GPL code or paid service) · **—** the
format cannot carry it.

## 1. Export (our model → file)

| Format | Exact solid | Surface | Tessellated | Assembly structure | Metadata (names, units, colours) | PMI / GD&T | Feature history |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ews-cad (native) | — (regenerated) | — | — | P3 | ✔ | P4 (semantic) | ✔ |
| STEP AP242 | ✔ (re-import verified) | P5 | P5 | P3 | ✔ names, mm; colour at solid level (◐ not separately verified) | P5 | — |
| STEP AP203 / AP214 | P5 (schema switch) | P5 | — | P3 | P5 | — | — |
| IGES 5.3 | P5 (custom WASM build) | P5 | — | — | P5 | — | — |
| STL | — | — | P5 (OCCT StlAPI present) | — | — (no units) | — | — |
| OBJ / glTF / GLB | — | — | P5 (JS writers on our meshes) | P5 (glTF nodes) | P5 | — | — |
| 3MF | — | — | P5 (own writer or lib3mf, BSD) | P5 | P5 units, colours | — | — |
| DXF (drawings) | — | — | — | — | P4 (own writer) | P4 | — |
| Rhino 3DM | P5 (rhino3dm, MIT) | P5 | P5 | — | P5 | — | — |
| Parasolid XT, ACIS SAT, JT, DWG | A | A | A | A | A | A | — |

## 2. Import (file → our model)

| Format | Detection today | Exact solid | Surface | Tessellated | Assembly | Metadata | PMI | History |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ews-cad | ✔ | ✔ (regenerated) | — | — | P3 | ✔ | P4 | ✔ |
| STEP AP203/214/242 | ✔ (AP from FILE_SCHEMA) | P5 as base body (geometry-only reader works in the kernel; used to verify exports) | P5 | P5 | P5 (XCAF reader not in build) | P5 (XCAF reader not in build) | P5 | — |
| IGES | ✔ (medium confidence) | P5 | P5 | — | — | P5 | — | — |
| STL / OBJ / 3MF / glTF | ✔ (3MF, GLB, ASCII STL high; OBJ, binary STL by extension) | — | — | P5 | P5 | P5 | — | — |
| FreeCAD FCStd | ✔ (zip + Document.xml) | P5 (contained BREP) | P5 | — | P5 | P5 | — | — (FreeCAD features not mapped) |
| Rhino 3DM | ◐ (extension only) | P5 | P5 | P5 | — | P5 | — | — |
| SOLIDWORKS, Inventor, Solid Edge (OLE) | ✔ (OLE signature + extension) | A | A | A | A | A | A | A |
| CATIA V5 | ◐ (`V5_CFV2` header, low confidence) | A | A | A | A | A | A | A |
| NX / Creo `.prt` | ◐ (extension) | A | A | A | A | A | A | A |
| Fusion, Onshape | ◐ (extension) / API | A (cloud translation) | A | A | A | A | A | A |
| Parasolid, ACIS, JT, DWG | ◐ / ✔ (DWG header) | A | A | A | A | A | A | — |

Every unsupported file opens a diagnostic that names the format, what it carries and the
recommended route (export STEP AP242 from the source system). `detectFormat` is tested for the
native format and STEP; the other signatures need tests with real public sample files (backlog).

## 3. Ecosystems

| Ecosystem | Native | Recommended route into the CAD today |
| --- | --- | --- |
| CATIA | CATPart/CATProduct (proprietary) | STEP AP242 export from CATIA |
| SOLIDWORKS | SLDPRT/SLDASM (proprietary, OLE) | STEP AP242 |
| Siemens NX | .prt (proprietary) | STEP AP242 (NX may license AP242 separately) |
| Autodesk Inventor | IPT/IAM (proprietary, OLE) | STEP AP242 |
| PTC Creo | .prt/.asm (proprietary) | STEP AP242 |
| Solid Edge | PAR/ASM/PSM (proprietary, OLE) | STEP AP242 |
| Autodesk Fusion | cloud / F3D | STEP export, or Autodesk Platform Services translation (A) |
| Onshape | cloud | STEP export, or Onshape translation API (A) |
| FreeCAD | FCStd (open zip) | STEP now; FCStd B-rep import P5 |
| Rhino | 3DM (openNURBS, MIT) | STEP now; 3DM P5 |
