# Engineering Workspace UI/UX modernization (Focused Canvas): brief (owner's text, verbatim)

Received 16 October 2026. Approved visual reference: [assets/focused-canvas-mockup.png](assets/focused-canvas-mockup.png).
Coordinator contracts and ownership: [ui-focused-canvas-contracts.md](ui-focused-canvas-contracts.md).
Progress: [ui-focused-canvas-progress.md](ui-focused-canvas-progress.md).

---

Claude Code Brief — Engineering Workspace UI/UX Modernization

Mission

Spawn a dedicated UI/UX Design System Agent to redesign and implement the Engineering Workspace interface using the approved Focused Canvas visual concept.

The objective is to transform the existing application into a polished, professional, high-density engineering environment comparable in quality to leading CAD, PLM, systems engineering and modern IDE applications.

This is an implementation task, not merely a design exercise.

The agent shall inspect the existing codebase, develop a shared design system, implement the redesigned interface and validate it through browser-based testing.

Primary constraint: Preserve all existing engineering functionality, application state, data models, APIs and module integrations.

1. Agent organization

The main coordinating agent shall:

1. Spawn a new specialist agent named "ui-ux-design-system".
2. Assign ownership of the shared application shell, navigation, layout, styling, design tokens and common UI components.
3. Allow the agent to research contemporary professional application design patterns using publicly available resources.
4. Coordinate changes with the Requirements, Conceptualize, SysML, CAD and AI integration agents.
5. Ensure interface changes do not conflict with ongoing module development.
6. Maintain a separate feature branch or isolated worktree for UI development.
7. Require visual verification and functional regression testing before merging.

The specialist agent must not independently modify engineering domain logic or backend contracts.

2. Visual design direction — Focused Canvas

Use the latest approved Focused Canvas mockup as the primary visual reference.

The design philosophy is Precision Industrial:

- Professional, technically sophisticated and visually restrained.
- Dark slate application shell contrasted with lighter working panels.
- Bright, uncluttered engineering canvas.
- Compact, information-dense toolbars.
- Consistent typography and iconography.
- Strong visual hierarchy between navigation, engineering content and contextual information.
- Minimal decorative effects.
- Efficient use of screen real estate.

Avoid generic SaaS dashboard aesthetics, oversized controls, excessive rounded cards, unnecessary gradients and large empty spaces.

The interface should feel like a premium engineering workstation.

3. Shared design system

Implement a centralized design system consumed by all application modules.

Typography

Preferred fonts:

- IBM Plex Sans — primary application typeface.
- IBM Plex Mono — engineering values, object IDs, parameters, code and technical notation.

Suggested sizing:

- 12 px: dense technical labels and metadata.
- 13 px: toolbars, navigation trees and property fields.
- 14 px: general interface text.
- 15–16 px: section and panel headings.
- 18–20 px: prominent document and project headings.

Use consistent font weights to distinguish primary labels, secondary information, selected items and technical metadata.

Provide configurable display density.

Colors

Initial palette:

- Application shell: "#202C3D"
- Navigation hover: "#304158"
- Working panels: "#E8EDF3"
- Engineering canvas: "#FFFFFF"
- Secondary surfaces: "#F8FAFC"
- Primary accent: "#2563EB"
- Validation success: "#0D9488"
- Warning: "#D97706"
- Error: "#DC2626"

Define these as semantic design tokens rather than hardcoded component values.

Support light and dark themes through the same token system, with the approved light-canvas/dark-shell appearance as the initial default.

Meet WCAG AA contrast requirements where applicable.

Icons

Adopt Lucide as the primary icon library.

Standardize:

- 16 px icons in dense toolbars.
- 18–20 px icons in primary navigation.
- Consistent stroke weights.
- Active-state backgrounds.
- Tooltips and keyboard shortcut hints.

Create a provision for custom engineering icons covering CAD operations, SysML elements, requirements relationships, constraints and validation.

Do not rely on color alone to communicate status.

Component architecture

Create or consolidate reusable components for:

- Application shell
- Navigation rail
- Module navigation
- Project explorer
- Hierarchical object tree
- Document tabs
- Contextual toolbar
- Engineering canvas container
- Properties inspector
- Dockable panels
- Splitters and resize handles
- Status bar
- Command palette
- Context menus
- Dialogs and notifications
- AI conversation panel
- File attachment and voice controls

