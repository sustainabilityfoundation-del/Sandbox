# Typed tools for AI and agents (brief §10)

Status: Proposed. Part of deliverable E. Index: [README.md](README.md). Change requests: CR-A1, CR-A2,
CR-A5, CR-S4.

## 1. Principles

1. **Provider independent.** Tools are defined once as data: stable name, version, description, JSON
   Schema (draft 2020-12 subset) for input **and** output, effect class and error codes. The same
   definition is translated by the AI Interface's provider adapter for any provider; nothing depends on a
   particular model's prompt format or tool-calling dialect. The shape follows the provider-neutral form
   used by MCP (name, title, description, input schema, output schema, annotations) without adopting MCP.
2. **Same operation for people and AI.** Every tool maps to a module API operation that the UI also uses
   (AGENTS.md "AI capability design"); the tool adds schema and description, not a second implementation.
3. **Reads run, writes are drafted.** Query and calculation tools return data. Tools with a mutation
   effect return a **ProposalDraft** that the AI Interface previews; nothing is written until the user
   applies it (preview policy unchanged).
4. **Validated twice.** The executor checks the schema (as `checkArguments` does today); the owning
   service validates again with its own schemas and permissions.
5. **Explicit honesty fields.** Outputs carry `basis` for every conclusion and `implementationStatus`
   (`implemented | test-adapter | not-implemented`) for tools that depend on missing modules.

Registration: today through an `AssistantContribution` whose `parameters` is the input schema. The
contribution is **headless** (no tool UI) and is registered by the workspace from
`@ews/reasoning-client` (CR-A2). When the ADR-0013 registry exists, the same definitions move into it
unchanged; `GET /api/reasoning/v1/tools` is the source of truth for schemas and versions.

## 2. Common envelope

```jsonc
// Every tool result (data part of AssistantActionResult or ServiceProposal metadata)
{
  "runId": "uuid",            // the run this call was recorded in (created on first call if absent)
  "stepId": "uuid",
  "result": { … },            // tool-specific, validated against outputSchema
  "basis": "calculated",      // lowest basis among conclusions in result (ADR-0043)
  "context": { "manifestId": "uuid", "items": 14, "omitted": 0 },
  "warnings": ["domain-warning: slenderness below the Euler validity range"],
  "implementationStatus": "implemented"
}
// Errors: { "code": "invalid-input|not-found|forbidden|not-entitled|stale-context|unit-error|domain-error|
//            budget-exhausted|cancelled|unavailable|not-implemented", "message": "…", "details": {…} }
```

Idempotency: mutation-class tools take `idempotencyKey` (the executor supplies the tool-call ID); a repeat
returns the first draft. Query tools are naturally idempotent.

## 3. Tool catalogue (refined from the brief's illustrative list)

| Tool | Effect | Owner of the operation | Replaces / refines | Phase |
| --- | --- | --- | --- | --- |
| `concepts.create_function` | draft | Conceptualize | `create_function` | 1 |
| `concepts.decompose_function` | draft | Conceptualize | `decompose_function` | 1 |
| `concepts.create_concept` | draft | Conceptualize (exists in its plan) | `create_concept` | 1 |
| `concepts.record_assumption` / `concepts.record_constraint` | draft | Conceptualize | new | 1 |
| `reasoning.retrieve_design_context` | query | Reasoning | `retrieve_design_context` | 2 |
| `reasoning.retrieve_design_rationale` | query | Reasoning (deterministic assembly) | `retrieve_design_rationale` | 1 (as Conceptualize read) / 2 |
| `reasoning.propose_solution_concepts` | draft | Reasoning → Conceptualize batch | `propose_solution_concepts` | 2 |
| `reasoning.create_design_exploration` | draft | Reasoning → Conceptualize | `create_design_exploration` | 2 |
| `reasoning.plan_investigation` | run state | Reasoning | new | 2 |
| `reasoning.evaluate_calculation` | query (recorded) | Reasoning (`engineering-calc`) | `execute_engineering_analysis` (calculation part) | 1 (library) / 2 |
| `reasoning.evaluate_constraint` | query (recorded) | Reasoning | `evaluate_constraint` | 2 |
| `reasoning.run_analysis` | job | Reasoning → `AnalysisPort` (**test adapter**) | `execute_engineering_analysis` (analysis part) | 3 |
| `reasoning.compare_alternatives` | query | Reasoning (+ Conceptualize trade-study result) | `compare_alternatives` | 2 |
| `reasoning.assess_change_impact` | query (+ optional draft of flags) | Reasoning | `assess_change_impact` | 1 (library) / 2 |
| `reasoning.propose_design_change` | draft | Reasoning → owning module | `propose_design_change` | 2 |
| `reasoning.record_design_decision` | draft (needs `decide`) | Reasoning → Conceptualize | `record_design_decision` | 2 |
| `reasoning.get_run` / `reasoning.cancel_run` | query / run state | Reasoning | new | 2 |

