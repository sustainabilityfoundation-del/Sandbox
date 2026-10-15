# Sources: CAD Interoperability Research

Companion to `interoperability.md`. Every source consulted during this research pass is listed here.

- **Date accessed for all entries:** 2026-10-14
- **Method:** web search plus fetching of public pages only. No login-only, paywalled or proprietary
  material was accessed. Pages that redirected to a login, were blocked by bot protection or
  returned errors are listed under "Not accessed / unusable" and no claims rest on them.
- **Read-depth legend**
  - **Full**: the page was fetched and its main content was processed. The fetch tool returns a
    model-generated digest of the page, not a verbatim copy, so read this as "read in full via fetch digest".
  - **Partial**: fetched, but only part was processed (page truncated at the tool limit, or only
    part of the content was relevant or available).
  - **Snippet**: seen only as a search-result summary. Not fetched. Claims resting only on these are
    marked `(snippet)` in the main document and are **lower confidence**.
  - **Not accessed**: fetch failed (404, login redirect, bot protection, JavaScript-only shell).
- **Background knowledge:** statements marked `(bg)` in the main document come from the author's
  general domain knowledge and were not re-verified this session.
- No substantial text was reproduced. Content is paraphrased, apart from short identifiers (schema
  names, class names, byte signatures) and very short phrases.

## A. Fetched (Full or Partial)

