# H. Security and governance

Status: Proposed. Index: [README.md](README.md). Related: ADR-0008 (client-side entitlements are a
prototype), ADR-0010 (same command boundary), ADR-0013 (proposed registry and gateway), ADR-0015,
[ADR-0042](../../decisions/0042-declarative-service-proposals.md), [ADR-0043](../../decisions/0043-basis-of-knowledge-and-promotion.md),
[ADR-0045](../../decisions/0045-reasoning-runs-and-model-access.md).

## 1. Authorization

| Layer | Rule |
| --- | --- |
| Entitlement | Reasoning operations require the entitlement decided in Q3 (proposal: `tool:conceptualize`, because the reasoning layer extends Conceptualize; a separate `service:design-reasoning` if the owner wants to sell it separately). Checked by the API host on every reasoning route; client checks are UX only (ADR-0008) |
| Roles | Reuse project roles. reader: read runs, rationale, impact reports, run read-only tools. editor: create runs, execute tools, create drafts. reviewer/administrator: as editor, plus accept engine-driven plans above the autonomy threshold, set project budgets |
| Reads through other modules | The engine forwards the **user's identity** to Conceptualize and Requirements; it has no service account with broader rights. Items the user cannot read are omitted from context (`not-authorized`) |
| Writes | None by the engine. Drafts are applied by the platform as the user, through the owning module's API, which enforces its own roles (e.g. Conceptualize `decide` for accepted/rejected decisions) |
| Revocation | Every step re-checks entitlement and membership; a revoked user's runs stop at the next step (`forbidden`) and their pending drafts expire |

## 2. Approval workflows

| Change | Approval |
| --- | --- |
| Any durable change proposed by AI or engine | User applies the previewed proposal (existing policy; unchanged) |
| Recording accepted/rejected decisions, gated maturity, superseding selected Concepts | Reviewer or administrator (existing Conceptualize gate) |
| Validating or invalidating an assumption used by a recorded decision | Reviewer |
| Relaxing a hard constraint that formalizes a requirement | Reviewer, and the requirement change itself through the Requirements review process |
| Promoting evidence to `evidence` basis (verified) | Reviewer review record on the evidence |
| Engine-driven plan with job-class tools or more than N model steps | Plan acceptance by the user (editor) or reviewer above a project threshold |
| Changes to approved baselines | Not reachable by the engine at all (no operations); baselines remain platform/Requirements actions |

Scoped autonomy beyond this (the ADR-0013 open question) is not introduced. Phase 3 autonomy is limited to
**operational** work: running read-only and calculation tools and producing drafts within a budget.

## 3. Provenance and auditability

- Every ToolInvocation, manifest, plan revision and draft records actor, project, conversation, message,
  run and step IDs, tool and engine versions, and (for model steps) opaque model identifiers from the gateway.
- Applied drafts carry provenance into the owning module: `source_kind: 'reasoning'` (new value, CR-C13),
  `conversationId`, `proposalId` (= draft ID), `messageId`, `runId`, `stepId`. Conceptualize already stores
  source kind, conversation and proposal IDs on every record.
- Audit records are append-only in both schemas (immutable-table triggers, as in Conceptualize).
- **Known weakness (conflict 6)**: Conceptualize records the source kind the client declares
  (`X-Source-Kind`). With declarative proposals applied by the platform the declaration comes from the
  platform executor rather than a tool, which is better but still browser-side. Strong provenance needs the
  server-side execution gateway of ADR-0013 (or the API host signing proposals it relays). Until then the
  architecture does not claim tamper-proof provenance.

## 4. Model independence

- Stored data never contains provider-specific structures. Model identifiers are opaque strings.
- Tool definitions are provider-neutral JSON Schema ([ai-tools.md](ai-tools.md)); provider adapters in the
  AI Interface translate them.
- The engine has no provider SDK and no credentials. Engine-driven model steps go through the AI Interface
  gateway (CR-A3), which owns provider choice, credentials (server-side), budgets in tokens, and data routing.
- Evaluation of the layer uses a **fake provider** for deterministic tests (AI-014) and real providers only
  for quality evaluation, recording provider and version.
- No reliance on private chain-of-thought: the engine stores explicit justifications, tool inputs and
  outputs; a provider's hidden reasoning is neither requested nor stored.

## 5. Untrusted content and data minimization

- Record text, imported documents, requirement statements and web content are **data**. When included in a
  model request they are wrapped as quoted data with their refs; the system instructions state that data
  cannot grant tools, change scope or approve anything (AI-015).
- The tool list offered with a request is computed by the platform from entitlements, never from content.
- Context sent to a model is the ContextPackage of the step (minimum needed, budgeted); the manifest records
  exactly what was sent.
- Expression evaluation is sandboxed (mathematics.md §7); no code from records or models is executed.

## 6. Reliability of AI-produced engineering content

- Basis ladder and promotion rules (ADR-0043) are enforced in Conceptualize, not only in the engine; the
  engine's labels are hints, the module's checks are authoritative.
- `calculated` evidence is re-verified by Conceptualize (mathematics.md §6).
- Calculation qualifications (C11) are carried unchanged everywhere: a sampled range is never shown as a bound, a
  status over a range is `satisfied`/`violated` only when proven, and a reproducible manifest is never presented as
  model validation or requirement satisfaction (contract-change-requests.md, CR-C8/C11 storage contract).
- An assertion is never upgraded by repetition, confidence scores or embedding similarity.
- The UI shows basis badges everywhere; AI-originated items need explicit confirmation to become user
  assertions.

## 7. Retention

| Record | Retention |
| --- | --- |
| Design knowledge (Conceptualize) | Permanent; removal recorded, never deleted |
| Runs, plans, invocations, manifests | Default 2 years, configurable per project; summaries and refs kept on the Conceptualize side (`investigations[].runRef`) so design rationale survives purging |
| Drafts | Applied drafts kept with the run; unapplied drafts expire after 7 days or on input change |
| Model request/response payloads | Not stored by the engine (the AI Interface owns conversation records) |

## 8. Safety-critical use

The reasoning layer is an **exploratory** function in the sense of the architecture vision §7: its outputs
are not relied upon for certification credit. Verification evidence comes from the owning modules'
verification records. Any future qualification of the calculation engine would be a separate roadmap item
(independent reference cases, version pinning, tool qualification records).
