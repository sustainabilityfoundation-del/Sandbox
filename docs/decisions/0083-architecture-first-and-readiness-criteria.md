# ADR-0083: Architecture-first generation, diversity assessment and readiness criteria as data

Status: Proposed (17 October 2026, ECII implementer, increment 2; for coordinator acceptance). Numbered 0083 as reserved by the
[ECII plan](../specifications/ecii-plan.md) Amendment 1 (0082 is kept for interfaces and facts, increment 3).

## Context

Increment 1 records the engineering intent. The brief (sections 8 and 10) asks for distinct solution architectures before dimensional
variations, a diversity check, and a readiness gate per downstream activity that labels speculative work instead of blocking it.

## Decision

1. **Where the architecture lives.** A block inside the Concept's engineering definition (`definition.architecture`), not a new table: it is
   revisioned with the Concept, validated by the existing definition normalisation (same path for user and assistant), and needs no migration.
   Absent means "not recorded"; revisions without the key keep it.
2. **Levels.** `develop_alternatives` gains `level` (architecture or variant). Variants name their architecture; alternatives that differ only in
   parameters are reported as variants.
3. **Diversity is a deterministic calculation** over the structured fields (token similarity, thresholds as data), never keyword rules and never a
   model. It is a heuristic about wording of structured fields; the judgement of whether architectures differ in substance stays with the person and
   the model, and the result says so by listing pairs and findings.
4. **Readiness criteria are data**: an ordered list of named checks per level and a table of the level each activity requires, versioned
   (`readiness-criteria/1`). Per-project overrides are not implemented yet. Levels: not established, Exploratory, Context Established, Interfaces Verified.
5. **Advisory in Phase 1.** The gate labels output provisional and lists unmet items (previews, handoff); it never refuses a write (plan section 7, ADR-0070:
   no standard-specific gates). Interfaces Verified is unreachable for a design that works with another system until interface and fact records exist (increment 3).
6. **Context package hook**: the result includes `contextReadiness { state, blockingIssues }` as in the context engineering brief section 2.

## Open-source evaluation

No suitable open-source component was found for the readiness gate and the diversity scoring. Requirements-readiness and maturity models (technology
readiness style scales, ISO/IEC 29148 checklists, MBSE quality plug-ins) are documents or tool-specific rule sets, not libraries; text-similarity
libraries (for example string-similarity or embedding stores) either add a dependency for a few lines of set arithmetic or bring a model and a
vector store, which the plan avoids. The logic here is domain-specific to the platform's records and criteria (about 300 lines, no dependency), so it
is implemented in Conceptualize; an embedding-based comparison may be revisited with pgvector (plan, context engineering ADR 0085).

## Limitations

- The readiness snapshot in a CAD handoff is computed when the handoff is built and does not go stale when the intent changes (staleness follows the Concept definition only).
- A variant is assessed through the architecture it names; an unresolvable parent leaves it without a block.

## Consequences

- Both operations are `calculate` class and testable without a model; fake-provider replays prove structure, not reasoning quality.
- Wording-based diversity can misjudge two differently worded but equivalent architectures; the threshold data and the findings keep this visible.
- A later change of criteria is a new criteria version, not a code path change.
