import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { CredentialVault } from './crypto'

/** Secret part of a connection (only ever held decrypted for one request). */
export type ConnectionSecret =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'oauth'; accessToken: string; refreshToken?: string; idToken?: string }

export interface ConnectionRow {
  id: string
  user_id: string
  provider: string
  method: string
  account_label: string
  key_last4: string | null
  account_subject: string | null
  client_id: string | null
  scopes: string[]
  secret_ciphertext: Buffer
  access_expires_at: Date | null
  model: string
  status: 'active' | 'needs-sign-in' | 'plan-usage-disabled'
  created_at: Date
  updated_at: Date
  last_validated_at: Date | null
}

/** What the browser may see about a connection: never the credential. */
export interface ConnectionStatus {
  id: string
  provider: string
  method: string
  account: string
  keyLast4?: string
  model: string
  status: ConnectionRow['status']
  connectedAt: string
  lastValidatedAt?: string
}

export function publicStatus(row: ConnectionRow): ConnectionStatus {
  return {
    id: row.id,
    provider: row.provider,
    method: row.method,
    account: row.account_label,
    ...(row.key_last4 ? { keyLast4: row.key_last4 } : {}),
    model: row.model,
    status: row.status,
    connectedAt: row.created_at.toISOString(),
    ...(row.last_validated_at ? { lastValidatedAt: row.last_validated_at.toISOString() } : {}),
  }
}

export interface AuditInput {
  userId: string
  projectId?: string
  provider: string
  method?: string
  model?: string
  purpose?: string
  toolsOffered: number
  toolsCalled: string[]
  toolsRefused: string[]
  inputTokens?: number
  outputTokens?: number
  latencyMs: number
  outcome: 'answer' | 'tool-calls' | 'error' | 'refused'
  errorCode?: string
  prompt?: unknown
}

const secretContext = (userId: string, connectionId: string) => `connection:${userId}:${connectionId}`

/** PostgreSQL access for schema `assistant`. Only this package touches these tables. */
export class AssistantStore {
  constructor(
    private readonly pool: Pool,
    private readonly vault: CredentialVault,
  ) {}

  async hostId(): Promise<string> {
    await this.pool.query('INSERT INTO assistant.host (host_id) VALUES ($1) ON CONFLICT DO NOTHING', [`urn:uuid:${randomUUID()}`])
    const { rows } = await this.pool.query<{ host_id: string }>('SELECT host_id FROM assistant.host')
    return rows[0].host_id
  }