| ID | Title / description | URL | Depth |
|---|---|---|---|
| I01 | OCCT 8.0.1 User Guide, STEP Translator (incl. XDE read/write, GD&T, schema parameter) | https://occt3d.com/dev/doc/overview/html/occt_user_guides__step.html | Full (two passes: 0 to 100k and 100k to end) |
| I02 | OCCT User Guide, IGES Translator | https://occt3d.com/dev/doc/overview/html/occt_user_guides__iges.html | Partial (first ~100k of ~112k characters) |
| I03 | OCCT User Guide, Data Exchange Wrapper (DE plugins table) | https://occt3d.com/dev/doc/overview/html/occt_user_guides__de_wrapper.html | Full |
| I04 | OCCT User Guide, Extended Data Exchange (XDE) | https://occt3d.com/dev/doc/overview/html/occt_user_guides__xde.html | Full |
| I05 | replicad repository, `packages/replicad-opencascadejs` README/directory | https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs | Partial (licence text not shown) |
| I06 | replicad-opencascadejs `build-config` directory listing | https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs/build-config | Full |
| I07 | replicad-opencascadejs `custom_build_single.yml` (binding symbols) | https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/build-config/custom_build_single.yml | Full (searched for data-exchange symbols) |
| I08 | replicad-opencascadejs `custom_build_multi.yml` | https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/build-config/custom_build_multi.yml | Full (searched for data-exchange symbols) |
| I09 | replicad-opencascadejs `package.json` (name, version 1.1.0, LGPL-2.1-only) | https://raw.githubusercontent.com/sgenoud/replicad/main/packages/replicad-opencascadejs/package.json | Full |
| I10 | OCCT LGPL exception text | https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/OCCT_LGPL_EXCEPTION.txt | Full |
| I11 | replicad API docs, `exportSTEP` | https://replicad.xyz/docs/api/functions/exportSTEP | Full |
| I12 | OpenCascade.js docs, Custom builds | https://ocjs.org/docs/app-dev-workflow/custom-builds | Full |
| I13 | occt-import-js repository README | https://github.com/kovacsv/occt-import-js | Full |
| I14 | MBx-IF / CAx-IF introduction | https://www.mbx-if.org/cax/cax_introduction.php | Full |
| I15 | CAx-IF Recommended Practices list | https://www.mbx-if.org/cax/cax_recommPractice.php | Full (list only; individual PDFs not read) |
| I16 | MBx-IF, EXPRESS schemas and ASN.1 identifiers | https://www.mbx-if.org/home/?p=613 | Full |
| I17 | STEP Tools, AP242 e3 programming notes (schema name, edition ids) | https://www.steptools.com/docs/stp_aim/notes_ap242e3.html | Full |
| I18 | Wikipedia, ISO 10303-21 | https://en.wikipedia.org/wiki/ISO_10303-21 | Full |
| I19 | Wikipedia, IGES | https://en.wikipedia.org/wiki/IGES | Full |
| I20 | NIST, MBE PMI validation and conformance testing (models, downloads, use terms) | https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-0 | Full |
| I21 | MBx-IF, NIST CAD Models and STEP Files (incl. SFA link) | https://www.mbx-if.org/home/?p=1310 | Full |
| I22 | Autodesk Inventor 2026 Help, Save As Export Options Reference | https://help.autodesk.com/cloudhelp/2026/ENU/Inventor-Help/files/GUID-68FCAD0E-93BD-4D90-B9FE-9CF82AA4E64D.htm | Full |
| I23 | Onshape Help, Supported File Formats | https://cad.onshape.com/help/Content/File/supported_file_formats.htm | Full |
| I24 | Onshape developer docs, Translation API | https://onshape-public.github.io/docs/api-adv/translation/ | Full |
| I25 | Autodesk Fusion Help, Supported file formats | https://help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/TPD-SUPPORTED-FILE-FORMATS.htm | Full (checkmark columns partly ambiguous in digest) |
| I26 | PTC Creo 12 Help, Exporting Part or Assembly to STEP | https://support.ptc.com/help/creo/creo_pma/r12/usascii/data_exchange/interface/Exporting_Part_or_Assembly_to_STEP.html | Full |
| I27 | PTC Creo 12 Help, About Interface Capabilities | https://support.ptc.com/help/creo/creo_pma/r12/usascii/data_exchange/interface/About_Interface_Capabilities.html | Full |
| I28 | Rhino 8 Help, Index of import/export file types | https://docs.mcneel.com/rhino/8/help/en-us/fileio/_index_of_import_export_file_types.htm | Full |
| I29 | rhino3dm repository README | https://github.com/mcneel/rhino3dm | Partial |
| I30 | openNURBS repository README | https://github.com/mcneel/opennurbs | Partial (licence file not shown) |
| I31 | lib3mf repository README | https://github.com/3MFConsortium/lib3mf | Partial |
| I32 | lib3mf documentation home | https://lib3mf.readthedocs.io/en/latest/ | Partial |
| I33 | 3MF Core Specification (GitHub markdown) | https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md | Partial |
| I34 | Khronos glTF 2.0 specification | https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html | Partial (first 100k of ~826k characters; GLB section not reached) |
| I35 | libdxfrw repository README (codelibs fork) | https://github.com/codelibs/libdxfrw | Full |
| I36 | Assimp repository README | https://github.com/assimp/assimp | Partial |
| I37 | Assimp `doc/Fileformats.md` | https://raw.githubusercontent.com/assimp/assimp/master/doc/Fileformats.md | Full |
| I38 | web-ifc repository README | https://github.com/ThatOpen/engine_web-ifc | Partial |
| I39 | Library of Congress, Sustainability of Digital Formats: JT (ISO 14306) | https://www.loc.gov/preservation/digital/formats/fdd/fdd000562.shtml | Full |
| I40 | Okino, Parasolid solutions page (x_t header description) | https://okino.com/solutions/parasolid.htm | Partial |
| I41 | The National Archives PRONOM, fmt/1967 SOLIDWORKS 2015+ | https://pronom.nationalarchives.gov.uk/fmt/1967.xml | Full |
| I42 | TransMagic, "What CAD format do I have here?" (header strings) | https://transmagic.com/what-cad-format-do-i-have-here/ | Full (vendor blog; secondary source) |
| I43 | Fusion 360 Gallery Dataset repository README | https://github.com/AutodeskAILab/Fusion360GalleryDataset | Partial |
| I44 | Fusion 360 Gallery Dataset `LICENSE.md` | https://raw.githubusercontent.com/AutodeskAILab/Fusion360GalleryDataset/master/LICENSE.md | Full |
| I45 | Wikipedia, Parasolid | https://en.wikipedia.org/wiki/Parasolid | Full |
| I46 | Wikipedia, ACIS | https://en.wikipedia.org/wiki/ACIS | Full |
| I47 | Wikipedia, ShapeManager | https://en.wikipedia.org/wiki/ShapeManager | Full |

