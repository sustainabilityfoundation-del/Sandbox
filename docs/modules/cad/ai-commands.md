# CAD Modeler: AI command specification

Status: Proposed (ADR-0023; contracts §5). Implementation: `packages/tool-cad-modeler/src/assistant.ts`;
tests: `assistant.test.ts` (Node, real kernel) and the workspace browser flow (demo assistant).

## 1. Operations offered to the assistant

| Operation | Kind | Purpose |
| --- | --- | --- |
| `cad-modeler.describe_model` | read | Documents, feature tree with status and errors, parameters with values, bodies (volume, mass, bounding box, topology), failures, references |
| `cad-modeler.query` | read | Any query of the catalogue (`get_sketch`, `get_entities`, `get_dependencies`, `get_operation_log`, `get_document`, `list_commands`, …) |
| `cad-modeler.run_commands` | proposal | A transaction of catalogue commands; creates a document when none is open |
| `cad-modeler.undo` | proposal | Undo the last transaction (whoever made it) |
| `cad-modeler.new_document` | proposal | New document with one part |
| `cad-modeler.open_document` | proposal | Open a native document given as JSON (validated before the preview) |
| `cad-modeler.export` | proposal | `step` (AP242 with structural report) or `ewscad` (native file) download |

Every operation is listed in the capability inventory (`apps/workspace/src/assistant/capabilities.ts`)
and mapped to a help topic. The assistant never writes directly: actions return data or SDK 1.5
service proposals; the platform shows the card; **Apply** calls the proposal's `apply`.

## 2. Safety properties (brief §9.3)

| Requirement | How |
| --- | --- |
| Preview before commit | `run_commands` performs `CadEngine.dryRun` (full validation and regeneration on a copy). The card lists each command and the predicted bodies (volume, faces, size, validity) and new failures |
| Transactional edits | One proposal = one transaction; all commands commit or none |
| Undo / rollback | Proposal `undo` restores the pre-apply content as a new version, only if the model is still at the applied version; `cad-modeler.undo` undoes the latest transaction |
| Model version checks | The version at preview time (or the caller's `expectedVersion`) is enforced on Apply; mismatches fail with `version-conflict` and nothing changes (tested) |
| Deterministic execution | Pure transaction function and deterministic IDs; the dry run predicts exactly what Apply produces |
| Validation after regeneration | Apply returns the regeneration; the summary reports failed features; `describe_model` and `get_failures` expose them |
| Structured error recovery | Invalid commands are rejected before a proposal exists, with the failing command index and the error code and message (`ActionError`), so the assistant can correct and retry |
| Complete operation logs | Every transaction, undo, redo and rejection is in the operation log with source `assistant` or `user` (`get_operation_log`, Diagnostics) |
| User approval | All mutations, file downloads and document creation are proposals applied by the user |

## 3. From concept to geometry (brief §9.4)

The AI path today: read requirements and concepts through their modules' operations, propose
parameters (`create_parameter`), constrained sketches and features with parameter expressions,
annotate interfaces (`add_semantic` on stable face names), link the part to the concept or
requirement (`add_reference`, role `realizes` / `satisfies`), then verify with `describe_model`
(mass, bounding box) and `get_entities`. Exploring alternatives without losing interfaces uses dry
runs on parameter changes. Reasoning stays in the platform's AI services; the CAD module provides
operations and data only.

## 4. Demo planning (labelled, SDK 1.5 `demo`)

No model provider is connected. The demo planner recognises: "create/make/model a plate W x D x T
[with an N mm hole]" (parameter-driven plate, optional centred through hole), "set <parameter> to
<value>" (for the active document), "describe the CAD part / volume", "export STEP", "undo … CAD".
Replies start with "(Demo planner.)". It only plans calls to registered actions.

## 5. Not available to the assistant (honest gaps)

Camera control and viewport images (planned as supplementary context), reading files from the
user's disk, redo, and validating cross-module targets automatically (the assistant should call
`read_object` or the owning module's search before `add_reference`).
