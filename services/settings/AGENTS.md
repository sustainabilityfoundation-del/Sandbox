# AGENTS.md: @ews/settings-service

Settings values (PostgreSQL schema `settings`) and the `/api/settings/v1` plugin hosted by `@ews/api`.
Owner: the AI connection agent (docs/specifications/ai-connection.md §5a). Contract: SDK 1.6
`contract/settings.ts`.

## Rules

- Only this package reads or writes schema `settings`; other services use `SettingsStore` (injected by
  the host) or the HTTP API. Migrations are append-only; `settings.history` is append-only (trigger).
- Definitions are code, registered by the host (`SettingsRegistry.register`). Values for unregistered IDs
  are refused. Validation uses the SDK's `checkSettingValue` / `withinCeiling`, so browser and server agree.
- Never store a secret. `secret-reference` values are opaque references written only by their owner.
- Every write needs If-Match (scope ETag); stale writes get 412, a missing If-Match 428.
- Project-scoped values need the administrator role unless the definition names another role.

## Tests

`npm run req:test:db` (services/settings/test on a disposable PostgreSQL).
