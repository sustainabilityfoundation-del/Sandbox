/** @ews/api: the API host. Composes service plugins with platform identity, roles and entitlements. */
export { buildServer, prepareDatabase, SAMPLE_TWIN, type ApiServer, type ServerOptions } from './server'
export { readConfig, loadEnvFile, isResettable, REPO_ROOT, type ApiConfig } from './config'
export { startEmbedded, ensureDatabase, resetDatabase, dropDatabase, canConnect, adminUrlOf } from './database'
export { DEV_USERS, identity, seedPlatform, migratePlatform } from './platform/identity'
