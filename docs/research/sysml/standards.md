# OMG Standards: KerML, SysML v2, Systems Modeling API and Services, v1-to-v2 Transformation

Tags: **Verified** means seen in a spec or official artifact that I read ([S-nn] at "read …" level). **Assumed** means inferred, from a secondary source, or from a search summary only. Sources are listed in [sources.md](sources.md).

## 1. Status and official locations

| Spec | Current formal version | Status and dates | OMG doc no. | Official URL | Revision in progress | Tag |
|---|---|---|---|---|---|---|
| KerML | 1.0 | Formal; OMG page shows publication Sep 2025 [S-23]. The SMC release states that all three specs were "formally adopted by OMG" as of 30 June 2025 and editorially updated in March 2026 for ISO submission [S-01] | formal/26-03-01 [S-23] | https://www.omg.org/spec/KerML/1.0 | KerML 1.1 RTF; **1.1 Beta 2 (Release 2026-07, Aug 2026)** in the release repo [S-03][S-18] | Verified |
| SysML | 2.0 (Part 1 Language, Part 2 Transformation) | Formal; Sep 2025 [S-22] | formal/26-03-02 (Language), formal/26-03-03 (Transformation) [S-22] | https://www.omg.org/spec/SysML/2.0 | SysML 2.1 RTF; 2.1 Beta 2 [S-03][S-19][S-20] | Verified |
| Systems Modeling API and Services | 1.0 | Formal; Sep 2025 [S-24] | formal/26-03-04 [S-24] | https://www.omg.org/spec/SystemsModelingAPI/1.0 | API 1.1 RTF; 1.1 Beta 2 [S-03][S-21] | Verified |
| History | Beta specs were adopted June 2023, followed by finalization task forces [S-01] | | | | | Verified |

Implication: target the **formal** 1.0/2.0 metamodel and libraries (2025-02-01 artifacts) for the first conformance baseline. Track the 1.1/2.1 Beta changes, which are mostly issue resolutions [S-03], as a later migration. The release-repo `master` already carries 1.1/2.1-dev libraries (`…-2.1.0-dev.20260801.kpar`) [S-06][S-27]. Pin fixtures to a tag. **Verified** (facts); recommendation is mine.

### Normative machine-readable artifacts (what is normative)
Every spec states that it comprises the document **plus the machine-readable files listed on its cover page**, and that the machine-readable files take precedence in a conflict ([S-18] Cl. 2, [S-19] Cl. 2, [S-21] Cl. 2). **Verified.**

| Spec | Artifact | URL (base) | Tag |
|---|---|---|---|
| KerML 1.0 | KerML.xmi (MOF abstract syntax), KerML.json (JSON schema of abstract syntax), KerML-Model-Interchange.json (KPAR metadata schema), Semantic-Library.kpar, Data-Type-Library.kpar, Function-Library.kpar | https://www.omg.org/spec/KerML/20250201/ [S-23] | Verified |
| SysML 2.0 | SysML.xmi, SysMLv1Tov2.xmi (transformation model), SysML.json, Systems-Library.kpar, plus 6 domain-library KPARs (Analysis, Cause and Effect, Geometry, Metadata, Quantities and Units, Requirement Derivation) | https://www.omg.org/spec/SysML/20250201/ [S-22] | Verified |
| API 1.0 | Systems-Modeling-API.xmi (PIM), OpenAPI.json (REST PSM, OAS 3.1), Schema.json (KerML+SysML+API JSON schemas), KerML/SysML OSLC shapes and vocab TTL | https://www.omg.org/spec/SystemsModelingAPI/20250201/ [S-24] | Verified |

Observed artifact quirk: OMG's `Systems-Library.kpar` stores `.project.json` and `.meta.json` under a `Systems Library/` folder rather than at the archive top level. It also contains macOS `.DS_Store` / `__MACOSX` entries, and its `.meta.json` index maps `AnalysisCases` to `AnalysisCase.sysml` while the file is named `AnalysisCases.sysml` [S-26]. The pilot 2026-04 release notes mention fixing "the `.meta.json` index in the standard library KPARs" [S-09]. A KPAR reader must be tolerant. **Verified** (observation).

## 2. KerML: language architecture and abstract syntax

