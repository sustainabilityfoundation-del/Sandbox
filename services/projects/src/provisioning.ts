import type { Pool } from 'pg'
import type { ProvisionRequest, ProvisionResult } from '@ews/platform-sdk'

/**
 * Module provisioning (integration milestone 1, C1; ADR-0062). The project and its memberships are created in one
 * transaction; afterwards every installed module is asked, idempotently, to prepare the project. Modules that key
 * their data by project ID and create their per-project space lazily on first write have no `provision` and are
 * recorded as `not-needed`. States: pending → ready | not-needed | failed (retried on open and on request).
 * A blank template never asks a module to create artifacts.
 */
export interface ProvisioningModule {
  /** Module ID, e.g. 'requirements', 'conceptualize', 'sysml', 'cad'. */
  module: string
  name: string
  /** Optional, idempotent; absent = the module creates its space lazily on first write. */
  provision?: (request: ProvisionRequest) => Promise<ProvisionResult>
  /** Why no provisioning is needed (shown in the project context). */
  lazyReason?: string
}

export type ModuleState = 'pending' | 'ready' | 'not-needed' | 'failed' | 'unavailable'

const TIMEOUT_MS = 5000

async function record(pool: Pool, projectId: string, m: { module: string; name: string }, status: ModuleState, reason: string, attempt: boolean) {
  await pool.query(
    `INSERT INTO projects.module_states (project_id, module, name, status, reason, attempts, last_error, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (project_id, module) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, reason = EXCLUDED.reason,
       attempts = projects.module_states.attempts + $6, last_error = EXCLUDED.last_error, updated_at = now()`,
    [projectId, m.module, m.name, status, reason, attempt ? 1 : 0, status === 'failed' ? reason : null],
  )
}

/** Records every installed module as pending inside the creation transaction (so a crash leaves a visible, retryable state). */
export async function recordPending(db: { query: Pool['query'] }, projectId: string, modules: ProvisioningModule[]) {
  for (const m of modules) {
    await db.query(
      `INSERT INTO projects.module_states (project_id, module, name, status, updated_at) VALUES ($1,$2,$3,'pending', now()) ON CONFLICT (project_id, module) DO NOTHING`,
      [projectId, m.module, m.name],
    )
  }
}

/**
 * Runs provisioning for the modules whose state is pending or failed (or all, with `force`). Idempotent: the key is
 * `<projectId>:provision:<module>`. Never throws; failures are recorded with their reason.
 */
export async function runProvisioning(pool: Pool, projectId: string, modules: ProvisioningModule[], actor: string, options: { templateId?: string; force?: boolean } = {}) {
  const { rows } = await pool.query<{ module: string; status: string }>('SELECT module, status FROM projects.module_states WHERE project_id = $1', [projectId])
  const states = new Map(rows.map((r) => [r.module, r.status]))
  for (const m of modules) {
    const state = states.get(m.module)
    if (!options.force && state && !['pending', 'failed'].includes(state)) continue
    if (!m.provision) {
      await record(pool, projectId, m, 'not-needed', m.lazyReason ?? `${m.name} creates its project space on the first write; nothing to prepare.`, false)
      continue
    }
    try {
      const result = await Promise.race([
        m.provision({ projectId, template: { id: options.templateId ?? 'blank', content: 'blank' }, actor, idempotencyKey: `${projectId}:provision:${m.module}` }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer within ${TIMEOUT_MS / 1000} s.`)), TIMEOUT_MS).unref?.()),
      ])
      if (result.status === 'provisioned') {
        // A blank template must not create artifacts (no-seed rule).
        if (result.createdRefs.length) await record(pool, projectId, m, 'failed', `${m.name} created ${result.createdRefs.length} artifact(s) for a blank project, which the provisioning contract forbids.`, true)
        else await record(pool, projectId, m, 'ready', '', true)
      } else if (result.status === 'not-needed') await record(pool, projectId, m, 'not-needed', m.lazyReason ?? '', true)
      else await record(pool, projectId, m, 'failed', result.message, true)
    } catch (e) {
      await record(pool, projectId, m, 'failed', e instanceof Error ? e.message : String(e), true)
    }
  }
}