  async connection(userId: string): Promise<ConnectionRow | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM assistant.connections WHERE user_id = $1', [userId])
    return rows[0]
  }

  secretOf(row: ConnectionRow): ConnectionSecret {
    return JSON.parse(this.vault.decrypt(row.secret_ciphertext, secretContext(row.user_id, row.id))) as ConnectionSecret
  }

  /** Replaces the person's connection (one active connection per person). */
  async saveConnection(input: {
    userId: string
    provider: string
    method: string
    accountLabel: string
    keyLast4?: string
    accountSubject?: string
    clientId?: string
    scopes?: string[]
    secret: ConnectionSecret
    accessExpiresAt?: Date
    model: string
    status?: ConnectionRow['status']
  }): Promise<ConnectionRow> {
    const id = randomUUID()
    const ciphertext = this.vault.encrypt(JSON.stringify(input.secret), secretContext(input.userId, id))
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM assistant.connections WHERE user_id = $1', [input.userId])
      const { rows } = await client.query<ConnectionRow>(
        `INSERT INTO assistant.connections (id, user_id, provider, method, account_label, key_last4, account_subject, client_id, scopes, secret_ciphertext, access_expires_at, model, status, last_validated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now()) RETURNING *`,
        [id, input.userId, input.provider, input.method, input.accountLabel, input.keyLast4 ?? null, input.accountSubject ?? null, input.clientId ?? null, input.scopes ?? [], ciphertext, input.accessExpiresAt ?? null, input.model, input.status ?? 'active'],
      )
      await client.query('COMMIT')
      return rows[0]
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }

  async updateSecret(row: ConnectionRow, secret: ConnectionSecret, accessExpiresAt?: Date, scopes?: string[]): Promise<ConnectionRow> {
    const { rows } = await this.pool.query<ConnectionRow>(
      'UPDATE assistant.connections SET secret_ciphertext = $2, access_expires_at = $3, scopes = COALESCE($4, scopes), updated_at = now() WHERE id = $1 RETURNING *',
      [row.id, this.vault.encrypt(JSON.stringify(secret), secretContext(row.user_id, row.id)), accessExpiresAt ?? null, scopes ?? null],
    )
    return rows[0]
  }

  async setModel(userId: string, model: string): Promise<ConnectionRow | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('UPDATE assistant.connections SET model = $2, updated_at = now() WHERE user_id = $1 RETURNING *', [userId, model])
    return rows[0]
  }

  async setStatus(id: string, status: ConnectionRow['status'], validated = false): Promise<void> {
    await this.pool.query(`UPDATE assistant.connections SET status = $2, updated_at = now()${validated ? ', last_validated_at = now()' : ''} WHERE id = $1`, [id, status])
  }

  async deleteConnection(userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM assistant.connections WHERE user_id = $1', [userId])
    return (rowCount ?? 0) > 0
  }

  // ---- OAuth registrations and attempts ----------------------------------------------------------------

  async registration(userId: string, provider: string): Promise<{ client_id: string; account_subject: string; account_email: string | null; id_token?: string } | undefined> {
    const { rows } = await this.pool.query<{ client_id: string; account_subject: string; account_email: string | null; id_token_ciphertext: Buffer | null }>(
      'SELECT client_id, account_subject, account_email, id_token_ciphertext FROM assistant.oauth_registrations WHERE user_id = $1 AND provider = $2 ORDER BY updated_at DESC LIMIT 1',
      [userId, provider],
    )
    const r = rows[0]
    if (!r) return undefined
    let idToken: string | undefined
    try {
      idToken = r.id_token_ciphertext ? this.vault.decrypt(r.id_token_ciphertext, `registration:${userId}:${provider}:${r.account_subject}`) : undefined
    } catch {
      idToken = undefined
    }
    return { client_id: r.client_id, account_subject: r.account_subject, account_email: r.account_email, id_token: idToken }
  }

  async saveRegistration(userId: string, provider: string, subject: string, email: string | undefined, clientId: string, idToken: string | undefined): Promise<void> {
    await this.pool.query(
      `INSERT INTO assistant.oauth_registrations (user_id, provider, account_subject, account_email, client_id, id_token_ciphertext) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, provider, account_subject) DO UPDATE SET account_email = EXCLUDED.account_email, client_id = EXCLUDED.client_id, id_token_ciphertext = EXCLUDED.id_token_ciphertext, updated_at = now()`,
      [userId, provider, subject, email ?? null, clientId, idToken ? this.vault.encrypt(idToken, `registration:${userId}:${provider}:${subject}`) : null],
    )
  }

  async saveAttempt(a: { state: string; userId: string; provider: string; method: string; verifier: string; nonce: string; redirectUri: string; returnTo: string; clientId: string }): Promise<void> {
    await this.pool.query("DELETE FROM assistant.oauth_attempts WHERE created_at < now() - interval '15 minutes'")
    await this.pool.query('INSERT INTO assistant.oauth_attempts (state, user_id, provider, method, secret_ciphertext, redirect_uri, return_to, client_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
      a.state, a.userId, a.provider, a.method, this.vault.encrypt(JSON.stringify({ verifier: a.verifier, nonce: a.nonce }), `attempt:${a.state}`), a.redirectUri, a.returnTo, a.clientId,
    ])
  }

  /** Takes (and deletes) an attempt; undefined when unknown or older than 15 minutes. */
  async takeAttempt(state: string): Promise<{ userId: string; provider: string; method: string; verifier: string; nonce: string; redirectUri: string; returnTo: string; clientId: string } | undefined> {
    const { rows } = await this.pool.query<{ user_id: string; provider: string; method: string; secret_ciphertext: Buffer; redirect_uri: string; return_to: string; client_id: string; fresh: boolean }>(
      "DELETE FROM assistant.oauth_attempts WHERE state = $1 RETURNING *, created_at > now() - interval '15 minutes' AS fresh",
      [state],
    )
    const r = rows[0]
    if (!r || !r.fresh) return undefined
    const s = JSON.parse(this.vault.decrypt(r.secret_ciphertext, `attempt:${state}`)) as { verifier: string; nonce: string }
    return { userId: r.user_id, provider: r.provider, method: r.method, verifier: s.verifier, nonce: s.nonce, redirectUri: r.redirect_uri, returnTo: r.return_to, clientId: r.client_id }
  }

  // ---- audit -------------------------------------------------------------------------------------------

  async audit(a: AuditInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO assistant.audit (user_id, project_id, provider, method, model, purpose, tools_offered, tools_called, tools_refused, input_tokens, output_tokens, latency_ms, outcome, error_code, prompt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [a.userId, a.projectId ?? null, a.provider, a.method ?? null, a.model ?? null, a.purpose ?? 'assistant', a.toolsOffered, a.toolsCalled, a.toolsRefused, a.inputTokens ?? null, a.outputTokens ?? null, a.latencyMs, a.outcome, a.errorCode ?? null, a.prompt === undefined ? null : JSON.stringify(a.prompt)],
    )
  }

  async auditRecords(userId: string, limit: number) {
    const { rows } = await this.pool.query<{ id: string; at: Date; provider: string; method: string | null; model: string | null; purpose: string; tools_offered: number; tools_called: string[]; tools_refused: string[]; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; outcome: string; error_code: string | null; has_prompt: boolean }>(
      'SELECT id, at, provider, method, model, purpose, tools_offered, tools_called, tools_refused, input_tokens, output_tokens, latency_ms, outcome, error_code, prompt IS NOT NULL AS has_prompt FROM assistant.audit WHERE user_id = $1 ORDER BY at DESC, id DESC LIMIT $2',
      [userId, limit],
    )
    return rows.map((r) => ({
      id: Number(r.id),
      at: r.at.toISOString(),
      provider: r.provider,
      method: r.method,
      model: r.model,
      purpose: r.purpose,
      toolsOffered: r.tools_offered,
      toolsCalled: r.tools_called,
      toolsRefused: r.tools_refused,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      latencyMs: r.latency_ms,
      outcome: r.outcome,
      errorCode: r.error_code,
      promptStored: r.has_prompt,
    }))
  }
}