## B. Search-result summaries only (Snippet, lower confidence)

| ID | Topic / principal pages in results | URL(s) | Depth |
|---|---|---|---|
| S01 | SOLIDWORKS 2025 Help, file types and Importing/Exporting documents (3D XML export-only, ACIS, IFC 2x3/4, IGES) | https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_File_Types.htm ; https://help.solidworks.com/2025/English/SolidWorks/Sldworks/c_Importing-Exporting_SOLIDWORKS_Documents.htm | Snippet (fetch returned navigation only, see N01/N02) |
| S02 | SOLIDWORKS 2018 What's New, enhanced import/export (Task Scheduler formats) | https://help.solidworks.com/2018/English/WhatsNew/c_enhanced_import_export.htm | Snippet |
| S03 | SOLIDWORKS Help, Exporting PMI to STEP 242 (MBD); CATI blog; forum on AP242 import | https://help.solidworks.com/2025/English/SolidWorks/Sldworks/t_MBD_step_242_pmi_export.htm ; https://www.cati.com/?p=122470 ; https://cadforum-net.dezignstuff.com/viewtopic.php?p=33172 | Snippet |
| S04 | Autodesk Inventor 2026 Help, About the Export Files Task | https://help.autodesk.com/cloudhelp/2026/ENU/Inventor-Help/files/GUID-D0551BB9-1DC5-4222-84A4-D1C840D835CF.htm | Snippet |
| S05 | Autodesk Inventor LT 2021 / Inventor 2014 Help, import/export version tables | https://help.autodesk.com/cloudhelp/2021/ENU/InventorLT-Help/files/GUID-AF41FA87-7588-4698-9C41-756A01EBE7F4.htm ; https://help.autodesk.com/cloudhelp/2014/ENU/Inventor/files/GUID-0D05C383-437E-4ED7-8B76-9572C03B3D37.htm | Snippet |
| S06 | ISO 10303-242:2025 (Edition 4) catalogue page; ISO/CD 10303-242 ballot | https://www.iso.org/standard/84300.html ; https://dps.gov.al/en/project/show/iso:proj:93277 | Snippet |
| S07 | ISO 10303-242:2022 listings (withdrawn 2025) | https://www.evs.ee/en/iso-10303-242-2022 ; https://online.standard.no/en/iso-10303-242-2022 | Snippet |
| S08 | STEP Tools AP214 notes (AP214 history and withdrawal) | https://steptools.com/docs/stp_aim/notes_ap214.html | Snippet |
| S09 | Siemens support KB articles on NX STEP AP242 (PMI convert, NX 1847 translator options, AP242 separate licence, density retention) | https://support.sw.siemens.com/en-US/okba/PL8698631/STEP-format-supported-by-PMI-convert-command/index.html ; https://support.sw.siemens.com/en-US/okba/PL8008020/New-Translator-Options-in-NX-January-Release-1847/index.html ; https://support.sw.siemens.com/en-US/okba/PL8010119/Deformable-part-result-in-an-assembly-level-body-when-doing-NX-to-STEP-export/index.html ; https://support.sw.siemens.com/en-US/okba/PL8003502/Need-to-retain-density-when-translating-data-to-a-neutral-format/index.html | Snippet (these KB pages may require login; not fetched) |
| S10 | Siemens KB, file formats that export PMI from Solid Edge | https://support.sw.siemens.com/en-US/okba/PL8008941/File-formats-that-support-export-PMI-information-from-Solid-Edge/index.html | Snippet |
| S11 | CATI blog, Export CATIA V5 parts with PMI using STEP AP242 (FTA/ST1 licences); 3DEXPERIENCE community questions | https://www.cati.com/blog/export-catia-v5-parts-with-pmi-using-step-ap242/ ; https://3dswym.3dexperience.3ds.com/question/catia-user-community/step-ap242-support-in-catia-v5-and-catia-3dexp_lI9MPkcVSTK1TZNPIdux5A | Snippet |
| S12 | cadinterop.com, CATIA V5 format overview | https://www.cadinterop.com/en/by-cad/cad-catia-v5.html | Snippet (third-party) |
| S13 | PTC Creo 11.0.4.0 What's New, STEP AP242 Edition 3 export; PTC article CS279094 | https://support.ptc.com/help/creo/creo_pma/r11.0/usascii/whats_new_pma/dex_step_ap242_e3.html ; https://www.ptc.com/en/support/article/CS279094 | Snippet |
| S14 | cadinterop.com, Solid Edge format overview | https://cadinterop.com/en/by-cad/cad-solid-edge.html | Snippet (third-party) |
| S15 | FreeCAD wiki, FCStd file format | https://wiki.freecad.org/Fcstd_file_format | Snippet (wiki fetch blocked, see N07) |
| S16 | FreeCAD wiki, Import Export and Manual: Import and export to other filetypes | https://wiki.freecad.org/Import_Export ; https://wiki.freecad.org/Manual:Import_and_export_to_other_filetypes | Snippet |
| S17 | Altair help, Supported File Formats (third-party format tables; not relied on for vendor claims) | https://2025.help.altair.com/2025/cast/en_us/topics/shared/unity_basics/file_formats_st_r.htm | Snippet |
| S18 | McNeel, openNURBS licence (MIT) and "what is openNURBS" | https://developer.rhino3d.com/license/ ; https://developer.rhino3d.com/guides/opennurbs/what-is-opennurbs/ | Snippet |
| S19 | GNU LibreDWG manual (GPLv3+, read coverage); Wikipedia | https://www.gnu.org/software/libredwg/manual/html_node/Overview.html ; https://en.wikipedia.org/wiki/LibreDWG | Snippet |
| S20 | Open Design Alliance 2025 brochure; ODA licence notices (members only) | https://www.opendesign.com/files/2025-05/Open%20Design%20Alliance%202025.pdf ; https://docs.omniverse.nvidia.com/kit/docs/omni.kit.converter.dgn/latest/Third_Party_Notices.html | Snippet |
| S21 | Siemens JT Open Program; JT Data Format patent clarification notice; JT ISO blog | https://plm.sw.siemens.com/en-US/plm-components/jt/jt-open-program ; https://www.plm.automation.siemens.com/media/global/it/Siemens-PLM-JT-Data-Format-Reference-Patent-Clarification-Notice-mi-X1_tcm56-58013.pdf | Snippet |
| S22 | Autodesk support, Drawing version codes for AutoCAD; CAD Forum; Tekla DWG/DXF | https://autodesk.com/es/support/technical/article/drawing-version-codes-for-autocad ; https://www.cadforum.cz/en/qaid.asp?ID=868 ; https://support.tekla.com/doc/tekla-structures/2024/int_dwg_and_dxf | Snippet |
| S23 | IANA media types model/vnd.parasolid.transmit.text and .binary | https://www.iana.org/assignments/media-types/model/vnd.parasolid.transmit.text ; https://ftp.iana.org/assignments/media-types/model/vnd.parasolid.transmit.binary | Snippet |
| S24 | PRONOM fmt/1316 (GLB signature); ISO/IEC 12113:2022 listing | https://pronom.nationalarchives.gov.uk/fmt/1316.xml ; https://www.vde-verlag.de/iec-normen/251059/iso-iec-12113-2022.html | Snippet |
| S25 | Wikipedia STL; Assimp and rviz STL loaders (binary detection) | https://en.wikipedia.org/wiki/STL_(file_format) ; https://docs.ros.org/en/melodic/api/rviz/html/c++/stl__loader_8cpp_source.html | Snippet |
| S26 | Autodesk Platform Services Model Derivative, supported translations; OutputType enum | https://aps.autodesk.com/en/docs/model-derivative/v2/supported-translations ; https://aps.autodesk.com/en/docs/model-derivative/v2/reference/dot-net-sdk/Autodesk.ModelDerivative.Model/OutputType | Snippet (official pages JS-rendered, see N05/N06) |
| S27 | SOLIDWORKS Document Manager API getting started; reseller licensing articles | https://help.solidworks.com/2025/English/api/swdocmgrapi/GettingStarted-swdocmgrapi.html ; https://support.hawkridgesys.com/hc/en-us/articles/360037482172-Requesting-A-Document-Manager-API-License-Key | Snippet |
| S28 | CAD Exchanger Web Toolkit and developer tools | https://cadexchanger.com/blog/which-cad-exchanger-developer-tools-are-right-for-me/ ; https://npmjs.org/package/@cadexchanger/web-toolkit | Snippet |
| S29 | Tech Soft 3D HOOPS Exchange / Communicator supported formats | https://docs.techsoft3d.com/communicator/latest/overview/supported-formats.html ; https://docs.techsoft3d.com/exchange/2024.8.0/start/supported-formats.html | Snippet |
| S30 | Datakit CrossManager converter pages (licensing options) | https://www.datakit.com/cad-convertors/catia-v5-3d-to-parasolid/2-10-1.html | Snippet |
| S31 | SLDPRT file format pages (compound file share, signature) | https://docs.fileformat.com/cad/sldprt ; https://filext.com/file-extension/SLDPRT | Snippet (third-party) |
| S32 | `file` mailing list, Inventor IPT as OLE2 compound document; Wikipedia COM Structured Storage | https://mailman.astron.com/pipermail/file/2023-August/001218.html ; https://en.wikipedia.org/wiki/COM_Structured_Storage | Snippet |
| S33 | CATPart signature `V5_CFV2` (docs.fileformat, docs.rs cadmpeg crate, PRONOM fmt/1615) | https://docs.fileformat.com/cad/catpart ; https://docs.rs/cadmpeg-codec-catia ; https://pronom.nationalarchives.gov.uk/fmt/1615 | Snippet |
| S34 | Wikipedia 3DXML; SketchUcation forum on 3D XML structure | https://en.wikipedia.org/wiki/3DXML ; https://community.sketchucation.com/post/956529 | Snippet |
| S35 | buildingSMART, IFC 4.3 approved / published as ISO 16739-1:2024 | https://www.buildingsmart.org/ifc-4-3-approved-as-a-final-standard/ | Snippet |
| S36 | Autodesk DXF Reference (group codes, header variables); PRONOM fmt/1391 binary DXF | https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-89CB823D-614D-4D1E-8204-568EC72DF869.htm ; https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm ; https://pronom.nationalarchives.gov.uk/fmt/1391 | Snippet |
| S37 | FileInfo F3D/F3Z; ezf3d reverse-engineering project (not a candidate) | https://fileinfo.com/extension/f3z ; https://fileinfo.com/extension/f3d ; https://gitblind.noratr.app/AlexSabaka/ezf3d | Snippet |
| S38 | Open Cascade commercial data exchange components (Advanced Data Exchange, Parasolid Import, 7.9.0 release) | https://old.opencascade.com/node/229 ; https://old.opencascade.com/node/231 ; https://dev.opencascade.org/content/open-cascade-added-value-components-v790-released | Snippet |
| S39 | OCCT forum, STEPCAFControl_Writer not writing sub-shape names and colours | https://dev.opencascade.org/content/stepcafcontrolwriter-not-writing-subshape-data-names-and-colors | Snippet |
| S40 | FreeCAD licensing (LGPL2+); FreeCAD Assets repository (CC-BY-SA-4.0) | https://gitblind.noratr.app/FreeCAD/Assets ; https://bugzilla.redhat.com/show_bug.cgi?id=1297263 | Snippet |
| S41 | IGES file organisation (Bentley help); Paul Bourke IGES notes | https://docs.bentley.com/LiveContent/web/OpenPlant%20Modeler%20Help-v10/en/GUID-26D258A1-0289-9A94-82CC-E26AFDDC099A.html ; https://paulbourke.net/dataformats/iges/ | Snippet |
| S42 | CAx-IF test suite documents (rounds 22J, 39J) | https://www.mbx-if.org/documents/test_suite_22j_v1.pdf ; https://www.mbx-if.org/documents/test_suite_39j_v12.pdf | Snippet |
| S43 | ABC dataset records (NYU archive; MIT for dataset, model copyright with creators); CVPR 2019 paper | https://archive.nyu.edu/handle/2451/44368 ; https://cims.nyu.edu/gcl/papers/2019-ABC-Dataset.pdf | Snippet |
| S44 | GrabCAD terms; GrabCAD 2013 terms-update blog | https://grabcad.com/terms ; https://blog.grabcad.com/blog/2013/07/03/almost-as-cool-as-3d-models-terms-of-service-update/ | Snippet |
| S45 | Onshape Terms of Use (public documents licence), Fabbaloo 2018 coverage | https://www.onshape.com/fr/legal/terms-of-use ; https://www.fabbaloo.com/blog/2018/8/15/onshape-tightens-licensing-for-free-users | Snippet |
| S46 | Creo TOOLKIT licence articles (PTC KB); NX Open journals (Eng-Tips) | https://www.ptc.com/support/article/CS282719 ; https://www.eng-tips.com/viewthread.cfm?qid=467838 | Snippet (low confidence) |
| S47 | Inventor API TranslatorAddIn object and Export to STEP sample; APS Design Automation for Inventor file types | https://help.autodesk.com/cloudhelp/2025/ENU/Inventor-API/files/TranslatorAddIn.htm ; https://help.autodesk.com/cloudhelp/2025/ENU/Inventor-API/files/TranslatorAddIn5_Sample.htm ; https://aps.autodesk.com/blog/list-supported-file-types-design-automation-inventor | Snippet |

