# Requirements navigation and filtering at scale

Status: **Requested / planned**, 14 October 2026. This document adds backlog work; it does not
implement UI or change existing API contracts. Follow the [development workflow](../development-workflow.md).

## Goal and current boundary

Keep the left-hand Requirements submenu usable with thousands of requirements: a configurable
visible window (default 10), scrollable navigation and a compact filter toolbar above the results.
All matching requirements remain reachable. “Carousel” here means a vertical, bounded results
navigator, not horizontally sliding cards or a truncated top-ten list.

The main Requirements table already supports search, filters, cursor pagination and saved views.
Reuse those capabilities and extend them where necessary; do not build a second query engine.
The left navigation is currently hosted by `apps/workspace/src/shell/ProductTree.tsx`; it is
Platform-owned. Requirements query/domain behaviour belongs to the Requirements module. Agree on
SDK changes with the coordinator before changing shell or shared contracts. Do not couple CAD to
Requirements or import a tool's private implementation into the shell.

## Functional requirements

| ID | Requirement |
| --- | --- |
| NAV-R01 | Default to 10 visible requirement rows. Provide a validated configurable visible-result count, persisted as a user preference through the host's approved mechanism. Never limit stored or searchable requirements to that count. |
| NAV-R02 | Provide a vertically scrollable bounded viewport, previous/next result-window controls and keyboard navigation. Keep the filter toolbar accessible and show current range and matching total, for example “11–20 of 248”. Do not wrap the last page to the first silently. |
| NAV-R03 | Use stable ordering with a unique ID tie-breaker. Cursor/page state is bound to project, configuration/baseline, query and sort. Reset invalid cursors when those inputs change. Refresh predictably after committed changes, explaining when results shift. |
| NAV-R04 | Toolbar includes search, context toggle, structured filter controls, sort, clear filters and visible-row preference. Display removable active-filter chips and the effective context. Provide loading, error, empty-project and no-match states. |
| NAV-R05 | Context filtering can resolve selected CAD/SysML representations to stable component identities and explicit allocations. Offer direct allocation and, where supported, descendant-assembly/defined related-link scope. Show which relationship scope is applied. Filtering never changes allocation. |
| NAV-R06 | Context is optional. Handle no selection and multiple selected components explicitly; default multiple-component matching to the union, labelled “any selected component”. Selecting a requirement keeps the last component context rather than accidentally clearing it. |
| NAV-R07 | Structured filters support text/ID, lifecycle, type, explicit classification/tags, allocation, implementation status, verification outcome and evidence freshness as data permits. Default AND between categories and OR within multi-valued choices; display non-default logic. |
| NAV-R08 | Approval, implementation, modelled satisfaction, verification outcome and evidence freshness remain distinct. “Verified” means current applicable evidence for the selected revision/configuration under documented rules, not approved or previously passed. Missing evidence/unsupported data is unknown or not verified, never a fabricated success. |
| NAV-R09 | Preserve selection and an accessible detail path when filters exclude the selected requirement. Explain “selected requirement is outside these results”; do not inject it into the filtered count or silently deselect it. |
| NAV-R10 | Filtering changes which results are shown. Selection and bulk actions are separate. Make current-page versus all-matching selection explicit, with count and scope; never equate the visible ten with all matches. |
| NAV-R11 | Natural-language requests resolve into the same typed filter/query model used manually. Show resulting chips/criteria. Expose search, filters, sorting, window navigation and settings as validated AI operations targeting an explicit view. |
| NAV-R12 | Preserve saved views and existing edit/review/baseline workflows. Save reusable criteria separately from transient cursor, scroll and selection state. Contextual presets store a relative rule or an explicit component ID deliberately, not an accidental stale selection. |

### Examples and ambiguity

- “Show safety requirements for the selected component”: explicit safety classification AND the
  displayed allocation scope. Safety classification may be an existing type or configured attribute;
  resolve the project's definition. Keyword search alone is not authoritative classification.
- “Show implemented requirements that are not currently verified”: implementation status AND
  verification/freshness semantics. Document whether failed, stale, inconclusive and missing evidence
  are included, and expose those choices to the user.
- “Show requirements with stale verification evidence”: evaluate evidence against exact input
  revisions and the active configuration/baseline.
- “Select all matching requirements”: a separate explicit selection operation, not merely a filter.

