# AI Interface: feature specification and acceptance scenarios

Status: Proposed. Parent: [AI architecture](../ai-interface.md).

The requirements below define intended behaviour, not existing capability or a claim of compliance.
IDs are documentation identifiers until imported into the Requirements module.

## Feature requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| AI-001 | Discover all permitted operations with schemas, effects and implementation status | Capability inventory maps UI and backend operations; unauthorized and planned operations cannot execute. Inventory and inspection: [coverage](coverage.md) (sprint 004); authorization-filtered discovery not yet implemented |
| AI-002 | Execute UI and AI actions through the same semantic domain/view handlers | Equivalent inputs produce equivalent outcomes/errors; no AI-specific validator bypass |
| AI-003 | Read/write every supported user-editable field and operate every relevant view control | Coverage tests include fields, navigation, selection, camera, filters and dialogs; unsupported controls are listed |
| AI-004 | Authenticate and enforce ownership, entitlements and revision checks at execution | Forged tool lists, revoked access and stale context are rejected |
| AI-005 | Maintain an editable design brief from freeform conversation | User correction updates the brief and affected plans without silently changing approved constraints |
| AI-006 | Ask targeted questions when missing facts change design correctness | Missing mounting dimensions block final fit claims but need not block labelled concept exploration |
| AI-007 | Research authorized sources and record provenance/uncertainty | Every acquired interface value is source-backed, measured or explicitly assumed |
| AI-008 | Preserve exact context and recover task state across interruption | Resume uses the same project/configuration and identifies stale dependencies |
| AI-009 | Produce the requested number of meaningfully distinct concepts | Gallery has stable IDs, comparable views, tradeoffs and unresolved constraints; no duplicate padding |
| AI-010 | Record concept selection and translate it into editable engineering artifacts | Selected concept/revision links to native CAD and any implementation departures |
| AI-011 | Validate geometry and relevant physical constraints using owning engines | Revision-pinned clearance and mesh checks; unsupported analyses remain explicitly unverified |
| AI-012 | Save exports with native source and reproducibility metadata | Downloadable artifact, revision, intended units and export settings match the selected model |
| AI-013 | Provide scoped autonomy, previews, cancellation and appropriate recovery | Current preview policy remains; future autonomy has tested scope limits, retry safety and completed-effect reporting |
| AI-014 | Keep providers replaceable and credentials server-side | A fake provider exercises the same contracts; frontend does not contain provider secrets |
| AI-015 | Treat source content as data and minimize disclosure | Imported malicious instructions cannot grant operations or retrieve unrelated project data |
| AI-016 | Keep the owner informed of progress, failures and engineering limitations | Long jobs show status/cancellation; failed steps do not appear complete |

## Primary scenario: drill-mounted bit holder

### Demonstration boundary

This scenario demonstrates general platform capabilities; it is not a product feature or a
prescribed internal workflow. Do not add drill/brand-specific entities, commands, UI, default
project data or production dependencies. Test fixtures and optional demonstrations may contain
example geometry and measurements, kept separate from production code. Concept counts, item
capacity, dimensions and export choices come from the current user's task. Validate the reusable
workflow against another unrelated design scenario before claiming general applicability.

### User request

“I have a Milwaukee hand drill. Create a drill-bit holder mounted to the supplied accessory bolt
holes. Hold up to six different bits of varying lengths, including deeper/wider nut drivers up to
1/2 inch. Do not obstruct cooling holes or other features. Show ten concepts; after I select one,
generate CAD and save an STL for printing.”

### 1. Clarify the design brief

Ask specific model versus a defined universal family. Resolve model number/variant from user input
or a label photo. Clarify attachment side and whether existing accessories must remain usable.
Determine the actual six items and their envelope dimensions, retention/removal expectations and
printer/material constraints as needed. “1/2 inch” may identify nut-driver socket size, not the
outside diameter or shank diameter: resolve this before defining pocket dimensions.

Record six-position capacity, mounting interface and no-obstruction constraints as explicit design
inputs. Keep aesthetics and layout preferences negotiable. Do not ask again for answered facts.

### 2. Acquire and confirm the interface

Search authorized models and manufacturer specifications/manuals, then images and user measurements.
Produce an inspectable interface definition with fastener/thread, hole positions, datums, drill body,
ventilation keep-outs, control access, hand/grip clearance and battery/service paths as applicable.

If dimensions cannot be established, ask for targeted measurements or scaled images. Clearly
separate approximate concept reference geometry from confirmed mounting geometry. A provisional
concept is permitted; a final fit claim is not. Universal scope needs a compatibility matrix and
explicit exclusions or an adjustable interface supported by the available evidence.

### 3. Explore ten concepts

Generate ten distinct approaches (for example mounting arrangement, retention mechanism or layout)
with stable concept IDs, consistent comparison views, benefits, drawbacks and unresolved checks.
Show mounting and keep-outs on the previews. If some concepts violate hard constraints, label them
rejected and replace them rather than counting invalid proposals as viable alternatives.

Use geometric previews when claiming dimensional relationships. Illustrations can communicate
style but must not be labelled dimensioned drawings. Allow the user to select, combine or revise
concepts. Selection of a particular concept is the approval point explicitly requested by this user.

### 4. Generate native CAD and validate

Create editable holder geometry through CAD operations tied to the selected concept and exact
interface revision. Preserve a separate reference model of the drill. Check mounting geometry,
fastener access, relevant keep-out intersections and fit allowances. Model bit envelopes and
insertion/removal access, not only nominal pocket diameters.

Check relevant print constraints: watertightness, minimum features, intended material/process,
orientation and support/access issues. Load/retention adequacy needs evidence appropriate to its
claim; geometry checks alone are insufficient. Recommend a small fit coupon when measurements or
printer tolerances remain uncertain. Do not invent collision results when the reference is missing.

### 5. Export and handoff

Save the native model and STL as separate revision-linked artifacts, including intended units,
mesh settings, checks and unresolved assumptions. Offer download links and a concise printing/fit
walkthrough. Do not claim universal compatibility or guaranteed fit without supporting evidence.

## Negative and recovery scenarios

- No reference model: obtain measurements; concepts can proceed provisionally, final fit remains blocked.
- Vent region missing from CAD: create a documented keep-out from evidence; do not assume absence.
- User changes model after concept selection: invalidate dependent interface/CAD checks and replan.
- Selected CAD module is mock-only: disclose limitation and stop before claiming a real CAD/STL result.
- Operation is unavailable: explain the gap and offer a permitted alternative; never fabricate execution.
- Retry after network failure: reconcile the operation ID and result before creating duplicate objects.
- Changed revision or revoked entitlement: reject execution and preserve recoverable task state.
- Cancel after partial CAD creation: stop further operations and report/recover completed changes.
- Imported text requests secrets or bypasses approval: treat it as source data; do not follow it.
- User rejects all ten concepts: revise the brief from feedback and generate a new labelled set.

## Evaluation

Use deterministic fixtures and a fake provider for command/permission/regression tests. Use real
provider evaluations for conversation quality, clarification and task planning, recording provider
version and variability. Use independent geometric references for dimension/clearance tests. Track
capability coverage, successful complete workflows, unintended changes, provenance completeness,
recovery correctness and owner review outcomes. A fluent answer is not a successful engineering run.
