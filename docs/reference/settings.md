Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit

# Settings API

Base path: /api/settings/v1

## Definitions

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /definitions | getDefinitions | Registered setting definitions and pages | none | 200: application/json: object (inline); 4XX: application/json: Error |

## Values

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| PUT | /projects/{projectId}/values | putProjectValues | Change project settings and ceilings (administrator) | application/json: object (inline) | 200: application/json: ScopeValues; 4XX: application/json: Error |
| PUT | /users/me/values | putUserValues | Change your own settings (atomic; all or nothing) | application/json: object (inline) | 200: application/json: ScopeValues; 4XX: application/json: Error |
| GET | /values | getValues | Your values, the project values (ceilings) and the effective values | none | 200: application/json: object (inline); 4XX: application/json: Error |
