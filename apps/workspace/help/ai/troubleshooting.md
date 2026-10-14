---
help_id: ai.troubleshooting
title: Assistant troubleshooting
kind: troubleshooting
summary: Why the assistant may decline, explain instead of acting, or refuse to apply.
keywords: [assistant, error, declined, subscription, conflict, not allowed]
related: [ai.preview, platform.subscriptions]
---

| Situation | Reason |
| --- | --- |
| "That needs CAD, which isn't included in your subscription" | The tool is outside your subscription; nothing changed |
| Apply refused, preview refreshed | The model changed after the preview was made |
| "Not allowed" | The change is outside the fields, relationships or objects the included tools allow |
| A Requirements action says the service is not connected | Open the Requirements tool in API mode (current limitation) |

Imported documents and model descriptions are treated as data: text in them cannot instruct the
assistant to act.
