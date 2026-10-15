---
help_id: ai.policy
title: What the AI may access
kind: reference
summary: Per module (off, read only, read and propose), per operation class, limits and project limits, all enforced by the server.
keywords: [access, permissions, policy, read only, off, propose, operations, limits, timeout, administrator, project limit]
related: [ai.privacy, ai.preview, ai.connect]
---

**Settings → AI and reasoning** decides what the assistant is given. The server enforces it twice: when
it builds the list of operations sent to the model, and when the model asks for an operation (anything
outside the list is refused and never runs). The browser only displays the settings.

| Setting | Values | Effect |
| --- | --- | --- |
| Access per module (Shared model and navigation, Requirements, Conceptualize, SysML Modeler, CAD Modeler, Illustrative tools, Help) | AI off, Read only, Read and propose changes | Off: no operations of the module are sent. Read only: reads, searches and calculations, no change previews |
| Operation classes | Read objects, Search, Run calculations, Propose changes, Export files, Request external generation | A class that is off is never offered, in any module. Request external generation is off by default |
| Operations per answer | 1–60 (default 24) | After this many operations the model must answer with what it has |
| Maximum answer length | 256–32000 tokens (default 4000) | Output limit per model call (ChatGPT plan usage applies its own limits) |
| Request timeout | 10–300 s (default 90) | The server stops waiting and reports a timeout |

Modules outside your subscription are never offered, whatever you choose. **Applying** a change always
needs you, whatever you choose ([previews](help:ai.preview)).

### Project limits

A project administrator (development user **ada**) sets upper limits for everyone in the project under
**Project limits**. You can only choose the same or narrower: a wider choice is refused, and if a limit is
lowered later your setting is narrowed to it automatically.

Settings for the design reasoning layer (`ai.reasoning.*`) will be added to this page by that module.
