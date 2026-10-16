---
help_id: ai.overview
title: The AI Assistant
kind: overview
summary: Ask about the model, request changes as previews you apply, and see what the assistant can and cannot do.
keywords: [assistant, ai, ai assistant, chatgpt, chat, conversation, preview, apply, model, context, tools, attachments, voice, microphone]
related: [platform.layout, ai.connect, ai.preview, ai.policy, ai.privacy, ai.coverage, ai.troubleshooting, ai.tutorial.drill-bit-holder]
---

The **AI Assistant** (right of the canvas, or in the bottom panel; open it from the rail or with Ctrl+K) answers
questions about the model and prepares changes. It
uses the same operations and checks as the rest of the workspace: tool subscriptions, module ownership
and revision checks.

Until you connect your own AI account the assistant is a **scripted demo** (the banner says so); the
example prompts show what it understands. To answer with a real model, connect your own OpenAI account in
**Settings → AI and reasoning** ([how](help:ai.connect)); the banner then shows the provider and model, and
**AI settings** opens that page. You decide there what the AI may access ([access](help:ai.policy),
[privacy](help:ai.privacy)).

## The panel

| Part | What it does |
| --- | --- |
| **Chat** | The conversation: your messages on the right, the assistant's replies with the operations it ran, the model information it inspected, references you can select, and change previews with **Apply** |
| **Context** | Exactly what is captured with your next message: project, configuration, scenario, model revision, active and open modules, and the selection when **Attach the selection** is on |
| **Tools** | The operations the assistant may call, by module; modules outside your subscription are marked |
| **Composer** | Type and press Enter (Shift+Enter for a new line), or use the send button; **Stop** ends a reply in progress. The **+** menu attaches the selection, starts a new conversation, exports the transcript or shows what the assistant can do |
| **Model** | Below the composer: the connected provider and model (choose another model of your account), or **Demo assistant**, which opens the AI settings |

**Not available yet:** attaching files (it needs the project file hand-off) and voice input (dictation and live
voice need a speech service). Their buttons are shown disabled with the reason; they never pretend to work.

Move the assistant between the right side and the bottom panel with the dock button in its header
([Workspace layout](help:platform.layout)).

- [Previews and Apply](help:ai.preview): how changes are proposed and applied.
- [What the assistant can do](help:ai.coverage): the capability coverage view.
- [Tutorial: drill bit holder concept](help:ai.tutorial.drill-bit-holder).
- [Troubleshooting](help:ai.troubleshooting).
