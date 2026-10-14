---
help_id: requirements.troubleshooting
title: Troubleshooting
kind: troubleshooting
summary: What common messages mean and how to fix them.
keywords: [error, problem, troubleshooting, unavailable, conflict, forbidden, demo, not reachable]
related: [requirements.roles, requirements.requirement.edit]
---

| Message | Meaning | What to do |
| --- | --- | --- |
| "API not reachable" or "The Requirements service is not available here" | The backend is not running or not reachable | Start the workspace with `npm run dev` (it starts the backend), or choose **Demo** in the Requirements service menu |
| "Someone else changed this first" | A newer revision exists | **Load latest (keep my edits)**, check, save again |
| Forbidden, or an action is missing | Your role or subscription does not allow it | See [Roles and permissions](help:requirements.roles) |
| "Internal error (reference …)" | An unexpected server error; nothing was saved | Retry; report the reference if it persists |
| Demo data | Demo mode is chosen explicitly | Collections, reviews, baselines, quality and ReqIF need the API |
| Stale evidence | The requirement or an allocated component changed after verification | Verify again ([Verify a requirement](help:requirements.requirement.verify)) |

The workspace never switches to demo data on its own when the service fails.
