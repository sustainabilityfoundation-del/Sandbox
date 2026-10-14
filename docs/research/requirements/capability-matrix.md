# Requirements tools: source-backed capability matrix

Prepared 13 October 2026. Sources and access levels: [research note](research-note.md) §4. This is
a reading of public documentation, **not** a feature comparison test and **not** a parity claim.
Absence of a mark means "not found in the pages inspected", not "the product lacks it".

## Evidence classes

| Mark | Meaning |
| --- | --- |
| **D** | Documented capability, stated on an official page that was inspected (source ID given) |
| **S** | Stated only in a search-result snippet of an official page; the page itself was not read, so **unverified** |
| **I** | Our interpretation (inference from related documented features; may be wrong) |
| **P** | Documented as a separately licensed add-on or paid extension |
| **X** | Provided through an integration or connector, not in the product core |
| — | Not found in the inspected pages |

## Source IDs

| ID | Source (all official vendor pages, inspected 13 Oct 2026 unless marked S) |
| --- | --- |
| DN1 | IBM Docs, DOORS Next 7.1 documentation index (ibm.com/docs/en/engineering-lifecycle-management-suite/doors-next/7.1.0) |
| DN2 | IBM Docs, DOORS Next 7.0.3, "Importing and exporting ReqIF files" |
| D1 | IBM Docs, DOORS 9.7.2, "Exchanging requirements with other databases" (c_aboutRIF) |
| D2 | IBM Docs, DOORS 9.7.0, "Exporting ReqIF packages" (**S**: search snippet only) |
| PO1 | Siemens, Polarion REQUIREMENTS product page (siemens.com/en-us/products/polarion/requirements/) |
| PO2 | Siemens blog, "Polarion ALM 2410 – What's new and noteworthy" |
| PO3 | Siemens blog, Polarion ALM 2404 and 2310 release notes (**S**: search snippets only) |
| J1 | Jama Connect Help, "Getting to know Jama Connect features" |
| J2 | Jama Connect Help, "Reuse baselined items" |
| J3 | Jama Support, "Data Exchange for Jama Connect User Guide" (**S**: search snippet only; may need customer login) |
| C1 | PTC Codebeamer Help r2.1, "Requirements Interchange Format (ReqIF)" |
| C2 | PTC Codebeamer Help r2.2, "Import ReqIF Data into an Existing Project" |
| C3 | PTC Codebeamer Help r2.1, "Select Project Baseline and Contents to Export" and "Project Import and Export Restrictions" (**S**) |

## Matrix