Use existing component libraries and styling infrastructure where appropriate. Avoid introducing competing UI frameworks.

Document component APIs and usage conventions.

4. Application layout

Implement the following primary layout.

A. Global application header

A compact dark-slate header containing:

- Application logo and identity.
- Active project selector.
- Configuration/baseline selector.
- Module navigation.
- Global search/command palette.
- Notifications.
- User account and application settings.

Target approximately 48–52 px in height.

Module navigation shall remain consistent across the entire application.

B. Primary navigation rail

A narrow vertical navigation rail along the left edge.

Include module and workspace shortcuts as appropriate.

Active module indicated using a distinct background and accent indicator.

Support collapsing and tooltips.

C. Project Explorer

A resizable project explorer immediately adjacent to the navigation rail.

Features:

- Hierarchical project structure.
- Expand/collapse nodes.
- Search and filtering.
- Contextual menus.
- Object type icons.
- Selection synchronization with other modules.
- Clear distinction between folders, objects and artifacts.

The project tree must support large engineering projects containing thousands of objects.

Implement efficient rendering or virtualization where required.

Preserve current explorer behavior and data access.

D. Central engineering canvas

The canvas is the dominant visual element.

It must support:

- SysML diagrams.
- CAD model views.
- Conceptualization diagrams and sketches.
- Requirements visualizations.
- Other future engineering modules.

The canvas should occupy the maximum practical area.

Provide compact contextual toolbars, document tabs, zoom controls, selection tools and breadcrumbs.

The canvas container must not impose a particular rendering technology on individual modules.

Maintain compatibility with their existing rendering engines and interactions.

E. Properties Inspector

A resizable contextual inspector positioned to the right of the engineering canvas.

It should provide:

- Selected object identity.
- Object type and validation status.
- Editable properties.
- Relationships.
- Traceability.
- Relevant engineering metadata.
- Contextual tabs and actions.

Use collapsible sections.

Only display information relevant to the current selection.

Preserve existing editing, validation and synchronization behavior.

F. AI Assistant

Implement a persistent, dockable AI assistant panel using the approved mockup as reference.

The assistant must look and behave like a modern conversational AI application rather than a traditional software command console.

Required UI:

- Scrollable conversation history.
- Clearly distinguished user and assistant messages.
- Rich responses containing engineering references, tables, diagrams, model previews and validation results.
- A modern rounded message composer.
- Plus button for attachments and additional actions.
- Microphone button.
- Send button.
- Model/provider selector.
- Context and tool tabs.
- Collapsible conversation panel.
- Loading, streaming and error states.

Support two voice interaction modes in the interface architecture:

1. Dictation — speech transcribed into the composer.
2. Live voice — continuous two-way conversation.

Do not implement mock voice functionality that appears operational but does nothing.

Connect to existing capabilities where available. For unavailable backend functionality, provide clearly disabled or feature-flagged controls and document the integration requirements.

The AI panel shall be able to reference the current project, selected objects, active configuration and active engineering module through the existing AI integration architecture.

Do not create a separate engineering action pathway for the assistant. AI-generated changes must continue through the application's existing validated engineering APIs, proposal mechanisms, authorization and audit systems.

Support engineering object references that can navigate to or highlight corresponding objects.

G. Bottom status bar

Introduce a compact persistent status bar displaying relevant information such as:

- Save/synchronization status.
- Active branch/configuration.
- Model revision.
- Validation status.
- Active units.
- Current selection.
- Background processing state.

Target approximately 24–28 px in height.

5. Docking and workspace management

The layout must be configurable.

Users shall be able to:

- Resize major panels.
- Collapse the project explorer.
- Collapse the properties inspector.
- Collapse the AI assistant.
- Move the AI assistant between right-side and bottom-docked positions.
- Maximize the engineering canvas.
- Restore the default layout.
- Save and restore workspace layout preferences.

Provide at least three workspace presets:

Engineering: Explorer + large canvas + inspector, with assistant collapsed.

AI-assisted: Explorer + canvas + expanded AI assistant.

