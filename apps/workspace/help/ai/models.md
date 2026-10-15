---
help_id: ai.models
title: Choose a model
kind: reference
summary: Pick the model for your connection from the list your account offers; the default is OpenAI's balanced general model.
keywords: [model, gpt, choose model, default model, model list]
related: [ai.connect, ai.policy]
---

After connecting, **Settings → AI and reasoning → Connection → Model** lists the models your account may
use, as reported by the provider (for Sign in with ChatGPT, the models your plan offers).

- The default is **gpt-6.1-sol**, which OpenAI's model guide describes as a balance of intelligence and
  cost. If your account does not offer it, the first listed model is used.
- The choice is stored with your connection on the server and applies to every request you send.
- A model that disappears from your account gives a clear error; choose another one here.

The model only produces text and operation requests. What it may read or change is decided by your
[access settings](help:ai.policy), and every change is still a preview you apply.
