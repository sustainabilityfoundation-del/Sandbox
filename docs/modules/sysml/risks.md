# Risk register

Status: maintained by the SysML agent; summarized in the progress file. Likelihood/impact: L/M/H.

| ID | Risk | L | I | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | The textual notation grammar is large; a hand-written parser covers a subset and may diverge from the spec grammar | H | H | Documented subset; conformance tests against official examples (fetched, not committed) with an explicit list of unsupported constructs; optional pilot implementation as oracle | SysML | Open |
| R-02 | Standard library licence may not allow bundling; implicit specializations need library names | M | M | Platform subset library with our own text and deterministic IDs; official library loaded locally when fetched (ADR-0036) | SysML | Open |
| R-03 | Large models (10⁵–10⁶ elements) exceed in-memory caches and browser capacity | M | H | Head index, per-owner lazy loading, cost-proportional commits; measured baseline; partitioning and workers in Phase 5 | SysML | Open |
| R-04 | Semantic merge is hard; parallel branches diverge | M | M | Element-level change sets from day one; merge in Phase 5; until then rebase-on-head when touched sets do not overlap | SysML | Open |
| R-05 | Shared contracts (SDK service, ArtifactRef scheme, CAD mapping, boundaries test) block integration | M | M | Change requests CR-SYSML-01…06 sent early; factory-based client wiring until the SDK service exists | Coordinator | Open |
| R-06 | Name resolution and validation semantics subtly differ from the spec (inheritance, redefinition, visibility) | M | M | Tests per rule; oracle comparison when available; diagnostics labelled with our rule IDs, not spec constraint names | SysML | Open |
| R-07 | Text reconciliation loses element identity on rename-in-text | M | M | Preview shows delete+create explicitly; inspector rename preserves identity; match by short name | SysML | Open |
| R-08 | Plain text area without highlighting/completion feels weak vs. SysIDE/SysON | H | L | CodeMirror 6 editor (sprint 2): highlighting, completion of keywords and model names, diagnostics in place; still no go-to-definition, rename or semantic highlighting | SysML | Mitigated |
| R-09 | elkjs bundle size (~1.5 MB) slows first diagram load | M | L | Lazy-load layout; fall back to a simple layered layout | SysML | Open |
| R-10 | AI proposals produce semantically valid but wrong engineering models | H | M | Preview + approval, reject-new-errors policy, provenance, explain_commit, assumptions listed; no autonomous apply | SysML | Open |
| R-11 | Two SysML tools (illustrative and modeler) confuse users | M | L | Distinct names and help; replacement decision is the coordinator's (contracts §1) | Coordinator | Open |
| R-12 | Re-implemented service infrastructure (migrations, outbox) drifts from the Requirements service | M | L | CR-SYSML-06 (shared package) | Coordinator | Open |
| R-13 | Standards evolve (SysML 2.x revisions, API versions) | M | M | Metamodel registry as single source; version recorded in project metadata | SysML | Open |
| R-14 | Usage quota interruptions lose work | M | M | Commit at each green checkpoint; progress file handoff log | SysML | Open |
| R-15 | Implicit library specializations are a derived subset (typed usages do not also subset the library base feature; no `isImplied` relationships in API JSON), so some names that resolve in the specification still fail and API consumers do not see implied relationships | M | M | Table-driven (`IMPLIED_GENERALS`), tested, documented in conformance.md §4; the corpus measurement tracks unresolved names; expose implied relationships at the API `derived` level when needed | SysML | Open |
