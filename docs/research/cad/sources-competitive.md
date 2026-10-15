# Sources: Competitive CAD Feature Research

Companion to `competitive-feature-matrix.md`. Every source consulted during this research pass is listed here.

- **Date accessed for all entries:** 2026-10-14
- **Method:** web search plus fetching of public pages only. No login-only, paywalled or proprietary material was accessed. When a page redirected to a login, it is listed as "not accessed".
- **Read-depth legend**
  - **Full**: the page was fetched and its main content was processed. The fetch tool returns a model-generated digest of the whole page, not a verbatim copy, so these are "read in full via fetch digest".
  - **Partial**: the page was fetched but only part of it was usable, or the fetch returned mainly navigation.
  - **Snippet**: seen only as a search-result summary. Not fetched. Claims that rest only on these are marked `(snippet)` in the matrix.
  - **Not accessed**: the fetch failed (404, 403, bot protection or login wall).
- **Background knowledge:** some statements in the matrix come from the author's general domain knowledge and were not re-verified this session. They are marked `(bg)` and should be treated as lower confidence until checked against a primary source.

## A. Read in full (fetched, main content processed)

| ID | Title / description | URL | Depth |
|---|---|---|---|
| R01 | Wikipedia, "Geometric modeling kernel" (kernel to CAD system mapping) | https://en.wikipedia.org/wiki/Geometric_modeling_kernel | Full |
| R02 | Siemens, "Synchronous technology" overview page | https://www.siemens.com/en-us/technology/synchronous-technology/ | Full |
| R03 | Digital Engineering 24/7, "Siemens PLM introduces history-free, feature-based modeling" (April 2008) | https://www.digitalengineering247.com/article/siemens-plm-introduces-history-free-feature-based-modeling | Full |
| R04 | Autodesk Inventor 2022 Help, "About Rules and Forms in iLogic" | https://help.autodesk.com/cloudhelp/2022/ENU/Inventor-iLogic/files/GUID-EF53484C-D750-41F8-9AB1-032B73BB071F.htm | Full |
| R05 | PTC Creo 7.0 What's New, "Multibody Part Design - Flexible Modeling" | https://support.ptc.com/help/creo/creo_pma/r7.0/usascii/whats_new_pma/multibody-flexible_modeling.html | Full |
| R06 | SOLIDWORKS blog, "Top 10 Tips & Tricks for Working With Large Assemblies" | https://blogs.solidworks.com/products/solidworks/top-10-tips-tricks-for-working-with-large-assemblies | Full |
| R07 | Autodesk Inventor 2020 Help, "About 3D Annotation and Model-Based Definition" | https://help.autodesk.com/cloudhelp/2020/ENU/Inventor-Help/files/GUID-B8779786-A71C-4A5C-B9A9-7EB1A9918946.htm | Full |
| R08 | PTC Creo+ Help, "About the Creo Unite Technology" | https://support.ptc.com/help/creo/creo_plus/usascii/data_exchange/creo_unite/About_PTC_Creo_Unite.html | Full |
| R09 | Autodesk Inventor 2018 API Help, "Getting Started with Inventor's API" | https://help.autodesk.com/cloudhelp/2018/ENU/Inventor-API/files/GettingStarted.htm | Full |
| R10 | DEVELOP3D, "Multicore for CAD" (vendor statements on parallelism) | https://develop3d.com/cad/multicore-for-cad/ | Full |
| R11 | Open CASCADE Technology reference, class `TNaming` | https://occt3d.com/dev/doc/refman/html/class_t_naming.html | Full |
| R12 | OpenCascade.js, "About" | https://ocjs.org/docs/about | Full |

## B. Fetched but not usable / not accessed

