import type { JobUsage } from '@ews/visualization-client'
import { AdapterError, pngSize, sniffMediaType, type GenerateInput, type GenerateOutput, type ImageAdapter } from './types'

/**
 * OpenAI Images API adapter (checked against the official documentation, 15 October 2026):
 * - `POST /v1/images/generations` (text to image) and `POST /v1/images/edits` (with reference images, multipart),
 *   response `data[0].b64_json`; models `gpt-image-2.5-flare` (fast everyday generation) and
 *   `gpt-image-2.5-sunburst` (editing precision); sizes 1024x1024, 1536x1024, 1024x1536; quality low, medium, high
 *   (the models also accept xhigh, max and auto; not offered here to keep cost predictable).
 * - Prices: text input $5, image input $8, image output $30 per 1M tokens (Standard). No per-image table is
 *   published; the actual `usage` of each response is recorded and the cost estimated from these prices.
 * - Works only with an **API key**. OpenAI lists image generation as unsupported on ChatGPT plan usage
 *   (Sign in with ChatGPT, preview limitations).
 * - Organisations may need API Organization Verification before GPT Image models can be used.
 */
export const OPENAI_IMAGE_MODELS = [
  { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare (fast, everyday images)', default: true },
  { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst (editing precision)', default: false },
]

export const OPENAI_IMAGE_PRICES = { textInputPerM: 5, imageInputPerM: 8, imageOutputPerM: 30 }

export interface OpenAIImageAdapterOptions {
  baseUrl?: string
  fetch?: typeof fetch
  /** Per-request timeout; OpenAI notes complex prompts can take up to 2 minutes. */
  timeoutMs?: number
}

interface OpenAIUsage {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { text_tokens?: number; image_tokens?: number }
}

export function estimateOpenAICost(u: OpenAIUsage): number | undefined {
  if (u.output_tokens === undefined) return undefined
  const text = u.input_tokens_details?.text_tokens ?? (u.input_tokens_details?.image_tokens === undefined ? (u.input_tokens ?? 0) : 0)
  const image = u.input_tokens_details?.image_tokens ?? 0
  const usd = (text * OPENAI_IMAGE_PRICES.textInputPerM + image * OPENAI_IMAGE_PRICES.imageInputPerM + u.output_tokens * OPENAI_IMAGE_PRICES.imageOutputPerM) / 1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

function usageOf(u: OpenAIUsage | undefined): JobUsage | undefined {
  if (!u) return undefined
  return {
    ...(u.input_tokens !== undefined ? { inputTokens: u.input_tokens } : {}),
    ...(u.output_tokens !== undefined ? { outputTokens: u.output_tokens } : {}),
    ...(u.input_tokens_details?.text_tokens !== undefined ? { textInputTokens: u.input_tokens_details.text_tokens } : {}),
    ...(u.input_tokens_details?.image_tokens !== undefined ? { imageInputTokens: u.input_tokens_details.image_tokens } : {}),
    ...(estimateOpenAICost(u) !== undefined ? { estimatedCostUsd: estimateOpenAICost(u) } : {}),
  }
}

function failure(status: number, body: { error?: { code?: string; type?: string; message?: string } } | undefined): AdapterError {
  const code = body?.error?.code ?? body?.error?.type ?? ''
  // Provider messages can quote the request; keep only a short, generic explanation plus the provider code.
  const ref = code ? ` (OpenAI: ${code})` : ''
  if (status === 401) return new AdapterError('provider-invalid-credential', `OpenAI did not accept the API key${ref}. Connect a valid key in Settings → AI and reasoning.`, false)
  if (status === 403) return new AdapterError('provider-not-permitted', `This OpenAI organisation may not use the image model${ref}. OpenAI may require API Organization Verification for GPT Image models.`, false)
  if (status === 429 && /insufficient_quota|billing/.test(code)) return new AdapterError('provider-usage-limit', `The OpenAI account has no remaining quota or billing is not set up${ref}.`, false)
  if (status === 429) return new AdapterError('provider-rate-limit', `OpenAI rate limit reached${ref}. Retry later.`, true)
  if (code === 'moderation_blocked') return new AdapterError('moderation-blocked', 'OpenAI blocked the request under its usage policies. Change the instruction or references before trying again.', false)
  if (status === 404 || code === 'model_not_found') return new AdapterError('invalid-request', `The image model is not available to this OpenAI account${ref}.`, false)
  if (status >= 500) return new AdapterError('provider-unavailable', `OpenAI could not generate the image right now${ref}. Retry later.`, true)
  return new AdapterError('invalid-request', `OpenAI refused the request${ref}. Change the instruction or references before trying again.`, false)
}

export function createOpenAIImageAdapter(options: OpenAIImageAdapterOptions = {}): ImageAdapter {
  const base = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 180_000
  return {
    id: 'openai-images',
    name: 'OpenAI image generation',
    providerId: 'openai',
    output: 'raster',
    models: OPENAI_IMAGE_MODELS,
    testOnly: false,
    paid: true,
    costNote: 'Billed to your OpenAI API account: image output $30 and image input $8 per million tokens, text input $5 per million tokens (OpenAI Standard prices, October 2026). Each job records the tokens used and an estimated cost; OpenAI’s invoice is authoritative.',
    limitations: [
      'Needs an OpenAI API key connection. OpenAI does not offer image generation on ChatGPT plan usage (Sign in with ChatGPT).',
      'OpenAI may require API Organization Verification before GPT Image models can be used.',
      'Images are illustrations: proportions, text and fine geometry are not reliable and never authoritative.',
      'Complex prompts can take up to two minutes.',
      'Requests may be refused by OpenAI moderation.',
    ],
    accepts(connection) {
      if (!connection) return { ok: false, code: 'not-connected', message: 'No AI account is connected. Connect an OpenAI API key in Settings → AI and reasoning to generate illustrations.' }
      if (connection.provider !== 'openai') return { ok: false, code: 'provider-missing', message: `Your connected account (${connection.provider}) has no image generation on this server. Connect an OpenAI API key in Settings → AI and reasoning.` }
      if (connection.method !== 'api-key')
        return { ok: false, code: 'method-unsupported', message: 'You are connected with Sign in with ChatGPT. OpenAI does not offer image generation on ChatGPT plan usage, so illustrations need an OpenAI API key (billed to the API account). Structured layouts keep working.' }
      return { ok: true }
    },
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      if (input.credential.kind !== 'api-key') throw new AdapterError('provider-invalid-credential', 'Image generation needs an OpenAI API key.', false)
      const signal = AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)])
      const auth = { Authorization: `Bearer ${input.credential.apiKey}` }
      let res: Response
      try {
        if (!input.references.length) {
          res = await doFetch(`${base}/images/generations`, {
            method: 'POST',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: input.model, prompt: input.prompt, n: 1, size: input.size, quality: input.quality, background: input.background, output_format: 'png' }),
            signal,
          })
        } else {
          const form = new FormData()
          form.set('model', input.model)
          form.set('prompt', input.prompt)
          form.set('n', '1')
          form.set('size', input.size)
          form.set('quality', input.quality)
          form.set('background', input.background)
          form.set('output_format', 'png')
          for (const r of input.references) form.append('image[]', new Blob([r.bytes as BlobPart], { type: r.mediaType }), r.fileName)
          res = await doFetch(`${base}/images/edits`, { method: 'POST', headers: auth, body: form, signal })
        }
      } catch (e) {
        if (input.signal.aborted) throw new AdapterError('cancelled', 'Cancelled.', true)
        if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') throw new AdapterError('timeout', 'OpenAI did not answer in time. Retry later.', true)
        throw new AdapterError('provider-unavailable', 'OpenAI could not be reached. Retry later.', true)
      }
      const text = await res.text()
      let body: { data?: { b64_json?: string; revised_prompt?: string }[]; usage?: OpenAIUsage; error?: { code?: string; type?: string; message?: string } } | undefined
      try {
        body = text ? JSON.parse(text) : undefined
      } catch {
        body = undefined
      }
      if (!res.ok) throw failure(res.status, body)
      const b64 = body?.data?.[0]?.b64_json
      if (!b64) throw new AdapterError('output-invalid', 'OpenAI answered without an image.', true)
      const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
      const mediaType = sniffMediaType(bytes)
      if (!mediaType) throw new AdapterError('output-invalid', 'OpenAI returned data that is not an image.', true)
      const size = pngSize(bytes)
      return { bytes, mediaType, width: size?.width ?? null, height: size?.height ?? null, ...(body?.data?.[0]?.revised_prompt ? { revisedPrompt: body.data[0].revised_prompt } : {}), usage: usageOf(body?.usage) }
    },
  }
}