| Topic | Content | Tag |
|---|---|---|
| Layers | **Root** (elements, relationships, annotations, packaging), **Core** (most general constructs with classification semantics, grounded in mathematical logic), **Kernel** (associations, behaviours, etc.; semantics given mostly by reuse of the Kernel Semantic Library written in KerML) [S-18] §6.1 | Verified |
| Normative parts | Clause 8 is normative: 8.2 concrete syntax (textual grammar), 8.3 abstract syntax (MOF model), 8.4 semantics. Clause 9: libraries. Clause 10: model interchange. Clause 7 (language description) is informative [S-18] §6.2 | Verified |
| Abstract syntax packages | Root: Elements and Relationships, Dependencies, Annotations, Namespaces. Core: Types, Classifiers, Features. Kernel: Data Types, Classes, Structures, Associations, Connectors, Behaviors, Functions, Expressions, Interactions, Feature Values, Multiplicities, Metadata, Packages [S-18] §8.3 TOC | Verified |

Key metaclasses, paraphrased from [S-18] §8.3 descriptions (**Verified**):

| Metaclass | Meaning (paraphrase) | Implementation note |
|---|---|---|
| Element | Uniquely identified constituent of a model; may own other elements via relationships; deleting it deletes what it owns | `elementId` is a string; UUID recommended |
| Relationship | Element relating other elements; related elements split into source and target; may own `ownedRelatedElement`s; a relationship can itself be owned | Ownership is **via relationships**, not direct containment. The repository must persist relationships as first-class rows |
| Namespace | Element containing members via Membership relationships; members may be owned, aliased or imported | Name resolution is defined on memberships, not on elements |
| Membership | Namespace–Element relationship carrying `memberName` / `memberShortName` and visibility; non-owning memberships act as aliases | |
| OwningMembership | Membership that owns its member element (`ownedMemberElement`) | The containment tree = chains of OwningMembership |
| FeatureMembership | OwningMembership between an owning Type and an owned member Feature; implies featuring (or snapshot featuring for variable features) | |
| Type | Namespace supporting classification; specialised by Classifier and Feature | |
| Classifier | Type classifying things (sequences of length one) and how features relate them | |
| Feature | Type whose instances are sequences relating things; has featuring types, direction, multiplicity | |
| Specialization | Specific type's instances ⊆ general type's instances | Subclasses: Subclassification (Classifier–Classifier), FeatureTyping (Feature → Type), Subsetting (Feature–Feature), Redefinition (special Subsetting; not separately read) |
| Conjugation | Conjugated type inherits original's features with in/out reversed | Ports in SysML |

Implied relationships: the interchange metadata has `includesImplied`, and elements have `isImpliedIncluded`. This means a tool must be able to **compute the implied specialisations** (for example, to library base types) or accept them already serialised [S-18] §10.3 notes 4–5. **Verified.**

## 3. SysML v2 Part 1: definition/usage, views, conformance

| Topic | Content | Tag |
|---|---|---|
| Relation to KerML | SysML abstract syntax extends KerML. Normative references include KerML 1.0, MOF 2.5.1, OCL 2.4, SMOF 1.0 and SysML v1.7 [S-19] Cl. 3 | Verified |
| Definition/usage pairs | Language description covers Definition and Usage (7.6), Attributes, Enumerations, Occurrences, Items, Parts, Ports (incl. conjugated), Connections, Interfaces, Allocations, Flows and Messages, Actions, States, Calculations, Constraints, Requirements, Cases, Analysis Cases, Verification Cases, Use Cases, Views and Viewpoints, Metadata [S-19] TOC | Verified |
| Notations | Concrete syntax = **textual** (8.2.2) + **graphical** (8.2.3). Graphical notation is specified with a graphical BNF that mixes graphical and textual elements [S-19] 8.2.3 | Verified |
| Views | Viewpoint def = kind of requirement def framing stakeholder concerns. View def = kind of part def specifying how to create a view artifact (view conditions via metadata filters + rendering). View usage **exposes** model content (an import ignoring visibility) and applies conditions and rendering. Views nest, for example into documents. Rendering def/usage are part defs/usages [S-19] 7.26.1 | Verified |
| Standard views | `StandardViewDefinitions` library package: General View, Interconnection View, Action Flow View, State Transition View, Sequence View, Geometry View, Grid View, Browser View. These "shall be supported by any tool conforming to the SysML graphical notation". User-defined views may go further [S-19] 9.2.20.1, Table 34 | Verified |
| Diagrams | "A diagram is a view" whose header is the view's name compartment. Representative diagram examples include General, Tree, Nested, Table and Matrix views [S-19] 7.26 / 8.2.3 | Verified |
| Diagram layout interchange | I found no diagram-interchange (layout geometry) format in the parts read. Views are model elements, but node positions are not part of the standard model | Assumed (absence in sections read) |