| ID | Title / description | URL | Result |
|---|---|---|---|
| X01 | Wikipedia, "Topological naming problem" | https://en.wikipedia.org/wiki/Topological_naming_problem | Not accessed (HTTP 404) |
| X02 | FreeCAD Wiki, "Topological naming problem" | https://wiki.freecad.org/Topological_naming_problem/en | Not accessed (bot-protection page) |
| X03 | SOLIDWORKS 2025 Help, "Design Table Configurations" | https://help.solidworks.com/2025/English/SolidWorks/Sldworks/c_Design_Table_Configurations.htm | Partial (only navigation returned) |
| X04 | SOLIDWORKS 2016 Help, "Sketch Geometry Status" | https://help.solidworks.com/2016/English/SolidWorks/Sldworks/c_Sketch_Geometry_Status.htm | Partial (only navigation returned) |
| X05 | SOLIDWORKS API Help, `IModelDocExtension::GetPersistReference3` (2020) | https://help.solidworks.com/2020/English/api/sldworksapi/SolidWorks.Interop.sldworks~SolidWorks.Interop.sldworks.IModelDocExtension~GetPersistReference3.html | Partial (only navigation returned) |
| X06 | PTC blog, "3 Ways to Keep Large Assemblies from Slowing You Down" | https://www.ptc.com/en/blogs/cad/3-ways-to-keep-large-assemblies-from-slowing-you-down | Not accessed (HTTP 403) |
| X07 | Siemens Support KB PL8507807, partial vs full loading | https://support.sw.siemens.com/en-US/okba/PL8507807/Difference-between-Partial-and-Fully-loading-components/index.html | Not accessed (redirects to login) |
| X08 | PTC Creo tutorial, "Creo Flexible Modeling Description and Uses" | https://support.ptc.com/help/creo/creo_pma/usascii/tutorials_pma/Flex_Description_and_Uses_tut.html | Not accessed (redirect to 404) |
| X09 | OCCT 7.7 WebGL sample documentation | https://dev.opencascade.org/doc/occt-7.7.0/overview/html/occt_samples_webgl.html | Not accessed (redirect to 404) |
| X10 | Siemens Software, synchronous technology (old URL) | https://www.sw.siemens.com/en-US/technology/synchronous-technology/ | Redirected; content read via R02 |

## C. Search-result summaries only (snippet; not fetched)

Siemens Support KB articles (S46, S70, S93) appeared in search results with summaries. The KB normally needs login (see X07), so only the snippet text was used.

