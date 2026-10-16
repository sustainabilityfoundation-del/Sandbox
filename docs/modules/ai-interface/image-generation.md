# Image generation for concept visuals (developer documentation)

Status: implemented in `services/visualization` (`@ews/visualization-service`) with the client contract
`@ews/visualization-client`. Contracts: [concept-visualization-contracts.md](../../specifications/concept-visualization-contracts.md)
§1, §3 and §6. User help: `apps/workspace/help/ai/images.md` (`ai.images`).

**Owner decision (contracts §6):** the first release uses structured layouts only. Image generation is built and
tested with the fake adapter, but **no live generation run has been made**. It is enabled per person by the steps in
§5 below.

## 1. What the owner's connection can use (official OpenAI documentation, checked 15 October 2026)

| Connection | Image generation | Source |
| --- | --- | --- |
| Sign in with ChatGPT (ChatGPT plan usage) | **Not supported.** "Image generation" is listed under the unsupported tools of the plan-usage preview. Only `POST /v1/responses` and `GET /v1/models` are documented for this flow. | [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) |
| OpenAI API key | Supported: `POST /v1/images/generations` (text to image) and `POST /v1/images/edits` (with input images, multipart). The response is `data[0].b64_json`. | [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) |

Models offered by the adapter:
- `gpt-image-2.5-flare`, the default: "fastest model for high-quality, everyday image generation";
- `gpt-image-2.5-sunburst`: recommended where editing precision matters most.

Sizes are 1024x1024, 1536x1024 (the default) and 1024x1536. The quality is low, medium or high; OpenAI also accepts
xhigh, max and auto, which are not offered here, to keep the cost predictable. The output is PNG.

## 2. Cost

