import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CredentialVault } from './crypto'

/**
 * The key that encrypts AI account credentials at rest. Production: EWS_ASSISTANT_KEY (32 bytes, base64 or
 * hex) is required, otherwise the assistant API is not started. Development: EWS_ASSISTANT_KEY, else a key
 * generated once in .data/assistant.key (git-ignored, owner-only permissions where the OS supports it), so
 * connections survive restarts. The key is never printed.
 */
export function loadAssistantKey(options: { production: boolean; repoRoot: string; env?: NodeJS.ProcessEnv }): Buffer | undefined {
  const { production, repoRoot, env = process.env } = options
  if (env.EWS_ASSISTANT_KEY) return CredentialVault.parseKey(env.EWS_ASSISTANT_KEY)
  if (production) return undefined
  const file = join(repoRoot, env.EWS_ASSISTANT_KEY_FILE ?? '.data/assistant.key')
  if (existsSync(file)) return CredentialVault.parseKey(readFileSync(file, 'utf8'))
  mkdirSync(dirname(file), { recursive: true })
  const key = CredentialVault.randomKey()
  writeFileSync(file, key.toString('base64'), { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* Windows: file ACLs of the user profile apply */
  }
  return key
}
