---
help_id: platform.subscriptions
title: Subscriptions, services and identity
kind: reference
summary: What the subscription menu and the Requirements service menu control in this prototype.
keywords: [subscription, plan, entitlement, locked, service, api, demo, user, identity]
related: [platform.getting-started, requirements.roles]
---

- **Subscription (demo)** chooses which tools you may use. Tools outside it are shown locked; their
  data stays visible. In this prototype the check runs in the browser; in production the server
  enforces it.
- **Requirements service** chooses where requirements come from: the API (PostgreSQL, default) or
  explicit demo data, and the development user (administrator, reviewer, editor, reader). The workspace
  never switches to demo data on its own.
- **Demo repository** shows save state for the shared product definition and can reset the demo data.
