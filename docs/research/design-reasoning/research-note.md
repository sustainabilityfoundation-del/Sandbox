# Design Reasoning Layer: research note

Prepared 14 October 2026 by the Design Reasoning Architecture Agent for brief §12 and the math-stack
question (brief §6). Architecture set: [docs/modules/design-reasoning/](../../modules/design-reasoning/README.md).

This note records **which sources were actually inspected and how much of each was accessible**. It
paraphrases and cites by section. It does not reproduce substantial text and claims no conformance
with any standard or method.

## 1. Access levels

| Level | Meaning |
| --- | --- |
| **Full text** | The complete document (or the complete chapter named) was retrieved and the relevant parts read |
| **Partial** | Part of the body text was readable (truncated page, or text extraction that lost prose) |
| **Abstract** | Only the publisher's or repository's abstract and bibliographic record |
| **TOC** | Only a table of contents or catalogue entry |
| **Secondary** | Only third-party descriptions (encyclopaedia, survey). Used for orientation, never as evidence |
| **None** | Not reachable (paywall, refused connection, scanned image without text) |

Tooling note: this machine has no PDF renderer and no Python. PDFs were read either through the web
fetcher or with a small throwaway text extractor written for this session (Flate streams, literal
strings only). It recovered prose from the NIST report and the interval-constraints paper; for the
SysML v2 specification it recovered clause numbers, headings, element names and code examples but
**not** the body prose. That is why SysML v2 is rated *Partial* below.

## 2. Sources

### Function, behaviour, structure and function–means

| Source | Access | Used for |
| --- | --- | --- |
| Gero, J.S. (1990) "Design prototypes: a knowledge representation schema for design", *AI Magazine* 11(4), 26–36, doi:10.1609/aimag.v11i4.854 | **Abstract**. The open PDF (AAAI) is a scanned image with no text layer; it could not be read | Citation only |
| Gero & Kannengiesser (2004) "The situated function-behaviour-structure framework", *Design Studies* 25(4), 373–391 | **Abstract** (Drexel repository record) | Citation only |
| Wikipedia, "Function-Behaviour-Structure ontology" | **Secondary** | F, Be, Bs, S variables and the eight processes (formulation, synthesis, analysis, evaluation, documentation, three reformulations); situated FBS three worlds |
| Raja & Isaksson (2015) "Generic functional decomposition … using a configurable component approach", *Advances in Transdisciplinary Engineering* 2, 337–346, doi:10.3233/978-1-61499-544-9-337 | **Abstract** | Enhanced function–means (EF-M) tree: functional requirements, means and constraints alternating by level |
| Johannesson & Claesson (2005) "Systematic product platform design: a combined function-means and parametric modeling approach", *J. Eng. Design* 16(1) | **None** (cited in a Springer reference list only) | Citation only |
| Fenves, Foufou, Bock, Sudarsan, Bouillon, Sriram (2004) *CPM 2: A Revised Core Product Model for Representing Design Information*, NISTIR 7185, doi:10.6028/NIST.IR.7185 | **Full text** (NIST PDF; abstract, class diagram text, class definitions read) | Artifact/Function/Form/Behavior/Specification/Requirement split; transfer functions and flows; a `type` attribute per class with an independent taxonomy as the extension mechanism |
| Fenves (2001/2002) *A Core Product Model for Representing Design Information*, NISTIR 6736 | **Abstract** (NIST catalogue) | Citation only (CPM 2 supersedes it) |

### Axiomatic design and DSM