### SysML conformance points [S-19] Cl. 2 (Verified)
1. **Abstract Syntax Conformance**: CRUD on abstract-syntax instances plus validation of well-formedness constraints.
2. **Concrete Syntax Conformance**, with variants (a) **Textual Notation** and (b) **Graphical Notation**. Graphical conformance requires textual support at least as far as needed to render text in graphics.
3. **Semantic Conformance**: interpretation via analysis or execution.
4. **Model Interchange Conformance**: import/export as a KPAR per KerML Cl. 10, `.kpar` extension, `.sysml` text files, metamodel URI `https://www.omg.org/spec/SysML/yymmnn`.
5. **Domain Library Support** (optional).

Minimum for any conformant tool: Abstract Syntax plus Model Interchange. KerML has the same four (no domain libraries) [S-18] Cl. 2.

## 4. Textual notation, JSON serialization, KPAR

| Item | Rule | Tag |
|---|---|---|
| Interchange formats | Per root namespace, one of: textual notation (`.kerml` / `.sysml`), JSON (`.json`, per 10.4), XMI (`.xmi`). Every conformant tool must import/export at least textual **or** JSON [S-18] 10.2 | Verified |
| JSON always available | For KerML-based languages, JSON via the 10.4 mapping is always permitted [S-18] 10.2 | Verified |
| Element serialization | Object with **`@id`** (= `elementId`), **`@type`** (= MOF metaclass name, e.g. `"Structure"`), plus all owned and inherited attributes. Redefined properties are included if their name differs [S-18] 10.4.5 | Verified |
| References | Object with a single field `{"@id": "<elementId>"}` [S-18] 10.4.4 | Verified |
| Multiplicity | [1..1] non-null; [0..1] value or `null`; upper > 1 gives an array [S-18] 10.4.5 | Verified |
| Enumerations / primitives | Enum literal name as string (e.g. `"public"`); Boolean/Integer/Real/String map to JSON boolean/integer/number/string [S-18] 10.4.2–3 | Verified |
| Model file | A root namespace is serialised as a JSON **array** of all elements in its ownership tree [S-18] 10.4.6 | Verified |
| KPAR | ZIP with a model file per root namespace, plus **top-level** `.project.json` (name, description, version, license, maintainer, website, topic, usage[resource, versionConstraint]) and `.meta.json` (index, created, metamodel, includesDerived, includesImplied, checksum{value, algorithm}). SemVer recommended [S-18] 10.3 | Verified |
| Library element IDs | Normative **name-based UUID v5 (SHA-1)**. Top-level package: namespace = NameSpace_URL UUID `6ba7b811-9dad-11d1-80b4-00c04fd430c8`, name = `https://www.omg.org/spec/KerML/` + package name. Nested elements: namespace = package UUID, name = `path()` of the element. Stable across library versions for elements with qualified names. Tools may use the same scheme for user models [S-18] §9.1 | Verified |
| JSON-LD in API | API JSON uses `@id`/`@type`. The OSLC PSM recommends RDF/XML, Turtle and JSON-LD media types [S-21] 8.2. The REST OpenAPI declares only `application/json` [S-25] | Verified |

## 5. Standard model libraries

