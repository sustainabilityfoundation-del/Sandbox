---
help_id: sysml-modeler.troubleshooting
title: Troubleshooting
kind: troubleshooting
summary: What common messages mean (cannot resolve, unsupported, still referenced, model changed, rejected) and what to do.
keywords: [troubleshooting, error, problem, conflict, cannot resolve, unsupported, refused]
related: [sysml-modeler.text, sysml-modeler.validation, sysml-modeler.history, sysml-modeler.language]
---

| Message | Meaning | What to do |
| --- | --- | --- |
| *The SysML model could not be loaded* | The API is not reachable, or your user lacks the SysML entitlement or project membership | Start the backend (`npm run dev:api`); check the development user; choose Retry |
| *Cannot resolve type "X"* | The text refers to a name that does not exist or is not visible here | Check the spelling, add an import (`private import ISQ::*;`) or qualify the name (`Interfaces::PowerPort`) |
| *"use" declarations are not supported …* | A SysML v2 construct this version does not support | See [Supported language](help:sysml-modeler.language); model it with supported constructs |
| *X is still referenced by Y* | Deleting would leave other elements pointing at nothing | Remove or retarget the references, or choose *Delete and remove references* |
| *The model changed since commit N: … changed* | Someone else changed the same elements | The view reloads; apply your change again |
| *The change would introduce N validation errors* (rejected) | An assistant proposal or a strict change would make the model invalid | Read the listed problems; the proposal was not applied |
| *Commit N cannot be undone: … changed afterwards* | Later commits changed the same elements | Undo the later commits first |
| *Text can be applied to the model root, packages and definitions* | The selected element is a usage | Select its package or definition, or edit the usage in Properties |
| *Local (this browser)* in the status bar | Demo or harness mode: the model is kept in this browser only | Use API mode for shared, persistent models |
