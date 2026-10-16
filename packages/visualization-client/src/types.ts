/**
 * Contract of the visualization service (`/api/visualization/v1`, docs/specifications/concept-visualization-contracts.md
 * §1, §3). Framework-free types shared by the service (`@ews/visualization-service`) and its clients
 * (Conceptualize UI and assistant operations). Generated images are illustrative artifacts: never evidence, never
 * geometry, never a verification (ADR-0070).
 */

export const VISUALIZATION_BASE_PATH = '/api/visualization/v1'
export const VISUALIZATION_API_VERSION = '0.1.0'

/** Lifecycle of a generation job. Terminal: succeeded, failed, cancelled. */
export type JobState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export const TERMINAL_STATES: readonly JobState[] = ['succeeded', 'failed', 'cancelled']

/** Kinds of generated visuals. Only `illustration` is generated in the first release (layouts are rendered by Conceptualize). */
export type GenerationKind = 'illustration'

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536'
export type ImageQuality = 'low' | 'medium' | 'high'
export type ImageBackground = 'opaque' | 'transparent' | 'auto'

/** The artifact a visual illustrates, pinned to its revision (an `ArtifactRef` of Conceptualize). */
export interface GenerationSubject {
  module: 'conceptualize'
  type: 'concept'
  /** Concept UUID. */
  id: string
  /** Concept revision the instruction was composed from (≥ 1). */
  revision: number
}

export interface GenerationOptions {
  /** Default 1536x1024. */
  size?: ImageSize
  /** Default from the person's AI settings (`ai.images.quality`, default medium). */
  quality?: ImageQuality
  /** Default opaque. */
  background?: ImageBackground
}

/** Provenance of the request (the same headers as other services can also be used). */
export interface RequestProvenance {
  sourceKind: 'user' | 'assistant'
  conversationId?: string
  proposalId?: string
  messageId?: string
}

/**
 * One generation request. The caller composes `instruction` from the structured concept definition and sends only
 * what the image needs (no requirement text, no project data beyond the instruction and reference images). The
 * adapter adds a fixed preface: illustrative concept sketch, no text, no dimension labels.
 *
 * Idempotency: the service derives the key from project, kind, subject (id and revision), the whitespace-normalised
 * instruction, adapter, model, options and the SHA-256 of each reference asset (order-independent). A request with the
 * same key returns the existing job (any state) instead of generating or charging again. `purpose`, `clientRef` and
 * `provenance` are recorded but are not part of the key.
 */
export interface GenerationRequest {
  kind: GenerationKind
  subject: GenerationSubject
  /** 1–4000 characters. */
  instruction: string
  /** Adapter ID from GET /adapters; default: the first available adapter. */
  adapter?: string
  /** Model of the adapter; default: the adapter's default model. */
  model?: string
  options?: GenerationOptions
  /** Up to 4 reference images uploaded with POST /projects/{projectId}/assets or produced by earlier jobs. */
  referenceAssetIds?: string[]
  /** Short label shown with the job, e.g. "Alternative B" (≤ 200). */
  purpose?: string
  /** Caller's correlation ID, e.g. Conceptualize's visual ID (≤ 200). */
  clientRef?: string
  provenance?: RequestProvenance
}

export interface JobError {
  /**
   * `provider-unavailable`, `provider-rate-limit`, `provider-usage-limit`, `provider-invalid-credential`,
   * `moderation-blocked`, `invalid-request`, `timeout`, `interrupted` (the server stopped while the job ran; it may
   * have been charged, so it is never re-run automatically), `output-invalid`.
   */
  code: string
  message: string
  /** Whether POST …/retry may succeed without changing the request. */
  retryable: boolean
}