## 4. Schemas of the core tools

Input schemas are shown; output schemas are in the OpenAPI document of the owning service (phase 2) and
summarized under each tool. `ref` everywhere is a `DesignRef` or `ArtifactRef`:

```jsonc
"$defs": {
  "ref": { "type": "object", "required": ["module", "id"], "additionalProperties": false,
    "properties": { "module": { "enum": ["conceptualize", "requirements", "sysml", "cad", "twin", "analysis", "external", "reasoning"] },
      "type": { "type": "string" }, "id": { "type": "string", "maxLength": 2000 }, "revision": { "type": "integer", "minimum": 1 } } },
  "quantity": { "type": "object", "required": ["unit"], "additionalProperties": false,
    "properties": { "value": { "type": "number" }, "min": { "type": "number" }, "max": { "type": "number" }, "unit": { "type": "string", "maxLength": 60 } } },
  "basis": { "enum": ["user-assertion", "ai-hypothesis", "assumption", "assessment", "estimate", "calculated", "evidence", "decision"] }
}
```

### `concepts.create_function`
```json
{ "type": "object", "additionalProperties": false, "required": ["name"],
  "properties": {
    "name": { "type": "string", "maxLength": 200 },
    "description": { "type": "string", "maxLength": 4000 },
    "parentFunctionId": { "type": "string" },
    "flows": { "type": "array", "maxItems": 20, "items": { "type": "object", "required": ["direction", "kind", "name"],
      "properties": { "direction": { "enum": ["in", "out"] }, "kind": { "enum": ["energy", "material", "signal", "force", "data", "other"] },
                      "name": { "type": "string" }, "quantity": { "$ref": "#/$defs/quantity" } } } },
    "performanceObjectives": { "type": "array", "maxItems": 20, "items": { "type": "object", "required": ["name", "direction"],
      "properties": { "name": { "type": "string" }, "direction": { "enum": ["minimize", "maximize", "target"] }, "quantity": { "$ref": "#/$defs/quantity" } } } },
    "requirementRefs": { "type": "array", "items": { "$ref": "#/$defs/ref" } },
    "idempotencyKey": { "type": "string" } } }
```
Output: ProposalDraft (preview: "New function", flows, objectives with basis `ai-hypothesis` unless quoted
from the user's statement; requirement links pinned to current revisions).

### `reasoning.retrieve_design_context`
```json
{ "type": "object", "additionalProperties": false, "required": ["question"],
  "properties": {
    "question": { "type": "string", "maxLength": 4000 },
    "questionType": { "enum": ["rationale", "alternatives", "change-impact", "feasibility", "comparison", "new-principles", "implementation-impact", "other"] },
    "seeds": { "type": "array", "maxItems": 20, "items": { "$ref": "#/$defs/ref" } },
    "maxItems": { "type": "integer", "minimum": 1, "maximum": 200, "default": 60 } } }
```
Output: `{ items: [{ ref, revision, type, label, summary, fields }], links: [...], manifestId, omitted }`.

### `reasoning.evaluate_calculation`
```json
{ "type": "object", "additionalProperties": false, "required": ["model"],
  "properties": {
    "model": { "$ref": "#/$defs/ref" },
    "bindings": { "type": "object", "description": "symbol → quantity, or symbol → { ref, property }",
      "additionalProperties": { "oneOf": [ { "$ref": "#/$defs/quantity" },
        { "type": "object", "required": ["ref", "property"], "properties": { "ref": { "$ref": "#/$defs/ref" }, "property": { "type": "string" } } } ] } },
    "uncertainty": { "enum": ["none", "interval-vertices"], "default": "none" },
    "recordAsEvidence": { "type": "boolean", "default": false } } }
```
Output: `{ outputs: { symbol: quantity }, constraints: [{ relationId, satisfied, margin, marginRatio }],
bounds?, manifest, validityWarnings }`; `basis: calculated` (or lower, from inputs). With
`recordAsEvidence` a ProposalDraft to record calculated Evidence is attached.

### `reasoning.evaluate_constraint`
```json
{ "type": "object", "additionalProperties": false, "required": ["constraint"],
  "properties": { "constraint": { "$ref": "#/$defs/ref" }, "against": { "type": "array", "items": { "$ref": "#/$defs/ref" },
    "description": "Concepts, implementations or evidence to check; default: all subjects" } } }
```
Output: per subject `{ status: satisfied | violated | unknown, margin?, evidenceRef?, reason }`; `unknown`
when no deterministic check exists (never guessed).

### `reasoning.compare_alternatives`
```json
{ "type": "object", "additionalProperties": false, "required": ["alternativeSet"],
  "properties": { "alternativeSet": { "$ref": "#/$defs/ref" }, "tradeStudy": { "$ref": "#/$defs/ref" },
    "method": { "enum": ["weighted-sum", "pareto", "both"], "default": "both" } } }
```
Output: Conceptualize's computed trade-study result (scores, ranges, coverage, robustness, preliminary flag)
plus Pareto set, dominated options with dominating option, infeasible options (constraint violations),
and the bases of all scores.

### `reasoning.assess_change_impact`
```json
{ "type": "object", "additionalProperties": false, "required": ["change"],
  "properties": {
    "change": { "type": "object", "required": ["ref"], "properties": { "ref": { "$ref": "#/$defs/ref" },
      "property": { "type": "string" }, "newValue": {}, "description": { "type": "string" } } },
    "maxDepth": { "type": "integer", "minimum": 1, "maximum": 6, "default": 4 },
    "demonstrate": { "type": "boolean", "default": true },
    "draftFlags": { "type": "boolean", "default": false } } }
```
Output: `ImpactReport` ([reasoning-orchestration.md §6](reasoning-orchestration.md#6-change-impact-analyzer));
hypothetical changes (`newValue`) are evaluated without writing anything.

### `reasoning.propose_solution_concepts`
```json
{ "type": "object", "additionalProperties": false, "required": ["function", "candidates"],
  "properties": {
    "function": { "$ref": "#/$defs/ref" },
    "candidates": { "type": "array", "minItems": 1, "maxItems": 20, "items": { "type": "object", "required": ["name", "principle"],
      "properties": { "name": { "type": "string", "maxLength": 200 }, "principle": { "type": "string", "maxLength": 2000 },
        "summary": { "type": "string", "maxLength": 1000 }, "advantages": { "type": "array", "items": { "type": "string" } },
        "risks": { "type": "array", "items": { "type": "string" } }, "openQuestions": { "type": "array", "items": { "type": "string" } } } } },
    "excludeSimilarTo": { "type": "array", "items": { "$ref": "#/$defs/ref" } },
    "idempotencyKey": { "type": "string" } } }
```
The **model** generates the candidates; the tool validates, flags near-duplicates of existing performers
(text similarity over names and principles), and drafts one batch: Concepts with `performs` links and an
AlternativeSet, all statements `ai-hypothesis`.

### `reasoning.record_design_decision`
```json
{ "type": "object", "additionalProperties": false, "required": ["alternativeSet", "outcomes", "rationale"],
  "properties": {
    "alternativeSet": { "$ref": "#/$defs/ref" }, "question": { "type": "string" },
    "outcomes": { "type": "array", "items": { "type": "object", "required": ["concept", "outcome", "rationale"],
      "properties": { "concept": { "$ref": "#/$defs/ref" }, "outcome": { "enum": ["accepted", "rejected", "deferred"] }, "rationale": { "type": "string" } } } },
    "rationale": { "type": "string", "maxLength": 20000 },
    "support": { "type": "array", "items": { "type": "object", "required": ["ref", "role"], "properties": { "ref": { "$ref": "#/$defs/ref" }, "role": { "enum": ["supports", "contradicts"] } } } },
    "assumptions": { "type": "array", "items": { "$ref": "#/$defs/ref" } },
    "constraints": { "type": "array", "items": { "$ref": "#/$defs/ref" } },
    "invalidationConditions": { "type": "array", "items": { "type": "object", "required": ["kind", "subject", "description"],
      "properties": { "kind": { "enum": ["assumption-invalidated", "constraint-changed", "evidence-superseded", "requirement-revised", "artifact-revised", "relation-violated", "manual"] },
        "subject": { "$ref": "#/$defs/ref" }, "description": { "type": "string" } } } },
    "idempotencyKey": { "type": "string" } } }
```
Drafts a **proposed** decision; `requiredApprovals: decide` when it would record accepted/rejected outcomes.
A user with the reviewer role applies it as `recorded`; anyone else can apply it only as `proposed`.

## 5. Authorization, validation, audit

| Concern | Rule |
| --- | --- |
| Discovery | `reasoning.*` tools are offered only when the user has the entitlement (Q3) and the reasoning service is available; tools depending on missing modules are listed with `implementationStatus` and refuse with `not-implemented` |
| Execution | Executor re-checks entitlement at call time (as `runToolAction` does); the service checks role and project membership; reads are performed as the user |
| Validation | Input schema in the executor; service-side schema and domain validation; units through the platform unit algebra |
| Audit | Every call is a ToolInvocation with run, step, actor, conversation and message IDs; drafts carry the same provenance into the owning module on Apply |
| Errors | Structured codes (§2); the assistant receives code and message; failures never appear as success |