| Source | Access | Used for |
| --- | --- | --- |
| Suh, N.P., *Axiomatic Design*, Chapter 1 (1996 web version for MIT course 2.882), web.mit.edu/2.882/www/chapter1/chapter1.htm | **Partial** (about the first 100,000 characters of the chapter, up to §1.7.10) | Four domains; FRs, DPs, PVs; constraints as bounds rather than FRs; design matrix (uncoupled, decoupled, coupled); zigzag decomposition; Independence and Information axioms |
| MIT OCW ESD.33 (2010) lecture 6 slides on axiomatic design | **Secondary** (search summary only) | Not used |
| dsmweb.org, "Introduction to DSM" | **Full text** (single page) | DSM basics: square matrix of element interactions; parallel, sequential and coupled patterns; clustering and sequencing |
| Eppinger & Browning (2012) *Design Structure Matrix Methods and Applications*, MIT Press | **TOC** (library records) | Product, organization and process DSMs and multi-domain matrices (MDM) as the book's structure; no content used beyond that |

### MBSE and SysML v2

| Source | Access | Used for |
| --- | --- | --- |
| OMG, *SysML v2.0 Part 1: Language Specification*, formal/2026-03-02 (dated March 2026; SysML 2.0 formal, published September 2025) | **Partial**: clause numbers, headings, element names and textual-notation examples extracted; body prose not extractable | Where SysML v2 models the concepts we need: §7.15 Allocations, §7.17 Actions, §7.19 Calculations, §7.20 Constraints (constraint def/usage, assert constraint), §7.21 Requirements, §7.22 Cases, §7.23 Analysis Cases incl. §7.23.3 Trade-Off Analyses, §7.24 Verification Cases, §7.27 Metadata; Analysis Domain Library §9.4.5 Trade Studies (`TradeStudy`, `EvaluationFunction`, `TradeStudyObjective`, `MinimizeObjective`, `MaximizeObjective`); Quantities and Units library §9.8.2 Quantities, §9.8.4 ISQ, §9.8.6 SI |
| OMG, *Systems Modeling API and Services* 1.0, formal/26-03-04 (September 2025) | **Abstract** (spec catalogue page) | Existence of a standard API with a REST/HTTP binding and OpenAPI files; future integration target for the SysML module, not for this layer |
| docs/specifications/requirements-sysml-mapping.md (this repository; the Requirements agent read SysML v2 Part 1 in full) | **Full text** | Existing mapping rules and the "no SysML v2 conformance" position |

### Design rationale and decision records

| Source | Access | Used for |
| --- | --- | --- |
| Nygard, M. (2011) "Documenting Architecture Decisions", cognitect.com blog | **Full text** | Small immutable decision records; context, decision, status, consequences; superseding without deleting |
| Wikipedia, "Design rationale" | **Secondary** | IBIS (issues, positions, arguments; Kunz & Rittel 1970, UC Berkeley Working Paper 131), QOC (questions, options, criteria, assessments; MacLean et al.), DRL (decision problems, alternatives, goals, claims; Lee 1991, ICSE 13); capture cost and intrusiveness of formal rationale |
| Kunz & Rittel (1970) "Issues as elements of information systems" | **None** (no authorised copy found) | Citation only |
| Regli, Hu, Atwood, Sun (2000) "A survey of design rationale systems", *Engineering with Computers* 16(3–4), 209–235 | **Abstract** (Drexel record). A copy on a university course site was found but not used because its authorisation could not be confirmed | Classification of rationale systems as argumentation-based, descriptive or process-based |

### Knowledge-based engineering, constraints, ontologies

| Source | Access | Used for |
| --- | --- | --- |
| La Rocca (2012) "Knowledge based engineering: between AI and CAD", *Adv. Eng. Informatics* 26(2), 159–179, doi:10.1016/j.aei.2012.02.002 | **None** (ScienceDirect HTTP 403; ResearchGate offers request-only access) | Citation only |
| Kügler, Dworschak, Schleich, Wartzack (2023) "The evolution of KBE from a design research perspective: literature review 2012–2021", *Adv. Eng. Informatics* 55, doi:10.1016/j.aei.2023.101892 | **Abstract** (FAU repository) | Finding that reuse and adoption remain hard: weak links from knowledge sources to automation, unclear application areas |
| O'Sullivan & Bowen (1998) "A constraint-based approach to supporting conceptual design", *AI in Design '98*, 291–308 | **Abstract-level** (keywords only) | Constraint filtering as the basis of interactive conceptual design; Pareto optimality |
| Wang, Y. (2004) "Solving interval constraints in computer-aided design", REC 2004 (Georgia Tech proceedings) | **Full text** (opening sections read) | Parameter ranges carry design intent and feasibility from early design into optimization bounds; soft (nominal-interval) constraints reduce conflicts |