## C. Not accessed / unusable (no claims rest on these)

| ID | Page | URL | Reason |
|---|---|---|---|
| N01 | SOLIDWORKS 2025 Help, File Types | https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_File_Types.htm | Fetch returned navigation shell only (JS-rendered) |
| N02 | SOLIDWORKS 2025 Help, Importing/Exporting SOLIDWORKS Documents | https://help.solidworks.com/2025/English/SolidWorks/Sldworks/c_Importing-Exporting_SOLIDWORKS_Documents.htm | Navigation shell only |
| N03 | SOLIDWORKS 2017 Help, Import and Export File Version Information | https://help.solidworks.com/2017/English/SolidWorks/sldworks/c_import_export_file_information.htm | Navigation shell only |
| N04 | SOLIDWORKS 2025 Help, import/export overview | https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_import_export_overview.htm | Navigation shell only |
| N05 | APS Model Derivative developer's guide, supported translations | https://aps.autodesk.com/en/docs/model-derivative/v2/developers_guide/supported-translations/ | JS-rendered; no content |
| N06 | APS Model Derivative reference, GET formats | https://aps.autodesk.com/en/docs/model-derivative/v2/reference/http/formats-GET/ | JS-rendered; no content |
| N07 | FreeCAD wiki, Import Export | https://wiki.freecad.org/Import_Export | Bot protection (Anubis) |
| N08 | Siemens KB, differences between Parasolid file formats | https://support.sw.siemens.com/en-US/okba/PL8658242/What-are-the-differences-in-Parasolid-file-formats/index.html | Redirected to login; not followed |
| N09 | openNURBS LICENSE file (raw, main branch) | https://raw.githubusercontent.com/mcneel/opennurbs/main/LICENSE | HTTP 404 (path differs) |
| N10 | replicad API docs, `ShapeConfig` interface | https://replicad.xyz/docs/api/interfaces/ShapeConfig | HTTP 404 |

Note: the first attempts at `dev.opencascade.org` documentation URLs returned 301 redirects to
`occt3d.com`. The redirected pages are listed as I01 to I04. The OCCT licensing page
(`dev.opencascade.org/resources/licensing`) redirected to a product page that was not fetched. The
exception text was read from the OCCT repository instead (I10).

## D. Counts

- Fetched: 47 (Full 35, Partial 12)
- Search-result summary only: 47 topic entries (several group 2 to 4 closely related pages)
- Not accessed / unusable: 10
