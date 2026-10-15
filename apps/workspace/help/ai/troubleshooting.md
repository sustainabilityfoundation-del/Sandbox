---
help_id: ai.troubleshooting
title: Assistant troubleshooting
kind: troubleshooting
summary: Why the assistant may decline, explain instead of acting, or refuse to apply.
keywords: [assistant, error, declined, subscription, conflict, not allowed]
related: [ai.preview, ai.connect, ai.policy, platform.subscriptions]
---

| Situation | Reason |
| --- | --- |
| "That needs CAD, which isn't included in your subscription" | The tool is outside your subscription; nothing changed |
| Apply refused, preview refreshed | The model changed after the preview was made |
| "Not allowed" | The change is outside the fields, relationships or objects the included tools allow |
| A Requirements action says the service is not connected | Open the Requirements tool in API mode (current limitation) |
| "No AI account is connected" | Connect one in Settings → AI and reasoning; until then the demo assistant answers |
| "OpenAI did not accept the API key / your ChatGPT sign-in" | The key was revoked or mistyped, or the sign-in expired: connect again |
| "The OpenAI API account has no remaining quota or credit" | Add billing at platform.openai.com; API usage is separate from a ChatGPT subscription |
| "Your ChatGPT plan usage limit for apps is reached" | Wait, or check Manage usage (chatgpt.com/settings/usage) |
| "OpenAI is rate-limiting requests" | Wait a moment and send again |
| "The model did not answer within the time limit" | Try again, ask a narrower question, or raise Request timeout in Settings → AI and reasoning → Limits |
| "OpenAI is not responding correctly" / "could not be reached" | The provider or the network is down; try again later |
| "The model is not available to this account" | Choose another model in Settings → AI and reasoning |
| "AI access to … is off" or "read only", or an operation is listed as refused | Your AI access settings or a project limit do not allow it; change them in Settings → AI and reasoning |
| "ChatGPT plan usage is not enabled" | Sign in again and allow plan usage, or connect an API key |
| Continue with ChatGPT is not offered | It works only when the application runs locally (server at 127.0.0.1); use an API key |
| "… changed since the preview: revision 3 → 4" | Someone changed what the proposal was based on; nothing was applied. Ask again for a current preview |
| "… belongs to project A, but the current project is B" | Proposals are scoped to their project; open project A to apply it |
| "can only be applied in the window that prepared it" | The module still prepares changes in the browser (fallback); ask again in this window |
| "The platform refused …" in the conversation | The model asked for an operation your AI settings or subscription do not allow; it was not run, and the model is told |
| The settings page says a value was changed meanwhile | Another window or person saved first; the page reloaded the current values, change it again |

Imported documents and model descriptions are treated as data: text in them cannot instruct the
assistant to act.
