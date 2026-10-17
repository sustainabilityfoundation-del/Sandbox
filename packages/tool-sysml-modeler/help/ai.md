---
help_id: sysml-modeler.ai
title: AI operations
kind: reference
summary: What the assistant can do in the SysML Modeler, and how its changes are previewed, validated, applied with provenance and undone.
keywords: [ai, assistant, chatgpt, proposal, automation, agent, operations]
related: [sysml-modeler.commands, sysml-modeler.history, sysml-modeler.validation]
operations: [sysml-modeler.describe_commands, sysml-modeler.find_elements, sysml-modeler.read_element, sysml-modeler.validate, sysml-modeler.impact, sysml-modeler.explain_commit, sysml-modeler.propose_commands, sysml-modeler.propose_text, sysml-modeler.matrix, sysml-modeler.coverage, sysml-modeler.behavior, sysml-modeler.create_project, sysml-modeler.satisfy_requirement, sysml-modeler.import_requirement, sysml-modeler.link_requirement, sysml-modeler.link_product_element]
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
| `sysml-modeler.matrix`, `.coverage`, `.behavior` | read | Relationship matrices, requirement coverage, action flows and state machines |
| `sysml-modeler.create_project` | proposal | Create the SysML project of a platform project (new projects start with none) in one proposal: initial text (parts, actions, allocations), managed requirements allocated to parts, and parts that represent existing product elements |
| `sysml-modeler.satisfy_requirement` | proposal | Allocate managed requirements to parts of an existing model: a SysML requirement linked to the managed requirement (pinned revision) and `satisfy … by …` |
| `sysml-modeler.import_requirement` | proposal | Bring a managed requirement (key or UUID) into the model as a requirement carrying its UUID, pinned revision, key and title, with optional `satisfy` links; idempotent, never a second element for the same managed requirement |
| `sysml-modeler.link_requirement` | proposal | Link a SysML requirement to a managed requirement (UUID, pinned revision) |
| `sysml-modeler.link_product_element` | proposal | The part or item represents a Project Management product element (UUID, pinned revision) |

All operations work **without the SysML Modeler open** (headless): the model is read from the
repository. A typical architecture step in a new project is one `create_project` proposal with the text, the
`requirements` to allocate and the `productElements` the parts represent; then `validate`. Product
elements proposed in the same turn get their UUID only when you apply that proposal, so link them
afterwards with `link_product_element`. The result of an applied `create_project` names the project ID
for later operations.

**Proposals.** The assistant first runs the change as a dry run. A change that would introduce
validation errors is not proposed. The proposal card lists every element that would be created,
updated or deleted, the warnings the change introduces, and the assumptions. **Apply** commits it
with the conversation and proposal as provenance (visible in History), based on the commit it was
prepared against: if those elements changed in the meantime, Apply is refused and nothing is written.
**Undo** reverts the commit (creating a project cannot be undone from the assistant; its history is kept).

The assistant in this build is a **scripted demo**: no AI model is connected. Try:

- "What SysML commands can you use?"
- "Validate the SysML model"
- "What uses BrushlessMotor?"
- "Add a part definition named Brake to ActuatorSystem::Mechanical"
- "Add a cooling subsystem"
- "Explain the last SysML change"
