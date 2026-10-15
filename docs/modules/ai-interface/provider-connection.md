# AI Interface: provider connection and access policy (development plan sprint 4)

Status: implemented on `feature/ai-connection` (15 October 2026), ready for owner review. Decisions:
[ADR-0047](../../decisions/0047-ai-provider-backend-and-account-connection.md),
[ADR-0048](../../decisions/0048-ai-settings-framework.md). Brief: [ai-connection.md](../../specifications/ai-connection.md).

## Request path

```
Assistant panel (browser)                services/api host                         Provider
  conversation.ts loop  ── POST /api/assistant/v1/respond ──▶ AssistantBackend.respond
  (AssistantRequest, X-Dev-User)            1. effective AI settings (settings service, project ceilings)
                                            2. verify signed results, filter tools (policy + entitlements)
                                            3. data sharing, history length, limits
                                            4. provider adapter (decrypted credential) ───────▶ Responses API
                                            5. screen tool calls, sign allowed ones, audit
  executor.ts runs signed calls  ◀── tool_calls | final ──┘
  (validation, previews; Apply by the person)
```

## Adding a provider

1. Implement `AssistantProvider` (`services/assistant/src/providers/types.ts`): `id`, `displayName`,
   `description`, `methods` (api-key and/or oauth), `defaultModel`, `listModels`, `validateCredential`,
   `respond`. Map tool names (dots) to the provider's allowed function names and back; never log
   credentials; map failures to `ProviderError` kinds.
2. Register it in `services/api/src/server.ts` (`ProviderRegistry.register`). The settings page lists it and
   its methods automatically; the workspace, tools and executor do not change.
3. Add unit tests with a mocked `fetch` (see `openai.test.ts`); the API tests use the fake provider.

An OpenAI-compatible server (Azure OpenAI, a local server) can reuse `createOpenAIProvider({ baseUrl })`
with its own ID once its authentication method is added.

## Operation catalogue

`OPERATION_CATALOGUE` in `services/assistant/src/policy.ts` gives each assistant action its operation class;
the module comes from the name prefix. `policy.test.ts` fails when a tool package adds an action that is not
catalogued. Uncatalogued actions of a known module count as "propose changes"; unknown modules are refused.

## Server-side callers

`AssistantBackend.complete(principal, { projectId, purpose, instructions?, messages, tools? })` gives other
server modules (the design reasoning model gateway, ADR-0045) the person's connection with the same policy
limits and audit; tools are screened by the same policy.
