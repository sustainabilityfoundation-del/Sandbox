# ECII: engineering practice research

Status: research note, 16 October 2026. Input to the ECII architecture (brief §15); not a standards-compliance claim.
Question: what do publicly available systems engineering guidance and SysML practice say about interface management,
evidence and maturity, requirements traceability and interface modelling, and how should that shape the ECII data model
and workflow without standard-specific gates (ADR-0070)?

Short answer: treat an interface as a first-class, independently owned and versioned record with a stable identity, two
named parties, a requirement-side statement (what must hold) kept apart from a design-side definition (what is), explicit
open items, and verification links; control it through baselines and change records; map it to SysML v2 interface
definitions, port usages and connections in the existing SysML module rather than a parallel model. Confidence: medium
to high for the NASA material (read from nasa.gov pages), medium for INCOSE, 15288 and 29148 (abstracts and secondary
summaries only), medium for SysML (existing repository research plus summaries).

All text below is paraphrased. No standard text is reproduced.

## 1. Sources

Retrieval date for all: 16 October 2026. "Read" means the page text was retrieved and read; "summary" means only an abstract or
search summary was available.

| ID | Source | URL | Level |
|---|---|---|---|
| P1 | NASA Systems Engineering Handbook (NASA/SP-2016-6105 Rev 2), 6.3 Interface Management | https://www.nasa.gov/seh/6-3-interface-management | read |
| P2 | NASA SEH 6.5 Configuration Management | https://www.nasa.gov/seh/6-5-configuration-management | read |
| P3 | NASA SEH 6.6 Technical Data Management | https://www.nasa.gov/seh/6-6-technical-data-management | read |
| P4 | NASA SEH 6.2 Requirements Management | https://www.nasa.gov/seh/6-2-requirements-management | read |
| P5 | NASA SEH Appendix C, how to write a good requirement (TBD/TBR, rationale, assumptions) | https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/ | read |
| P6 | INCOSE IS 2016, NASA flight project interface management slides/paper (ICWG, ICD) | https://www.incose.org/wp-content/uploads/legacy/presentation/IS2016-pdf/6-1-1.pdf | search summary only (fetch returned 403) |
| P7 | NASA NTRS 20160010336 (companion paper on interface management) | https://ntrs.nasa.gov/api/citations/20160010336/downloads/20160010336.pdf | not extractable (compressed PDF) |
| P8 | P. Davies, "Interface Management: the Neglected Orphan of Systems Engineering", INCOSE IS 2020 | https://www.ppi-int.com/wp-content/uploads/2020/09/Davies_IM_IS2020.pdf | search summary only |
| P9 | PPI Systems Engineering FAQ on interface management scope and planning | https://www.ppi-int.com/resources/systems-engineering-faq/what-is-the-scope-of-interface-management-and-how-is-the-planning-for-interface-management-recorded/ | search summary only |
| P10 | ISO/IEC/IEEE 15288:2023 abstract (ISO catalogue) | https://www.iso.org/standard/81702.html | summary via store abstracts (direct fetch 403) |
| P11 | ISO/IEC/IEEE 29148:2018 abstracts | https://webstore.iec.ch/publication/64315 ; https://store.sfs.fi/en/ieee-29148-2018 | summary |
| P12 | NASA Software Engineering Handbook, bidirectional traceability | https://swehb.nasa.gov/x/7QL7 | summary |
| P13 | OMG SysML 2.0 specification page | https://www.omg.org/spec/SysML/2.0 | read (overview only; no interface detail) |
| P14 | SysML v2 Release repository | https://github.com/Systems-Modeling/SysML-v2-Release | read (README level) |
| P15 | ESA workshop slides, SysML v2 approaching industrial use (v1 to v2 concept mapping) | https://indico.esa.int/event/386/contributions/6223/attachments/4266/6445/1015%20-%20SysML%20Version%202%20Approaching%20Industrial%20Use.pdf | search summary only |
| P16 | Capella community forum threads on exchange items, component exchanges | https://forum.mbse-capella.org/t/what-are-exchange-items-good-for/6312 ; https://forum.mbse-capella.org/t/component-exchange-without-port/11024 | search summary only (community, not official) |
| P17 | Repository: SysML standards research (OMG artifacts read in depth, 14 October 2026) | docs/research/sysml/standards.md | internal |
| P18 | Repository: SysML requirements mapping and program contracts | docs/specifications/requirements-sysml-mapping.md ; docs/specifications/sysml-program-contracts.md | internal |
| P19 | Repository: ADR-0070 and AGENTS.md "Development assurance" | docs/decisions/0070-development-assurance-boundaries.md | internal |