### Assemblies, large assemblies, configurations, top-down
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S01 | GoEngineer, "7 Ways to Improve SOLIDWORKS Large Assembly & Drawing Performance" | https://www.goengineer.com/blog/7-ways-improve-solidworks-large-assembly-drawing-performance | Snippet |
| S02 | SOLIDWORKS blog, "Large Assembly Tips & Tricks" (2017) | https://blogs.solidworks.com/tech/2017/04/large-assembly-tips-tricks.html | Snippet |
| S03 | Engineers Rule, "5 tips working large assemblies" | https://www.engineersrule.com/5-tips-working-large-assemblies/ | Snippet |
| S04 | SOLIDWORKS 2015 Help, simplified representations of assemblies | https://help.solidworks.com/2015/English/SOLIDWORKS/sldworks/t_simplified_representations_assemblies.htm | Snippet |
| S06 | PTC Support article CS29678 (shrinkwrap export) | https://www.ptc.com/en/support/article/CS29678 | Snippet |
| S07 | PTC Creo ModelCHECK Teacher, Simplified Representations | https://support.ptc.com/help/creo/creo_pma/r7.0/usascii/model_analysis/modelcheck/teacher/simprep.html | Snippet |
| S28 | SOLIDWORKS Help, "Design Table Configurations" (2017/2020) | https://help.solidworks.com/2020/English/SolidWorks/sldworks/c_Design_Table_Configurations.htm | Snippet |
| S29 | SOLIDWORKS 2015 Help, preparing an Excel file for a design table | https://help.solidworks.com/2015/English/SolidWorks/sldworks/t_preparing_excel_file.htm | Snippet |
| S30 | Autodesk University, "Getting Started Inventor Model States 2022" | https://www.autodesk.com/autodesk-university/article/Getting-Started-Inventor-Model-States-2022 | Snippet |
| S31 | Autodesk Inventor blog on model states | https://blogs.autodesk.com/inventor/?p=2056 | Snippet |
| S32 | PTC Creo Help r12, "About Assembly Functionality" (skeleton family tables) | https://support.ptc.com/help/creo/creo_pma/r12/usascii/assembly/asm/About_Assembly_Functionality.html | Snippet |
| S33 | PTC Windchill Help, family table structures | https://support.ptc.com/help/wnc/r12.0.2.0/en/Windchill_Help_Center/ProEWCIntegAHFamTableStruct.html | Snippet |
| S34 | Siemens NX Design blog, "Feature templates tips and tricks" | https://blogs.sw.siemens.com/nx-design/feature-templates-tips-and-tricks/ | Snippet |
| S35 | GrabCAD Q&A, WAVE geometry linker vs interpart link | https://grabcad.com/questions/what-is-the-difference-between-wave-geometry-linker-and-interpart-link-in-nx-7-5 | Snippet |
| S36 | Eng-Tips, NX WAVE links behaviour (Siemens PM comment on licensing) | https://www.eng-tips.com/threads/nx-wave-links-behaviour.414239/post-8182355 | Snippet |
| S37 | Dassault Systemes courseware PDF, "Skeleton" (publications) | https://www.3ds.com/fileadmin/Level-B/Japan/pdf/edu/Skeleton.pdf | Snippet |
| S38 | GoEngineer, "CATIA V5: Advanced Part and Assembly Design" course outline | https://www.goengineer.com/training/catia-v5-advanced-part-and-assembly-design | Snippet |
| S70 | Siemens Support KB on partial loading (summary in search result) | https://support.sw.siemens.com/en-US/okba/PL8507807/Difference-between-Partial-and-Fully-loading-components/index.html | Snippet |
| S71 | Eng-Tips, NX lightweight models threads | https://eng-tips.com/threads/nx7-lightweight-models.275308 | Snippet |
| S72 | PTC Windchill Help, "CGR Cache Management (CATIA V5)" | https://support.ptc.com/help/windchill/r13.1.2.0/en/Windchill_Help_Center/WWGMforCatiaV5/WGMCATIAV5AdvTechCGRCache.html | Snippet |
| S73 | Autodesk Inventor 2026 Help, "Create a Simplified Part from an Assembly" | https://help.autodesk.com/cloudhelp/2026/ENU/Inventor-Help/files/GUID-A106F1D6-2B7C-4BAB-9356-1DB87CA4767A.htm | Snippet |
| S74 | Autodesk Inventor blog, "Autodesk Inventor 2018: Model Simplification" | https://blogs.autodesk.com/inventor/autodesk-inventor-2018-model-simplification | Snippet |

### Direct modeling, synchronous, flexible modeling
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S05 | Manufacturing Management, synchronous technology "100-fold" claim (2008) | https://www.manufacturingmanagement.co.uk/content/news/siemens-plm-says-synchronous-technology-set-to-speed-complex-modelling-100-fold | Snippet |
| S08 | PTC Community, flexible modeling thread (references 2011 newsletter) | https://community.ptc.com/3d-part-assembly-design-327/flexible-modeling-54363 | Snippet |
| S64 | Dezignstuff, "Does SolidWorks do Direct Editing?" | https://dezignstuff.com/?p=9526 | Snippet |
| S65 | CADimensions, "What is SOLIDWORKS Instant3D?" | https://knowledge.cadimensions.com/knowledge/what-is-solidworks-instant-3d | Snippet |
| S66 | PTC User presentation PTC106 (Neumueller, 2015), Creo Flexible Modeling | https://www.ptcusercommunity.com/sejnu66972/attachments/sejnu66972/CommunityNetworkingDiscussions/836/1/PTC106_Neumueller_20150625_1731.pdf | Snippet |
| S67 | PTC Support, Creo Flexible Modeling Extension product page | https://support.ptc.com/products/creofmx/ | Snippet |
| S98 | Autodesk Inventor Ideas, "Direct editing of dimensions" | https://forums.autodesk.com/t5/inventor-ideas/direct-editing-of-dimensions/idi-p/8968464 | Snippet |

