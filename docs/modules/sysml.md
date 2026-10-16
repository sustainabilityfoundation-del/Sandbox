# Module: SysML Modelling

Package: `packages/tool-sysml` (version 1.0.0, SDK `^1.0.0`, entitlement `tool:sysml`).
Status: **Retired from the interface** (ADR-0077, 16 October 2026): the tool is no longer registered, shown or offered to the AI; the package, the twin data (`sysml-element`, `represents`) and the ID `sysml` are kept. The tool users see is the System Model (`docs/modules/sysml/`). Historical specification follows. Working rules: [AGENTS.md](../../packages/tool-sysml/AGENTS.md).

## Owns

- `sysml-element` objects (part definitions and usages, requirement usages).
- Relationships from SysML elements: `represents` (→ component), `references` (→ requirement),
  `connects` and `satisfies` (→ SysML element).

## Capabilities

A small editable diagram with a property panel and a generated, read-only, **illustrative** text
notation. Supported: part definition, part usage nested once, requirement usage referencing a shared
requirement, connection, satisfy, `represents`. Not supported: ports, interfaces, items, attributes,
actions, states, constraints, packages, imports, multiplicities. It is not SysML v2 compliant and
must not be described as such.

## Assistant actions

`sysml.read_model`, `sysml.create_part`, `sysml.add_requirement_reference`, `sysml.connect`.

## Integration

- Identity comes from the physical component; a SysML part `represents` it. Never create a second
  component for an existing one.
- No synchronisation with CAD. Requirements text is read from the shared `requirement`, never copied.