export interface Asset {
  id: string
  projectId: string
  /** SHA-256 of the bytes (content address in the Project Management blob store). */
  sha256: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  byteSize: number
  width: number | null
  height: number | null
  origin: 'upload' | 'generated'
  /** The job that produced it (origin generated). */
  jobId: string | null
  /** True for output of the fake test adapter: never a real visual. */
  testAsset: boolean
  createdBy: string
  createdAt: string
  /** Relative URL of the bytes: `/api/visualization/v1/projects/{projectId}/assets/{id}/content`. */
  contentUrl: string
}

export interface JobOutput {
  asset: Asset
  /** The prompt as revised by the provider, when it reports one. */
  revisedPrompt?: string
}

export interface JobUsage {
  inputTokens?: number
  outputTokens?: number
  imageInputTokens?: number
  textInputTokens?: number
  /** Estimated cost in USD from the adapter's published prices (an estimate, not an invoice). */
  estimatedCostUsd?: number
}

export interface GenerationJob {
  id: string
  projectId: string
  batchId: string | null
  state: JobState
  kind: GenerationKind
  subject: GenerationSubject
  instruction: string
  adapter: string
  /** Provider and model actually used (recorded per job). */
  provider: { id: string; name: string; model: string; method: string | null }
  options: Required<GenerationOptions>
  referenceAssets: { id: string; sha256: string; mediaType: string }[]
  idempotencyKey: string
  /** 1 for the first run; incremented by each retry. */
  attempt: number
  purpose: string | null
  clientRef: string | null
  provenance: RequestProvenance
  createdBy: string
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
  /** A cancel was requested while running; the state becomes cancelled when the adapter stops. */
  cancelRequested: boolean
  error: JobError | null
  output: JobOutput | null
  usage: JobUsage | null
  /** True when produced by the fake test adapter. */
  testAsset: boolean
}

/** Response of POST /projects/{projectId}/jobs: `created` false when an identical request already had a job. */
export interface JobCreated {
  job: GenerationJob
  created: boolean
}

/** One item of a batch: one item's refusal or failure never affects the others. */
export interface BatchItemOutcome {
  index: number
  outcome: 'created' | 'existing' | 'refused'
  job?: GenerationJob
  error?: { code: string; message: string; details?: Record<string, unknown> }
}

export interface BatchCreated {
  batchId: string
  items: BatchItemOutcome[]
}

export interface AdapterModel {
  id: string
  label: string
  default: boolean
}

export interface AdapterInfo {
  id: string
  name: string
  /** `raster` adapters produce images; structured layouts are not generated here. */
  output: 'raster' | 'vector'
  models: AdapterModel[]
  /** For the calling person in the given project. */
  available: boolean
  /** Why it is not available, in words a person can act on. */
  unavailableReason?: string
  /** `not-connected`, `images-disabled`, `method-unsupported`, `provider-missing`. */
  unavailableCode?: string
  /** Test adapter (development and tests only). */
  testOnly: boolean
  costNote: string
  limitations: string[]
}

export interface AdaptersResponse {
  adapters: AdapterInfo[]
  /** The adapter used when a request names none (null: image generation is unavailable). */
  defaultAdapter: string | null
}

/** Server-sent event on GET /projects/{projectId}/events (`event: visualization.job-changed`). */
export interface JobChangedEvent {
  eventId: string
  /** Increasing delivery position; resume with ?after=<seq>. */
  seq: number
  type: 'visualization.job-changed'
  projectId: string
  jobId: string
  batchId: string | null
  state: JobState
  subject: GenerationSubject
  clientRef: string | null
  occurredAt: string
}

/** Error body of every route: `{ error: { code, message, details } }`. */
export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

/**
 * Codes of refusals when creating a job (HTTP 409 `generation-unavailable`, `details.reason`):
 * `not-connected` (no AI account), `images-disabled` (Settings → AI and reasoning → Image generation is off),
 * `method-unsupported` (Sign in with ChatGPT: OpenAI does not offer image generation on ChatGPT plan usage),
 * `provider-missing` (the adapter is not installed on this server). No job is created and nothing is charged.
 */
export type UnavailableReason = 'not-connected' | 'images-disabled' | 'method-unsupported' | 'provider-missing'