### Knowledgeware, automation, APIs
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S09 | Autodesk Inventor 2017 Help, "About iLogic Functionality" | https://help.autodesk.com/cloudhelp/2017/ENU/Inventor-Help/files/GUID-9372F2A9-377E-40AB-92AA-5FC371BACF8C.htm | Snippet |
| S10 | 3DSwym CATIA user community wiki, "CATIA Knowledge Advisor 2 (KWA)" | https://3dswym.3dexperience.3ds.com/wiki/catia-user-community/catia-knowledge-advisor-2-kwa_jKbzQs4hTpKtOxtpYIks5Q | Snippet |
| S11 | City, University of London mirror of CATIA V5 Knowledgeware glossary | https://www.staff.city.ac.uk/~ra600/ME2105/Catia%20course/CATIA%20Tutorials/kwrug_C2/kwruggl.htm | Snippet |
| S12 | GoEngineer, "CATIA V5: Knowledge-Based Engineering" course outline | https://www.goengineer.com/training/catia-v5-knowledge-based-engineering | Snippet |
| S17 | Siemens NX Open .NET reference (JournalLanguageType, ProgramInformation) | https://docs.plm.automation.siemens.com/data_services/resources/nx/12/nx_api/custom/en_US/nxopen_net/class_n_x_open_1_1_report_1_1_program_information.html | Snippet |
| S18 | PTC Community, "PTC Creo API" thread | https://community.ptc.com/t5/Customization/PTC-Creo-API/td-p/928197 | Snippet |
| S19 | PTC user presentation PTC119 (Kochar, 2015), Creo APIs | https://www.ptcusercommunity.com/sejnu66972/attachments/sejnu66972/CommunityNetworkingDiscussions/839/1/PTC119_Kochar_20150606_1929.pdf | Snippet |
| S20 | PTC Creo r10 Help, "Other Resources - Creo TOOLKIT Documentation" | https://support.ptc.com/help/creo/creo_pma/r10.0/usascii/introduction/toolkit_helppage.html | Snippet |
| S21 | COE, session recap on VBA and EKL in 3DEXPERIENCE | https://www.coe.org/Content-Center/Content-Center-Details/session-recap-unlocking-efficiency-quick-tips-and-tricks-using-vba-and-ekl-in-3dexperience | Snippet |
| S22 | Dassault Systemes, CAA RADE portfolio page | https://www.3ds.com/ko/products-services/catia/products/v5/portfolio/domain/CAA_RADE | Snippet |
| S23 | 3DSwym, CATIA best practices (EKL) | https://3dswym.3dexperience.3ds.com/post/catia-user-community/top-10-catia-best-practices-that-you-just-can-t-miss_Troxz2klRrijbE9yEXzjZw | Snippet |
| S68 | SOLIDWORKS API Help, persistent reference ID pages (2016-2024 family) | https://help.solidworks.com/2022/English/api/sldworksapi/SOLIDWORKS.Interop.sldworks~SOLIDWORKS.Interop.sldworks.IModelDocExtension~IGetPersistReference3.html | Snippet |
| S86 | Siemens NX Open Python reference, `RuleManager` (Knowledge Fusion) | https://docs.plm.automation.siemens.com/data_services/resources/nx/12/nx_api/custom/en_US/nxopen_python_ref/NXOpen.RuleManager.html | Snippet |
| S87 | DRWE training, NX Knowledge Fusion | https://drwe.de/en/trainings/siemens-nx-cad-tainings/nx-knowledge-fusion-basic-advanced | Snippet |
| S89 | Autodesk Inventor API Help, `ReferenceKeyManager.BindKeyToObject` | https://help.autodesk.com/cloudhelp/2025/ENU/Inventor-API/files/ReferenceKeyManager_BindKeyToObject.htm | Snippet |

