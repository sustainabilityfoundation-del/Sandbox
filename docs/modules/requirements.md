# Module: Requirements Management

Package: `packages/tool-requirements` (version 1.1.0, SDK `^1.1.0`, entitlement `tool:requirements`).
Status: **Implemented** (Phase 1). Working rules for contributors: [AGENTS.md](../../packages/tool-requirements/AGENTS.md).

## Owns

- `requirement` objects: title (`name`), `statement`, `rationale`, `status`, `verificationMethods`.
- `allocated-to` relationships (requirement → assembly or part).
- Verification records (artifacts of kind `verification-record`).

It reads, but never writes, components, SysML elements and CAD representations.

## Capabilities

- Table with search, status filter, and filter by the selected component (a selected SysML element
  or CAD representation resolves to its component through `represents`).
- Edit, allocate, relationships, history (activity) and verification in a detail panel.
- Trace columns: SysML references and CAD representations of allocated components.
- Verification status per requirement: Verified, Stale evidence, Failed, Inconclusive, Not verified.

## Verification record (schema 1)

| Field | Content |
| --- | --- |
| `kind`, `schemaVersion` | `verification-record`, `1` |
| `references` | `{REQ, revision, 'verifies'}` (exact); optional `{BL-…, 'baseline'}`, `{OUT-…, 'evidence'}` |
| `configurationId` | Configured article (filled by the SDK from the view's context) |
| `inputs` | The requirement and its allocated components, at their current revisions |
| `result` | `method`, `outcome` (`pass`/`fail`/`inconclusive`), `procedure` (required) |

Rules:

- Records are never edited. A new result is a new record; status comes from the newest record.
- A record is stale when any input revision differs from the working model. A stale pass is shown as
  "Stale evidence", never as "Verified".
- A baseline is offered only when it belongs to the same configuration and pins the requirement's
  current revision, so the record and the baseline describe the same definition.
- The statement at the verified revision can be shown from revision history (`getObjectRevision`).

## Assistant actions

`requirements.read_for_component`, `requirements.update` (statement, rationale, status; `allocated-to`
links). Recording verification is not available to the assistant.

## Not in scope yet

Requirement hierarchy, reviews and approvals, derived requirements, import and export.
