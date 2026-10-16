import { createHash } from 'node:crypto'
import { AdapterError, type GenerateInput, type GenerateOutput, type ImageAdapter } from './types'

export const FAKE_ADAPTER_ID = 'fake-test'

/**
 * TEST ADAPTER (development and tests only; never registered in production). Returns a deterministic SVG that says
 * "TEST ASSET – not a generated image", derived from the prompt, model and size; no provider is called and nothing is
 * charged. Test hooks in the instruction:
 * - `[fake:fail]` fails every attempt (retryable provider error);
 * - `[fake:fail-once]` fails the first attempt only (for retry tests);
 * - `[fake:refuse]` fails with a non-retryable error;
 * - `[fake:slow]` waits about 3 s, honouring cancellation.
 */
export function createFakeImageAdapter(options: { slowMs?: number } = {}): ImageAdapter {
  const slowMs = options.slowMs ?? 3000
  return {
    id: FAKE_ADAPTER_ID,
    name: 'Test images (fake adapter, development only)',
    providerId: 'fake',
    output: 'vector',
    models: [{ id: 'fake-image-1', label: 'Deterministic test image', default: true }],
    testOnly: true,
    paid: false,
    costNote: 'No cost: no provider is called.',
    limitations: ['Test adapter: the image is a labelled placeholder for tests, never a real visual. Not offered in production.'],
    accepts: () => ({ ok: true }),
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      if (input.prompt.includes('[fake:slow]')) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, slowMs)
          input.signal.addEventListener('abort', () => (clearTimeout(t), reject(new AdapterError('cancelled', 'Cancelled.', true))), { once: true })
        })
      }
      if (input.signal.aborted) throw new AdapterError('cancelled', 'Cancelled.', true)
      if (input.prompt.includes('[fake:refuse]')) throw new AdapterError('invalid-request', 'Test adapter: refused (test hook [fake:refuse]).', false)
      if (input.prompt.includes('[fake:fail]') || (input.prompt.includes('[fake:fail-once]') && input.attempt === 1)) throw new AdapterError('provider-unavailable', 'Test adapter: simulated provider failure (test hook).', true)
      const [w, h] = input.size.split('x').map(Number)
      const hash = createHash('sha256').update(`${input.model}\n${input.size}\n${input.prompt}\n${input.references.map((r) => createHash('sha256').update(r.bytes).digest('hex')).join(',')}`).digest('hex')
      const hue = parseInt(hash.slice(0, 2), 16)
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="100%" height="100%" fill="hsl(${hue},30%,92%)"/>` +
        `<rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="hsl(${hue},40%,40%)" stroke-width="8" stroke-dasharray="32 16"/>` +
        `<text x="50%" y="45%" text-anchor="middle" font-family="sans-serif" font-size="72" font-weight="700" fill="hsl(${hue},40%,25%)">TEST ASSET</text>` +
        `<text x="50%" y="55%" text-anchor="middle" font-family="sans-serif" font-size="32" fill="hsl(${hue},40%,25%)">not a generated image (fake adapter)</text>` +
        `<text x="50%" y="62%" text-anchor="middle" font-family="monospace" font-size="24" fill="hsl(${hue},40%,25%)">${hash.slice(0, 16)}</text>` +
        `</svg>`
      return { bytes: new TextEncoder().encode(svg), mediaType: 'image/svg+xml', width: w, height: h, usage: { estimatedCostUsd: 0 } }
    },
  }
}