| Library | Contents (files observed in release repo) | Tag |
|---|---|---|
| Kernel Semantic Library | Base, Clocks, ControlPerformances, FeatureReferencingPerformances, KerML, Links, Metaobjects, Objects, Observation, Occurrences, Performances, SpatialFrames, StatePerformances, Transfers, TransitionPerformances, Triggers (`.kerml`) [S-06] | Verified |
| Kernel Data Type Library | Collections, ScalarValues, VectorValues [S-06] | Verified |
| Kernel Function Library | BaseFunctions, Boolean/Collection/Complex/Control/Data/Integer/Natural/Numerical/Occurrence/Rational/Real/Scalar/Sequence/String/Trig/Vector functions [S-06] | Verified |
| SysML Systems Library | Actions, Allocations, AnalysisCases, Attributes, Calculations, Cases, Connections, Constraints, Flows, Interfaces, Items, Metadata, Parts, Ports, Requirements, StandardViewDefinitions, States, SysML, UseCases, VerificationCases, Views [S-06] | Verified |
| Domain libraries | Analysis (AnalysisTooling, SampledFunctions, StateSpaceRepresentation, TradeStudies), Cause and Effect, Geometry (ShapeItems, SpatialItems), Metadata (ImageMetadata, ModelingMetadata, ParametersOfInterestMetadata, RiskMetadata), Requirement Derivation, **Quantities and Units** (ISQ + 13 ISQ part files, SI, SIPrefixes, USCustomaryUnits, Quantities, MeasurementReferences, Quantity/Tensor/Vector calculations, Time) [S-06] | Verified |
| ISQ provenance | `ISQBase.sysml` says it was generated (2025-03-13) "from standard ISO/IEC 80000" and cites ISO 80000 item numbers [S-07] | Verified |
| Forms | Textual, KPAR, Eclipse XMI without implied relationships, Eclipse XMI with implied relationships. The XMI is Eclipse XMI (`.kermlx` / `.sysmlx`), **not fully normative OMG XMI** [S-01][S-04] | Verified |

Licensing of these files is covered in [reference-implementations.md](reference-implementations.md).

## 6. Systems Modeling API and Services

### 6.1 Architecture and conformance
- PIM (Cl. 7) plus two PSMs: **REST/HTTP** (OpenAPI 3.1) and **OSLC 3.0** [S-21] Cl. 8. **Verified.**
- Conformance at **PSM level** (implements a defined PSM) or **PIM level** (own PSM with a documented mapping) [S-21] Cl. 2. **Verified.**
- Per-service conformance: ProjectService, ElementNavigationService, ProjectDataVersioningService, QueryService, ExternalRelationshipService, ProjectUsageService. Each has a full and (where applicable) a **Read** level. For example, ProjectDataVersioning Read = getCommits, getHeadCommit, getCommitById, getCommitChange, getCommitChangeById, getBranches, getBranchById, getDefaultBranch, getTags, getTagById, getTaggedCommit, diffCommits. Each level must pass the Annex A conformance test cases plus the cross-cutting cases (A.7) [S-21] Cl. 2. **Verified.**
- **Derived Property conformance**: *Passthrough* (store derived values as given and return them unchanged) or *Full* (provider computes correct derived values; consumers may omit them). A provider may also claim none [S-21] Cl. 2. **Verified.** This matters directly to us. A TypeScript semantic core lets us aim for Full. Passthrough is a cheaper first step.

### 6.2 Resource model (PIM, [S-21] 7.1, Verified)
| Concept | Key attributes and rules |
|---|---|
| Record (abstract) | `id: UUID` (read-only), `resourceIdentifier: IRI[0..1]`, `alias[*]`, `name[0..1]` (must be in alias), `description` |
| Project | name, created, defaultBranch (exactly 1), branches (1..*), tags, commits, commitReferences, usage (ProjectUsage), queries. Also the **permission target** for access control |
| Commit | created, owningProject, `previousCommit[*]` (multiple parents = merge), `change` (DataVersions created/updated/deleted), derived `versionedData` (cumulative snapshot). **Immutable and not destructible** in normal operation. Timestamps strictly monotonic over parents. A merge commit must resolve all conflicting identities in its `change` set. OCL for `versionedData` is given |
| DataIdentity | Version-independent identity; `id` = `Data.getId()` (for Elements, the elementId); derived createdAt/deletedAt |
| DataVersion | Wraps one version of Data (`payload`, `null` = deleted) plus `identity`; own random UUID |
| Data (interface) | Realised by Element, ExternalData, ExternalRelationship, ProjectUsage |
| Branch | CommitReference with `head`; mutable; deletable; created/deleted timestamps |
| Tag | CommitReference with `taggedCommit`; immutable; deletable (delete and recreate to move) |
| ProjectUsage | usedProject + usedProjectCommit (library/project reuse pinned to a commit) |
| Query | select, scope, where (PrimitiveConstraint {property, operator ∈ {instanceOf, =, <, <=, >, >=, in}, value, inverse} or CompositeConstraint {and/or, 2..* constraints}), orderBy. Mappable to SQL, Gremlin, GraphQL, SPARQL |
| Timestamps | ISO 8601 with explicit UTC or offset; UTC recommended |

