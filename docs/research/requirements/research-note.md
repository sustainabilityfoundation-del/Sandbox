# Requirements Management: research note

Stage 1 of the [brief](../../specifications/requirements-management.md). Prepared 13 October 2026 by the
Requirements agent. Companion documents: [capability matrix](capability-matrix.md) and
[acceptance criteria and backlog](acceptance-and-backlog.md).

This note records **which sources were actually inspected, how much of each was accessible**, and
what the implementation takes from them. No substantial text is reproduced; findings are
paraphrased and cited by clause or section. Nothing here claims standards compliance or parity
with any commercial tool.

## 1. Access levels

| Level | Meaning |
| --- | --- |
| **Full text** | The complete official document was downloaded from the publisher and read (relevant parts) |
| **Partial** | Official pages with some body text (for example one appendix, or individual help topics) |
| **TOC / listing** | Only the publisher's table of contents, abstract or catalogue entry |
| **None** | Not reachable (paywall, login, bot challenge) |
| **Third-party summary** | Only secondary descriptions; used for orientation, never as evidence |

## 2. Standards, specifications and handbooks

| Source | Edition checked | Access | Where | Used for |
| --- | --- | --- | --- | --- |
| OMG, *Requirements Interchange Format (ReqIF)* | **1.2**, formal/16-07-01, July 2016 (current; 1.0.1 and 1.1 are described by OMG and IBM as technically equivalent) | **Full text** (PDF) | omg.org/spec/ReqIF/1.2/PDF | Exchange model, element semantics, identifiers, LAST-CHANGE, tool extensions |
| OMG ReqIF XML schemas `reqif.xsd` (dtc/11-04-05) and `driver.xsd` (dtc/11-04-06) | Namespace `http://www.omg.org/spec/ReqIF/20110401/reqif.xsd` | **Full text** | omg.org/spec/ReqIF/20110401/reqif.xsd, …/20110402/driver.xsd | Schema validation; element and attribute names |
| W3C XHTML Modularization 1.1 schema modules (imported by `driver.xsd`) | As referenced by `driver.xsd` | **Full text** (downloaded by `npm run req:reqif:schemas`) | w3.org/TR/xhtml-modularization/SCHEMA/ | Schema validation of XHTML attribute values |
| OMG, *OMG Systems Modeling Language (SysML) v2.0, Part 1: Language* | **2.0**, formal/26-03-02 (About page dated September 2025) | **Full text** (PDF, 691 pp.) | omg.org/spec/SysML/2.0/Language/PDF | Mapping of requirement, satisfy, verify, allocation, derivation (§7.15, §7.21, §7.24, §9.6) |
| NASA, *NASA Systems Engineering Handbook*, SP-2016-6105 **Rev 2** | Rev 2 (supersedes Rev 1, 2007) | **Full text** (PDF) | nasa.gov (handbook PDF; Appendix C also at nasa.gov/reference/appendix-c-how-to-write-a-good-requirement) | Quality checks (Appendix C), verification matrix (Appendix D), requirement attributes |
| INCOSE, *Guide to Writing Requirements* (GtWR) | **Version 4**, INCOSE-TP-2010-006-04, 2023 (date reported as June or July 2023) | **None**: incose.org product page and the public v4 summary sheet and overview PDFs returned HTTP 403 (bot challenge) | — | Provisional only. Third-party summaries say 15 characteristics (C1–C15) and 42 rules (R1–R42); **not verified** |
| ISO/IEC/IEEE 29148, *Systems and software engineering — Life cycle processes — Requirements engineering* | **2018** (2nd edition, published 2018-11-30, active; supersedes 2011) | **TOC / listing**: IEEE SA catalogue page (title, status, abstract). ISO OBP preview returned 403 | standards.ieee.org/ieee/29148/6937/ | Provisional only (characteristics and attributes known from secondary sources) |

### What the implementation takes from the full-text sources

