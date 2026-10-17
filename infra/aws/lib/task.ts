import * as ecs from 'aws-cdk-lib/aws-ecs'
import type { DataStack } from './data-stack'
import { API_PORT, type EwsConfig } from './config'

/**
 * Settings shared by the API service and the one-off migration task. No AI provider variable (OPENAI_API_KEY, ANTHROPIC_API_KEY,
 * GEMINI_API_KEY, GOOGLE_AI_API_KEY, XAI_API_KEY, EWS_AI_MODE) is ever set: deployed instances use people's own connections.
 */
export function baseEnvironment(cfg: EwsConfig): Record<string, string> {
  return {
    EWS_DEPLOYED: '1',
    EWS_PG: 'external',
    ...(cfg.dbHostOverride ? { DB_HOST_OVERRIDE: cfg.dbHostOverride } : {}),
  }
}

/** The database coordinates come from the Secrets Manager secret (JSON keys); docker-entrypoint.sh assembles DATABASE_URL from them. */
export function databaseSecrets(data: DataStack): Record<string, ecs.Secret> {
  return {
    DB_HOST: ecs.Secret.fromSecretsManager(data.dbSecret, 'host'),
    DB_PORT: ecs.Secret.fromSecretsManager(data.dbSecret, 'port'),
    DB_NAME: ecs.Secret.fromSecretsManager(data.dbSecret, 'dbname'),
    DB_USER: ecs.Secret.fromSecretsManager(data.dbSecret, 'username'),
    DB_PASSWORD: ecs.Secret.fromSecretsManager(data.dbSecret, 'password'),
  }
}

export function apiImage(data: DataStack, cfg: EwsConfig): ecs.ContainerImage {
  return ecs.ContainerImage.fromEcrRepository(data.repository, cfg.imageTag)
}

export const ARM64 = { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX }
export { API_PORT }
