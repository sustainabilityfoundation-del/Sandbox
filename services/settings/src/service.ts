import type { Pool, PoolClient } from 'pg'
import { checkSettingValue, clampToCeiling, validateSettingDefinitions, withinCeiling, type SettingDefinition, type SettingPermission, type SettingScope, type SettingValue } from '@ews/platform-sdk'

/** Error codes (same conventions and statuses as the other platform services). */
export type SettingsErrorCode = 'invalid' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'precondition-required' | 'unavailable'

const STATUS: Record<SettingsErrorCode, number> = { invalid: 422, unauthenticated: 401, forbidden: 403, 'not-found': 404, conflict: 412, 'precondition-required': 428, unavailable: 503 }

export class SettingsServiceError extends Error {
  readonly status: number
  constructor(
    readonly code: SettingsErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SettingsServiceError'
    this.status = STATUS[code]
  }
}

export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
const ROLE_RANK: Record<string, number> = { reader: 0, editor: 1, reviewer: 2, administrator: 3 }
const NEEDS: Record<SettingPermission, number> = { editor: 1, reviewer: 2, administrator: 3 }

/** A registered definition and the module (page) it belongs to. */
export interface RegisteredDefinition {
  pageId: string
  pageTitle: string
  definition: SettingDefinition
}

/**
 * Server-side registry of setting definitions. Hosts register the definitions of the modules they serve
 * at startup (for example the AI and reasoning page from @ews/assistant-service); values for unregistered
 * IDs are refused, so the browser cannot invent settings.
 */
export class SettingsRegistry {
  private readonly byId = new Map<string, RegisteredDefinition>()

  register(page: { id: string; title: string }, definitions: SettingDefinition[], options: { allowReserved?: boolean } = {}): void {
    const all = [...[...this.byId.values()].map((r) => r.definition), ...definitions]
    const problems = validateSettingDefinitions(all, options)
    const mine = problems.filter((p) => definitions.some((d) => p.startsWith(`${d.id}:`)))
    if (mine.length) throw new Error(`Invalid setting definitions for ${page.id}: ${mine.join(' ')}`)
    for (const d of definitions) this.byId.set(d.id, { pageId: page.id, pageTitle: page.title, definition: d })
  }

  get(id: string): SettingDefinition | undefined {
    return this.byId.get(id)?.definition
  }

  list(): RegisteredDefinition[] {
    return [...this.byId.values()]
  }
}

export interface ScopeValues {
  values: Record<string, SettingValue>
  revision: number
  /** Strong ETag of the scope (its revision). */
  etag: string
}

export const etagOf = (scope: SettingScope, ownerId: string, revision: number) => `"${scope}:${encodeURIComponent(ownerId)}:${revision}"`

export interface Actor {
  userId: string
  /** The actor's role in the project the request concerns (null when not a member). */
  role: Role | null
}

/**
 * Settings values in PostgreSQL schema `settings`. Every write is one transaction on a scope (a user or a
 * project) with a revision check (If-Match), validated against the registered definitions: type and range,
 * required role, project ceilings, and no secrets (secret references are written only by their owner).
 */
export class SettingsStore {
  constructor(
    private readonly pool: Pool,
    readonly registry: SettingsRegistry,
  ) {}

  async read(scope: SettingScope, ownerId: string, client: Pool | PoolClient = this.pool): Promise<ScopeValues> {
    const [{ rows: scopes }, { rows }] = await Promise.all([
      client.query<{ revision: string }>('SELECT revision FROM settings.scopes WHERE scope = $1 AND owner_id = $2', [scope, ownerId]),
      client.query<{ setting_id: string; value: SettingValue }>('SELECT setting_id, value FROM settings.setting_values WHERE scope = $1 AND owner_id = $2', [scope, ownerId]),
    ])
    const revision = Number(scopes[0]?.revision ?? 0)
    const values: Record<string, SettingValue> = {}
    // Values of definitions no longer registered are kept in storage but not served.
    for (const r of rows) if (this.registry.get(r.setting_id)?.scope === scope) values[r.setting_id] = r.value
    return { values, revision, etag: etagOf(scope, ownerId, revision) }
  }

  /** Effective values for a person in a project: stored values clamped to project ceilings, else defaults. */
  async effective(userId: string, projectId: string): Promise<Record<string, SettingValue>> {
    const [user, project] = await Promise.all([this.read('user', userId), this.read('project', projectId)])
    return computeEffective(this.registry, user.values, project.values)
  }

