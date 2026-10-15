# AI Interface: capability coverage (sprint 1)

Status: inventory implemented 14 October 2026 (sprint [004](../../sprints/004-ai-capability-inventory.md)).
Source of truth: `apps/workspace/src/assistant/capabilities.ts`, shown in the workspace as
**AI capability coverage** (command palette, or "What can the assistant do?" in the assistant panel).
`capabilities.test.ts` fails when a toolbar item, an assistant operation or a Requirements API
operation is missing from it, so the inventory cannot silently fall behind the product.

The inventory is an inspection aid. It grants nothing: execution still goes through the platform
operations, tool contributions and repository/API validation of ADR-0010, and every change still needs
the user's preview approval. The registry proposed in ADR-0013 is not implemented.

## Coverage levels

| Level | Meaning |
| --- | --- |
| Shared operation | The assistant calls the same operation as the UI |
| Equivalent | Different entry point, same repository or API validation and ownership checks |
| Partial | Only part of the capability, or only under conditions |
| No AI path | People can do it, the assistant cannot (a gap) |
| Restricted | Deliberately unavailable: approval decisions, identity, destructive demo controls, or not built |

## Result at the checkpoint

68 capabilities: 4 shared, 9 equivalent, 8 partial, 39 without an AI path, 8 restricted. **22 %** of the
60 non-restricted capabilities are fully available to the assistant. The count covers the whole
inventory (UI controls, platform functions and the 63 Requirements API operations), not only the
operations already exposed to the assistant.

## Findings

1. **Requirements moved to the API, the assistant mostly did not.** `requirements.update` proposes
   statement/rationale/status edits; in API mode the preview appears inside the Requirements tool, not
   in the platform preview (contract request 3, deferred). Allocation edits proposed by the assistant
   target the old twin copy, not the Requirements service that now owns allocation (ADR-0012).
2. **API-mode Requirements actions depend on an open view.** `requirements.search`,
   `explain_quality` and API-mode `update` use a connection the Requirements view sets when it mounts.
   With the tool closed they fail. A headless operation boundary (development plan sprint 2) fixes this.
3. **No view control is operable by the assistant** except selecting objects and opening tools:
   filters, columns, camera, layout, panels and windows have no operations (sprint 3).
4. **Platform configuration control is invisible to the assistant:** baselines, configuration/scenario
   change, review status and the activity log (one operation each would close these).
5. **CAD is mock throughout**; native CAD, geometric checks and STL export are listed as not available so
   they cannot be presented as working (sprints 8–9).
6. **The conversation itself is a scripted demo**; no provider is connected (sprint 4).

## Recommended next increment (development plan sprint 2)

Shared operations for one Requirements workflow: create, read and edit a requirement through operations
that both the Requirements UI and the assistant call, with identical validation and persistence through
the Requirements API, working with the tool closed, and with the platform preview. This needs the
decision on ADR-0013 (registry shape and AssistantContribution migration), which also resolves the
deferred contract request 3.

## Update: provider connection (development plan sprint 4, 15 October 2026)

Finding 6 is addressed on `feature/ai-connection`: with a connected account (Settings → AI and reasoning)
the conversation is answered by a real model through `services/assistant`, using the same operations; the
inventory now marks the conversation **experimental** (answer quality is not evaluated) and adds the
connection, access policy, send preview and audit as **restricted** (a person's controls over the AI, never
assistant operations) and the Settings centre. The server enforces the AI access policy when the tool list is
built and when calls return ([provider connection](provider-connection.md)). The other findings stand.