Existing repository SysML research (P17) was cited rather than repeated; it shows the project implements KerML and SysML v2 in
`packages/sysml-core`, targeting the formal 1.0 and 2.0 specifications.

## 2. Interface management practice mapped to ECII concepts

### 2.1 Interface definition fields

Public guidance (P1, P6, P9) describes an interface as the common boundary where two systems of interest interact, and
the definition as covering physical, electrical, mechanical and human characteristics. NASA stresses that interfaces are found
by analysing the concept of operations during formulation and kept up to date as the architecture evolves (P1). Typical
interface document content, as commonly practised (my synthesis; P1 itself defers detail to the NASA expanded guidance):
parties, purpose, interface type, physical/geometric characteristics, functional and performance characteristics, environments,
constraints, and verification method.

Mapping to the brief §5 fields:

| Practice element | ECII field (brief §5) | Note |
|---|---|---|
| The two (or more) interfacing items | participating entities | Reference by stable ID and revision (`ArtifactRef`), not by name. |
| Nature of the boundary | interface type | Keep the brief's open list; make the kind extensible by data, not enum edits. |
| Why the interface exists | functional purpose | Link to a function or requirement; practice ties each interface to a need. |
| Physical definition | geometric features, coordinate systems, reference datums, dimensions, tolerances, clearances | Practice requires each value to name its datum and units; see 3.3. |
| Forces and flows | loads and reactions, connection methods | In SysML terms, flows across the boundary. |
| Conditions | environmental and operational constraints | Reference operating-environment entities. |
| How compliance is shown | verification requirements | Separate from the definition (2.5). |
| Basis | supporting evidence, confidence and status | Per attribute, not per interface (3.2). |

Recommendation: a per-attribute record (value, unit, tolerance, datum, method, evidence status, source reference) is
the more useful granularity, because practice and the brief both require that an estimated dimension never silently become a
verified one.

### 2.2 ICD versus IRD

NASA names four interface documents: Interface Requirements Document (IRD), Interface Control Document/Drawing (ICD),
Interface Definition Document (IDD) and Interface Control Plan (ICP), with detail deferred to expanded guidance (P1). The
common understanding in the wider literature (P6, P9, secondary) is: the IRD states what the interface must satisfy,
as requirements negotiated between the parties; the ICD records the agreed definition of the interface; the ICD is
maintained under configuration management and acts as a trace link between requirements, design, integration and test.

ECII mapping (my recommendation):

- Keep **interface requirement** (a statement of need, a candidate requirement in the Requirements module, never auto-approved,
  brief §12) separate from the **interface definition** (the ECII artifact describing the actual boundary).
- Many ECII interfaces start as discovered facts about an existing host (Documented or Estimated), where no one has negotiated
  anything. This is the "reverse-engineered ICD" case: a definition exists before any requirement. The model must allow a
  definition with no requirement yet, and a requirement with no definition yet (a needed interface not yet discovered).
- Link both directions: requirement refines or constrains the interface; the definition realizes or satisfies the requirement.
  Do not merge them into one record.

### 2.3 Ownership and agreement between parties

NASA places interface control with an Interface Working Group (IWG; "ICWG" in P6), staffed by technical representatives of the
interfacing parties; it may sit under a change control board. Where approval is needed from all sides, agreement must be
unanimous, and late changes are costlier (P1, P6). P9 notes that responsibility for an interface from requirements to
implementation can sit with a named entity, and lists open questions such as who holds approval authority.

ECII implication: in the drill-bit-holder case the host is a third-party product that cannot agree to anything. So the
useful distinction is the **authority of the other side**:

