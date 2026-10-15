# CAD Interoperability Research and Compatibility Matrix

Status: **research, not a specification.** Nothing in this document is implemented or verified in
our code. Every capability claim is about a third-party format, product or library as described by
public sources, and the implementation must confirm each one with real files before it is offered
to users. Sources are listed with read depth in [sources-interoperability.md](sources-interoperability.md)
(IDs `I..` = fetched, `S..` = search-result summary only). Markers used below:

- `(snippet)`: rests only on a search-result summary. Lower confidence.
- `(bg)`: author's background knowledge, not re-verified this session. Lower confidence.
- `(verify)`: a specific claim the implementation must test before relying on it.

Context assumed: the CAD module runs Open CASCADE Technology (OCCT) compiled to WebAssembly through
the npm package `replicad-opencascadejs` (LGPL-2.1-only, version 1.1.0 at access time [I09]) in a
browser Web Worker, under a TypeScript parametric core whose native format is an open JSON format.

Licensing rule applied throughout: MIT, BSD, Apache, ISC, zlib, MPL and LGPL as a separately
replaceable module are pre-approved. GPL/AGPL in the shipped app, proprietary SDKs, restrictive vendor
format libraries and paid services are marked **requires approval**.

---

## 1. Executive summary

1. **Phase 1 (STEP AP242 export of exact solids with names, units, colours) looks achievable with the
   current build, subject to verification.** The replicad custom build binds `STEPControl_Writer`,
   `STEPCAFControl_Writer`, `XCAFDoc_ShapeTool`, `XCAFDoc_ColorTool`, `XCAFDoc_LengthUnit`,
   `TDataStd_Name`, `TDocStd_Document`, `Quantity_Color(RGBA)` and `Interface_Static` [I07, I08].
   OCCT's writer selects the schema through `write.step.schema`, whose values include `AP242DIS`
   (value 5). The default is AP214CD, so AP242 must be set explicitly [I01]. Whether the WASM build
   emits a correct AP242 `FILE_SCHEMA` header must be checked `(verify)`.
2. **STEP import with names, colours and assembly needs one more binding.** The build has
   `STEPControl_Reader` (shapes only) but no `STEPCAFControl_Reader` [I07]. Adding it is a custom-build
   change that stays inside LGPL OCCT, so no approval is needed.
3. **IGES is not in the current build** [I07, I08]. OCCT's IGES 5.3 reader and writer are LGPL [I02],
   so adding them is a build change, not a licensing question. OCCT documents the IGES translator as
   **not thread-safe** [I02, I03], which matters less in a single worker but must be serialised.
4. **Tessellated exports (STL now; OBJ, glTF, 3MF later) are achievable without approval.** The build
   has `StlAPI_Writer`/`StlAPI_Reader` [I07]. OCCT also provides OBJ, glTF and VRML readers/writers
   and a PLY writer [I03], which can be bound if wanted. 3MF has no OCCT support. lib3mf is BSD-2-Clause
   [I31], or a small writer can be built from the public 3MF core spec [I33].
5. **Semantic PMI is a Phase 5 item with a real path.** OCCT XDE reads and writes AP242 GD&T
   (dimensions, geometric tolerances, datums) and reads graphical PMI and saved views. It does not
   export saved views, and it has listed limitations [I01, I04]. The current build has no
   `XCAFDoc_DimTolTool` binding [I07], and our parametric core has no PMI model yet.
6. **Parasolid XT, ACIS SAT/SAB, JT (B-rep), DWG and all proprietary native formats need approval.**
   Open-source OCCT covers STEP, IGES, STL, VRML (and the mesh formats). Parasolid, ACIS, JT, DXF and
   IFC are sold by Open Cascade as commercial components that are not freely downloadable [S38].
   DWG needs the Open Design Alliance SDK (membership, proprietary) [S20] or GPL LibreDWG [S19].
7. **DXF has no pre-approved library in this survey.** libdxfrw is GPL-2.0-or-later [I35] and
   needs approval. Autodesk publishes the DXF reference [S36], so a narrow ASCII-DXF writer of our own
   (2D drawings) is a realistic, permissive alternative.
8. **Rhino 3DM is reachable under a permissive licence.** openNURBS is MIT according to McNeel
   [S18], and `rhino3dm.js` (MIT, WASM) reads and writes .3dm including B-reps and meshes [I29]. It
   has no meshing or kernel operations [I29, S18], so OCCT geometry would need mapping into it. Phase 5.
9. **No neutral format carries parametric feature history in practice.** Feature history
   survives only in native formats and vendor APIs. Our open JSON format is the only place our own
   history persists. Treat level 7 as "not carried" for every exchange format.
10. **Detect proprietary natives and stop with a clear message.** CATIA V5 (`V5_CFV2`), OLE compound
    files (Inventor, older SOLIDWORKS), SOLIDWORKS 2015+ (PRONOM signature), NX (`UGII`), Creo
    (`#UGC:`) and DWG (`AC10xx`) can be recognised from their leading bytes [I41, I42, S22, S33]. The
    user should be told to export STEP AP242 from the source system, or use the vendor API or an
    authorised conversion service.

---

## 2. Fidelity levels (kept distinct throughout)

| # | Level | Meaning in this document |
|---|---|---|
| 1 | Exact solid B-rep | Closed, topologically connected solids with exact (analytic/NURBS) geometry, re-usable for modelling |
| 2 | Surface geometry | Exact surfaces/curves without guaranteed closed-solid topology (trimmed surfaces, open shells, wireframe) |
| 3 | Tessellated geometry | Triangles/polygons only (meshes), whether or not exact geometry is also present |
| 4 | Assembly structure | Product tree, component instances, placements (transforms), reuse of one definition by many instances |
| 5 | Metadata | Names, colours, layers, user properties/attributes, units, materials/density, validation properties |
| 6 | PMI/GD&T | **Semantic** (machine-readable tolerances, datums, dimensions linked to geometry) vs **graphical** (display-only polylines/text), plus saved views |
| 7 | Parametric feature history | Sketches, features, constraints, parameters and their order, re-computable |

A format "carrying" a level is different from a library "delivering" it. The matrix in section 6
records what we could deliver and with what library.

---

## 3. Ecosystems: native formats and native neutral exchange

Confidence notes: CATIA, NX, Solid Edge and SOLIDWORKS rows rely more on search summaries because
their official help is login-gated, JavaScript-rendered, or both. Inventor, Creo, Fusion, Onshape and
Rhino rows rest on fetched official pages.

### 3.1 Summary table