**ReqIF 1.2 and its XSDs** (full text): the exchange root `REQ-IF` with `THE-HEADER`, `CORE-CONTENT`
and `TOOL-EXTENSIONS`; seven datatype definitions (Boolean, Date, Enumeration, Integer, Real,
String, XHTML); spec types (`SPEC-OBJECT-TYPE`, `SPEC-RELATION-TYPE`, `SPECIFICATION-TYPE`,
`RELATION-GROUP-TYPE`) with typed attribute definitions; `SPEC-OBJECT`, `SPEC-RELATION`,
`SPECIFICATION` with an ordered `SPEC-HIERARCHY`, and `RELATION-GROUP`; every identifiable element has
a required `IDENTIFIER` and `LAST-CHANGE` and optional `LONG-NAME`, `DESC` and `ALTERNATIVE-ID`.
Rich text is XHTML in the `http://www.w3.org/1999/xhtml` namespace, restricted to the modules the
driver schema includes (text, hypertext, list, edit, presentation, inline style, object, table).
ReqIF itself defines no lifecycle, no revision history, no baselines and no relationship semantics
beyond named relation types: these are tool conventions. The OMG licence allows building software
on the specification but not reposting the documents, so the schemas are **downloaded at build time,
not committed** (see [ReqIF report](../../specifications/requirements-reqif.md)).

**SysML v2.0** (full text): a requirement definition/usage is a kind of constraint with a *subject*,
optional actors and stakeholders, required and assumed constraints, and documentation text (§7.21.1);
nested requirement usages decompose a requirement (§7.21.1); a *satisfy requirement usage* asserts
that a feature bound to the subject satisfies the requirement (§7.21.4); verification is a
verification case whose objective contains `verify` requirement memberships (§7.24); allocation is a
connection-like *allocation usage* (§7.15); requirement derivation is a library connection
`Derivation` with one `originalRequirement` and one or more `derivedRequirements` (§9.6, Requirement
Derivation Domain Library). These map onto our relationship types in
[the SysML mapping](../../specifications/requirements-sysml-mapping.md). Our module stores
requirement text, not constraint expressions, so it never claims SysML v2 conformance.

**NASA SE Handbook Rev 2, Appendix C** (full text): terms (shall/will/should), an editorial checklist
(active voice, product-centred form, consistent terminology, tolerances, free of implementation and
of operations), a general goodness checklist (positive statements, minimise TBD in favour of TBR
with rationale, rationale and assumptions), and a validation checklist (clarity incl. ambiguous terms
such as "and/or", "etc.", indefinite pronouns; one thought per statement; completeness;
compliance; consistency; traceability; correctness; verifiability with a list of unverifiable
terms). Appendix D describes a verification matrix keyed by unique identifier with source document.
These directly seed the **heuristic** quality rules (vague terms, multiple obligations, TBD/TBR,
negative statements, missing tolerance or unit, missing rationale, missing trace) and the
verification method field. NASA itself presents these as checklists for human review, which
supports the brief's position that necessity, feasibility and correctness need engineering
judgement.

## 3. Textbooks

None of the textbooks was available in full text. Publisher pages were inspected for edition and
contents only. Nothing in the implementation depends on claims attributed to these books; where
they are cited it is for well-known topic areas visible in their tables of contents.