Review: Large canvas + traceability/validation panels.

Persist user layout preferences without modifying project engineering data.

Ensure the design remains usable on smaller laptop displays.

6. Compact toolbars and interaction patterns

Review existing toolbar controls across all modules.

Consolidate redundant controls and group related commands.

Targets:

- Toolbar height: 32–36 px where practical.
- Icon buttons: approximately 28–32 px.
- Consistent separators and grouping.
- Overflow menus for infrequently used commands.
- Tooltips showing command names and keyboard shortcuts.

Use progressive disclosure: frequently used controls remain visible, while advanced options are accessible contextually.

Do not remove existing commands simply to reduce visual clutter.

Preserve keyboard shortcuts and accessibility.

7. Functional preservation

This redesign must not break existing capabilities.

In particular, preserve:

- Requirements creation, editing, filtering and validation.
- SysML model editing and diagram interactions.
- CAD viewing and modeling workflows.
- Conceptualization artifacts and relationships.
- Project and configuration management.
- AI conversation history and tool invocation.
- Cross-module object selection.
- Repository persistence and saved artifacts.
- Existing API contracts.

Create a regression checklist covering these workflows before implementation.

Avoid unnecessary backend changes.

8. Implementation strategy

Work incrementally.

Phase 1 — Audit

Inspect the frontend architecture, styling approach, component hierarchy and existing UI tests.

Identify reusable components and technical constraints.

Document the current application layout.

Phase 2 — Design system

Implement tokens, typography, icon standards, spacing, density settings and foundational components.

Establish component documentation.

Phase 3 — Application shell

Implement the header, navigation rail, project explorer, dockable layout and status bar.

Maintain compatibility with existing modules.

Phase 4 — Engineering workspace

Update the shared canvas container, document tabs, toolbars and inspector.

Do not rewrite individual engineering renderers.

Phase 5 — AI assistant

Redesign the assistant interface.

Preserve existing AI integration and proposal workflows.

Introduce attachment and voice controls using feature flags where required.

Phase 6 — Validation

Run automated tests, build checks and browser-based visual inspections.

Compare the result against the approved Focused Canvas mockup.

Resolve layout defects and functional regressions.

9. Acceptance criteria

The task is complete when:

- The application visually follows the approved Focused Canvas direction.
- All modules share the same design system.
- Navigation is consistent across modules.
- The central canvas has substantially greater visual prominence.
- Toolbars are compact and functionally complete.
- Explorer, inspector and assistant panels are independently resizable and collapsible.
- The AI assistant has a modern conversational interface.
- Existing engineering workflows continue to operate.
- Layout preferences persist.
- No critical accessibility or usability regressions are introduced.
- Automated tests and production builds pass.
- Screenshots demonstrate the implemented result at desktop and laptop resolutions.

Visual polish must be evaluated using actual running application screenshots, not only component code inspection.

10. Deliverables

Produce:

1. Implemented frontend changes.
2. Shared design tokens and component library.
3. Documentation of the application shell and layout architecture.
4. AI assistant interface documentation.
5. Screenshots showing the completed UI.
6. Functional regression test results.
7. List of remaining UI issues and deferred enhancements.
8. Updated architectural guidance for future module agents.

11. Ongoing agent responsibilities

Update the repository's main architecture and agent instruction documents so that all future agents follow the shared UI design system.

Module agents shall consume common UI components rather than independently developing competing visual styles.

Document extension points for future modules.

Ensure that a newly installed or subscription-enabled engineering module can integrate into the application navigation and workspace without requiring modifications to the core shell.

12. Priority and coordination

This is a dedicated frontend workstream.

It must not divert the main coordinating agent or other specialist agents from the primary engineering demonstration:

An end-to-end AI-assisted engineering workflow progressing from Conceptualize through Requirements, SysML and CAD output.

The UI agent should improve the presentation and usability of this workflow while other agents continue implementing its engineering capabilities.

The coordinating agent shall manage integration points and review the UI agent's work before merging.

Begin by spawning the specialist agent, auditing the current frontend and preparing a short implementation plan. Then proceed with implementation, using the approved Focused Canvas mockup as the visual target. Do not stop at producing a design proposal.
