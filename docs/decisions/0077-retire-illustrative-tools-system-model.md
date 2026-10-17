# ADR-0077: Retire the illustrative tools from the interface; name the SysML tool "System Model"

Status: Accepted (16 October 2026, owner decision in the conversation; implemented by the `ui/retire-illustrative-rename-system-model`
branch). Amends [ADR-0027](0027-cad-mock-tool-replacement.md) (phase 4, hide) and
[ADR-0030](0030-sysml-module-placement-and-packages.md) (the line about retiring `tool-sysml`).

## Context

Two illustrative tools remain from the first prototype: the SysML tool (`packages/tool-sysml`, tool ID `sysml`) and the mock CAD tool
(`packages/tool-cad`, tool ID `cad`). They work on the example project's browser twin, are labelled "Demo", and sit beside the real
modules: the SysML Modeler (`sysml-modeler`) and the CAD Modeler (`cad-modeler`). Users meet two SysML entries and two CAD entries.
ADR-0027 planned the CAD retirement in four gated phases (phase 4: hide the mock tool behind a flag); ADR-0030 left the retirement of
`tool-sysml` to a later ADR. The coordinator proposed hiding both while keeping their data and IDs.

## Owner decisions (16 October 2026)

- On hiding the two old tools: "Yes remove the two old ones".
- On naming: "change the SysMl Menu to System Model, I think it's better to have it agnostic of the underlying language."

## Decision

1. **Retire the illustrative SysML and mock CAD tools from the interface and from the AI.** `sysml` and `cad` are removed from
   `INSTALLED_MODULES` (`apps/workspace/src/platform/installedModules.ts`). Because every user and AI surface is derived from that
   list, no further flag is needed: they disappear from the rail, the command palette, search, the phone Tools menu, the Help Centre
   (menu, navigation, search, About), the AI capability coverage dialog and the capabilities summary, and no default tab opens them.
   Their legacy capability entries (`installedCapabilities.ts`) are deleted with them. The AI module `illustrative` and its six catalogue
   operations (`sysml.read_model`, `sysml.create_part`, `sysml.connect`, `sysml.add_requirement_reference`, `cad.read_representation`,
   `cad.set_dimension`) are removed from `services/assistant/src/policy.ts`; the operations are no longer offered, classified or accepted
   (the tool specs derive from the registered tools). The demo assistant no longer plans them. No SDK change was needed (SDK stays 1.13.0).
2. **Keep all data and stable IDs.** Nothing is deleted or rewritten and there is no migration. The twin keeps its SysML elements
   (`SYS-…`), CAD representations (`CAD-…`) and `represents` links; they stay readable in the product tree, the inspector, baselines and
   artifacts. The module IDs `sysml` and `cad` stay as provisioning, artifact-source and `ArtifactRef.module` values, and as the owners of
   the twin object types and the ADR-0006 delegation. The packages `packages/tool-sysml` and `packages/tool-cad` stay in the repository
   (their own tests still run); only their registration is gone. The `tool:sysml` and `tool:cad` entitlements stay (the modelers share them).
   Sessions that restored a tab or a second view of a retired tool drop it silently.
3. **Rename the SysML tool's display name to "System Model"**, agnostic of the underlying language. Changed: the tool name and rail label,
   the client and server manifest `name`, the AI module label, the help module name and overview title, command-palette entries, empty
   states and the documentation. Unchanged: the tool ID `sysml-modeler`, operation names `sysml-modeler.*`, package names, API paths,
   entitlements and help IDs. Help text that explains the SysML v2 notation still names SysML as the language. The tool still makes no
   SysML v2 conformance claim. The CAD Modeler keeps its name; its naming is decided separately.

## Amendments

- **ADR-0027**: phase 4 ("hide the mock tool") is done by this decision. The explicit conversion command (phase 2), the mapping question
  (phase 3), the migration-test gate and the reversal flag are not part of this ADR and stay open. The "flag restores the mock tool" is
  replaced by re-adding the tool to `INSTALLED_MODULES`, which needs no data change.
- **ADR-0030**: the illustrative `tool-sysml` is retired from the interface by this ADR. Migration of its twin data is still not decided
  (the data is simply kept).

## Consequences

- The example project PRJ-ACT100 opens Requirements, System Model, CAD Modeler and Conceptualize (the projects service lists the modelers
  in its legacy defaults and no longer labels demo tools).
- The twin's CAD dimensions can no longer be edited from the interface, nor proposed by the AI (`propose_changes` refuses them: no
  included tool allows the fields). CAD-side editing is the CAD Modeler's.
- The fixed AI presentation order loses `illustrative`: workspace, requirements, conceptualize, sysml-modeler, cad-modeler, projects,
  reasoning, help.
- Tests that used the retired tools as vehicles for platform behaviour now use the modelers; tests prove the retired tools are absent.

## Amendment: the CAD Modeler is displayed as "CAD" (17 October 2026)

Owner decision (coordinator log): "yes leave it CAD". The CAD Modeler's user-visible name is "CAD", applied the same way as the System
Model rename: the tool name and rail label, the client and server manifest `name`, the AI module label on the AI settings page
(presentation order unchanged), the help module name and overview title, palette entries, tab titles, empty states and the documentation.
Unchanged: the tool ID `cad-modeler`, operation names `cad-modeler.*`, package names, API paths, the `tool:cad` entitlement and help IDs.
The retired mock tool keeps its ID `cad` as an internal module ID (provisioning, artifact source, twin object owner); it is not shown
anywhere. The ownership table keeps the label "CAD Modeler (displayed "CAD")", like "SysML Modeler (displayed "System Model")".