### Kernels, topological naming, OCCT / WebAssembly
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S13 | TransMagic, "Which kernel" | https://transmagic.com/which-kernel | Snippet |
| S14 | Mun & Han, persistent naming and naming mapping (KoreaScience PDF) | https://koreascience.kr/article/JAKO200413842032898.pdf | Snippet |
| S15 | Agbodan et al., "A Topological Entity Matching Technique" (ICSMA 2003) | https://www.lias-lab.fr/publications/7076/2003-ICSMA-AGBODAN.pdf | Snippet |
| S16 | KAIST DSpace, survey of persistent naming mechanisms | https://dspace.kaist.ac.kr/handle/10203/171438 | Snippet |
| S24 | Hackster, "FreeCAD Hits 1.0 ... End to the Toponaming Problem" | https://hackster.io/news/freecad-hits-1-0-after-two-decades-finally-sees-an-end-to-the-toponaming-problem-7e7ac2df3e63 | Snippet |
| S25 | OpenCascade.js GitHub repository | https://github.com/donalffons/opencascade.js | Snippet |
| S26 | OCCT 7.3 reference, `TNaming_Evolution` | https://dev.opencascade.org/doc/occt-7.3.0/refman/html/_t_naming___evolution_8hxx.html | Snippet |
| S27 | OCCT 7.0 reference, `TNaming_Builder` | https://dev.opencascade.org/doc/occt-7.0.0/refman/html/class_t_naming___builder.html | Snippet |
| S50 | Siemens D-Cubed components fact sheet / DE247 Altair licensing D-Cubed | https://www.digitalengineering247.com/article/altair-expands-use-of-siemens-d-cubed | Snippet |
| S99 | Kripac, J. (1997) "A mechanism for persistently naming topological entities in history-based parametric solid models", Computer-Aided Design 29(2):113-122, DOI 10.1016/S0010-4485(96)00040-1. Known only from citations in S14/S16 reference lists. | https://doi.org/10.1016/S0010-4485(96)00040-1 | Snippet (citation only; paper not read) |

### Sheet metal, weldments, structures
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S39 | GoEngineer, SOLIDWORKS Sheet Metal and Weldments training | https://www.goengineer.com/training/solidworks-sheet-metal-weldments-course | Snippet |
| S40 | GoEngineer, "SOLIDWORKS Cut List Properties" | https://www.goengineer.com/en-us/blog/solidworks-cut-list-properties | Snippet |
| S41 | Javelin, "A Complete Guide to SOLIDWORKS Weldments" (2024) | https://www.javelin-tech.com/blog/2024/05/solidworks-weldments/ | Snippet |
| S42 | Autodesk Inventor 2017 Help, "Frame Generator overview" | https://help.autodesk.com/cloudhelp/2017/ENU/Inventor-Help/files/GUID-953F560A-C2D3-4031-8348-762054C7C779.htm | Snippet |
| S43 | Autodesk Inventor 2024 Help, "About Sheet Metal Flat Patterns" | https://help.autodesk.com/cloudhelp/2024/ENU/Inventor-Help/files/GUID-1B336854-4ED3-4C32-ADCB-E7A407485D80.htm | Snippet |
| S44 | PTC Creo r13 Help, "About Flat Pattern Features" | https://support.ptc.com/help/creo/creo_pma/r13/usascii/sheetmetal/sheetmetaldesign/about_flat_pattern_features.html | Snippet |
| S45 | PTC Creo+ What's New (May 2024), unbending and flat patterns | https://support.ptc.com/help/creo/creo_plus/usascii/whats_new/smt_unbending_and_flat_pattern.html | Snippet |
| S46 | Siemens Support KB PL8014212, sheet metal features after Flat Pattern | https://support.sw.siemens.com/en-US/okba/PL8014212/How-to-add-Sheet-Metal-features-after-the-Flat-Pattern-feature/index.html | Snippet |
| S47 | NX Open Python reference, `FlatPatternBuilder` | https://docs.plm.automation.siemens.com/data_services/resources/nx/12/nx_api/custom/en_US/nxopen_python_ref/NXOpen.Features.SheetMetal.FlatPatternBuilder.html | Snippet |
| S48 | GoEngineer, "CATIA V5: Generative Sheetmetal Design" course | https://www.goengineer.com/en-us/training/catia-v5-generative-sheetmetal-design | Snippet |
| S49 | 3DSwym wiki, "CATIA - Structure Design 1 (SR1)" | https://3dswym.3dexperience.3ds.com/wiki/catia-user-community/catia-structure-design-1-sr1_ik_lvG81Q0Whzkyg18dQBA | Snippet |