- *Controlled by us* (both sides within the project): agreement is internal, change by normal review.
- *Controlled by an external party* (host manufacturer, standard, supplier): the definition is a statement about someone else's
  design. The model should record the owning party, its documents, and that a change on their side invalidates ours without
  our consent. This is an external dependency (brief §12 Project Management), not an agreement.
- *Jointly negotiated*: needs an approval record from each party. Defer; but reserve an "owner" and "counterparty" field
  and a review/approval state separate from evidence status (ADR-0070 item 4).

Recommendation: store `owner` (project, external party, or shared) and a generic `agreement` reference that is optional in
Phase 1. No working-group workflow is needed now.

### 2.4 Configuration control and baselines

NASA describes four baselines (functional, allocated, product, as-deployed) set at reviews, configuration identification
(choose items, unique IDs, change authority), change control through a board with classes of change (engineering change versus
waiver, where a waiver does not alter the baseline), status accounting, and functional and physical audits (P2). Once interface
requirements are baselined, changes follow the requirements management process: identify need, assess impact, record approval
or rejection, update records (P1, P4). Controlled items include models and documents, not only hardware (P2).

ECII implication:

- Interface definitions and context-graph entities carry a stable ID and an immutable revision, and are included in the
  project baseline already planned (ADR-0070 gap, milestone C6). Do not build a separate baseline mechanism.
- Reference other artifacts by `ArtifactRef { module, kind, id, revision }` so a baseline pins exact revisions.
- Distinguish a **change** (new revision of the definition, impact analysis follows) from a **waiver/deviation** (accept a
  non-conformance without altering the definition). Design Reasoning (decisions with review flags) is the natural home for waivers.
- When an assumption changes, brief §11 requires affected concepts, requirements, models and decisions to be identified. NASA's
  change impact step (assess effect on cost, schedule, architecture, interfaces, related requirements, P4) supports that as a
  query over typed relationships, not a new engine.

### 2.5 Verification of interfaces

NASA treats approved interface documentation as input to product verification and validation, setting test objectives and plans,
and verifying interface requirements is called out as a critical part of system verification (P1). Integration steps check that
assembly procedures mark interfaces and match specifications and ICDs (P1).

ECII implication:

- A **verification activity** is its own entity linked to an interface requirement or attribute (brief §3 "requires verification").
  It records method (inspection, measurement, analysis, test, demonstration are the widely used categories; treat as data, not enum),
  the revisions and configuration of both sides, the inputs, and the tool or instrument (ADR-0070 item 3).
- Distinguish verification of the *definition* ("do we have the host dimensions right": measurement or authoritative
  documentation) from verification of the *design against the interface* ("does the holder fit"): the first feeds the
  readiness gate (section 3.4), the second belongs to Requirements verification records.
- A verification result does not remain current when either side changes revision; reuse the existing staleness derivation (ADR-0046).

## 3. Evidence and maturity

### 3.1 How practice separates the concepts

| Practice concept | Meaning (paraphrase) | Source |
|---|---|---|
| Requirement | A verifiable, single-thought statement of what the product must do, traceable to a parent, with rationale and stated assumptions | P5, P4 |
| Assumption | Condition taken as true without proof; should be written next to the requirement or decision that depends on it | P5, P1 (assumptions behind change decisions are work products) |
| TBD | Value not yet determined; discouraged where an estimate can be given | P5 |
| TBR | Best-estimate value still to be resolved; expected to carry rationale, resolution steps, owner and deadline, and to appear on a maintained list | P5 |
| Validation | Is it the right requirement or product | P4 (V&V results are mapped into the requirements database) |
| Verification | Was it built or shown to meet the requirement, by a stated method | P1, P4 |

P5 prefers an estimated value flagged as TBR over a blank TBD, and wants a visible, maintained list of all unresolved items.

### 3.2 Mapping to the brief's seven evidence statuses

