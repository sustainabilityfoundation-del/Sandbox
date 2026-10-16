/**
 * Port to the visualization service (`@ews/visualization-client`, contract of commit 3e4632a): the subset
 * Conceptualize uses. The host registers the client (it knows the identity and base URL); until it does,
 * illustration requests are refused with an explanation and the structured layout workflow keeps working.
 * No placeholder image is ever produced here.
 */

export type JobState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface GenerationRequest {
  kind: 'illustration'
  subject: { module: 'conceptualize'; type: 'concept'; id: string; revision: number }
  instruction: string
  adapter?: string
  model?: string
  referenceAssetIds?: string[]
  purpose?: string
  clientRef?: string
  provenance?: { sourceKind: 'user' | 'assistant'; conversationId?: string; proposalId?: string; messageId?: string }
}

export interface GenerationJob {
  id: string
  state: JobState
  adapter: string
  provider: { id: string; name: string; model: string; method: string | null }
  attempt: number
  clientRef: string | null
  error: { code: string; message: string; retryable: boolean } | null
  output: { asset: { id: string; sha256: string; mediaType: string; testAsset: boolean } } | null
  testAsset: boolean
}

export interface AdapterInfo {
  id: string
  name: string
  available: boolean
  unavailableReason?: string
  unavailableCode?: string
  testOnly: boolean
  costNote: string
  limitations: string[]
}

export interface VisualizationPort {
  adapters(projectId: string): Promise<{ adapters: AdapterInfo[]; defaultAdapter: string | null }>
  createJob(projectId: string, request: GenerationRequest): Promise<{ job: GenerationJob; created: boolean }>
  getJob(projectId: string, jobId: string): Promise<GenerationJob>
  cancel(projectId: string, jobId: string): Promise<GenerationJob>
  retry(projectId: string, jobId: string): Promise<GenerationJob>
  contentUrl(projectId: string, assetId: string): string
}

let port: VisualizationPort | null = null

/** Host wiring: register the visualization client (null removes it). */
export function registerVisualizationPort(p: VisualizationPort | null) {
  port = p
}
export const visualizationPort = () => port

export interface Availability {
  available: boolean
  adapter: string | null
  /** In words a person can act on. */
  reason: string
  code: string | null
  testOnly: boolean
}

/** Whether illustrations can be generated now; never throws. */
export async function illustrationAvailability(projectId: string): Promise<Availability> {
  const p = port
  if (!p) return { available: false, adapter: null, reason: 'Image generation is not connected in this workspace (no visualization service). Structured layouts are available.', code: 'provider-missing', testOnly: false }
  try {
    const r = await p.adapters(projectId)
    const chosen = r.adapters.find((a) => a.id === r.defaultAdapter && a.available) ?? r.adapters.find((a) => a.available)
    if (chosen) return { available: true, adapter: chosen.id, reason: chosen.testOnly ? 'Fake test adapter (development and tests only): images are labelled TEST ASSET.' : chosen.costNote, code: null, testOnly: chosen.testOnly }
    const first = r.adapters[0]
    return { available: false, adapter: null, reason: first?.unavailableReason ?? 'No image generation adapter is available.', code: first?.unavailableCode ?? 'provider-missing', testOnly: false }
  } catch (e) {
    return { available: false, adapter: null, reason: `The visualization service is not reachable: ${e instanceof Error ? e.message : String(e)}`, code: 'unavailable', testOnly: false }
  }
}

/** The generation record Conceptualize stores for a job (asset references only). */
export function generationRecord(job: GenerationJob) {
  return {
    jobId: job.id,
    state: job.state,
    adapter: job.adapter,
    provider: job.provider.name || job.provider.id,
    model: job.provider.model,
    attempt: job.attempt,
    assetId: job.output?.asset.id ?? null,
    assetSha256: job.output?.asset.sha256 ?? null,
    mediaType: job.output?.asset.mediaType ?? null,
    testAsset: job.testAsset || !!job.output?.asset.testAsset,
    error: job.error,
  }
}

/** A refusal (409 generation-unavailable) as a record: no job, nothing charged. */
export function refusalRecord(e: unknown) {
  const err = e as { code?: string; message?: string; details?: { reason?: string } }
  return { state: 'refused' as const, jobId: null, error: { code: err?.details?.reason ?? err?.code ?? 'generation-unavailable', message: err?.message ?? String(e), retryable: false } }
}

/**
 * The instruction for an illustration, composed from the structured definition only: what the image needs
 * (intent, principle, components and how they relate), no requirement text, no project data.
 */
export function illustrationInstruction(input: { name: string; intent: string; principle: string[]; components: { id: string; name: string; kind: string }[]; interfaces: { name: string; betweenNames: string[] }[]; style?: string }): string {
  const parts = [
    `Concept: ${input.name}.`,
    input.intent ? `Purpose: ${input.intent}.` : '',
    input.principle.length ? `Operating principle: ${input.principle.join(' ')}` : '',
    input.components.length ? `Visible components: ${input.components.filter((c) => c.kind !== 'envelope').map((c) => c.name).join(', ')}.` : '',
    input.interfaces.length ? `Connections: ${input.interfaces.map((f) => `${f.name} between ${f.betweenNames.join(' and ')}`).join('; ')}.` : '',
    input.style ? `View: ${input.style}.` : 'View: clean three-quarter concept sketch.',
  ]
  return parts.filter(Boolean).join(' ').slice(0, 4000)
}