### Surfacing and freeform
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S51 | 3DSwym wiki, "CATIA ICEM Shape Design Center (ICM)" | https://3dswym.3dexperience.3ds.com/wiki/catia-user-community/catia-icem-shape-design-center-icm_KdxuUI1HRley97kxCN6w8A | Snippet |
| S52 | GrabCAD Q&A, GSD vs ICEM Shape Design | https://workbench.grabcad.com/questions/what-is-the-difference-between-gsd-and-icem-shape-design-workbench-in-catia | Snippet |
| S53 | GfxSpeak, "Siemens NX 9 beefs up synchronous technology, adds freeform design tools" | https://gfxspeak.com/?p=16432 | Snippet |
| S54 | Autodesk Inventor blog, "Unleash Your Imagination With Freeform Modeling" | https://blogs.autodesk.com/inventor/unleash-your-imagination-with-freeform-modeling | Snippet |
| S55 | PTC Creo r12 Help, "About the Style User Interface" | https://support.ptc.com/help/creo/creo_pma/r12/usascii/surfacing/style/About_the_Style_User_Interface.html | Snippet |
| S56 | PDSVISION, Creo Freestyle page | https://pdsvision.com/cad/creo/freestyle/ | Snippet |
| S88 | Loughborough University, ISDX teaching page | https://learn.lboro.ac.uk/ludata/cd/cad/mod_level3/isdx.htm | Snippet |

### GD&T, MBD, drawings
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S57 | 3DCS blog, SOLIDWORKS PMI and GD&T for DVA | https://blog.3dcs.com/solidworks-pmi-save-time-by-using-solidworks-pmi-and-gdt-for-dimensional-variation-analysis-dva | Snippet |
| S58 | PTC, Creo Model-Based Definition product page | https://www.ptc.com/en/products/cad/creo/model-based-definition | Snippet |
| S59 | GfxSpeak, "Latest Siemens NX software offers enhanced Model Based Definition" | https://gfxspeak.com/?p=54873 | Snippet |
| S75 | SOLIDWORKS Help, sketch states / sketch geometry status (2012-2019 pages) | https://help.solidworks.com/2019/english/SolidWorks/acadhelp/c_sketch_states_acadhelp.htm | Snippet |
| S76 | CADimensions, sketch troubleshooting guide | https://knowledge.cadimensions.com/knowledge/sketch-troubleshooting-guide | Snippet |
| S93 | Siemens Support KB PL8011000, inherited PMI to drawing sheet | https://support.sw.siemens.com/en-US/okba/PL8011000/Moving-Inherited-PMI-from-member-view-to-the-drawing-sheet/index.html | Snippet |
| S94 | NX Open Python reference, `InheritPmiViewStyle` | https://docs.plm.automation.siemens.com/data_services/resources/nx/12/nx_api/custom/en_US/nxopen_python_ref/NXOpen.Drawings.InheritPmiViewStyle.html | Snippet |
| S95 | Technia, CATIA 3D Functional Tolerancing & Annotation training | https://www.technia.com/en/training/catia-3d-functional-tolerancing-annotation/ | Snippet |
| S96 | GoEngineer, CATIA V5 FT&A course | https://www.goengineer.com/training/catia-v5-functional-tol-and-annotation | Snippet |
| S97 | Autodesk Inventor 2027 What's New, MBD enhancements | https://help.autodesk.com/cloudhelp/2027/ENU/Inventor-WhatsNew/files/INV2027-MDB.htm | Snippet |
| S100 | IMAGINiT course listing, "Autodesk Inventor: Working with 3D Annotations & Model-Based Definition" | https://www.imaginit.com/training/find-a-class-and-enroll/find-a-course/CourseId/2453 | Snippet |

