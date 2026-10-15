# ADR-0048: Settings framework — SDK 1.6 setting definitions, settings service, Settings centre

Status: Proposed (2026-10-15, AI connection agent)

Brief: [ai-connection.md](../specifications/ai-connection.md) §5a. Answers the open preference-service
question in `requirements-navigation-filtering.md`.

## Context

Modules need configurable items, and the AI and reasoning page needs per-user settings with
administrator-set project limits, validated on the server. Today preferences live in browser storage
(theme, density, service mode, demo subscription) with no shared contract.

## Decision

1. **Contract (SDK 1.6, additive):** `SettingDefinition` (boolean, enum, number with unit and range,
   string, secret-reference; namespaced `<module>.<area>.<item>`; label, description, help ID, default,
   scope user | project, `requiresPermission?`, `ceiling?`, `group?`), `SettingsContribution` (one page per
   module) as `ToolDefinition.settings`, read access through `ToolApi.settings` and `useSetting(id)`, and
   shared validators (`checkSettingValue`, `withinCeiling`, `clampToCeiling`, `validateSettingDefinitions`)
   so browser and server agree. `ai.reasoning.*` is reserved for the design reasoning layer.
2. **Ceilings:** a user setting may name a project-scoped setting of the same type as its ceiling (enum
   options ordered narrow → wide; numbers ≤; booleans). Writes above the ceiling are refused; a later,
   lower ceiling clamps the effective value.
3. **Settings service** `services/settings` (`@ews/settings-service`, schema `settings`, `/api/settings/v1`):
   a server-side definition registry filled by the host, user and project values, one revision per scope
   with ETag / If-Match (412 stale, 428 missing), atomic all-or-nothing writes with per-field errors, the
   administrator role for project values, an append-only history, OpenAPI 3.1. Secrets are never values:
   a secret-reference is written only by its owning service.
4. **Settings centre** in the workspace header beside Help: pages grouped Platform / AI / Modules, search,
   `?settings=<page>` deep links, rendered from definitions with design-system controls; a custom panel only
   for what definitions cannot express (the AI connection). The Platform page edits the same browser state
   as the existing header controls (they remain).

## Consequences

- Module pages appear only when a module contributes definitions; no placeholders.
- Server validation of a module's values needs its definitions on the API host. Tool packages are React
  packages, so the host cannot import them today: a framework-free settings export per module (or a
  definitions file the host loads) is a follow-up (change request in the progress file).
- Platform preferences stay per browser (not per user on the server); moving them is a later decision.