If a requested field has no canonical source, surface that gap. Propose a typed attribute/contract
addition with migration and ownership review; do not invent data or misuse lifecycle status.
Questions are needed only when ambiguity changes the result meaning. Manual filters must work
without a real AI provider; do not present natural-language execution as working before integration.

## Query, state and performance constraints

- Filter and sort before pagination. Never fetch ten unfiltered requirements and then filter those ten.
- Use the existing service/client/SDK boundaries and server-side authorization. Query counts must
  use exactly the same permissions and criteria as results; do not leak inaccessible counts.
- Use bounded queries and bounded rendered rows. A fixed viewport alone is insufficient if an
  ever-growing list remains mounted. Use windowing/virtualization or page replacement as appropriate.
- Review the existing workspace requirements projection: do not claim backend scalability merely
  because the sidebar displays ten while the host still fetches every requirement in the project.
  Record any dependency on changing projection/query behaviour as explicit Platform work.
- Verification filtering currently spans API requirements and twin artifacts. Agree on a correct
  query/projection strategy before pagination; filtering only the current page is incorrect.
- Exact totals and backwards navigation must follow documented query semantics. If the existing
  service lacks these capabilities, propose additive contracts rather than fabricating totals or
  simulating a full dataset by unbounded client downloads.
- Debounce text queries, cancel superseded requests and ignore stale responses. A late response
  must not replace results for a newer context, search or configuration.
- Keep active criteria/cursor/scroll private to each view instance. Cross-surface synchronization
  is explicit and optional; do not silently change every open requirements view.
- Persist preferences through Platform/SDK services. The tool must not access localStorage directly.
- Keep baseline views historical and read-only; show unavailable historical status rather than
  borrowing a current implementation/verification value without explanation.

## Delivery backlog and ownership

This is proposed upcoming work, not an active sprint or permission to rewrite unrelated modules.
Use existing sprint numbering when the coordinator schedules it; do not replace completed records.

| Increment | Requirements owner | Platform/coordinator dependency | Demonstrable exit |
| --- | --- | --- | --- |
| A: bounded navigation | Reuse existing query behaviour; define preference, ordering/count and cursor needs | Implement left submenu toolbar/viewport/navigation and preference access | Ten visible by default; configurable; every result reachable; counts and selection correct |
| B: contextual and structured filters | Shared criteria, explicit classifications/status semantics, canonical queries | Resolve shared selection; agree SDK/count/evidence projection extensions | Manual component + status filters work over all results with chips and clear/reset |
| C: AI and reusable presets | Validated filter operations, saved relative criteria and manual/AI equivalence | AI discovery and view-targeting integration; real provider if needed | Available AI path applies inspectable criteria; presets restore without stale cursors |

Begin by inspecting the current table, saved views, cursor API, sidebar and projection. Write the
smallest agreed contract addition before dependent implementation. Existing table functionality
must remain usable after each increment. Do not add fixtures as production project data.

## Acceptance and evidence

Use synthetic test/demo datasets of at least 5,000 requirements, with allocations, explicit safety
classification and independent implementation/verification states. Record dataset size, environment,
request/render counts and timings; choose agreed performance budgets before implementation.

- All matches are reachable with ten visible rows; no omissions/duplicates in a fixed dataset;
  first/last/partial windows and configurable sizes behave correctly.
- Filters operate over the full authorized dataset, not just the visible page. Counts match criteria.
- Direct/descendant and multi-component context resolve correctly from CAD, SysML and product tree.
- Selection survives exclusion; entering a requirement does not reset retained component context.
- Combined filters distinguish approval, implementation, passed/failed/inconclusive, stale and missing evidence.
- Query changes, events, rapid selection, late responses and cursor invalidation cannot show mixed results.
- Current-page/all-match selection is explicit; bulk mutation validates the exact intended scope and revisions.
- Saved views, separate windows, historical baselines, service errors and permission changes behave honestly.
- Keyboard/screen-reader navigation, phone/tablet layouts, both themes/densities and existing editing work.
- Manual and AI-generated structured criteria produce equivalent results; unavailable AI features are labelled.

Follow repository build/test/contract checks for implementation. Each sprint provides an exact
committed checkpoint, startup instructions, owner walkthrough, actual verification evidence and
known limitations. Owner acceptance remains pending until feedback is received.
