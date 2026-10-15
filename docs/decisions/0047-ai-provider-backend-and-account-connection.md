# ADR-0047: AI provider backend, account connection and server-enforced access policy

Status: Proposed (2026-10-15, AI connection agent)

Brief: [ai-connection.md](../specifications/ai-connection.md) §2–§5a. Related: ADR-0010, ADR-0013, ADR-0045
(reasoning runs and model access).

## Context

The owner wants the assistant to answer with ChatGPT using **their own account**, be ready for other
providers, and control what the AI is given. Credentials must stay on the server; only needed context may
be sent; model output and documents are data; every operation is validated in application code. Tool calls
are executed in the browser by the existing executor (preview and Apply unchanged).

What OpenAI offers third-party applications (checked 15 October 2026, official documentation):

- **Sign in with ChatGPT** (developers.openai.com/siwc). Identity-only sign-in on websites is offered to
  "a select group of commercial partners" (waitlist). **ChatGPT plan usage** is documented for "open-source
  projects, personal projects that run locally, and selected private apps"; paid or remotely hosted apps
  must join the waitlist first. The open-source / local flow uses OAuth authorization code with PKCE,
  **dynamic client registration** (`client_id=dynamic_agent_client`, the callback returns an issued
  `oaiapp_…` client ID), an `ext_agent_host_id`, a loopback redirect on `http://127.0.0.1:<port>/…`,
  scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, refresh and
  revocation endpoints from `https://auth.openai.com/.well-known/openid-configuration`, and inference on the
  public Responses API with `store: false`, `stream: true`, namespaced function tools and no
  `max_output_tokens`. "This direct flow needs neither a client secret nor a partner API key."
- **OpenAI API keys** (platform.openai.com project keys), billed to the API account, separate from a
  ChatGPT subscription.

## Decision

1. **Provider-neutral backend** `services/assistant` (`@ews/assistant-service`, schema `assistant`,
   `/api/assistant/v1`, hosted by `services/api`). A provider is an adapter implementing
   `AssistantProvider` (`listModels`, `validateCredential`, `respond`) and registered in a
   `ProviderRegistry`; connection methods (`api-key`, `oauth`) are data the settings page renders
   generically. OpenAI is the first adapter (plain `fetch`, Responses API, streaming parse). A fake
   provider proves another provider plugs in without workspace changes.
2. **Account connection, two methods.** (a) **Sign in with ChatGPT with plan usage**, offered only when the
   API host runs on a loopback origin (`http://127.0.0.1:<port>`) outside production, as OpenAI documents for
   local apps; the server holds state, nonce and PKCE verifier, validates the ID token (RS256 JWKS, issuer,
   audience = issued client ID, expiry, nonce), requires the `chatgpt.tokens.use.direct` grant before
   inference, refreshes near expiry (serialized), revokes on Disconnect and keeps the registration for a
   later sign-in. The callback path is `/auth/callback` at the API host root. (b) **OpenAI API key**,
   validated with a model-list call before it is stored. No other product's client ID is used, and the
   chatgpt.com web session is never automated.
3. **Credentials** are AES-256-GCM encrypted at rest with `EWS_ASSISTANT_KEY` (context-bound to user and
   record), never returned, logged or put in URLs; the browser sees "key ending …" or the account e-mail.
   Without the key in production the assistant API is not started.
4. **Access policy enforced on the server** (settings `ai.access.*`, `ai.operations.*`, `ai.sharing.*`,
   `ai.limits.*` with project ceilings `ai.ceiling.*`, ADR-0048): the tool list sent to the model is filtered
   by the person's server-side entitlements and policy; model tool calls outside it are refused and never
   reach the browser (the model is told and asked again, at most twice); every issued call ID carries an
   HMAC over user, name and arguments, and the browser's tool results are accepted only for such calls and
   only while the operation is still allowed. Data sharing strips the selection / open tools, shortens the
   history and redacts requirement text or element details in results. Limits: operations per answer,
   output tokens, timeout. The browser mirrors the policy for UX only.
5. **Audit** per model call (user, project, provider, method, model, operations offered / called / refused,
   tokens, latency, outcome); no credentials; prompts only when the person enables prompt storage.
6. **Server-side callers** (the design reasoning layer's model gateway, ADR-0045) use
   `AssistantBackend.complete()` with the same connection, policy limits and audit.

## Consequences

- The browser contract (`AssistantRequest` / `AssistantResponse`) is unchanged per provider; a provider is
  one adapter. The proposal-preview policy is unchanged.
- ChatGPT plan usage is a **preview** program: it is available only for local, personal or open-source use;
  hosting the platform remotely or commercially needs OpenAI's approval (owner decision). Approved OpenAI
  button branding (logo) is not included; the button uses the required label "Continue with ChatGPT".
- The full Sign in with ChatGPT round trip could not be tested by an agent (OpenAI's bot protection and
  the owner's personal account); unit tests cover URL, PKCE, ID-token validation and callback handling.
- The operation catalogue (module and operation class per action) lives in the assistant service; a test
  fails when a tool package adds an action that is not catalogued. Module settings pages for other modules
  need their definitions registered on the API host (change request in the progress file).
