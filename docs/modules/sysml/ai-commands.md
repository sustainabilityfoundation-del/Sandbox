# AI command architecture

Status: Proposed (ADR-0034, ADR-0038). Implementation: `sysml-core/src/commands`, `services/sysml`
transactions endpoint, `tool-sysml-modeler/src/assistant.ts`.

## 1. One boundary

Every modification of a SysML model, from any source, is a **transaction of typed commands** executed
by `sysml-core` (in the service for mode `api`, in the browser for mode `local`). The UI builds commands
from gestures; the assistant builds them from tool calls; API clients post them. There is no other
write path: the raw Systems Modeling API commit endpoint is itself validated by the core. The
assistant never simulates clicks and never touches the database.

## 2. Commands (catalogue; schemas served by `GET /commands` and `describeCommands()`)

| Command | Effect | Key arguments |
| --- | --- | --- |
| `createElement` | Creates a namespace member: package, definition or usage of a supported kind, with its owning membership and optional typing/specialization/multiplicity/value/direction | `ownerId`, `kind`, `name`, `shortName?`, `typeIds?`, `specializes?`, `subsets?`, `redefines?`, `multiplicity?`, `value?`, `direction?`, `isAbstract?`, `doc?`, `ref?` (placeholder like `$motor` for later commands) |
| `rename` | Sets `declaredName` / `declaredShortName` | `elementId`, `name?`, `shortName?` |
| `setTyping` | Replaces the feature's owned `FeatureTyping`s | `elementId`, `typeIds` |
| `addSpecialization` / `removeSpecialization` | Subclassification, Subsetting, Redefinition, ReferenceSubsetting | `elementId`, `generalId`, `kind` |
| `setMultiplicity` | Owned `MultiplicityRange` | `elementId`, `lower`, `upper` (`*` = unbounded) or `null` to remove |
| `setValue` | Owned `FeatureValue` with an expression parsed from text | `elementId`, `expression`, `isDefault?`, `isInitial?` |
| `setDirection`, `setAbstract` | Attribute changes | |
| `setDocumentation` | Owned `Documentation` | `elementId`, `text` (empty removes) |
| `connect` | Connection / interface / flow / binding usage between two feature chains | `ownerId`, `kind`, `source`, `target` (chains like `motor.power`), `typeId?`, `itemTypeId?`, `name?` |
| `satisfy` | `SatisfyRequirementUsage` | `ownerId`, `requirementId`, `by` (chain) |
| `allocate` | `AllocationUsage` | `ownerId`, `source`, `target` |
| `move` | Re-owns an element (moves its owning membership) | `elementId`, `newOwnerId` |
| `deleteElement` | Deletes the element, its owned subtree and relationships owned by it; refuses when other elements reference it unless `removeReferences` | `elementId`, `removeReferences?` |
| `applyText` | Parses textual notation and reconciles it with the namespace's current members (§4) | `namespaceId`, `text`, `mode: 'replace-members' \| 'append'` |
| `setMetadata` | Platform metadata (managed requirement, CAD representation) | `elementId`, `metadata`, `values` |
| `importRequirement` | A requirement usage carrying `EWS::ManagedRequirement` (UUID, revision, key, title) and optional `Satisfy` usages; reuses the element that already carries the UUID | `ownerId`, `requirementId`, `key`, `title`, `revision?`, `satisfiedBy?` |

All commands are pure functions over a working copy; references to elements created earlier in the
same transaction use placeholders (`$name`). Library elements are read-only.

## 3. Transaction pipeline

```
commands ─▶ validate arguments (JSON schema) ─▶ apply to working copy (core) ─▶ change set
        ─▶ semantic validation (diagnostics before/after → introduced/resolved)
        ─▶ policy: report | reject-new-errors ─▶ dry run? return preview
        ─▶ concurrency check vs. base commit (element-level) ─▶ commit (provenance) ─▶ outbox event
```

Result (`TransactionResult`): `changes` (created/updated/deleted, each with metaclass, name, qualified
name, before/after JSON), `createdIds` (placeholder → ID), `diagnostics: { introduced, resolved, total }`,
`textPreview` (affected namespaces before/after), `commit` (absent for dry runs), `inverse` (commands
are not needed for undo: the inverse change set is computed from versions).

## 4. Text reconciliation (`applyText`)

The text is parsed in the context of the namespace (its imports and enclosing scopes resolve). The new
member tree is matched to the existing one by (owner path, metaclass family, declared name or, for
unnamed elements, order among unnamed siblings of the same metaclass). Matched elements keep their IDs
and get attribute/relationship updates; unmatched new ones are created; unmatched old ones are
deleted. Reference targets are re-resolved by name. A rename in text therefore appears as delete +
create unless the short name matches; the preview shows this explicitly, and the inspector's rename is
the identity-preserving way.

## 5. Assistant operations (`sysml-modeler.*`)

| Operation | Kind | Purpose |
| --- | --- | --- |
| `describe_commands` | data | Schema discovery: command schemas, supported metaclasses, textual subset summary |
| `find_elements` | data | Query by name, metaclass, owner, qualified name |
| `read_element` | data | Element with derived properties, owned members, relationships, textual notation |
| `validate` | data | Diagnostics, optionally for one namespace |
| `impact` | data | Elements that reference an element (transitive), for impact analysis |
| `explain_commit` | data | What a commit changed, its reason and provenance, affected elements |
| `propose_commands` | service proposal | Typed commands → dry run → preview (each change, diagnostics delta, assumptions); Apply commits with provenance; Undo reverts |
| `propose_text` | service proposal | Textual notation for a namespace (elaboration, e.g. "add a cooling subsystem") → same pipeline via `applyText` |

The demo planner (labelled demo; no model provider) maps a few prompts to these operations.

## 6. Policies

- **Approval**: every AI modification is a service proposal; nothing is written before Apply. The
  preview lists every created/updated/deleted element and the diagnostics the change introduces.
- **Validation**: AI transactions use `reject-new-errors`: Apply fails (proposal stays open) if the
  change would introduce errors; warnings are shown. Human edits default to `report`.
- **Version checks**: the proposal carries the head commit at preparation; Apply sends it as
  `baseCommitId` and the element-level check applies (§3). A conflict keeps the proposal open with the
  conflicting elements named.
- **Provenance**: commits from the assistant record `source: { kind: 'assistant', conversationId,
  proposalId, messageId }` and the explanation as reason; `explain_commit` returns it.
- **Undo**: the proposal's undo calls `revert` (compensating commit).
- **Untrusted content**: model text and documentation are data, never instructions to the assistant.

## Headless operation (C9, integration milestone 1)

Every `sysml-modeler.*` operation works with no SysML Modeler view mounted (all tabs closed). The
client comes from the host's configuration of the tool (`PlatformServices.sysml` once SDK 1.8 provides
it); the model is loaded from the repository at the branch head. When a view of the same platform
project is open, its branch is used and it is refreshed after Apply/Undo; no view session is created
otherwise. Tests: `packages/tool-sysml-modeler/src/headless.test.ts` (every operation without a view;
the same invalid command refused with the same message by the UI and assistant paths).

Policy difference (deliberate): proposals use validation policy `reject-new-errors`; direct edits in
the UI use `report` (the change is committed and the new errors are listed in Validation). With the
same policy both paths refuse identically.
