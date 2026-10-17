import { describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import type { FastifyRequest } from 'fastify'
import { devIdentitiesAllowed, isDeployed, readAiConfig, readConfig } from './config'
import { prepareExternal } from './database'
import { identity } from './platform/identity'
import { SCHEMA_MIGRATIONS } from './migrations'

/** Deployment switches (docs/infrastructure/DEPLOYMENT_AUDIT.md changes C3, C5, C7). Pure: no database, no ports. */
const EXTERNAL = { EWS_PG: 'external', DATABASE_URL: 'postgres://ews_app:secret@db.internal:5432/ews' }

describe('refuse the embedded database when deployed', () => {
  it('leaves development unchanged: embedded by default, local fallback URL, dev identities, seeding', () => {
    const c = readConfig({})
    expect(c.production).toBe(false)
    expect(c.pgMode).toBe('embedded')
    expect(c.allowDevIdentities).toBe(true)
    expect(c.seedOnStart).toBe(true)
    expect(readConfig({ EWS_PG: 'external' }).databaseUrl).toContain('local-dev-only@127.0.0.1:5432')
    expect(readConfig({ NODE_ENV: 'test' }).pgMode).toBe('embedded')
  })

  it('fails fast with NODE_ENV=production and no EWS_PG=external', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/embedded database/)
    expect(() => readConfig({ NODE_ENV: 'production', EWS_PG: 'embedded', DATABASE_URL: EXTERNAL.DATABASE_URL })).toThrow(/EWS_PG=external/)
  })

  it('fails fast with EWS_DEPLOYED=1 and no EWS_PG=external', () => {
    expect(() => readConfig({ EWS_DEPLOYED: '1' })).toThrow(/embedded database/)
    // Only the exact value 1 counts as the flag.
    expect(() => readConfig({ EWS_DEPLOYED: '0' })).not.toThrow()
  })

  it('refuses the local fallback URL when deployed', () => {
    expect(() => readConfig({ NODE_ENV: 'production', EWS_PG: 'external' })).toThrow(/DATABASE_URL/)
    expect(() => readConfig({ EWS_DEPLOYED: '1', EWS_PG: 'external', DATABASE_URL: '  ' })).toThrow(/DATABASE_URL/)
  })

  it('accepts a deployed configuration with an external database, and does not seed', () => {
    for (const flag of [{ NODE_ENV: 'production' }, { EWS_DEPLOYED: '1' }]) {
      const c = readConfig({ ...flag, ...EXTERNAL })
      expect(c.production).toBe(true)
      expect(c.pgMode).toBe('external')
      expect(c.databaseName).toBe('ews')
      expect(c.seedOnStart).toBe(false)
      expect(c.allowDevIdentities).toBe(false)
    }
  })
})

describe('external database at start-up', () => {
  const cfgFor = (production: boolean) => ({ production, databaseUrl: 'postgres://ews_app:x@db.internal:5432/ews', databaseName: 'ews' })
  it('deployed: checks the target database only and never creates one', async () => {
    const seen: string[] = []
    let created = 0
    const deps = { canConnect: async (u: string) => (seen.push(u), true), ensureDatabase: async () => void created++ }
    expect(await prepareExternal(cfgFor(true), deps)).toBeUndefined()
    expect(seen).toEqual([cfgFor(true).databaseUrl])
    expect(await prepareExternal(cfgFor(true), { ...deps, canConnect: async () => false })).toMatch(/bootstrap/)
    expect(created).toBe(0)
  })
  it('local: checks the admin database and creates the target if missing', async () => {
    const seen: string[] = []
    let created = 0
    const deps = { canConnect: async (u: string) => (seen.push(u), true), ensureDatabase: async () => void created++ }
    expect(await prepareExternal(cfgFor(false), deps)).toBeUndefined()
    expect(seen[0]).toMatch(/\/postgres$/)
    expect(created).toBe(1)
  })
})

describe('AI configuration follows the deployment flag', () => {
  it('EWS_DEPLOYED=1 forces user mode like production', () => {
    const r = readAiConfig({ EWS_DEPLOYED: '1', EWS_AI_MODE: 'mock' })
    expect(r.config.mode).toBe('user')
    expect(r.config.allowUnverifiedPricing).toBe(false)
  })
})

describe('public origin (EWS_PUBLIC_ORIGIN)', () => {
  it('is unset by default and normalised to an origin when given', () => {
    expect(readConfig({}).publicOrigin).toBeUndefined()
    expect(readConfig({ EWS_PUBLIC_ORIGIN: ' https://example.org/some/path ' }).publicOrigin).toBe('https://example.org')
  })
  it('rejects anything that is not an http(s) URL', () => {
    expect(() => readConfig({ EWS_PUBLIC_ORIGIN: 'example.org' })).toThrow(/EWS_PUBLIC_ORIGIN/)
    expect(() => readConfig({ EWS_PUBLIC_ORIGIN: 'ftp://example.org' })).toThrow(/EWS_PUBLIC_ORIGIN/)
  })
})

describe('development identities in a deployment', () => {
  it('are allowed outside a deployment and refused in one unless EWS_ALLOW_DEV_IDENTITIES=1', () => {
    expect(isDeployed({})).toBe(false)
    expect(devIdentitiesAllowed({})).toBe(true)
    expect(devIdentitiesAllowed({ EWS_ALLOW_DEV_IDENTITIES: '1' })).toBe(true)
    for (const flag of [{ NODE_ENV: 'production' }, { EWS_DEPLOYED: '1' }]) {
      expect(isDeployed(flag)).toBe(true)
      expect(devIdentitiesAllowed(flag)).toBe(false)
      expect(devIdentitiesAllowed({ ...flag, EWS_ALLOW_DEV_IDENTITIES: 'true' })).toBe(false)
      expect(devIdentitiesAllowed({ ...flag, EWS_ALLOW_DEV_IDENTITIES: '1' })).toBe(true)
    }
  })

  it('authenticate refuses X-Dev-User when deployed, before touching the database', async () => {
    const pool = { query: () => Promise.reject(new Error('the database must not be used')) } as unknown as Pool
    const req = (headers: Record<string, string>) => ({ headers, method: 'GET' }) as unknown as FastifyRequest
    for (const options of [{ production: true }, { production: true, devIdentities: false }, { production: false, devIdentities: false }]) {
      const auth = identity(pool, options)
      await expect(auth.authenticate(req({ 'x-dev-user': 'ada' }))).rejects.toThrow(/X-Dev-User is not accepted/)
      await expect(auth.authenticate(req({}))).rejects.toThrow(/not configured/)
    }
  })

  it('authenticate accepts X-Dev-User in development and when explicitly allowed in a deployment', async () => {
    const queries: unknown[][] = []
    const pool = {
      query: async (_sql: string, params: unknown[]) => {
        queries.push(params)
        return { rows: [{ id: 'ada', active: true, entitlements: ['tool:requirements'] }] }
      },
    } as unknown as Pool
    const req = { headers: { 'x-dev-user': 'ada' }, method: 'GET' } as unknown as FastifyRequest
    for (const options of [{ production: false }, { production: true, devIdentities: true }]) {
      const principal = await identity(pool, options).authenticate(req)
      expect(principal.userId).toBe('ada')
    }
    expect(queries).toHaveLength(2)
  })
})

describe('migration registry', () => {
  it('lists all nine schemas once, in a fixed order', () => {
    expect(SCHEMA_MIGRATIONS.map((s) => s.schema)).toEqual(['platform', 'requirements', 'conceptualize', 'projects', 'settings', 'assistant', 'visualization', 'sysml', 'cad'])
  })
})
