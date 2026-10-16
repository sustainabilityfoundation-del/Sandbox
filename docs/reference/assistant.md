Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit

# Assistant API

Base path: /api/assistant/v1

## Assistant

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| POST | /respond | respond | One step of the tool-calling loop: tool calls (signed) or a final answer | application/json: AssistantRequest | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |

## Audit

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /audit | getAudit | Your recent AI calls: time, model, operations, tokens, outcome | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |

## Connection

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| DELETE | /connection | deleteConnection | Disconnect: revoke the sign-in where supported and delete the stored credential | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| GET | /connection | getConnection | Your connection status (never the credential) | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /connection/api-key | connectApiKey | Connect with an API key (validated with the provider, then stored encrypted) | application/json: object (inline) | 201: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| PUT | /connection/model | putModel | Choose the model | application/json: object (inline) | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| GET | /connection/models | getModels | Models available to your connected account | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /connection/oauth/start | startOAuth | Start a provider sign-in (authorization code with PKCE); returns the URL to open | application/json: object (inline) | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /connection/test | testConnection | Test the connection with a cheap provider call | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| GET | /providers | getProviders | Registered providers and their connection methods | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |

## Policy

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /policy | getPolicy | Your effective AI access policy (settings clamped to project limits) and the operation catalogue | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /preview | previewRequest | What would be sent to the provider for this request (nothing is sent) | application/json: AssistantRequest | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |

## Proposals

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /proposals | listProposals | Your proposals in a project (open ones reopen after a restart) | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /proposals | createProposal | Store a proposal shown to the person (declarative: module operations validated against the module OpenAPI and project) | application/json: object (inline) | 201: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| GET | /proposals/{id} | getProposal | One of your proposals | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /proposals/{id}/apply | applyProposal | Apply a declarative proposal: revalidate identity, membership, entitlements, project (C13), expected revisions and idempotency, then execute through the module API | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
| POST | /proposals/{id}/outcome | recordProposalOutcome | Record the outcome of a proposal applied in the browser (twin, closure) or a rejection | none | 200: application/json: object (inline); 4XX: application/json: Error; 5XX: application/json: Error |