| Brief status | Nearest practice analogue | Difference to keep |
|---|---|---|
| Verified | Value confirmed by test, measurement, inspection or authoritative controlled source | Must name method, instrument, datum, configuration. |
| Documented | Stated in an identified source (manufacturer manual, drawing) | Practice calls this "data from a source", not verified. Keep distinct, as the brief does. |
| Derived | Computed or inferred from other values | Must reference its inputs and the calculation; it inherits the weakest input status. |
| Estimated | A TBR-style best estimate | Needs the basis and an expected resolution path. |
| Assumed | An assumption | Needs an owner and a validation trigger (Conceptualize assumptions already carry validation history). |
| Unknown | A TBD | Should become an information gap with priority and a research or clarification task. |
| Conflicting | Not a named class in the public sources read | Practice handles it through discrepancy resolution and change control; ECII should retain both values and a resolution-required flag. |

Observations:

1. TBD and TBR are not additional statuses; they are workflow states of an open item. In ECII, Unknown is the TBD analogue and
   Estimated or Assumed with a resolution plan is the TBR analogue. The useful addition from practice is the **resolution plan
   (owner, steps, due)**, which maps to project management tasks.
2. Evidence status and verification status are different axes. A value can be Documented (evidence status) while the interface
   is not yet verified (verification status). Keep these separate, consistent with ADR-0070 item 4.
3. Provenance of the AI's reading is separate from the evidence (brief §6): store the source reference and extraction method, then
   the AI's interpretation, then a person's confirmation as distinct records.
4. "Derived inherits the weakest input" is an inference of mine from practice on TBR handling; it is not stated in the sources.

### 3.3 Dimensional data

Public guidance on writing requirements stresses unambiguous, verifiable statements and stated assumptions (P5). The brief adds
units, tolerance, datum and method. No NASA page read specifies a CAD datum scheme; that detail is from CAD drawing practice (not
retrieved this session) and should be settled with the CAD module owner.

### 3.4 Readiness gate

Practice ties maturity to reviews and baselines: functional baseline at the system design review, allocated at preliminary design,
product at critical design (P2). The brief's three states (Exploratory, Context Established, Interfaces Verified) are an analogous
progression but are per downstream activity, not per project phase.

Recommendation: define readiness as a function `(activity, set of interfaces and their attribute statuses) -> state` with
activity-specific criteria held as data, so that a later assurance profile can supply stricter criteria without changing the
function. Criteria such as "all critical-interface attributes needed for dimensioned CAD are Verified, or Documented and
corroborated" are project data; no standard-specific vocabulary appears in code. Readiness output should list the specific
blocking items, which doubles as the TBR/TBD list recommended by P5.

## 4. Requirements traceability for deriving interface and integration requirements

From the abstracts of ISO/IEC/IEEE 29148 (P11): the standard covers the processes for engineering requirements, the information
items and their content, and what makes a good requirement, applied iteratively through the life cycle. Requirements engineering
is described as discovering, eliciting, analysing, verifying, validating and managing requirements. Beyond the abstract I could not
read the clauses, so the points below rest on NASA material (P4, P5, P12) and general practice.

Practice points relevant to ECII:

1. **Each requirement traces to a parent.** A requirement with no parent is labelled self-derived and flagged for concurrence at the
   next level up (P4). ECII-derived interface requirements should trace to: the engineering problem or objective, the interface
   definition, and the specific evidence, and be flagged "derived from AI proposal" until approved.
2. **Bidirectional traceability.** Upward to the parent, downward to children (P4); it reveals both missing coverage and orphans (P12).
   For ECII: from any requirement one can reach the interface and evidence; from any interface one can list the requirements derived
   from it, and interfaces with no requirement are surfaced as gaps.
3. **Quality attributes of a requirement.** Single thought, positive, what not how, verifiable, with rationale and stated assumptions (P5).
   An interface requirement proposal should be generated with rationale (why this interface matters) and assumptions populated
   from the unresolved items on the interface.
4. **Interface requirements need their own traceability check.** P6's companion material (summary only) notes most texts discuss
   working groups but few address interface requirement traceability analysis. A cheap automated check is possible: each interface
   has at least one requirement, each requirement on an interface names a verification approach.
5. **Change impact before approval.** Assess effect on interfaces and related requirements before approving a change (P4); in ECII this
   is the traversal from a changed assumption or evidence item.
6. **Promotion is explicit.** AI-generated requirements stay candidates until a person applies them (brief §12; ADR-0070 item 5).