### Multidisciplinary design optimization

| Source | Access | Used for |
| --- | --- | --- |
| Martins & Ning (2022) *Engineering Design Optimization*, Cambridge University Press, doi:10.1017/9781108980647; free HTML at mdobook.github.io | **Partial**: Ch. 1 (most of it), Ch. 9 (§9.1–9.4 and summary), Ch. 13 (about 80%, up to §13.3.3). The free PDF host refused connections | Problem formulation (design variables, objective, constraints; quantities that should be limits rather than objectives); Pareto dominance; weighted-sum limitations; ε-constraint; NSGA-II; presenting trade-offs; coupled systems in residual form; DSM/XDSM; OpenMDAO as a practical framework. **Not read:** the MDF/IDF/SAND and distributed-architecture sections |

### AI tool interfaces (provider independence)

| Source | Access | Used for |
| --- | --- | --- |
| Model Context Protocol specification 2025-06-18, "Server → Tools" | **Full text** (page) | Provider-neutral tool definition shape (name, title, description, JSON Schema `inputSchema`, optional `outputSchema`, annotations), structured results, protocol vs execution errors, human-in-the-loop and validation guidance. Used as a design reference only; MCP is not adopted by this architecture |

### Mathematics libraries (brief §6)

Read from the npm and PyPI registries and GitHub API on 14 October 2026 (**full** metadata), plus the mathjs
documentation pages on units, security and the function reference (**full text**).

| Candidate | Latest version (release date) | Licence | Maintenance signal | Notes |
| --- | --- | --- | --- | --- |
| **mathjs** | 15.2.0 (2026-04-07) | Apache-2.0; all nine runtime deps MIT | ~15k stars, pushed 2026-09-13, regular releases, TypeScript types | Expression parser with AST, evaluation, `simplify`, `derivative`, `rationalize`, linear solvers (`lusolve`), `polynomialRoot`, `solveODE`, units with `equalBase`. **No** general nonlinear solver and **no** optimization. Docs warn that the parser should be restricted (`import`, `createUnit`, `evaluate`, `parse`, `simplify`, `derivative`, `resolve` are the high-risk functions) and run in a worker with time limits; offset temperatures misbehave in arithmetic |
| js-quantities | 1.8.0 (2023-08-21) | MIT | last push 2024-03 | Units only; no bundled types |
| UnitMath | 1.1.1 (2024-10-05) | Apache-2.0 | 36 stars | Units only |
| nerdamer | 2.0.0 (2026-10-02) | Apache-2.0 | active | Symbolic algebra incl. solve. **Excluded:** 2.0.0 is less than two weeks old; 1.1.13 dates from 2021 |
| Algebrite | 1.4.0 (2021-04-14) | MIT | inactive | CAS; no types |
| SymPy (Python worker) | 1.14.0 (2025-04-27) | BSD | very active | Full CAS incl. solving and units (with Pint 0.26.1, BSD). Adds a Python runtime and a process boundary |
| SciPy / OpenMDAO (Python worker) | 1.18.1 (2026-08-21) / 3.45.1 (2026-09-11) | BSD-3 / Apache-2.0 | active | Root finding, optimization, MDO; candidates for phase 3 only |
| Pyodide | 314.0.7 (2026-09-14) | MPL-2.0 | active | Python in WebAssembly; heavy; not needed |
| javascript-lp-solver | 1.0.3 (2026-01-24) | Unlicense | revived 2026 | LP/MILP; possible phase 3 option |
| glpk.js | 5.0.0 (2025-12-23) | **GPL-3.0** | — | Excluded (licence) |