| Capability | DOORS 9.7 (classic) | DOORS Next 7.x | Polarion Requirements | Jama Connect | Codebeamer | This module (first release) |
| --- | --- | --- | --- | --- | --- | --- |
| **Authoring** (structured text, rich text) | I (module objects; not read) | D artifacts, requirement and base artifacts (DN1) | D LiveDocs, Word/Excel import wizard (PO1) | D items with versioning and status (J1) | I trackers/items (C1) | Title, statement, rationale and other fields as separate fields; XHTML from ReqIF shown sanitised |
| **Hierarchy / documents** | I formal modules (D1 mentions modules) | D modules vs collections; module structure (DN1) | D documents; collections (PO2) | D Explorer tree, sets, folders (J1) | D ReqIF specifications ≈ tracker document view; items may appear in several specifications (C1) | Collections with headings, ordered membership; a requirement may be in several collections; hierarchy never implies derivation |
| **Attributes** (typed, custom) | I | D attributes and data types, multi-value (DN1) | — | I item types and fields (J1) | D item types ≈ trackers, fields (C1) | Typed custom attribute definitions (string, integer, real, boolean, date, enumeration incl. multi-valued, XHTML) |
| **Reuse** | — | D artifacts reused across modules (DN1) | D derived documents, branching, push master changes (PO1) | D reuse and synchronisation; reuse from baselines with restrictions (J1, J2) | D same item in several specifications (C1) | Requirement in several collections (reference, not copy). Copy-with-sync is backlog |
| **Traceability** | I link modules (not read) | D link types, direction, constraints, link validity (DN1) | D traceability, change control (PO1) | D Traceability Information Model, trace views, suspect links (J1) | D associations with attributes such as "suspected" (C1) | Typed relationships with documented direction and endpoints; trace matrix; impact view; suspect flagging via revision pins is backlog |
| **Baselines** | I | D baselines, e-signed baselines (DN1) | D Collection/Document baselines, upstream baselines (PO2); "time machine" history (PO1) | D baselines as snapshots, restore, reuse, export (J1, J2) | S project baselines selectable for export (C3) | Immutable baselines pinning requirement revisions, relationship revisions and collection structure; comparison |
| **Reviews / approvals** | — | D reviews, comments (DN1) | D e-signatures for review/approval (PO1) | D reviews with e-signatures (J1) | — | Review records with decisions on an exact revision; lifecycle draft → in-review → approved → retired. No legally binding e-signature |
| **Change control** | D locks and merge for exchange (D1) | D change sets linked to work items (DN1) | D rule-based workflow with audit trail (PO1) | D impact analysis, versioning (J1) | — | Optimistic concurrency, change reason per revision, append-only history, impact assessment. Formal change requests are backlog |
| **Configurations / variants** | — | D components, streams, configurations, compare (DN1) | D branching for product lines (PO1) | D categories for variants (J1) | — | Configuration applicability (twin configuration IDs) and configuration-filtered reads. Streams/branches are backlog |
| **Verification links** | — | D links to other lifecycle applications (DN1) | D test case specifications exchange (PO1) | D test plans and runs traced to requirements (J1) | — | Verification method and acceptance criteria fields; verification results stay twin artifacts (ADR-0007) |
| **Search / filters** | — | D filters and views in modules (DN1) | D reports, queries (PO1, I) | D filters (J1) | S tracker views used for export filtering (C3) | Full-text search, filters, configurable columns, saved views, cursor pagination |
| **Bulk editing** | — | I | — | — | — | Validated bulk operations (atomic or per-item outcomes) |
| **Permissions** | D locks (exchange) (D1) | I | D security (PO1) | D admin controls user access (J1) | D import requires permissions on target tracker and fields (C2) | Reader, editor, reviewer, administrator roles plus entitlements, enforced by the backend |
| **Audit** | — | D artifact history (DN1) | D audit trails (PO1) | D versioning for auditing (J1) | D import statistics with updated values (C2) | Append-only audit events with actor, timestamp, reason (no tamper-proof claim) |
| **APIs** | — | D OSLC services, reportable REST API (DN1) | D Java Open API, Web Services API; REST API for collections (PO1, PO2) | — (REST API not on inspected pages) | — | Versioned HTTP API with OpenAPI 3.1; SDK contract for SysML and CAD |
| **Reporting** | — | D document-style and data warehouse reports (DN1) | D LiveReports, PDF, BIRT, dashboards (PO1) | D Word/Excel export, templates (J1) | — | Trace matrix, quality summary, JSON export. Document reports are backlog |
| **ReqIF exchange** | D ReqIF definitions, packages, locks, merge on re-import; ReqIF 1.0/1.1/1.2 treated as equivalent (D1) | D import/export of .reqif/.reqifz, merge on re-import, report after import/export (DN2) | D built-in exchange (PO1); D cross-reference import for round trips (PO2) | P ReqIF via Jama Connect Interchange add-on (J1); S Data Exchange modes with/without ID preservation (J3) | D .reqif/.reqifz, ReqIF ≥ 1.0.1, head revision only (C1); D source matched by header IDs, warns on older file (C2) | .reqif and .reqifz import with preview (new/changed/unchanged/conflicting), source-keyed mapping, no deletion on absence, schema validation, export of selections, configurations and baselines |
| **AI assistance** | — | — | — | P Jama Connect Advisor (J1) | — | Deterministic checks, heuristics and optional assistant review, all explainable and dismissible |
| **Integrations** | — | D OSLC links across domains (DN1) | X Simulink, Azure DevOps, Jira, Rhapsody connectors (PO1, PO2) | P/X Jama Connect Interchange (Jira and others) (J1) | — | SysML and CAD through the platform SDK; no external connectors |

## Interpretations and caveats

- "I" cells are deliberately few. DOORS classic's module/object/attribute model is widely known,
  but the pages read for this matrix were about exchange only, so it is not marked D.
- Pricing and licensing are not documented on the inspected pages except where a page names an
  add-on (Jama Connect Advisor, Jama Connect Interchange). Nothing here states that a core feature is
  free or included.
- Version coverage differs: Codebeamer pages are r2.1/r2.2, DOORS Next 7.0.3/7.1, DOORS 9.7.x,
  Polarion release 2410 and the current product page, Jama current help.
