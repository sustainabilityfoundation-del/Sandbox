/**
 * @ews/settings-service: typed module settings (SDK 1.6) — server-side definition registry, user- and
 * project-scoped values in PostgreSQL schema `settings`, validation and ETag/If-Match; a Fastify plugin
 * hosted by @ews/api at /api/settings/v1. Other server services read settings through `SettingsStore`.
 */
export { settingsPlugin, settingsOpenApi, SETTINGS_BASE_PATH, SETTINGS_API_VERSION, type SettingsHost } from './plugin'
export { SettingsRegistry, SettingsStore, SettingsServiceError, computeEffective, etagOf, type Actor, type RegisteredDefinition, type Role, type ScopeValues } from './service'
export { migrateSettings, SETTINGS_MIGRATIONS } from './db/migrate'
