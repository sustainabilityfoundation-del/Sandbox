---
help_id: sysml.tutorial
title: Connect a demo part to a requirement
kind: tutorial
summary: Create an explicit satisfy link in the workspace.
keywords: [sysml, demo]
---

1. Open the full workspace with an existing project and requirement. In SysML, choose Add Part (`sysml.features`); enter a unique name and optionally link an existing physical component. Confirm creation.
2. Choose Add Requirement Reference (`sysml.features`), select the existing requirement, and confirm. Expect a requirement usage linked to its canonical record.
3. Choose Connect (`sysml.features`), select the part as source and the requirement usage as target. Confirm the satisfy link.
4. Toggle Text (`sysml.features`) to inspect the illustrative notation. It cannot be edited or imported as a SysML model.

The result is traceability in the shared demo, not evidence that the requirement has been verified. Inspect the canonical requirement through Open in Requirements.