Existing relationships (P18): the Requirements module already has `derives-from`, `decomposes`, `depends-on` and `allocated-to`;
ECII should add no parallel relation types for requirement-to-requirement links.

## 5. SysML mapping

Note: the project's SysML is KerML/SysML v2 (P17, P18). The mapping below describes intent, not conformance, and does not claim
the ECII model is SysML-compliant. I did not read the SysML v2 language specification clauses on interfaces this session
(P13 lists no interface detail); the v2 concept names come from the ESA slides summary (P15), repository research (P17, P18) and
background knowledge that should be confirmed against the specification before implementation.

| ECII concept | SysML v2 element (intent) | Notes |
|---|---|---|
| Entity (product, host system, subsystem, component, external system) | Part definition and part usage | Host systems the project does not own can be modelled as external part usages with an "external" marker via metadata. |
| Interface definition (the boundary kind) | Interface definition, with end features typed by port definitions | One ECII interface definition artifact corresponds to a SysML interface definition plus the interface usage that connects two port usages. |
| Interface end on an entity | Port usage typed by a port definition | A mounting point on the drill is a port on the host part usage. |
| Items crossing the boundary (loads, signals, data, fluids) | Item definitions/usages carried by flow or by port features | In v1 these were flow properties and item flows (background knowledge); in v2 the ESA summary says v1 connectors become connection definitions and v1 interfaces become interface definitions (P15). |
| A specific link between two entities | Connection usage or interface usage | v2 permits n-ary connections (summary of a secondary guide), useful for multi-party mounts. |
| Requirement on interface | Requirement definition/usage with a subject, linked by satisfy | Already implemented by the Requirements/SysML mapping (P18). |
| Allocation of requirement to component | Allocation usage | Already mapped as `allocated-to` (P18). |
| Verification activity | Verification case with objective linked to requirement | See P18 for the mapped verification cases. |
| Geometric features, datums, keep-out volumes | Not SysML core; use the v2 Geometry domain library only where useful, otherwise reference CAD artifacts | Avoid pushing detailed geometry into SysML; carry an `ArtifactRef` to CAD geometry. |
| Evidence status, confidence | Metadata on the element, kept in ECII | SysML has no built-in evidence maturity; use metadata annotations referencing the ECII record. |

SysML v1 background (for users with older models; not retrieved this session): interface blocks, proxy ports and flow properties
were the v1 way to type a port's flows; connectors joined ports; allocate relations tied requirements and behaviours to structure.
The v1 to v2 transformation specification (P14) provides the official mapping.

Capella and Arcadia offer a useful contrast (P16, community sources): functional exchanges carry data between functions and
are mapped to component exchanges between components through ports; exchange items define what is exchanged, and practitioners
say there is no fixed method prescribed for them. The pattern, separate the thing exchanged from the link that carries it, matches
the SysML item/port/connection split and supports the recommendation in section 6.

CAD tools: I did not research how CAD tools represent mounting interfaces and keep-out volumes this session (see section 7).

Where ECII is the source of truth: ECII owns discovery, evidence and readiness; the SysML module owns the architecture model
(brief §12: "do not create a competing systems-modeling representation"). The SysML mapping should be a proposal-preview
operation that creates or updates SysML elements, with the ECII interface ID recorded on them for round-trip traceability.

## 6. Recommendations for the ECII data model and workflow

All of these stay generic and avoid standard-specific terms (ADR-0070 items 1 to 5).

1. **Interface as a first-class record with revisioned identity.** Stable ID, immutable revisions, `ArtifactRef` participants.
   Register it in the Project Management artifact registry so it joins project baselines without a new baseline mechanism.
2. **Separate definition, requirement and verification.** Definition (what the boundary is), interface requirement (what must hold,
   candidate until approved), verification activity (how and when shown). Link them; never merge them into one "complete" flag.
3. **Attribute-level evidence.** Each value records value, unit, tolerance, datum, method, evidence status (seven values), source
   reference, and who or what interpreted it. Evidence is stored apart from the AI's interpretation of it.
4. **Evidence is configuration-specific.** Evidence and verification identify the revisions of both interface sides, inputs and tool
   version; currency is derived, not stored (ADR-0070 item 3; ADR-0046).