  /**
   * Writes values (null resets to the default) to a scope. `ifMatch` must be the scope's current ETag.
   * `owner` set means a service writes its own secret references (no HTTP caller can).
   */
  async write(
    scope: SettingScope,
    ownerId: string,
    changes: Record<string, unknown>,
    options: { ifMatch: string | undefined; actor: Actor; projectId: string; owner?: string },
  ): Promise<ScopeValues> {
    if (!options.ifMatch && !options.owner) throw new SettingsServiceError('precondition-required', 'Send If-Match with the ETag you read, so a stale page cannot overwrite newer settings.')
    const entries = Object.entries(changes ?? {})
    if (!entries.length) throw new SettingsServiceError('invalid', 'No values to change.')
    const fields: Record<string, string> = {}
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('INSERT INTO settings.scopes (scope, owner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [scope, ownerId])
      const { rows } = await client.query<{ revision: string }>('SELECT revision FROM settings.scopes WHERE scope = $1 AND owner_id = $2 FOR UPDATE', [scope, ownerId])
      const revision = Number(rows[0].revision)
      if (options.ifMatch && options.ifMatch !== '*' && options.ifMatch !== etagOf(scope, ownerId, revision)) {
        throw new SettingsServiceError('conflict', 'These settings were changed since you read them (another window or person). Reload and try again.', { currentEtag: etagOf(scope, ownerId, revision) })
      }
      const projectValues = scope === 'user' ? (await this.read('project', options.projectId, client)).values : undefined
      const current = await this.read(scope, ownerId, client)
      for (const [id, value] of entries) {
        const def = this.registry.get(id)
        if (!def) {
          fields[id] = 'not a registered setting'
          continue
        }
        if (def.scope !== scope) {
          fields[id] = `a ${def.scope}-scoped setting`
          continue
        }
        if (def.type === 'secret-reference' && options.owner !== def.owner) {
          fields[id] = `a reference managed by ${def.owner}; it cannot be set here`
          continue
        }
        const needed = def.requiresPermission ?? (scope === 'project' ? 'administrator' : undefined)
        if (needed && (options.actor.role === null || ROLE_RANK[options.actor.role] < NEEDS[needed])) {
          throw new SettingsServiceError('forbidden', `Changing “${def.label}” needs the ${needed} role in ${options.projectId}${options.actor.role ? ` (yours: ${options.actor.role})` : ''}.`)
        }
        if (value === null) continue
        const problem = checkSettingValue(def, value)
        if (problem) {
          fields[id] = problem
          continue
        }
        if (def.ceiling && projectValues) {
          const ceilingDef = this.registry.get(def.ceiling)!
          const ceiling = def.ceiling in projectValues ? projectValues[def.ceiling] : ceilingDef.default
          if (!withinCeiling(def, value as SettingValue, ceiling)) fields[id] = `above the project limit (${String(ceiling)}) set by an administrator`
        }
      }
      if (Object.keys(fields).length) throw new SettingsServiceError('invalid', 'Some values were not accepted; nothing was changed.', { fields })
      const next = revision + 1
      for (const [id, value] of entries) {
        const old = id in current.values ? current.values[id] : null
        if (value === null) await client.query('DELETE FROM settings.setting_values WHERE scope = $1 AND owner_id = $2 AND setting_id = $3', [scope, ownerId, id])
        else
          await client.query(
            `INSERT INTO settings.setting_values (scope, owner_id, setting_id, value, updated_by) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (scope, owner_id, setting_id) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
            [scope, ownerId, id, JSON.stringify(value), options.actor.userId],
          )
        await client.query('INSERT INTO settings.history (scope, owner_id, setting_id, old_value, new_value, actor, revision) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
          scope, ownerId, id, JSON.stringify(old), JSON.stringify(value), options.actor.userId, next,
        ])
      }
      await client.query('UPDATE settings.scopes SET revision = $3, updated_at = now() WHERE scope = $1 AND owner_id = $2', [scope, ownerId, next])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
    return this.read(scope, ownerId)
  }
}

/** Stored values clamped to project ceilings, else defaults, for every registered definition. */
export function computeEffective(registry: SettingsRegistry, user: Record<string, SettingValue>, project: Record<string, SettingValue>): Record<string, SettingValue> {
  const stored = (d: SettingDefinition) => {
    const scoped = d.scope === 'project' ? project : user
    return d.id in scoped ? scoped[d.id] : d.default
  }
  const out: Record<string, SettingValue> = {}
  for (const { definition: d } of registry.list()) {
    const ceiling = d.ceiling ? registry.get(d.ceiling) : undefined
    out[d.id] = ceiling ? clampToCeiling(d, stored(d), stored(ceiling)) : stored(d)
  }
  return out
}