### Interoperability, healing, data management, misc.
| ID | Title / description | URL | Depth |
|---|---|---|---|
| S60 | SOLIDWORKS blog, "3D Interconnect: Seamless Collaboration Between CAD Platforms" (2017) | https://blogs.solidworks.com/tech/2017/02/solidworks-3d-interconnect-seamless-collaboration-between-cad-platforms.html | Snippet |
| S61 | Autodesk Inventor blog, "AnyCAD Technology explained" | https://blogs.autodesk.com/inventor/?p=652 | Snippet |
| S62 | CADInterop, Inventor page | https://cadinterop.com/en/by-cad/cad-inventor.html | Snippet |
| S63 | Javelin, "SOLIDWORKS Import Diagnostics and Repairing Import Errors" | https://www.javelin-tech.com/blog/?p=29140 | Snippet |
| S77 | Datakit, STEP AP242 page | https://datakit.com/en/step_ap242.php | Snippet |
| S78 | PTC Creo r10 Help, "About Exchanging Graphical Semantic Annotation" | https://support.ptc.com/help/creo/creo_pma/r10.0/usascii/data_exchange/interface/About_Exchanging_Graphical_Semantic_Annotate.html | Snippet |
| S79 | GoEngineer, CATIA STEP exchange of PMI/composites (FR-CA) | https://www.goengineer.com/fr-CA/blog/catia-step-exchange-3d-models-with-pmi-or-composites-data | Snippet |
| S80 | SOLIDWORKS Workgroup PDM data sheet | https://www.solidworks.com/sw/docs/solidworks-workgroup-pdm-data-sheet.pdf | Snippet |
| S81 | INNEO, Windchill PDM Essentials | https://inneo.com/en/product-development/product-data-management-pdm-plm/windchill-pdm-essentials.html | Snippet |
| S82 | IBM Support note on CATIA boolean type vs Define In Work Object | https://www.ibm.com/support/pages/node/5228157 | Snippet |
| S83 | City, University of London mirror, CATIA Part Design "Intersecting Bodies" | https://staff.city.ac.uk/~ra600/ME2105/Catia%20course/CATIA%20Tutorials/prtug_C2/prtugbt1003.htm | Snippet |
| S84 | CIMdata, "PTC introduces PTC Creo 3.0 with Unite technology" | https://www.cimdata.com/de/industry-summary-articles/item/1545-ptc-introduces-ptc-creo-3-0-with-unite-technology-delivering-unparalleled-multi-cad-data-handling-capabilities | Snippet |
| S85 | PTC Creo Options Modeler Help, "About Opening Non-Native Models" | https://support.ptc.com/help/creo/creo_optm/r7.0/usascii/optm/options_modeler/About_Opening_Non_Native_Models.html | Snippet |
| S90 | PTC Creo+ Help, Import DataDoctor "About Repairing Geometry" | https://support.ptc.com/help/creo/creo_plus/usascii/data_exchange/impdatadoc/About_Repairing_Geometry.html | Snippet |
| S91 | PTC Creo+ Help, "About Diagnostics in Import DataDoctor" | https://support.ptc.com/help/creo/creo_plus/usascii/data_exchange/impdatadoc/About_diagnostics_in_IDD.html | Snippet |
| S92 | PTC/ThingWorx community, Creo multithreading feature request | https://community.thingworx.com/t5/3D-Part-Assembly-Design/Creo-Feature-Request-Multithreading/m-p/806764 | Snippet |

## D. Counts

| Read depth | Count |
|---|---|
| Full (fetched, main content) | 12 (R01-R12) |
| Partial (fetched, navigation only) | 3 (X03-X05) |
| Not accessed (404/403/bot/login) | 6 (X01, X02, X06-X09) plus 1 redirect (X10) resolved via R02 |
| Snippet only | 99 entries listed in section C (IDs are not contiguous; gaps are intentional) |

**Search effort:** about 30 web searches and 25 fetch attempts. Most of the competitive detail rests on search summaries of official help pages, so the matrix flags those claims as `(snippet)`. Before any claim is used externally, fetch the specific vendor help page for the release in question and confirm it.
