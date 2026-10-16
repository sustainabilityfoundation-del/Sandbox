# ADR-0074: Capability registry and capability-complete toolbars

Status: Accepted (16 October 2026, coordinator; implements the owner's
[capability toolbar directive](../architecture/CAPABILITY_TOOLBARS.md)). Owner decisions in the specification §9 remain open.

## Context

The owner requires every module to expose its full intended scope through a consistent toolbar that distinguishes implemented,
partial, planned and contextually unavailable commands, with status based on evidence and the AI reading the same registry as the
user. The repository already keeps a per-module capability inventory in the module manifests (`CapabilityEntry`,
`ModuleManifest`, SDK 1.12) with consistency checks, and [ADR-0013](0013-ai-semantic-capability-coverage.md) (held) proposed a
typed registry shared by user and AI paths.

## Decision

Extend the existing manifest inventory into the single capability registry, as specified in
[capability-registry.md](../specifications/capability-registry.md):

1. **Additive SDK contract (1.13.0):** optional hierarchy (`commandLayout`: tab, group, command), placement, description, icon,
   behaviour and contract reference, limitations, prerequisites, help ID, requirements and backlog references, test references,
   entitlement and alternatives. A module opts into the strict rules with `inventory: 1`.
2. **Implementation state is computed, never stored:** planned (no binding), partial (bound with limitations or without test
   evidence), implemented (bound, test evidence, no limitations). CI verifies that bindings and test references resolve; a gap list
   for existing entries may only shrink.
3. **Runtime availability is a separate pure function** of prerequisites and context, evaluated by the host and modules; server-side
   entitlement enforcement is unchanged.
4. **One toolbar component** (`CommandBar`, `CommandInfoPopover` in the design system, fed by `buildCommandModel` in the SDK):
   planned commands are muted, focusable and open a non-modal description; they cannot be invoked by type.
5. **Search and help** cover all capabilities, including planned ones, clearly labelled.
6. **AI:** a read operation `list_capabilities` over the same registry; planned entries are never offered as tools; a strict policy
   option refuses operation names missing from the catalogue (closing today's default-`propose` loophole).

ADR-0013 is **amended, not superseded:** its registry clause is implemented as data by this ADR; its remaining held parts
(unifying UI and AI handlers, scoped autonomy) stay open.

## Consequences

- Every module gains a target inventory and toolbar layout in CT-3 onwards, reusing its open-source research
  ([OPEN_SOURCE_STRATEGY.md](../architecture/OPEN_SOURCE_STRATEGY.md)).
- No placeholder operations: a planned entry has no binding, and CI fails otherwise.
- Work order: CT-2a (contract and component) can start now; CT-2b (checks, shell, palette, AI, pilot) after the module-registration
  steps M6 and F; per-module steps after CT-2b, D1's modules first, without changing handlers or operation names. D1 keeps
  priority.
- The `strict` policy default changes the default-`propose` rule in the module-registration recipe once Project Management's
  operations are catalogued.

## Prior art and licences

The specification borrows **concepts only** (no code, no new dependency) from three projects. Licences verified from the upstream
repositories on 16 October 2026:

| Project | Concept borrowed | Licence (upstream) |
| --- | --- | --- |
| VS Code (`microsoft/vscode`) | Contribution points: declarative commands and menus separate from handlers | MIT (Copyright Microsoft Corporation) |
| `@lumino/commands` (`jupyterlab/lumino`, v2.3.4) | A command registry with label, enablement and visibility separate from execution | BSD-3-Clause |
| Eclipse Theia (`@theia/core`) | Command registry and contribution interfaces | EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0 |

CT-2a integrates none of them: the registry is data on the existing manifest, and `CommandBar` is built on React Aria Components,
which the design system already uses. If one were integrated later, MIT and BSD-3-Clause are preferred licences; Theia's EPL needs
the compliance review the strategy requires. No dependency was added.
