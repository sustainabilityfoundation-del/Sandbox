import type { AdapterModel, ImageBackground, ImageQuality, ImageSize, JobUsage, UnavailableReason } from '@ews/visualization-client'

/** A credential for one adapter call. Produced by the access port at run time and never stored or logged here. */
export type ImageCredential = { kind: 'api-key'; apiKey: string } | { kind: 'oauth'; accessToken: string } | { kind: 'none' }

/** The person's connection as seen by adapters (no secret). `purpose` allows a later image-only credential. */
export interface ConnectionInfo {
  provider: string
  method: string
  /** `assistant`: the person's assistant connection; `images`: a dedicated image-generation credential (reserved). */
  purpose: 'assistant' | 'images'
}

export interface ReferenceImage {
  bytes: Uint8Array
  mediaType: string
  fileName: string
}

export interface GenerateInput {
  model: string
  /** Full prompt: the adapter-independent preface and the caller's instruction. */
  prompt: string
  size: ImageSize
  quality: ImageQuality
  background: ImageBackground
  references: ReferenceImage[]
  credential: ImageCredential
  /** 1 for the first run of a job. */
  attempt: number
  signal: AbortSignal
}

export interface GenerateOutput {
  bytes: Uint8Array
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  width: number | null
  height: number | null
  revisedPrompt?: string
  usage?: JobUsage
}

export type Acceptance = { ok: true } | { ok: false; code: UnavailableReason; message: string }

/**
 * A replaceable image generation adapter (contracts §1). Provider-specific logic stays here; the service and
 * Conceptualize only see jobs and assets.
 */
export interface ImageAdapter {
  id: string
  name: string
  providerId: string
  output: 'raster' | 'vector'
  models: AdapterModel[]
  /** Test adapters are registered only outside production (development and tests). */
  testOnly: boolean
  /** Whether a paid-usage opt-in (`ai.images.enabled`) is needed. */
  paid: boolean
  costNote: string
  limitations: string[]
  /** Whether the person's connection can be used with this adapter. */
  accepts(connection: ConnectionInfo | null): Acceptance
  generate(input: GenerateInput): Promise<GenerateOutput>
}

/** A failed generation. `retryable`: a retry of the same request may succeed. */
export class AdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'AdapterError'
  }
}

/** Fixed preface of every generation prompt: images are illustrations, never dimensioned drawings. */
export const PROMPT_PREFACE =
  'Illustrative concept sketch for early engineering design exploration. Show the idea clearly on a plain background. ' +
  'Do not draw any text, letters, numbers, labels, dimension lines, logos or brand marks. The image is not to scale.'

export const composePrompt = (instruction: string) => `${PROMPT_PREFACE}\n\n${instruction}`

/** Width and height of a PNG from its IHDR chunk (null when the bytes are not a PNG). */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Detects the media type from magic bytes (uploads and provider output are checked, never trusted). */
export function sniffMediaType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (pngSize(bytes)) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}