Recommendation and rationale: [mathematics.md](../../modules/design-reasoning/mathematics.md) and
[ADR-0021](../../decisions/0021-calculation-models-and-math-stack.md).

## 3. What the architecture takes, and what it leaves out

| Idea | Verdict | Where it appears |
| --- | --- | --- |
| **Function separate from solution** (FBS function; Suh FRs vs DPs; CPM Function vs Form) | **Adopt.** It is the brief's core principle and the main gap in today's Conceptualize model | Function entity, CR-C1 |
| **Function–means alternation** (EF-M tree: function → candidate means → sub-functions of the chosen means) | **Adopt as a view and a validation rule**, not as a separate data structure: `performs` (Concept → Function) plus `decomposes-into` on both sides gives the tree; the "zigzag" of axiomatic design is the same pattern | domain-model.md §4, user-experience.md |
| **Expected vs derived behaviour** (FBS Be vs Bs; evaluation compares them) | **Adopt lightly**: a Function's performance objectives are expected behaviour; calculated or analysed results attached as evidence are derived behaviour; the comparison is a constraint check | mathematics.md, exploration.md |
| FBS reformulation processes | **Adopt as vocabulary** for exploration steps (reformulate function, constraints or structure), not as a workflow engine | exploration.md |
| Situated FBS (three worlds, 20 processes) | **Leave out.** A cognitive model of designers; no platform behaviour depends on it | — |
| **Design matrix / coupling** (Suh) and **DSM** | **Adopt as derived analyses**: a Function × Concept matrix and a design-element DSM computed from typed links; coupling flags in trade studies. No separate matrix store | knowledge-representation.md §5 |
| Information axiom (probability of success) | **Leave out** as a formal criterion; it needs distributions that conceptual data rarely has. A trade-study criterion can express it | — |
| **IBIS/QOC/DRL argumentation** | **Adopt the minimal structure**: question → options (alternatives) → criteria (trade study) → decision with supporting and contradicting evidence. Conceptualize already has most of it | domain-model.md §6 |
| Full argumentation graphs (Toulmin warrants, rebuttals, issue maps) | **Leave out.** Capture cost and intrusiveness are the documented reasons rationale systems fail | — |
| **ADR form** (immutable records, supersede instead of edit) | **Adopt** for DesignDecision supersession (already in Conceptualize) and for this architecture's ADRs | domain-model.md §6 |
| **KBE** generative rules | **Adopt only the principle** that reusable engineering knowledge (calculation models) is explicit, versioned and executable by deterministic code. A KBE language or generative-geometry engine is out of scope | mathematics.md |
| **Constraint-based design**, interval parameters | **Adopt** ranges (`min`/`max`) as first-class intent and propagate them as bounds; constraint checks are deterministic tool calls | mathematics.md §5 |
| Constraint propagation / CSP solvers | **Defer** to phase 3, behind the calculation-engine port | roadmap.md |
| **MDO** formulation (design variables, objectives, constraints; Pareto) | **Adopt** the formulation vocabulary in DesignExploration and Pareto dominance in comparisons | exploration.md |
| MDO architectures (MDF/IDF/SAND), coupled adjoints | **Leave out** until a multidisciplinary analysis capability exists; an external framework (OpenMDAO) would provide them | roadmap.md risks |
| **SysML v2** constraints, calculations, analysis cases, trade studies, ISQ/SI | **Use as the mapping target** for formalization; keep our representation compatible (subject, objective, alternatives, evaluation function) without claiming conformance | formalization.md |
| **CPM** per-class `type` with an independent taxonomy | **Adopt** as the extension mechanism (classifications and registered relationship types) instead of a global ontology | knowledge-representation.md §6 |
| OWL/RDF ontologies, reasoners, a graph database | **Leave out.** The brief forbids a graph database without demonstrated need; the extension mechanism above covers the use cases | ADR-0018 |
| MCP-style tool definitions (input and output schema, annotations) | **Adopt the shape** for provider-independent tool schemas | ai-tools.md |
