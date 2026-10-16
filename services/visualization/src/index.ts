/**
 * @ews/visualization-service: image generation for concept visuals (docs/specifications/concept-visualization-contracts.md
 * §1, §3). Idempotent generation jobs with retry, cancel, batches and events; assets in the Project Management blob
 * store; a registry of replaceable adapters (OpenAI Images API with an API key; a fake test adapter outside
 * production). Credentials are read at run time through the host's ImageAccessPort and never stored here.
 */
export { visualizationPlugin, buildVisualizationOpenApi, VISUALIZATION_BASE_PATH, ENTITLEMENT as VISUALIZATION_ENTITLEMENT, type VisualizationPluginOptions } from './plugin'
export { VisualizationService, idempotencyKey, normaliseInstruction, type BlobPort, type ImageAccess, type ImageAccessPort, type VisualizationServiceOptions } from './service'
export { AdapterRegistry } from './adapters/registry'
export { createOpenAIImageAdapter, estimateOpenAICost, OPENAI_IMAGE_MODELS, OPENAI_IMAGE_PRICES, type OpenAIImageAdapterOptions } from './adapters/openai'
export { createFakeImageAdapter, FAKE_ADAPTER_ID } from './adapters/fake'
export { AdapterError, PROMPT_PREFACE, composePrompt, type ConnectionInfo, type GenerateInput, type GenerateOutput, type ImageAdapter, type ImageCredential } from './adapters/types'
export { createVisualizationEventHub, type VisualizationEventHub } from './events'
export { migrateVisualization, VISUALIZATION_MIGRATIONS } from './db/migrate'
export { VisualizationError } from './errors'