5. **Open items are first-class.** Unknown, Estimated and Assumed items carry a resolution plan (owner, route such as research,
   user question, measurement, due), shown in a single list and feeding Project Management tasks. This is the generic form of the
   TBD/TBR practice, with no standard-specific names.
6. **Conflicting is a retained state with a resolution requirement**, keeping both values and sources.
7. **Ownership of the far side.** Record `owner` as project, external party or shared, plus the external party's identifying
   reference (model, revision, document). An external change invalidates dependent definitions and triggers impact analysis. Joint
   agreement/approval workflow deferred.
8. **Readiness as data-driven evaluation per downstream activity.** Criteria are project data keyed by activity; the gate returns
   state plus blocking items. Later profiles can add criteria without code changes.
9. **Traceability checks as queries**: interfaces without requirements, requirements without a parent, interfaces without any
   verification plan, evidence that references superseded revisions. Surface in the Engineering Context panel; do not block creative
   exploration.
10. **SysML projection by preview.** Map to interface definitions, port usages, connection/interface usages, and existing requirement
    relations through the SysML module's typed commands; do not duplicate geometry in SysML. Record ECII IDs on SysML elements.
11. **No hardcoded verification vocabulary.** Keep methods (inspection, measurement, analysis, test, demonstration) as an extensible
    data list.
12. **Keep states distinct.** Evidence status, definition review/approval, verification, and evidence currency are separate attributes
    (ADR-0070 item 4). AI proposals, extracted facts and approved records remain different record kinds with provenance.
13. **Technical data handling.** NASA's data management guidance (P3) calls for metadata sufficient for retrieval, originator
    responsibility for entering data, and distribution and rights markings. This supports the brief's retrieved-reference record
    (source, retrieval date, identifiers, licence or usage restriction). Store a rights/usage-restriction field on each reference;
    do not treat publicly visible content as redistributable.

Phase suggestion: Phase 1 implements recommendations 1 to 6, 8 and 12 in the data model and the conceptual readiness function;
7, 9, 10 and 13 are lightweight (fields and queries) with 10's execution deferred to the SysML integration step.

## 7. What could not be accessed

- The NASA SEH interface section gives only brief definitions of the IRD, ICD, IDD and ICP and defers to the NASA Expanded
  Guidance (6.3.2), which I did not retrieve; the page does not mention N2 diagrams, so N2 practice (rows and columns show
  interfacing functions or components, off-diagonal cells show exchanges) rests on secondary encyclopaedic sources and should be treated
  as a background idea only. The ICD field list in 2.1 is a synthesis, not a NASA-stated list.
- The NASA SEH requirement management page did not mention TBD/TBR or a verification matrix; TBD/TBR practice comes from Appendix C
  (P5). The NASA SEH full PDF was not downloaded.
- INCOSE Systems Engineering Handbook text (member publication; only brief mention found in P8). INCOSE IS 2016 slides (403), NASA NTRS 20160010336
  and the Davies IS 2020 paper (PDF content not extractable or fetched as binary): only search-engine summaries were used.
  Treat INCOSE-related statements as medium confidence.
- ISO/IEC/IEEE 15288:2023 and 29148:2018 are paid standards; only publisher abstracts and summaries were used. ISO's own page
  returned 403. Nothing here asserts clause-level content. (P10 content was limited to scope-level points: processes applicable to
  systems and elements across the life cycle, no prescribed life cycle model, iterative and recursive application.)
- SysML v2 language specification clauses on interface definitions, port definitions and connections: OMG's page only gave overview
  and links; the large PDFs were not read for this note. Repository research (P17) covers other parts of the specification. The
  SysML v1 spec page also had no interface detail. The v2 interface/port statements in section 5 should be verified against the
  specification before implementation.
- Capella official documentation: only community forum summaries and the home page were reached.
- CAD tools: how CAD systems represent mounting interfaces, mates, reference geometry and keep-out volumes was not researched
  (optional in the assignment). A follow-up should survey the open CAD kernel and the project's CAD module contracts.
- Web fetch summaries came from a small model reading each page; they were cross-checked only against search snippets.