The Standard prices per million tokens are identical for both models
([pricing](https://developers.openai.com/api/docs/pricing),
[model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)):

| Price per million tokens | |
| --- | --- |
| Image output | $30 |
| Image input | $8 |
| Text input | $5 |

- OpenAI publishes no per-image table; its interactive calculator in the guide estimates tokens by quality and size.
- Each job records the `usage` of the response (input, output, text and image tokens) and `estimatedCostUsd`,
  computed from the prices above (`estimateOpenAICost`). The provider's invoice is authoritative.
- Example from the test fixture: 40 text input tokens and 1200 output tokens come to about $0.036. This shows the
  formula only; it is not a measured price.

What keeps the cost down:
- Idempotent jobs: an identical request returns the existing job, whether it is pending, running or finished.
- Interrupted jobs are never re-run automatically.
- The setting `ai.images.daily-limit` (default 20 per person per 24 h, project ceiling 200).
- Image generation is off by default.

Rate limits (default images per minute): Build tier 20, Launch 150, Grow 250. OpenAI may require **API
Organization Verification** before GPT Image models can be used.

## 3. Architecture

```
Conceptualize (UI / assistant operation)
  │  POST /api/visualization/v1/projects/{p}/jobs | /batches   (GenerationRequest: subject concept+revision, instruction, options, references)
  ▼
services/visualization ── jobs table (state, derived idempotency key, provider/model, instruction, references, revision, usage)
  │  runner (background, concurrency 2, heartbeat, SKIP LOCKED claim)       outbox → SSE /events
  │  ImageAccessPort.resolve(user, project) ─────────────► services/assistant AssistantBackend.imageAccess()
  │                                                         (settings ai.images.*, connection without secret,
  │                                                          credential() decrypts for one call)
  ▼
AdapterRegistry: openai-images (Images API, API key) │ fake-test (development and tests only)
  ▼
Project Management BlobStore (content-addressed bytes) + visualization.assets (references)
```

- The **idempotency key** is the SHA-256 of a canonical JSON of: project, kind, subject ID (lower case) and revision,
  the whitespace-normalised instruction, adapter, model, options, and the sorted reference SHA-256s. Purpose,
  clientRef and provenance are not part of it. A unique index on `(project_id, idempotency_key)` makes this hold
  under concurrent requests.
- **States:** pending → running → succeeded, failed or cancelled.
  - Retry is allowed for failed and cancelled jobs; it is the same job with `attempt + 1`.
  - Cancel moves a pending job straight to cancelled. A running job gets `cancelRequested`, and output that arrives
    later is discarded.
  - A running job whose heartbeat is older than 90 s becomes failed `interrupted` (retryable). It is never re-run
    automatically.
- **Batches:** every item is created and run independently. The outcome is created, existing or refused, with the
  error.
- **Refusal:** when no adapter is usable, the response is 409 `generation-unavailable` with `details.reason`
  (`not-connected`, `images-disabled`, `method-unsupported` or `provider-missing`), or 429 `daily-limit`. No job is
  created. There is no placeholder image.
- **Context sent:** only the instruction, the fixed preface (`PROMPT_PREFACE`: an illustrative sketch, no text,
  labels, numbers or dimension lines, not to scale), the options and the reference images. No project, user or
  concept identifiers are sent; a test checks this.
- **Credentials:** they never leave `services/assistant` except as the argument of one adapter call. They are not
  stored in schema `visualization` or put in responses, events or errors (tested). Provider error messages are
  replaced by the platform's own text with the provider code.
- **Future image-only key:** `ConnectionInfo.purpose` (`assistant` | `images`) is already in the port, so a
  dedicated image credential can be added in `services/assistant` without changing the visualization service.
  It is not built (owner decision).
- **Fake adapter:** `fake-test` returns a deterministic SVG reading "TEST ASSET – not a generated image".
  - Assets it produces are flagged `testAsset` and served with `X-Test-Asset: true` and a sandboxing CSP.
  - It needs no credential and no opt-in. The registry refuses it in production.
  - The API host registers it only when `EWS_ASSISTANT_FAKE_PROVIDER=1` (`npm run ai:dev:fake`) or
    `visualization.fakeAdapter`.
  - Test hooks in the instruction: `[fake:fail]`, `[fake:fail-once]`, `[fake:refuse]`, `[fake:slow]`.

## 4. Configuration

| What | Where | Default |
| --- | --- | --- |
| Image generation opt-in | user setting `ai.images.enabled` (project ceiling `ai.images-ceiling.enabled`) | off |
| Default quality | user setting `ai.images.quality` | medium |
| Daily limit | user setting `ai.images.daily-limit` (ceiling `ai.images-ceiling.daily-limit`) | 20 (ceiling 200) |
| Credential | the person's connection in `services/assistant` (encrypted with `EWS_ASSISTANT_KEY`) | none |
| Bytes | Project Management blob store (`STORAGE_DIR`, default `.data/objects`) | |
| Fake adapter | `EWS_ASSISTANT_FAKE_PROVIDER=1`, development only | off |
| Runner | `ServerOptions.visualization.runner` (`concurrency`, `pollMs`, `staleAfterMs`) | 2, 1000 ms, 90 s |

API reference: `/api/visualization/v1/docs` (OpenAPI at `/api/visualization/v1/openapi.json`).

## 5. Enabling live image generation later (the owner)

1. Create an OpenAI API project key with billing and credit at platform.openai.com. If OpenAI asks, complete API
   Organization Verification for GPT Image models.
2. Settings → AI and reasoning → Connection: connect the key. If you are connected with Sign in with ChatGPT,
   disconnect first; only one connection per person exists today.
3. Settings → AI and reasoning → Image generation: turn it on. Optionally choose the quality and the daily limit.
4. Request an illustration in Conceptualize. The job records the provider, model, instruction, reference images,
   source concept revision, tokens and estimated cost.

## 6. Limitations

- API key only (see §1). Each person has one connection; an image-only key is reserved and not built.
- Images are illustrations: text, proportions and fine geometry are unreliable and never authoritative (ADR-0070).
  Dimensions come only from structured layouts.
- Latency is up to about 2 minutes per image; OpenAI moderation may refuse requests.
- The service does not check that the concept revision exists in Conceptualize; Conceptualize composes and validates
  the request.
- The cost is an estimate from published prices; partial-image streaming is not used.
- The fake adapter's assets are deduplicated by content, so an asset's `jobId` names the first job that produced it.
