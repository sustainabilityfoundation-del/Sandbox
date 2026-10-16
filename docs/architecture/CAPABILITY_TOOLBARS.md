# Faber: Capability-Complete Prototype Toolbars

Status: **owner directive, 16 October 2026; standing requirement for all existing and future modules.** The text from
"Objective" onwards is the owner's directive as issued. The repository notes at the end map it onto what exists today; they do
not change it.

- Priority: High
- Scope: All existing and future modules

## Objective

Expose the intended full functional scope of each module through a consistent, professional toolbar interface while clearly
distinguishing implemented, partially implemented, planned, and contextually unavailable operations.

## Architectural directive

All module agents shall develop a comprehensive target command and toolbar definition for their module, based on research into
established industry-leading engineering applications and relevant open-source implementations.

The complete planned functionality shall be visible and discoverable in the prototype, regardless of current implementation
progress.

This is a user-interface and capability-definition exercise, not an instruction to immediately implement every command.

## Capability registry

Create a centralized, machine-readable capability registry. Every command shall define:

- Stable capability identifier.
- Owning module and toolbar group.
- User-facing label, description, and icon.
- Intended behaviour and input/output contracts.
- Implementation status: implemented, partial, or planned.
- Runtime availability and prerequisites.
- Associated API command or action.
- Documentation reference.
- Requirements and backlog references.
- Relevant implementation tests.
- Subscription entitlement, where applicable.

Implementation status shall be evidence-based and preferably derived from completed implementation and test results, not
manually asserted without verification.

Runtime availability shall be calculated separately from implementation status.

## Toolbar presentation

- Maintain the compact, professional visual language established for the Faber interface.
- Organize functionality into logical command groups, tabs, ribbons, or contextual toolbars as appropriate.
- Display implemented commands normally.
- Indicate partially implemented commands with a subtle status marker and explanatory tooltip.
- Render planned commands in a muted style while retaining discoverability.
- Distinguish contextually unavailable commands from unimplemented commands.
- Provide descriptive tooltips for all commands.
- Allow users to inspect planned command descriptions and related documentation without invoking unavailable functionality.
- Avoid excessive badges, bright colours, or visually cluttered toolbars.
- Support search across all capabilities, including planned functionality.

## Agent responsibilities

Each module agent shall:

1. Research the full functional scope of leading commercial and open-source tools in its discipline.
2. Develop a comprehensive hierarchical capability inventory.
3. Map existing implemented features to the inventory.
4. Identify partially implemented functionality and limitations.
5. Register planned functionality without creating fake implementations.
6. Define the complete target toolbar organization.
7. Integrate the toolbar with the central capability registry.
8. Connect capability entries to help documentation and development backlog items.
9. Ensure new functionality automatically updates its corresponding capability status when verified.
10. Maintain consistency with the shared Faber design system.

## Prototype interaction rules

Planned commands must never appear to execute successfully.

Clicking a planned command may display a non-modal feature description, implementation status, and associated backlog
information.

Partially implemented commands shall disclose relevant limitations.

Implemented commands must invoke genuine functionality.

Do not create placeholder backend operations that simulate successful engineering operations.

## Integration with AI

The AI interface shall have access to the same capability registry as the human interface. The AI must be able to determine:

- Which commands exist.
- Which commands are implemented.
- Which commands are currently available.
- Which commands are planned.
- What prerequisites each command requires.
- Which alternative implemented commands may achieve the same result.

The AI shall not attempt to execute unimplemented commands or falsely report their completion.

## Acceptance criteria

- Every module has a documented target capability inventory.
- Toolbars expose the intended scope of the finished application.
- Status indicators accurately reflect implementation progress.
- Planned commands provide useful explanatory tooltips.
- No placeholder command falsely reports success.
- AI and human interfaces share the same command definitions.
- The existing end-to-end engineering demonstration remains functional.

**Execution instruction:** Assign capability inventory and toolbar implementation work to the relevant module agents under
coordination of the lead architect. Prioritize defining the complete UI architecture without diverting substantial resources
from the current end-to-end engineering demonstration.

---

## Repository notes (coordinator, 16 October 2026)

These notes connect the directive to the repository. They are not part of the directive and do not change it.

- **Existing foundations.** A capability inventory with an implementation status per entry already exists and, since the
  module-registration work ([module-registration.md](../specifications/module-registration.md)), is carried by each module's
  manifest (`CapabilityEntry`, `ModuleManifest` in `@ews/platform-sdk`). The typed shared registry for human and AI paths is
  [ADR-0013](../decisions/0013-ai-semantic-capability-coverage.md) (held: not yet built). This directive is implemented by extending those
  contracts, not by a second registry.
- **Existing rules kept.** AGENTS.md "Do not present a planned capability as working", the proposal-preview policy for AI
  writes, and "Help and documentation" (toolbar items map to help IDs) still apply; planned commands are shown, marked and
  explained, never executed.
- **Open-source first.** Each module's research (responsibility 1) also feeds its build-versus-integrate decisions
  ([OPEN_SOURCE_STRATEGY.md](OPEN_SOURCE_STRATEGY.md)).
- **Status** of the registry design, the toolbar component and each module's inventory is tracked in
  [docs/status/coordinator.md](../status/coordinator.md).