| Book | Edition verified | Access | Relevant parts (from contents) |
| --- | --- | --- | --- |
| Dick, Hull, Jackson, *Requirements Engineering* | 4th ed., Springer 2017 (ISBN 978-3-319-61072-6) | **TOC / listing** (Springer listing via search; link.springer.com redirects to login) | Ch. 4 Writing and Reviewing Requirements; Ch. 7 Advanced Traceability (rich traceability, satisfaction arguments); Ch. 8 DOORS |
| Laplante, Kassab, *Requirements Engineering for Software and Systems* | 4th ed., CRC Press/Auerbach 2022 (ISBN 9781032275994) | **TOC / listing** (publisher listing and blurb) | Writing the specification, validation, management and tools; new chapter on non-functional requirements |
| Pohl, *Requirements Engineering: Fundamentals, Principles, and Techniques* | 2nd English ed., Springer 2025 (ISBN 978-3-662-69204-2); 1st ed. 2010 | **TOC / listing** (part structure on the author site re-buch.de) | Parts III–V: documentation, artefacts (goals, scenarios, solution-oriented requirements), validation and management |
| van Lamsweerde, *Requirements Engineering: From System Goals to UML Models to Software Specifications* | 1st ed., Wiley 2009 (ISBN 9780470012703) | **TOC / listing** (Wiley pages, partial) | Specification and documentation; requirements quality assurance; evolution and traceability; goal refinement |
| Wiegers, Beatty, *Software Requirements* | 3rd ed., Microsoft Press 2013 (ISBN 9780735679665) | **TOC / listing** (Microsoft Press, Pearson, O'Reilly contents) | Writing excellent requirements; validation; reuse; requirements management, change and traceability; tools |
| Alexander, Stevens, *Writing Better Requirements* | 1st ed., Addison-Wesley 2002 (ISBN 0321131630) | **TOC / listing** (partial contents) | Requirement attributes; writing guidelines and common mistakes; checking and reviewing |

Where the books and the inaccessible standards are expected to add guidance (attribute sets,
characteristics of requirement sets, rich traceability, review practice), the implementation keeps
the behaviour **configurable** (custom attributes, configurable writing conventions, typed
relationships with documented semantics) instead of hard-coding a rule set attributed to a source
we have not read. If the user supplies PDF copies in `docs/research/requirements/sources/`
(gitignored), the provisional items in [acceptance-and-backlog.md](acceptance-and-backlog.md) §4 will
be checked against them.

## 4. Commercial tools: documentation inspected

| Product | Distinguished from | Documentation inspected | Access |
| --- | --- | --- | --- |
| IBM Engineering Requirements Management **DOORS** (classic, 9.7.x) | DOORS Next (separate product, web-based, part of IBM ELM) | ibm.com/docs: "Exchanging requirements with other databases" (DOORS 9.7.2, ReqIF definitions, packages, locks, merge); "Exporting ReqIF packages" (9.7.0, via search) | **Partial** (public help topics) |
| IBM Engineering Requirements Management **DOORS Next** 7.x | DOORS classic | ibm.com/docs: DOORS Next 7.1 documentation index (modules vs collections, artifacts, attributes and data types, link types and constraints, baselines and e-signatures, change sets, streams and configurations, reviews, ReqIF, reports, OSLC); 7.0.3 topic "Importing and exporting ReqIF files" | **Partial** (public help topics; individual topics read for ReqIF) |
| Siemens **Polarion Requirements** (Polarion ALM) | — | siemens.com product page; Polarion ALM 2410 release blog (ReqIF cross-references, Collections baselines, REST API); official help on docs.sw.siemens.com rendered no content (JavaScript and/or Siemens login) | **Partial** (marketing page and release notes only; official help **not** accessible) |
| **Jama Connect** | — | help.jamasoftware.com: "Getting to know Jama Connect features"; "Reuse baselined items" | **Partial** (public help). The Data Exchange (ReqIF) user guide is on support.jamasoftware.com and was not read |
| PTC **Codebeamer** | — | support.ptc.com/help/codebeamer: "Requirements Interchange Format (ReqIF)" (r2.1), "Import ReqIF Data into an Existing Project" (r2.2) | **Partial** (public help topics) |

Findings for the matrix are limited to what those pages state. Search-result snippets that were not
confirmed on an inspected page are marked as such in the matrix.

## 5. Findings that shape the design

1. **ReqIF carries the head state only.** ReqIF has no revision history, comments or baselines
   (Codebeamer r2.1 ReqIF page states this explicitly; the OMG model has no such elements). Export
   therefore exports one chosen state (working, configuration-filtered or a baseline) and reports
   what is not carried (lifecycle, reviews, history, allocation to twin components).
2. **Re-import depends on stable identifiers per source.** DOORS (merge into an existing
   definition), Codebeamer (known data source identified by header IDs; warns on re-importing an
   older file) and Polarion (release notes and community guidance) all match on the exchange
   identifiers. Our mapping is keyed by *exchange source* and ReqIF `IDENTIFIER`, never by canonical
   UUID, and absence from a file never deletes local data (brief §7).
3. **Document view vs. object identity.** DOORS Next distinguishes modules from collections and
   lets an artifact be reused in several modules; ReqIF allows the same SPEC-OBJECT in several
   specifications and more than once in one (Codebeamer page). Our collections hold *references* to
   requirements with ordered membership and headings, and a requirement may appear in several
   collections. Hierarchy never implies derivation (contracts §2).
4. **Baselines pin revisions; configurations are separate.** DOORS Next separates baselines,
   change sets and streams/configurations; Polarion distinguishes baselines from branching and has
   collection baselines. We implement immutable baselines and configuration *applicability*; full
   streams/branching are backlog.
5. **Reviews and e-signatures** are documented for DOORS Next, Jama and Polarion. We implement
   review records with decisions on an exact revision, distinct from lifecycle status; legally
   binding e-signatures are out of scope and not claimed.
6. **Quality assistance as advice.** NASA Appendix C is a checklist for reviewers. Jama markets
   AI-based requirement analysis as a paid add-on (Jama Connect Advisor). We keep deterministic
   validation, heuristic suggestions and optional AI review visibly separate, with dismissals and
   no automatic rewriting.
