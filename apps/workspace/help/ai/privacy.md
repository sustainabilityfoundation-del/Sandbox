---
help_id: ai.privacy
title: Privacy - what is sent to the AI provider
kind: reference
summary: Only the needed context goes to the provider; choose what is shared, preview a request, and review the audit of recent calls.
keywords: [privacy, data sharing, what is sent, selection, history, requirement text, audit, prompts, debugging]
related: [ai.policy, ai.connect]
---

Each request to the provider contains only:

- instructions describing the assistant's role (no object names or document text in them);
- your message, with the captured context: project, configuration, scenario, model revision and,
  depending on **Data sharing**, the attached selection (IDs, names, types) and the open tools;
- the last few messages of the conversation (**Conversation history**, default 6);
- the definitions of the operations you allow;
- results of operations the model asked for in this answer.

Anything else (other requirements, model elements, documents) the model can only read through the
allowed operations. With **Requirement text** off, statements and rationale in operation results are
replaced by a placeholder; with **Model element details** off, property values, attributes and
documentation are replaced as well.

**Preview what is sent with each request** shows the exact context, operations and instructions the server
would send for your next message. The preview sends nothing to the provider.

Object names, requirement statements, imported documents and model output are treated as **data**: text in
them cannot instruct the assistant, grant operations or reveal credentials.

### Audit

The audit lists your recent AI calls: time, provider and model, operations called (and refused), tokens
and outcome. It never contains credentials. Prompts are stored only if you turn on **Store prompts for
debugging** (off by default).