### 6.3 REST/HTTP endpoints, verified from OMG `OpenAPI.json` v1.0 [S-25] (Verified)

| Verb | Path | operationId | Notable parameters |
|---|---|---|---|
| GET | `/projects` | getProjects | `page[after]`, `page[before]`, `page[size]` |
| POST | `/projects` | postProject | body ProjectRequest |
| GET | `/projects/{projectId}` | getProjectById | |
| PUT | `/projects/{projectId}` | putProjectById | (also used to set default branch [S-21]) |
| DELETE | `/projects/{projectId}` | deleteProjectById | |
| GET | `/projects/{projectId}/branches` | getBranchesByProject | paging |
| POST | `/projects/{projectId}/branches` | postBranchByProject | |
| GET | `/projects/{projectId}/branches/{branchId}` | getBranchesByProjectAndId | |
| DELETE | `/projects/{projectId}/branches/{branchId}` | deleteBranchByProjectAndId | |
| POST | `/projects/{projectId}/branches/{targetBranchId}/merge` | merge | `sourceCommitId` (array, required), `description` |
| GET | `/projects/{projectId}/tags` | getTagsByProject | paging |
| POST | `/projects/{projectId}/tags` | postTagByProject | |
| GET | `/projects/{projectId}/tags/{tagId}` | getTagByProjectAndId | |
| DELETE | `/projects/{projectId}/tags/{tagId}` | deleteTagByProjectAndId | |
| GET | `/projects/{projectId}/commits` | getCommitsByProject | paging |
| POST | `/projects/{projectId}/commits` | postCommitByProject | `branchId` (query, optional; default branch otherwise); body CommitRequest {`@type`:"Commit", `change`: DataVersionRequest[] (required)} |
| GET | `/projects/{projectId}/commits/{commitId}` | getCommitByProjectAndId | |
| GET | `/projects/{projectId}/commits/{commitId}/changes` | getChangesByProjectCommit | paging |
| GET | `/projects/{projectId}/commits/{commitId}/changes/{changeId}` | getChangeByProjectCommitId | |
| GET | `/projects/{projectId}/commits/{commitId}/elements` | getElementsByProjectCommit | `excludeUsed`, paging |
| GET | `/projects/{projectId}/commits/{commitId}/elements/{elementId}` | getElementByProjectCommitId | `excludeUsed` |
| GET | `/projects/{projectId}/commits/{commitId}/elements/{elementId}/projectUsage` | getProjectUsageByProjectCommitElement | |
| GET | `/projects/{projectId}/commits/{commitId}/elements/{relatedElementId}/relationships` | getRelationshipsByProjectCommitRelatedElement | `direction` ∈ {in, out, both}, default both |
| GET | `/projects/{projectId}/commits/{commitId}/roots` | getRootsByProjectCommit | `excludeUsed`, paging |
| GET | `/projects/{projectId}/commits/{compareCommitId}/diff` | diff | `baseCommitId` (required) |
| GET | `/projects/{projectId}/queries` | getQueriesByProject | |
| POST | `/projects/{projectId}/queries` | postQueryByProject | |
| GET | `/projects/{projectId}/queries/{queryId}` | getQueryByProjectAndId | |
| PUT | `/projects/{projectId}/queries/{queryId}` | putQueryByProjectAndId | |
| DELETE | `/projects/{projectId}/queries/{queryId}` | deleteQueryByProjectAndId | |
| GET | `/projects/{projectId}/queries/{queryId}/results` | getQueryResultsByProjectIdQueryId | `commitId` (query, optional) |
| GET | `/projects/{projectId}/query-results` | getQueryResultsByProjectIdQuery | ad-hoc query in body; `commitId` |
| POST | `/projects/{projectId}/query-results` | getQueryResultsByProjectIdQueryPost | same, for clients that cannot send GET bodies [S-21] |
| GET | `/meta/datatypes` | getDatatypes | paging |
| GET | `/meta/datatypes/{datatypeId}` | getDatatypeById | `datatypeId` is a URI |