| System (kernel) | Native formats / container | Publicly documented? | Notable native neutral export | Notable import |
|---|---|---|---|---|
| **CATIA V5 / 3DEXPERIENCE** (CGM `(bg)`) | `.CATPart`, `.CATProduct`, `.CATDrawing`, `.cgr`. V5 files start `V5_CFV2` [S33, I42]. 3DEXPERIENCE data lives in a PLM database. Exchange uses 3D XML (ZIP) [S34] | No. 3D XML documentation is reportedly given under a royalty-free, internal-use licence on request [S34] (snippet) | STEP AP203/AP214/AP242 with 3D annotations (PMI needs FTA licence; STEP needs ST1 add-on, per a reseller) [S11] (snippet). IGES, STL, VRML, DXF/DWG, 3D XML [S12] (snippet) | STEP, IGES and others (snippet) |
| **SOLIDWORKS** (Parasolid [I45]) | `.sldprt`, `.sldasm`, `.slddrw`. Older files are OLE compound files. A distinct 2015+ signature exists [I41, S31] | No. Format "specifications are not available" [S31] (snippet). Document Manager API reads/writes with a subscriber key [S27] | Parasolid `.x_t/.x_b`, ACIS `.sat`, IGES (surfaces and B-rep solids), STEP, 3D XML (export only), IFC 2x3/4 export, STL, 3MF, VRML, CGR, VDAFS [S01, S02] (snippet). **STEP AP242 with PMI needs SOLIDWORKS MBD** ("Publish STEP 242") [S03] (snippet) | Many, incl. IFC import [S01] (snippet). AP242 import uncertain (forum dispute) [S03] |
| **Siemens NX** (Parasolid [I45]) | `.prt` (single file type for part/assembly/drawing `(bg)`). Starts `UGII` per TransMagic [I42] (low confidence) | No | JT (Siemens' own format). STEP AP203/AP214/AP242. **AP242 translator is a separately licensed product** per a Siemens KB article [S09] (snippet). AP242 export added PMI section views, attributes and facets in NX 1847 [S09] (snippet). Parasolid, IGES, STL `(bg)` | PMI "Convert" works only with AP242 imports [S09] (snippet) |
| **Autodesk Inventor** (ShapeManager, forked from ACIS 7.0 [I47]) | `.ipt`, `.iam`, `.idw`/`.dwg`, `.ipn`. OLE compound files (storage names `RSeStorage`, `RSeEmbeddings`) [S32] | No | **STEP AP203/AP214/AP242.** AP242 carries Inventor MBD/3DA PMI but "is not available for assemblies". JT (XT B-rep or JT B-rep; no JT B-rep at v10.3+; JT PMI not for assemblies). Parasolid, SAT, IGES (surfaces/solids/wireframe), STL, OBJ, CATIA V5, Pro/E Granite `.g` [I22] | STEP, IGES, SAT, Parasolid, JT, SOLIDWORKS, others [S05] (snippet) |
| **PTC Creo Parametric** (Granite, per its `.g` export `(bg)`) | `.prt`, `.asm`, `.drw` with numeric version suffixes `(bg)`. Text-like header `#UGC:` per TransMagic [I42] (low confidence) | No | **STEP ap203_is / ap203_e2 / ap214_is / ap242 / ap242_e3.** Semantic GD&T on ap214_is, ap203_e2, ap242, ap242_e3. Graphical PMI per AP242. Colours, layers, groups, material, density, validation properties, parameters. Assembly as one file or split [I26]. AP242 Ed. 3 export since 11.0.4.0 [S13] (snippet). IGES, VDA, Parasolid, ACIS, JT (licence), CATIA V5 (licence), NX (licence), SOLIDWORKS (licence), STL, VRML, 3MF, OBJ, DWG, PDF/U3D, Neutral [I27] | STEP, IGES, Parasolid, ACIS, JT, CATIA V4/V5, NX, SOLIDWORKS, Inventor, Solid Edge, Rhino `.3dm` [I27] |
| **Solid Edge** (Parasolid [I45]) | `.par`, `.psm`, `.asm`, `.dft`. Container not confirmed (OLE compound file is likely `(bg)`) | No | STEP AP203/AP214/AP242, IGES, Parasolid, JT, STL [S14] (snippet, third-party). JT was the PMI-capable translator at the time of a Siemens KB article. AP242 PMI was planned [S10] (snippet) | (Not researched in depth) |
| **Autodesk Fusion** (ShapeManager `(bg)`) | Cloud-hosted. Export `.f3d` (proprietary archive) and `.f3z` (ZIP holding `.f3d` + JSON manifest) [S37] (snippet) | No | STEP, SMT, F3D, 3MF, OBJ, STL, FBX, USDZ on all licences. **IGES export and File>Export DXF need a commercial licence.** SAT/SMT export excluded on Personal Use. SAT import limited to ACIS 7 [I25] | CATIA V5, Creo, NX, Solid Edge, SOLIDWORKS, Rhino, Parasolid and others (several are commercial-only) [I25] |
| **Onshape** (Parasolid [I45]) | No user-visible native file. Documents live in the cloud database. Export via UI or REST API [I24] | API documented publicly [I24] | **STEP AP203/AP214/AP242 (export includes MBD data)**, IGES 5.3, Parasolid v25.0 to v37.0, Parasolid mesh, ACIS v5, JT up to 11.0, Rhino 3dm v2 to 8, STL, OBJ, 3MF, glTF, PVZ, URDF. DWG/DXF for drawings [I23] | STEP import is "geometry and face color only". Parasolid is the preferred import format. CATIA, SOLIDWORKS, Inventor, NX, Creo, Solid Edge natives (assemblies zipped) [I23] |
| **FreeCAD** (OCCT; LGPL2+ [S40]) | `.FCStd`: ZIP containing `Document.xml` (parametric definition), `GuiDocument.xml` (display: colours, line width), one OCCT BREP file per shape (`.brp`/`.brep`), a thumbnail [S15] (snippet; wiki bot-blocked) | Yes, by the open-source project (FreeCAD-specific schema) | STEP and IGES (via OCCT), BREP, STL, OBJ, 3MF, glTF, DXF. DWG via an external converter. IFC via IfcOpenShell [S16] (snippet) | Same set. glTF import status differs between wiki versions [S16] |
| **Rhino 3D** (own NURBS kernel) | `.3dm` via openNURBS (MIT) [S18, I30] | Yes, through the openNURBS toolkit | STEP, Parasolid `.x_t` (export only), ACIS `.sat` (export only), 3MF, glTF, OBJ, STL, DWG/DXF, FBX, USD, VDA, PLY [I28]. **IGES did not appear in the English export index at access time**, though it is on the import list [I28] `(verify)` | STEP, IGES, 3MF, glTF, OBJ, STL, DWG/DXF, SOLIDWORKS `.sldprt/.sldasm`, SketchUp, PDF [I28] |

### 3.2 Implications for us

- **STEP AP242 is the common denominator.** All ten ecosystems either export STEP natively or (Onshape)
  through UI and API. AP242 specifically is documented for Creo [I26], Inventor (parts only for
  PMI) [I22], Onshape [I23], SOLIDWORKS MBD [S03], NX (separately licensed translator) [S09] and
  CATIA (licensed add-ons) [S11]. Rhino and FreeCAD export STEP, but the AP version was not confirmed
  here.
- **Kernel families matter for "near-native" exchange.** Parasolid XT is first choice into NX,
  Solid Edge, SOLIDWORKS and Onshape [I23, I45]. SAT/SMT goes into Fusion and Inventor, which accept
  only SAT up to ACIS 7 [I25, I47]. We cannot write either without approval (section 4).
- **PMI interchange is uneven.** Inventor AP242 PMI excludes assemblies [I22]. Onshape STEP
  import keeps only geometry and face colour [I23]. NX converts imported PMI only from AP242 [S09].
  Our PMI round-trip claims must stay narrow.

---

## 4. Format reference

For each format: owner and openness, libraries with licence, WASM/browser viability, and the
fidelity the format itself can carry. "OCCT" means open-source Open CASCADE Technology (LGPL-2.1 with
an exception covering object code that uses OCCT header material, conditional on a prominent notice
[I10]). OCCT documentation at access time was for version 8.0.1 [I01]. The OCCT version inside
`replicad-opencascadejs` 1.1.0 was not determined `(verify)`.

### 4.1 STEP (ISO 10303-21 exchange structure; AP203, AP214, AP242)

- **Owner/openness:** ISO TC 184/SC 4 international standard. Purchased from ISO, not free.
  AP242 editions: ed. 1 (2014), ed. 2 (2020), ed. 3 (2022, withdrawn 2025), **ed. 4 ISO 10303-242:2025
  is current** [S06, S07] (snippet). A further CD was in ballot in 2026 [S06]. AP214 was withdrawn after
  AP242 was published in 2014 [S08] (snippet). Implementation guidance is in the **CAx-IF Recommended
  Practices**, which can be downloaded as PDFs without login. They cover PMI representation and
  presentation, geometric and assembly validation properties, model styling and organisation
  (colours/layers), tessellated geometry, user-defined attributes, external references, persistent
  IDs and STEP file compression [I15].
- **Schema identification:** the AP242 schema name `AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF`
  is the same in every edition. Editions are told apart by the ASN.1 object identifier [I17]:
  ed1 `{1 0 10303 442 1 1 4}`, ed2 `{1 0 10303 442 3 1 4}`, ed3 `{1 0 10303 442 4 1 4}`,
  ed4 `{1 0 10303 442 7 1 4}` [I16]. AP214 uses `AUTOMOTIVE_DESIGN` [I18]. AP203 ed2 has identifier
  `{1 0 10303 403 2 1 2}` [I16]. Its schema name `AP203_CONFIGURATION_CONTROLLED_3D_DESIGN_OF_MECHANICAL_PARTS_AND_ASSEMBLIES_MIM_LF`
  and AP203 ed1 `CONFIG_CONTROL_DESIGN` are `(bg)`. OCCT's AP214CD output schema string is not documented here `(verify)`.
- **Libraries:**
  - **OCCT `STEPControl` (shapes and assembly structure) and `STEPCAFControl` + XDE (names, colours,
    layers, materials, validation properties, GD&T)**, LGPL [I01, I04]. Reads AP214 CC2, AP203 and
    "some parts of AP242". Writes AP203 or AP214 variants, and AP242DIS through `write.step.schema` [I01].
    Reads and writes tessellated entities (`tessellated_solid`, `triangulated_face` and others; write
    default `OnNoBRep`) [I01]. Global `Interface_Static` parameters are not thread-safe. OCCT
    recommends per-call `DESTEP_Parameters` [I01, I03].
  - **occt-import-js** (LGPL-2.1, WASM): STEP/IGES/BREP to triangulated meshes with names, colours and
    hierarchy as JSON [I13]. Useful as a reference or viewer path, not for B-rep editing.
  - Commercial: STEP Tools (`stplib`) [I17], plus the multi-format SDKs in section 7. **Requires approval.**
- **WASM:** yes. The current build already includes the STEP reader and writers [I07].
- **Fidelity carried by AP242:** exact B-rep, surfaces, tessellation, assembly, styling and
  metadata, semantic and graphical PMI, validation properties [I14, I15]. AP203/AP214 carry geometry,
  assembly and (AP214) colours and layers. PMI there is graphical polylines only, under the AP203/AP214 polyline
  practice [I15]. Feature history: AP242 has no broadly implemented, interoperable feature-history
  exchange. Treat as not carried `(bg)`.

### 4.2 IGES 5.3

- **Owner/openness:** originated with US Air Force ICAM/NBS (NIST). Version 5.3 (1996) was published by
  US Product Data Association. It was an ANSI standard from 1996 to 2006 and is the last published
  version [I19]. Archived PDFs are linked from public pages [I19]. Superseded in practice by STEP.
- **Libraries:** OCCT `IGESControl`/`IGESCAFControl` (LGPL). Reads up to 5.3 (3D geometric entities
  only). Writes 5.3 in Face mode (trimmed surfaces 144) or BRep mode (186 manifold solid, 514 shell,
  510 face). Colours, names and layers go through XDE. Units are converted to mm on read. **Not
  thread-safe** [I02, I03]. occt-import-js reads IGES to mesh [I13].
- **WASM:** OCCT IGES is **not bound** in replicad-opencascadejs [I07, I08]. Needs a custom-build change.
- **Fidelity:** B-rep solids (186) where the sender writes them, else trimmed surfaces. Colours and
  levels (layers). No assembly semantics comparable to STEP. No semantic PMI. No history.

### 4.3 OCCT BREP (`.brep`) and FreeCAD FCStd

- **BREP:** OCCT's own exact-geometry text/binary format, read and written by `BRepTools`, which is bound in
  the current build [I07]. Shapes only. No names or colours (XDE XBF holds those [I03]).
- **FCStd:** ZIP with `Document.xml`, `GuiDocument.xml` and per-object BREP files [S15] (snippet).
  Because the shapes are OCCT BREP, **exact solids from an FCStd could be imported with `BRepTools`
  plus a permissive ZIP reader**. Colours would come from `GuiDocument.xml`. FreeCAD's parametric
  `Document.xml` is FreeCAD-specific and is **not** a practical feature-history import source `(bg)`.

### 4.4 Parasolid XT (`.x_t` text, `.x_b` binary)

- **Owner/openness:** Siemens Digital Industries Software, proprietary kernel licensed to other
  vendors [I45]. Wikipedia calls the format "documented and open" but cites a 2006 reference PDF
  on a third-party site [I45]. IANA registrations (2002) say the text spec is available on request
  and the binary spec is not published [S23] (snippet). Treat it as **proprietary with a partly
  public description**.
- **Header:** ASCII header with `**PART1` (including `APPL=`, `FORMAT=`, `GUISE=transmit`),
  `**PART2` (including `SCH=` schema reference), `**PART3`, `**END_OF_HEADER` [I40].
- **Libraries:** Parasolid itself (Siemens, licensed). Open Cascade's commercial Parasolid Import
  component (all schema versions, colours and names via XDE) [S38]. Multi-format SDKs. **All
  require approval.** No open-source reader of production quality was found.
- **WASM:** no approved option.
- **Fidelity:** exact B-rep (native kernel data), assembly via instances, attributes, colours, density
  (Siemens notes Parasolid and JT keep density, IGES/STEP do not [S09] (snippet)). No semantic PMI,
  no feature history `(bg)`.

### 4.5 ACIS SAT/SAB (and Autodesk SMT)

- **Owner/openness:** Spatial Corp. (Dassault Systèmes), proprietary [I46]. SAT is text, SAB binary,
  same content. The save version is tracked separately from the release, and only major releases
  change SAT [I46]. Autodesk ShapeManager forked from ACIS 7.0 in 2001 [I47], so Autodesk tools
  accept SAT only up to version 7 [I25]. SMT/SMB is Autodesk's ShapeManager format [I25].
- **Header:** first line holds the save version and counts, second the product/ACIS version string,
  third the units/resolution values `(bg)`. Exact syntax not verified this session.
- **Libraries:** Spatial ACIS / 3D InterOp, Open Cascade's commercial ACIS component (SAT and SAB) [S38],
  multi-format SDKs. **All require approval.**
- **Fidelity:** exact B-rep, colours and attributes. No semantic PMI or history.

### 4.6 JT (ISO 14306)

- **Owner/openness:** Siemens. ISO 14306:2012 then **ISO 14306:2017** (purchasable). Siemens' JT
  File Format Reference v10.5 is freely viewable [I39]. Patents are licensed royalty-free for software
  that produces or consumes JT, limited to rights needed to implement the format [I39, S21].
  The **JT Open Toolkit** (C++, full read/write) is tied to JT Open Program membership [S21].
- **Structure:** file header (version, TOC location), TOC segment, data segments (logical scene
  graph, shape LODs, metadata, B-rep). The 2017 edition adds a STEP B-rep segment and deprecates the
  JT B-rep and PMI segments in favour of XT B-rep and metadata [I39].
- **Libraries:** JT Open Toolkit (membership), Open Cascade commercial JT component [S38],
  multi-format SDKs. **Require approval.** A tessellation-only reader built from the public
  reference is possible in principle. It would be substantial work `(bg)` and still subject to
  reading the patent notice.
- **Fidelity:** tessellated LODs (primary), exact B-rep (XT segment) optional, assembly structure,
  metadata, PMI (Inventor exports JT PMI for parts [I22]). No history.

### 4.7 3D XML (Dassault Systèmes)

- **Openness:** proprietary. ZIP container holding a BOM/manifest and representation files [S34]
  (snippet). Documentation reportedly given under a yearly royalty-free licence for internal works on
  request [S34] (snippet). SOLIDWORKS exports it [S01].
- **Libraries:** none open-source found. Commercial SDKs. **Requires approval.**
- **Fidelity:** mainly tessellated plus product structure and metadata `(bg)`.

### 4.8 Rhino 3DM

- **Owner/openness:** Robert McNeel & Associates. Read/write toolkit openNURBS under the MIT licence
  according to McNeel's developer licence page [S18]. The licence file itself could not be fetched [N09].
- **Libraries:** openNURBS (C++, MIT, includes zlib) [S18]. **rhino3dm.js** (MIT, WASM, browser and Node)
  reads and writes .3dm points, curves, NURBS surfaces, B-reps, meshes, extrusions, SubD, layers and
  attributes [I29]. No meshing or intersection in openNURBS (commercial Rhino SDK only) [S18].
- **WASM:** yes (rhino3dm.js). Pre-approved licence.
- **Fidelity:** exact B-rep/NURBS, meshes, layers, names, colours, units, blocks/instances `(bg)`.
  Annotations exist [I29]. No interoperable semantic PMI. No CAD feature history.

### 4.9 STL

- **Openness:** de facto, informally published (3D Systems origin `(bg)`).
- **Structure:** binary has an 80-byte header, a uint32 little-endian triangle count, and 50 bytes per
  triangle. ASCII starts with `solid`. Binary headers may also start with `solid`, so detection must check
  size (`84 + 50 * n == file size`) first [S25] (snippet).
- **Libraries:** OCCT `StlAPI` (in current build) [I07]. three.js loaders/exporters (MIT `(bg)`). Assimp
  (BSD-3) [I36, I37].
- **Fidelity:** tessellation only. No units (unitless by convention), no colour in the standard (vendor
  colour extensions exist `(bg)`), no assembly.

### 4.10 OBJ (Wavefront)

- **Openness:** de facto public description `(bg)`.
- **Libraries:** OCCT `RWObj` read/write (via DE wrapper) [I03], **not bound** in current build [I07].
  three.js OBJLoader/OBJExporter (MIT `(bg)`), Assimp (BSD-3) [I37].
- **Fidelity:** polygons, groups/objects (flat names), materials through `.mtl`. No units, no instancing
  semantics, no B-rep.

### 4.11 3MF

- **Owner/openness:** 3MF Consortium. Published core spec **1.4.0 (2025-02-06)** on GitHub [I33].
  OPC ZIP package. StartPart relationship to the 3D model part, recommended at `/3D/3dModel.model`.
  `unit` attribute (micron to meter, default millimetre). Triangle meshes, components, build items with
  3x4 transforms, metadata, base materials with sRGB `displaycolor` [I33]. Content types and `.rels` come from OPC [I33].
- **Libraries:** **lib3mf** (BSD-2-Clause; bindings C/C++/Python/C#/Go/Pascal/NodeJS; no WASM build
  mentioned) [I31, I32]. Assimp 3MF export marked experimental [I37]. Or our own writer from the open
  spec plus a permissive ZIP library `(bg)`.
- **Fidelity:** tessellation, simple assembly (components + transforms), names and metadata, colours and
  materials, explicit units. No B-rep, no PMI, no history.

### 4.12 glTF 2.0 / GLB

- **Owner/openness:** Khronos, royalty-free spec [I34]. Also **ISO/IEC 12113:2022** [S24] (snippet).
  Right-handed, +Y up. Scenes, node hierarchy with transforms, meshes, materials, cameras, animation
  [I34]. Metres by convention `(bg)`. GLB: 12-byte header with magic `0x46546C67` ("glTF" as bytes
  `67 6C 54 46`), version 2, total length, then chunks [S24] (snippet).
- **Libraries:** OCCT `RWGltf` reader/writer (XCAF-based) [I03]. ocjs examples bind `RWGltf_CafWriter`
  in custom builds [I12]. **Not bound** in current build [I07]. three.js GLTFLoader/GLTFExporter
  (MIT `(bg)`). Our repo already contains a GLB viewer app (outside the platform), which is not evaluated here.
- **Fidelity:** tessellation, assembly hierarchy (nodes), names, PBR colours/materials, `extras` for
  custom properties. No B-rep, no PMI, no history.

### 4.13 DXF

- **Owner/openness:** Autodesk publishes the DXF Reference publicly [S36]. Sections start with group
  code `0`/`SECTION`, then `2`/name (e.g. `HEADER`), and end `0`/`ENDSEC`. `$ACADVER` (group code 1) gives the
  version, e.g. `AC1024` = 2010, `AC1032` = 2018 [S36] (snippet). Binary DXF starts with the sentinel
  `AutoCAD Binary DXF` [S36] (snippet, PRONOM).
- **Libraries:** **libdxfrw: GPL-2.0-or-later** (reads/writes DXF ASCII and binary, reads DWG R14 to 2015)
  [I35]. **Requires approval.** Assimp imports DXF (no export) [I37]. ODA (proprietary). OCCT DXF is a
  commercial component [S38]. A narrow own writer (2D entities) from the public reference is a
  permissive alternative `(bg)`.
- **Fidelity:** 2D/3D wireframe, layers, colours, blocks (instancing), units (`$INSUNITS` `(bg)`). 3D solids
  in DXF are embedded ACIS (SAT) data `(bg)`, so exact solids via DXF require ACIS. Graphical dimensions only.

### 4.14 DWG

- **Owner/openness:** Autodesk, proprietary, no published spec. Reverse-engineered by ODA and GNU
  LibreDWG [S19, S20]. Version string in the first six bytes: `AC1015` (2000), `AC1018` (2004),
  `AC1021` (2007), `AC1024` (2010), `AC1027` (2013), `AC1032` (2018 onward) [S22] (snippet).
- **Libraries:** **ODA Drawings SDK**, proprietary, members only. A WASM "Drawings inWEB" exists [S20]
  (snippet). **Requires approval.** **LibreDWG**, GPLv3+, reads r1.2 to r2018 (about 99%), with limited
  write support [S19] (snippet). **Requires approval** (GPL). libdxfrw reads DWG (GPL) [I35].
- **Fidelity:** as DXF. Practically 2D drawings for us.

### 4.15 IFC (relevant for building/plant contexts only)

- **Owner/openness:** buildingSMART. **ISO 16739-1:2024 (IFC 4.3)** [S35] (snippet). Encoded as an
  ISO 10303-21 file (`FILE_SCHEMA(('IFC4'))` or similar `(bg)`), so STEP detection must look at the schema
  name before routing.
- **Libraries:** **web-ifc** (MPL-2.0, WASM, read/write) [I38]. IfcOpenShell (LGPL `(bg)`). SOLIDWORKS
  exports IFC 2x3/4 [S01]. FreeCAD uses IfcOpenShell [S16].
- **Fidelity:** product/spatial structure, properties, swept/B-rep/mesh geometry. Not a mechanical PMI carrier.

### 4.16 Proprietary native formats (CATPart/CATProduct, SLDPRT/SLDASM, NX prt, Creo prt/asm, IPT/IAM, PAR/PSM/ASM, F3D)

- **Openness:** none publicly documented. Readers exist only in commercial SDKs (HOOPS Exchange [S29],
  CAD Exchanger [S28], Datakit [S30], Spatial 3D InterOp, Open Cascade commercial components [S38]) or
  cloud services (Onshape import [I23], Autodesk Platform Services Model Derivative [S26]).
  **All require approval.** Reverse-engineered readers (e.g. a clean-room Python F3D reader [S37])
  are not candidates: there is a legal and quality risk and no licence clarity.

### 4.17 Our native JSON format

The only format here that carries level 7 (our own feature history) losslessly. It should also
record the export provenance (which neutral files were derived from which revision) under the
artifact rules in AGENTS.md. That is a design topic, not researched here.

---

## 5. OCCT data exchange coverage and the current WASM build

| OCCT component (LGPL) | What it handles [I01 to I04] | In replicad-opencascadejs 1.1.0? [I07, I08] |
|---|---|---|
| `STEPControl_Writer` | Shapes, assembly (`write.step.assembly`), schema selection, units | **Yes** |
| `STEPControl_Reader` | Shapes and assembly structure | **Yes** |
| `STEPCAFControl_Writer` | Names, colours, layers, materials, validation props, GD&T (AP242) | **Yes** |
| `STEPCAFControl_Reader` | Same, on import, plus graphical PMI, saved views, user attributes | **No** |
| `XCAFDoc_ShapeTool`, `ColorTool`, `LengthUnit`, `DocumentTool` | XDE assembly, colours, units | **Yes** |
| `XCAFDoc_LayerTool`, `MaterialTool`, `DimTolTool`, `ViewTool` | Layers, materials, GD&T, views | **No** (not in symbol list) |
| `TDataStd_Name` | Names on labels | **Yes** |
| `IGESControl_*`, `IGESCAFControl_*` | IGES 5.3 | **No** |
| `StlAPI_Writer` / `StlAPI_Reader` | STL | **Yes** |
| `RWGltf_*`, `RWObj_*`, `RWPly`, VRML | glTF, OBJ, PLY (write), VRML | **No** |
| `BRepTools` | OCCT BREP read/write | **Yes** |
| `Interface_Static` | Global translator parameters (`write.step.schema`, units) | **Yes** |

Other notes:

- All the missing items are LGPL OCCT classes. Adding them is a custom-build change (the replicad
  build uses opencascade.js YAML configs with `ytt` and Docker [I05, I12]), not a licensing change.
  Either fork the build config or maintain our own build. Both keep OCCT a separately replaceable
  LGPL module.
- replicad's own `exportSTEP(shapes, {unit, modelUnit})` returns a `Blob` [I11]. The `ShapeConfig`
  page (name/colour fields) returned 404 [N10]. Its exact naming/colour behaviour must be read from source `(verify)`.
- A forum report says OCCT's STEPCAF writer wrote colours for solids and compounds but not for
  per-face colours in that user's case [S39] (snippet). Phase 1 should assign colours at solid level
  and test face-level colours separately.
- OCCT's XDE writer limitations: no per-side face colours, transparency, reflectance, curve styles or
  point markers. Saved views not exported. GD&T only on shapes or shape groups. Only some
  tolerance-zone types. AP214 GD&T handling is obsolete. AP242 recommended [I01].

---

## 6. Compatibility matrix

### 6.1 Legend

Status (what **we** could deliver, never merged across levels):

- **S** Supported: the format carries the level and a pre-approved library can deliver it.
- **P** Partial: carried only in part, or the library delivers only part (see note).
- **N** Not carried by format.
- **L** Requires licensed library (approval needed).

Library keys:

| Key | Library | Licence | Approval |
|---|---|---|---|
| OB | OCCT class **already bound** in replicad-opencascadejs | LGPL-2.1 | Pre-approved |
| OX | OCCT class, **binding to be added** to our custom build | LGPL-2.1 | Pre-approved |
| R3 | rhino3dm.js / openNURBS | MIT | Pre-approved |
| 3M | lib3mf, or own writer from the 3MF spec | BSD-2-Clause / ours | Pre-approved |
| WI | web-ifc | MPL-2.0 | Pre-approved |
| OW | Own TypeScript implementation from a public spec | ours | Pre-approved |
| ZP | Permissive ZIP library (to select) | MIT/zlib expected | Pre-approved, select and record |
| PS | Parasolid, or Open Cascade commercial Parasolid component | proprietary | **Requires approval** |
| AC | Spatial ACIS / 3D InterOp, or OCC commercial ACIS component | proprietary | **Requires approval** |
| JT | JT Open Toolkit, or OCC commercial JT component | membership / proprietary | **Requires approval** |
| OD | Open Design Alliance SDK | proprietary (members) | **Requires approval** |
| GP | libdxfrw / LibreDWG | GPL-2.0+ / GPL-3.0+ | **Requires approval** |
| CS | Commercial multi-format SDK (HOOPS Exchange, CAD Exchanger, Datakit, Spatial 3D InterOp) | proprietary | **Requires approval** |
| CL | Cloud translation (Onshape API, APS Model Derivative) | paid service / account terms | **Requires approval** |

Phase: **P1** = Phase 1 (STEP AP242 export of exact solids with names, units, colours). **P5** = Phase 5
(expanded interoperability). **-** = not planned. **A** = only after coordinator approval.

### 6.2 Matrix: export (our model to file)

| Format | 1 Exact solid B-rep | 2 Surface geometry | 3 Tessellated | 4 Assembly structure | 5 Metadata | 6 PMI/GD&T (sem / graph) | 7 Feature history |
|---|---|---|---|---|---|---|---|
| **STEP AP242** | S · OB · **P1** | S · OB · P1 (open shells/surfaces if modelled) | S · OB · P5 (`write.step.tessellated`, verify in WASM) | S · OB · P5 (`write.step.assembly`; P1 if multi-body grouping needed) | P · OB · **P1** names, colours (solid level), units. Layers/materials need OX · P5 | sem: P · OX (`DimTolTool`) · P5. graph: N from OCCT writer per docs (graphical presentation export not documented) · - | N |
| **STEP AP214 / AP203** | S · OB · P5 (compatibility option) | S · OB · P5 | P · OB · P5 (tessellation is AP242-era `(bg)`) | S · OB · P5 | P · OB · P5 (AP214 colours/layers; AP203 limited `(bg)`) | sem: N (obsolete in AP214 per OCCT [I01]). graph: P via polylines (not via OCCT) · - | N |
| **IGES 5.3** | P · OX · P5 (BRep mode 186; receivers vary) | S · OX · P5 (Face mode 144) | N | N (flat; no product structure) | P · OX · P5 (colours, names, levels; units forced mm on read) | N | N |
| **OCCT BREP** | S · OB · P5 (debug/support export) | S · OB | P (triangulation can be stored `(bg)`) | N | N | N | N |
| **Parasolid XT** | L · PS · A | L · PS · A | N (mesh variant exists [I23]) | L · PS · A | L · PS · A | N | N |
| **ACIS SAT** | L · AC · A | L · AC · A | N | L · AC · A | L · AC · A | N | N |
| **JT** | L · JT · A (XT B-rep segment) | L · JT · A | L · JT · A | L · JT · A | L · JT · A | L · JT · A | N |
| **3D XML** | N `(bg)` | N | L · CS · A | L · CS · A | L · CS · A | N | N |
| **Rhino 3DM** | P · R3 · P5 (OCCT to openNURBS geometry mapping needed) | S · R3 · P5 | S · R3 + OB tessellation · P5 | P · R3 · P5 (instance definitions `(bg)`) | S · R3 · P5 (layers, names, colours, units) | N (annotations only, not semantic) | N |
| **STL** | N | N | S · OB · P5 (or P1 as convenience) | N | N (no units, no names beyond header) | N | N |
| **OBJ** | N | N | S · OX or OW · P5 | P · OX/OW · P5 (groups only, no instancing) | P · P5 (names, `.mtl` colours; no units) | N | N |
| **3MF** | N | N | S · 3M · P5 | P · 3M · P5 (components + build transforms) | S · 3M · P5 (units, names, metadata, display colours) | N | N |
| **glTF/GLB** | N | N | S · OX (`RWGltf`) or OW · P5 | S · OX/OW · P5 (node tree) | P · P5 (names, PBR colours, `extras`; metres convention) | N | N |
| **DXF** | L · AC (embedded ACIS) · A | P · OW · P5 (2D/3D curves) | P · OW · P5 (3DFACE/mesh `(bg)`) | P · OW · P5 (blocks) | P · OW · P5 (layers, colours, units) | graph: P · OW · P5 (drawing dimensions as graphics) | N |
| **DWG** | L · OD · A | L · OD/GP · A | L · OD · A | L · OD · A | L · OD · A | L · OD · A | N |
| **IFC** | P · WI · - (not a mechanical target) | P · WI · - | S · WI · - | S · WI · - | S · WI · - | N | N |
| **Native proprietary** | L · CS/CL · A | L · CS/CL · A | L · CS/CL · A | L · CS/CL · A | L · CS/CL · A | L · CS/CL · A | L · vendor API only · A |
| **Our JSON** | S (by regeneration) | S | S (cached, optional) | S | S | S (when our PMI model exists) | **S** |

### 6.3 Matrix: import (file to our model)

Imported geometry becomes a non-parametric ("dumb") body in our core. Level 7 is never recovered from
neutral formats.

| Format | 1 Exact solid B-rep | 2 Surface geometry | 3 Tessellated | 4 Assembly structure | 5 Metadata | 6 PMI/GD&T (sem / graph) | 7 Feature history |
|---|---|---|---|---|---|---|---|
| **STEP AP242** | S · OB · P5 | S · OB · P5 | S · OB · P5 (`read.step.tessellated` default On) | P · OB (structure) · S with OX `STEPCAFControl_Reader` · P5 | S · OX · P5 (names, colours, layers, materials, validation props, user attributes) | sem: P · OX · P5 (dimensions, tolerances, datums; limits [I01]). graph: P · OX · P5 (polylines/tessellated; no character text) | N |
| **STEP AP214 / AP203** | S · OB · P5 | S · OB · P5 | P · OB · P5 | P/S · OB/OX · P5 | S · OX · P5 | sem: N. graph: P · OX · P5 (AP214 legacy) | N |
| **IGES 5.3** | P · OX · P5 (186 if present; else sew surfaces) | S · OX · P5 | N | N | P · OX · P5 | N | N |
| **FCStd** | S · OB (BREP) + ZP · P5 | S · OB + ZP · P5 | N | P · ZP + OW · P5 (FreeCAD object tree) | P · OW · P5 (colours from GuiDocument.xml) | N | N (FreeCAD-specific; not mapped) |
| **Parasolid XT** | L · PS · A | L · PS · A | L | L · PS · A | L · PS · A | N | N |
| **ACIS SAT/SAB, SMT** | L · AC · A | L · AC · A | N | L · AC · A | L · AC · A | N | N |
| **JT** | L · JT · A | L · JT · A | L · JT · A (P · OW conceivable for LOD meshes, large effort) | L · JT · A | L · JT · A | L · JT · A | N |
| **3D XML** | N | N | L · CS · A | L · CS · A | L · CS · A | N | N |
| **Rhino 3DM** | P · R3 · P5 (openNURBS to OCCT mapping) | S · R3 · P5 | S · R3 · P5 | P · R3 · P5 | S · R3 · P5 | N | N |
| **STL** | N | N | S · OB · P5 | N | N | N | N |
| **OBJ** | N | N | S · OX/OW · P5 | P | P | N | N |
| **3MF** | N | N | S · 3M/OW · P5 | P · P5 | S · P5 | N | N |
| **glTF/GLB** | N | N | S · OX/OW · P5 | S · P5 | P · P5 | N | N |
| **DXF** | L · AC · A | P · OW · P5 | P · OW · P5 | P · OW · P5 | P · OW · P5 | graph: P · OW · P5 | N |
| **DWG** | L · OD · A | L · OD/GP · A | L · OD · A | L · OD · A | L · OD · A | L · OD · A | N |
| **IFC** | P · WI · - | P · WI · - | S · WI · - | S · WI · - | S · WI · - | N | N |
| **Native proprietary** | L · CS/CL · A | L | L | L | L | L | L (vendor API only) |

### 6.4 Matrix notes

1. "S · OB · P1" for STEP AP242 B-rep means the writer classes are present. Correctness of the
   AP242 header, units and colour placement has **not** been verified in WASM. The Phase 1
   acceptance should include validation with the NIST STEP File Analyzer and Viewer [I21] (not run
   here) and re-import into at least one commercial system.
2. Semantic PMI export through OCCT requires that our core first represent GD&T. The matrix marks the
   library path only.
3. Tessellated STEP export (AP242 tessellated entities) is documented in OCCT [I01]. It is listed as
   P5 because exact B-rep is the Phase 1 target and receiving support varies `(bg)`.
4. For mesh formats, OCCT's `BRepMesh` produces the triangulation. Units must be written explicitly
   where the format allows (3MF `unit`) or documented (STL unitless, glTF metres).

---

## 7. Authorised pathways for proprietary native formats

| Pathway | What it gives | Requirements and limits | Approval |
|---|---|---|---|
| **Ask the user to export STEP AP242 from the source system** | Best neutral fidelity, no cost to us | The user needs the source system. Some systems license AP242/PMI separately (NX AP242 translator [S09], SOLIDWORKS MBD [S03], CATIA FTA/ST1 [S11]) (snippets) | None. **Default recommendation** |
| **SOLIDWORKS API** (`SaveAs` to STEP etc.) | Native read with full fidelity, export to neutral | Needs an installed, licensed SOLIDWORKS `(bg)`. **Document Manager API** reads/writes documents without SOLIDWORKS installed but needs a key issued to subscription customers, renewed per major release, with functional categories [S27] (snippet) | Requires approval |
| **Inventor API** (TranslatorAddIn, STEP translator CLSID sample) | Native read, STEP/other export | Needs Inventor (or Inventor Server/Apprentice contexts, scope unclear) [S47] (snippet). APS Design Automation for Inventor runs this in the cloud [S47] (snippet) | Requires approval |
| **NX Open** | Full NX access | Needs licensed NX. Journals may run without a developer licence, per a forum post [S46] (snippet, low confidence) | Requires approval |
| **Creo TOOLKIT / Object TOOLKIT** | Full Creo access | TOOLKIT licence and unlock for distribution [S46] (snippet) | Requires approval |
| **CATIA CAA (RADE)** | Full CATIA access | Dassault developer licence. No public detail found | Requires approval |
| **Onshape REST translation API** | Import natives (CATIA, SOLIDWORKS, Inventor, NX, Creo, Solid Edge, Parasolid, JT, ACIS) and export STEP/Parasolid/glTF/etc. [I23, I24] | Authenticated calls (API keys or OAuth). Asynchronous jobs with polling or webhooks. `GET /translations/translationformats` lists formats [I24]. Uploads user data to a third-party cloud. Account and plan terms not stated on the API page [I24] | Requires approval (paid service, data residency) |
| **Autodesk Platform Services Model Derivative** | 60+ input formats to SVF/SVF2 viewables and outputs including STEP, IGES, STL, OBJ, IFC, DWG, FBX, depending on input [S26] (snippet). Live list via the formats endpoint | Autodesk account, cloud credits/pricing, data leaves the browser. Official pages are JS-rendered and were not readable [N05, N06] | Requires approval |
| **Commercial SDKs** (HOOPS Exchange, CAD Exchanger, Datakit CrossManager/CrossCad Ware, Spatial 3D InterOp, Open Cascade commercial components) | Direct native reading, often PMI. Some offer web viewers (CAD Exchanger Web Toolkit needs server-side SDK/CLI conversion [S28]; ODA has WASM inWEB products [S20]) | Proprietary licences, revenue-tiered or OEM pricing [S28, S30] (snippets) | Requires approval |

Recommendation: Phase 5 should start with **guided export instructions** (no dependency). Evaluate
one cloud API only if users need native import and the coordinator approves the cost and the
data-handling terms.

---

## 8. Automatic format detection

### 8.1 Principles

- Detect by **content first, extension second**. Read the first 4 KB (and for ZIP, the central
  directory). Extensions break ties and steer diagnostics.
- Run detection in the worker before handing data to OCCT. Never pass an unrecognised binary to a
  text parser.
- Report the detected format, version (if known), and the decision (supported, unsupported,
  needs-approval path) to the user. Do not attempt a "best effort" parse of proprietary binaries.

### 8.2 Signature table

| Format | Signature / rule | Version detail | Confidence |
|---|---|---|---|
| **STEP Part 21** | First non-whitespace token `ISO-10303-21;`, then `HEADER;` with `FILE_DESCRIPTION`, `FILE_NAME`, `FILE_SCHEMA` [I18] | `FILE_SCHEMA` name: `AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF` (AP242; edition from the ASN.1 id [I16, I17]), `AUTOMOTIVE_DESIGN` (AP214 [I18]), `CONFIG_CONTROL_DESIGN` (AP203 ed1 `(bg)`), `AP203_CONFIGURATION_CONTROLLED_3D_DESIGN_..._MIM_LF` (AP203 ed2 `(bg)`), `IFC2X3`/`IFC4`/`IFC4X3` route to IFC `(bg)` | High for structure; schema strings partly bg |
| **STEP compressed / ZIP** | `.stpZ` or Part 21 ed3 ZIP archive (ed3 adds ZIP-based compression [I18]; CAx-IF compression practice [I15]); gzip magic `1F 8B` `(bg)` | Unwrap, then re-detect | Medium |
| **STEP XML (Part 28)** | XML root in the ISO 10303-28 namespace `(bg)` | Rare. Report unsupported | Low |
| **IGES** | ASCII, 80-column records. Column 73 holds the section letter `S`, `G`, `D`, `P`, `T`. Columns 74 to 80 hold the sequence number. First record is `S` (`0000001`). Last is `T` [S41] (snippet), [I19] | IGES version flag in Global section `(bg)` | High |
| **STL binary** | File size equals `84 + 50 * uint32LE@80` [S25] | - | High |
| **STL ASCII** | Starts `solid`, contains `facet normal` / `endsolid`, and is **not** a binary size match [S25] | - | High |
| **OBJ** | Text lines beginning `v `, `vn `, `vt `, `f `, `o `, `g `, `usemtl`, `mtllib`, `#` `(bg)` | - | Medium (heuristic) |
| **glTF JSON** | JSON object with `"asset"` and `"version": "2.0"` `(bg)` | `asset.version` | High |
| **GLB** | Bytes `67 6C 54 46` ("glTF"), uint32 version `2`, uint32 length [S24] | Version field | High |
| **ZIP containers** | `50 4B 03 04` `(bg)`, then inspect entries: | | |
| - 3MF | `[Content_Types].xml`, `_rels/.rels`, a `.model` part (usually `3D/3dmodel.model`) [I33] | Model namespace | High |
| - FreeCAD FCStd | `Document.xml` (+ `GuiDocument.xml`, `*.brp`) [S15] | `SchemaVersion`/`ProgramVersion` attributes `(bg)` | High |
| - 3D XML | `Manifest.xml` + `.3DRep`/`.3DXML` entries [S34] (forum-level) | - | Low |
| - Fusion F3Z | `.f3d` entries + JSON manifest [S37] (snippet). F3D itself: proprietary archive | - | Low |
| - Zipped native assemblies | e.g. SOLIDWORKS Pack and Go (Onshape requires zipped assemblies [I23]): list contained extensions and diagnose each | - | Medium |
| **OLE compound file (CFB)** | `D0 CF 11 E0 A1 B1 1A E1` [S31, S32] | Root CLSID / stream names: Inventor storages `RSeStorage`, `RSeEmbeddings` [S32]. SOLIDWORKS (pre-2015) streams such as `Contents`, `swXmlContents` [S31]. Solid Edge (likely CFB `(bg)`) | Medium. Distinguish by extension when streams are inconclusive |
| **SOLIDWORKS 2015+** | PRONOM fmt/1967 pattern at offset 4 [I41] | `V E R S I O N _` spaced text per TransMagic [I42] | Medium |
| **CATIA V5** | `V5_CFV2` at offset 0 (`56 35 5F 43 46 56 32 00 00`) [S33, I42] | Release string "V5" search [I42] | Medium-high |
| **NX** | Leading `UGII` [I42] | - | Low (single secondary source) |
| **Creo / Pro/E** | Leading `#UGC:` [I42] | - | Low (single secondary source) |
| **Parasolid text `.x_t`** | ASCII lines `**PART1`, `**PART2`, `**PART3`, `**END_OF_HEADER`, `APPL=`, `FORMAT=`, `SCH=` [I40] | `SCH=` schema id | Medium |
| **Parasolid binary `.x_b`** | Not verified. Rely on extension plus absence of other signatures `(verify)` | - | Low |
| **ACIS SAT** | Text. First line numeric (save version, counts). Second line product and ACIS version strings `(bg)` | Save version from first number `(bg)` | Low |
| **ACIS SAB / SMB** | Binary. Extension-based `(bg)` | - | Low |
| **JT** | 80-byte ASCII version text at offset 0 such as `Version 9.5 JT` `(bg)`. Header holds version and TOC location [I39] | Version text | Low-medium |
| **Rhino 3DM** | ASCII preamble `3D Geometry File Format` followed by the version `(bg)`. Prefer `rhino3dm.js` detection | Version number | Medium |
| **DXF ASCII** | Group-code pairs: `0`/`SECTION`, `2`/`HEADER`, optional leading `999` comments. `$ACADVER` gives `AC10xx` [S36] | `$ACADVER` | High |
| **DXF binary** | Sentinel `AutoCAD Binary DXF` [S36] (PRONOM) | - | Medium |
| **DWG** | First six bytes `AC10xx` (`AC1015`, `AC1018`, `AC1021`, `AC1024`, `AC1027`, `AC1032`) [S22] | Code-to-release map [S22] | High |
| **Our JSON** | JSON with our schema identifier and version (define in our spec) | Schema version | n/a |

### 8.3 Detection order (proposal)

1. Empty or tiny file: error.
2. Binary magic: GLB, ZIP, CFB, gzip, `V5_CFV2`, `AC10xx` (DWG), DXF binary sentinel.
3. Binary STL size rule.
4. Text: STEP (`ISO-10303-21;`), then schema routing (AP203/214/242, IFC). IGES (column-73 rule on
   the first lines). DXF group codes. Parasolid `**PART1`. JSON (our format, glTF). OBJ heuristics.
   ASCII STL. Creo `#UGC:`. NX `UGII`. SAT numeric first line.
5. Fallback to extension, used only to choose the diagnostic message.

### 8.4 User-facing diagnostic messages (draft wording)

These are proposals for help/troubleshooting content. Final IDs follow the help rules (`cad.import.*`).

| Situation | Message |
|---|---|
| Recognised proprietary native (CATIA, SOLIDWORKS, NX, Creo, Inventor, Solid Edge, Fusion F3D) | "This is a {System} {kind} file ({version if known}). Its format is proprietary and cannot be opened here. In {System}, use Save As or Export to **STEP AP242** (`.stp`/`.step`) and import that file. If you cannot access {System}, your organisation may use the vendor's own API or an authorised conversion service." |
| Parasolid / ACIS / JT recognised | "This is a {Parasolid XT / ACIS SAT / JT} file. Reading it needs a licensed translator that this application does not include. Export STEP AP242 from the originating system instead." |
| DWG | "This is an AutoCAD DWG drawing ({release}). DWG is proprietary. Save it as DXF or export the 3D model as STEP AP242." |
| STEP with unsupported or unknown schema | "This STEP file uses schema {name}. It may import with missing data. Geometry is checked after import. Names, colours or PMI may be incomplete." |
| STEP AP203/AP214 with PMI expected | "This file uses {AP203/AP214}. Only geometry, assembly structure and styling are read. For tolerances and annotations, export STEP AP242 with PMI from the source system." |
| IFC routed from a STEP header | "This is an IFC building model ({schema}), not a mechanical STEP file. It is not supported in the CAD tool." |
| Mesh formats imported (STL/OBJ/3MF/glTF) | "This file contains a triangle mesh, not exact geometry. It will import as a reference mesh. It cannot be used for features that need exact faces. {Units note: STL has no units. Assumed {unit}.}" |
| Zipped assembly of natives | "This archive contains {n} {System} files. Native formats are not supported. Export the assembly as a single STEP AP242 file." |
| Unknown | "The file type could not be identified. Supported: STEP (`.stp`, `.step`), {others as enabled}." |

The messages must not name a specific commercial service as endorsed. Any such pointer needs approval.

---

## 9. Test model sources and licences

| Source | Content | Licence / terms (as found) | Use for us |
|---|---|---|---|
| **NIST MBE PMI test cases** (FTC-06 to FTC-11, CTC-01 to CTC-05, STC, HTC, MTC) | Native CATIA V5, NX, Inventor, Creo and SOLIDWORKS MBD models. STEP AP242 and AP203 for FTC/CTC. AP242 for STC. Two assemblies (FTC 07 to 10; CTC 02 + 04) [I20, I21] | "The test cases, CAD models, and STEP files can be used without any restrictions". Acknowledgement requested. No endorsement implied. NIST logo not to be used [I20, I21]. As US government work it is likely public domain `(bg)`, but the page itself does not use that phrase [I20] | **Primary** STEP AP242 import and PMI test corpus. Can be committed with acknowledgement (coordinator to confirm) |
| **NIST STEP File Analyzer and Viewer (SFA)** | Validates AP242 files, compares PMI with test case definitions [I21] | NIST software (terms not read here) | Phase 1 export validation tool (run by developer, not shipped) |
| **CAx-IF test rounds / STEP file library** | Synthetic and production AP242 test cases. A STEP file library described as "publicly accessible" in test-suite documents [S42] (snippet). Member area exists (legacy) | Not confirmed. Exact location and terms not found | Use test-suite PDFs as specs. Confirm the terms before committing any file |
| **ABC dataset** (1M Onshape models) | Parametric-surface CAD models (STEP and others `(bg)`) | Dataset release MIT, but **copyright in models belongs to their creators**, subject to Onshape Terms of Use §1.g.ii [S43] (snippet) | **Licence check required** before committing files. Fine for local, uncommitted robustness testing if approved |
| **Fusion 360 Gallery dataset** | Fusion designs (STEP etc.) for research | **Non-commercial research only**. No full redistribution. Terminable [I44] | **Not suitable** for a commercial product's committed test suite. Requires approval even for internal use |
| **FreeCAD sample files** | Example `.FCStd` documents shipped with FreeCAD `(bg)` | Not confirmed. FreeCAD code is LGPL2+ [S40]. FreeCAD Assets repo is CC-BY-SA-4.0 [S40] | Licence check per file. Prefer models we create ourselves in FreeCAD |
| **GrabCAD community** | Large user library | Terms grant limited rights. Redistribution of others' submissions is not permitted without owner permission (2013 summary) [S44] (snippet) | **Do not redistribute** or commit. Local manual testing only, with care |
| **Self-made models** | Our own JSON models exported to every target format | Ours | Golden files for regression tests |

---

## 10. Phase recommendations

### Phase 1: STEP AP242 export of exact solids with names, units and colours

1. Build an XCAF document in the worker. One label per body (`XCAFDoc_ShapeTool`), names via
   `TDataStd_Name`, colours via `XCAFDoc_ColorTool` at solid level, length unit via
   `XCAFDoc_LengthUnit` [I07].
2. Set `write.step.schema` to AP242 (value 5 / `AP242DIS`) and call `Model(true)` as the OCCT docs
   require [I01]. Set `write.step.unit` to match the model.
3. Use `STEPCAFControl_Writer` with name and colour modes on [I01].
4. Verify (implementation work, not done here): the `FILE_SCHEMA` string and ASN.1 id in the output
   header, SFA analysis [I21], re-import into OCCT, and import into at least one of Onshape, FreeCAD
   or a commercial viewer. Volumes and centroids should match. Optionally write validation
   properties for the receiver to check [I01, I15].
5. Record OCCT/opencascade.js as LGPL dependencies in `docs/dependencies.md` if not already there
   (coordinator task).

### Phase 5: expanded interoperability (ordered by value per effort)

1. STEP import with XDE (`STEPCAFControl_Reader`): names, colours, assembly.
2. Tessellated exports: glTF (`RWGltf` or own writer), 3MF (own writer or lib3mf), OBJ. Keep STL.
3. IGES import/export (bind OCCT IGES; serialise calls).
4. FCStd shape import (BREP + ZIP).
5. 3DM export/import via rhino3dm.js (geometry mapping work).
6. Semantic PMI (requires PMI in our core first, then `XCAFDoc_DimTolTool`).
7. DXF 2D drawing export (own writer).
8. Anything in the "requires approval" column: Parasolid, ACIS, JT, DWG, native formats, cloud APIs.
   Coordinator decision with cost, licence and data-handling review.

---

## 11. Open questions for the implementation to verify

1. Which OCCT version is inside `replicad-opencascadejs` 1.1.0, and does its AP242 writer emit the
   expected schema and edition identifier?
2. Does replicad's `exportSTEP` already set names and colours (source reading needed, since the docs
   page for `ShapeConfig` returned 404)?
3. WASM binary size impact of adding `STEPCAFControl_Reader`, IGES and `RWGltf` bindings.
4. Rhino 8 IGES export status (absent from the English export index at access time [I28]).
5. Exact signatures for Parasolid `.x_b`, ACIS SAT/SAB, JT and 3DM. Test them with real files
   from authorised sources before shipping detection rules.
6. CAx-IF STEP file library location and terms of use.
