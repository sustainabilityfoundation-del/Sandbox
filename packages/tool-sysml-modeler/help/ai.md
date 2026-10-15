---
help_id: sysml-modeler.ai
title: AI operations
kind: reference
summary: What the assistant can do in the SysML Modeler, and how its changes are previewed, validated, applied with provenance and undone.
keywords: [ai, assistant, chatgpt, proposal, automation, agent, operations]
related: [sysml-modeler.commands, sysml-modeler.history, sysml-modeler.validation]
operations: [sysml-modeler.describe_commands, sysml-modeler.find_elements, sysml-modeler.read_element, sysml-modeler.validate, sysml-modeler.impact, sysml-modeler.explain_commit, sysml-modeler.propose_commands, sysml-modeler.propose_text]
---

The assistant uses the **same typed commands and validation** as the editor. It never clicks in
the interface and never writes to the database.

| Operation | Kind | Purpose |
| --- | --- | --- |
| `sysml-modeler.describe_commands` | read | Command schemas, creatable kinds, validation rules |
| `sysml-modeler.find_elements` | read | Search by name, kind and owner |
| `sysml-modeler.read_element` | read | An element, its members, its references and its text |
| `sysml-modeler.validate` | read | Diagnostics |
| `sysml-modeler.impact` | read | What depends on an element |
| `sysml-modeler.explain_commit` | read | What a commit changed, why, who made it (provenance) and what is affected |
| `sysml-modeler.propose_commands` | proposal | A transaction of typed commands |
| `sysml-modeler.propose_text` | proposal | SysML v2 text for a namespace (elaboration) |

**Proposals.** The assistant first runs the change as a dry run. A change that would introduce
validation errors is not proposed. The proposal card lists every element that would be created,
updated or deleted, the warnings the change introduces, and the assumptions. **Apply** commits it
with the conversation and proposal as provenance (visible in History), based on the commit it was
prepared against: if those elements changed in the meantime, Apply is refused and nothing is written.
**Undo** reverts the commit.

The assistant in this build is a **scripted demo**: no AI model is connected. Try:

- "What SysML commands can you use?"
- "Validate the SysML model"
- "What uses BrushlessMotor?"
- "Add a part definition named Brake to ActuatorSystem::Mechanical"
- "Add a cooling subsystem"
- "Explain the last SysML change"