Other REST facts (**Verified**):
- All IDs in paths are `format: uuid` [S-25].
- Media type `application/json` only [S-25].
- **Cursor pagination** uses `page[size]`, `page[after]`, `page[before]`, with IETF Web Linking `Link` headers (`rel="next"` / `rel="prev"`) [S-21] 8.1.3.
- External relationships and project usages have **no dedicated endpoints**. They are read via Queries (`@type = 'ExternalRelationship'` / `'ProjectUsage'`) and written via commits whose DataVersion payload is the object, or `null` to delete [S-21] Table 10.
- Commit write semantics: new Data means a DataVersion with no identity or a new identity. Update means an existing identity with a new payload. Delete means an existing identity with `payload: null` [S-21] Table 10.
- Spec inconsistency: Table 10 prints `POST /projects/{projectId}/commit` while the OpenAPI and Annex B examples use `/commits` [S-21][S-25]. Follow the OpenAPI.
- Schema nuance: API record schemas carry `$id` base `…/SystemsModelingAPI/20230201/…` inside the 20250201 OpenAPI file, and `Identified` = `{ "@id": uuid }` [S-25]. Use the file as-is for code generation.

### 6.4 Aligned-subset recommendation (ours, built on Verified facts above)
Phase 1: ProjectService (full), ProjectDataVersioningService **Read** + createCommit + branches/tags, ElementNavigationService (full), Derived Property **Passthrough**. Phase 2: diff/merge, QueryService (PrimitiveConstraint/CompositeConstraint mapped to SQL over PostgreSQL), Derived Property Full via the TS semantic core. Mark the claim as "aligned with", never "conformant", until the Annex A test suite passes (repository rule: do not claim compliance).

## 7. SysML v1 to v2 Transformation (Part 2)

| Aspect | Finding | Tag |
|---|---|---|
| Purpose | Precise semantic translation of SysML **v1.7** (UML4SysML metaclasses + SysML v1 stereotypes) to SysML v2 abstract syntax. Intended as rules for automated converters and as educational comparison material. Could also back a "SysML v2-like" read-only API over v1 models [S-20] Cl. 1 | Verified |
| Method | Declarative mapping classes (from/to ends) with OCL operations computing target properties. `getMapped` resolves cross-references; `filter` restricts applicability; mappings are inherited by source subclasses [S-20] Cl. 6.1. Normative model SysMLv1Tov2.xmi [S-22] | Verified |
| Coverage | Clause 7: foundations, helper library, initializers, factories, generic mappings, mappings from UML4SysML metaclasses (7.7) and from SysML v1.7 stereotypes (7.8) [S-20] TOC | Verified |
| Conformance | Tool implements the v1 abstract syntax + profile (XMI import recommended), the v2 abstract syntax (KPAR export recommended), and the transformation. Partial conformance is allowed for an identified subset. SysML v2 tools are **not required** to implement it [S-20] Cl. 2 | Verified |
| Diagrams | The word "diagram" does not occur in the Part 2 text. The spec maps model content, not v1 diagrams. Converting diagram layouts to v2 views is out of scope for the standard | Verified (text search) |
| Vendor practice | Dassault says its migration follows the transformation spec "including diagrams" (a vendor extension) [S-56] | Verified (vendor claim) |
| v2 stance on graphics | Graphical notation is a normative concrete syntax with standard views, but the view model + rendering is the abstraction. Diagrams are views. No layout interchange found (see §3) | Verified / Assumed (layout) |

## 8. Design consequences for our TypeScript module (derived)
1. Use **relationship-centric storage**. Ownership and membership are Relationship elements. Persist them as first-class rows keyed by elementId, which is UUID v5 for libraries [S-18].
2. Make **JSON per KerML 10.4** (`@id`/`@type`, all attributes, references as `{@id}`) the canonical wire and storage form. It matches the API payloads [S-18][S-25].
3. Implement **KPAR import/export** early, because it is the minimum conformance path together with abstract syntax. Make the reader tolerant of OMG KPAR quirks [S-19][S-26].
4. Model the repository on **Commit/DataVersion/DataIdentity** with immutable commits and multi-parent merges. Compute `versionedData` incrementally (snapshot or delta tables in PostgreSQL) [S-21].
5. Define **views as model elements** (view usages exposing content plus filters). Keep layout in tool-private view state, consistent with the platform rule that diagram position is view state [S-19].

## Sources
Full details are in [sources.md](sources.md). All sources accessed 2026-10-14.

