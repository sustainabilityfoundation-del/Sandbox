import { buildModelIndex, seedModel, type ModelIndex } from '@ews/model-service'

/**
 * '@ews/platform-sdk/testing': fixtures for unit-testing a tool's domain logic
 * without a host. The sample model is the same actuator twin the harness and
 * the workspace start with.
 */
export function sampleModel(): ModelIndex {
  return buildModelIndex(seedModel())
}