| ID | URL | Title | Accessed | Access level |
|---|---|---|---|---|
| S-01 | https://github.com/Systems-Modeling/SysML-v2-Release (raw README.md, master) | SysML v2 Release README | 2026-10-14 | read in full |
| S-03 | https://github.com/Systems-Modeling/SysML-v2-Release/releases | Release repo releases | 2026-10-14 | read partially (fetched; latest 5 releases) |
| S-04 | https://github.com/Systems-Modeling/SysML-v2-Release/releases/tag/2026-04 | Release 2026-04 notes | 2026-10-14 | read partially (fetched; full notes) |
| S-06 | https://api.github.com/repos/Systems-Modeling/SysML-v2-Release/git/trees/master?recursive=1 | Release repo file tree (1,759 paths) | 2026-10-14 | read in full (listing) |
| S-07 | Raw files: `sysml.library/Kernel Libraries/Kernel Semantic Library/Base.kerml`, `sysml.library/Domain Libraries/Quantities and Units/ISQBase.sysml`, `sysml.library/Systems Library/.meta.json` | Library file headers | 2026-10-14 | read partially (first 25–30 lines each) |
| S-09 | https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation/releases | Pilot releases | 2026-10-14 | read partially (fetched; latest 5) |
| S-18 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/1-Kernel_Modeling_Language.pdf | Kernel Modeling Language (KerML) v1.1 Beta 2 (Release 2026-07) | 2026-10-14 | read partially (Cl. 2 Conformance, 3, 6.1 Architecture, 8.3 TOC and metaclass descriptions for Element, Relationship, Membership, OwningMembership, FeatureMembership, Namespace, Type, Classifier, Feature, Specialization, Subclassification, Subsetting, FeatureTyping, Conjugation; 9.1 library UUID rule; Cl. 10 Model Interchange in full; Annex A start) |
| S-19 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2a-OMG_Systems_Modeling_Language.pdf | OMG SysML v2.1 Beta 2, Part 1: Language Specification | 2026-10-14 | read partially (TOC, Cl. 2 Conformance, 3, 7.26 Views and Viewpoints, 8.2.3 graphical notation intro, 9.2.20 Standard View Definitions) |
| S-20 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/2b-SysML_v1_to_v2_Transformation.pdf | OMG SysML v2.1 Beta 2, Part 2: SysML v1 to SysML v2 Transformation | 2026-10-14 | read partially (TOC, Cl. 1 Scope, 2 Conformance, 3, 6 Mapping Approach; keyword search for "diagram") |
| S-21 | https://github.com/Systems-Modeling/SysML-v2-Release/blob/master/doc/3-Systems_Modeling_API_and_Services.pdf | Systems Modeling API and Services v1.1 Beta 2 | 2026-10-14 | read partially (front-matter licence, Cl. 2 Conformance, 3, 7.1 API Model, 8.1 REST/HTTP PSM incl. Tables 9–10 and pagination, 8.2 media types, Annex B.1 examples) |
| S-22 | https://www.omg.org/spec/SysML/2.0 | OMG SysML 2.0 spec page | 2026-10-14 | read partially (fetched) |
| S-23 | https://www.omg.org/spec/KerML/1.0 | KerML 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-24 | https://www.omg.org/spec/SystemsModelingAPI/1.0 | Systems Modeling API and Services 1.0 spec page | 2026-10-14 | read partially (fetched) |
| S-25 | https://www.omg.org/spec/SystemsModelingAPI/20250201/OpenAPI.json | Systems Modeling API and Services REST/HTTP PSM, OpenAPI 3.1, version 1.0 | 2026-10-14 | read in full (machine-parsed: all paths, verbs, operationIds, parameters, media types, key schemas) |
| S-26 | https://www.omg.org/spec/SysML/20250201/Systems-Library.kpar and https://www.omg.org/spec/KerML/20250201/Semantic-Library.kpar | Normative library KPARs (Systems Library 2.0.0, Kernel Semantic Library 1.0.0) | 2026-10-14 | read partially (archive listing, .project.json, .meta.json, one library file) |
| S-27 | Raw: `sysml.library.kpar/SysML_Quantities_and_Units_Library-2.1.0-dev.20260801.kpar` (.project.json) | Release-repo KPAR metadata | 2026-10-14 | read partially |
| S-56 | https://docs.nomagic.com/SYSML2P/2026x-refresh1/catia-magic-cameo-sysml-v2-solution-312246433.html | CATIA Magic / Cameo SysML v2 solution | 2026-10-14 | read partially (fetched) |
