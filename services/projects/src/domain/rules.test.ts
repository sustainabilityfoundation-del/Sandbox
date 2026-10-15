import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BlobIntegrityError, BlobNotFoundError, keyOf, localBlobStore, memoryBlobStore, sha256Of } from '../blob/blobStore'
import { LINK_RULES, MODULE_OWNED_LINKS, PROJECT_KEY, TEMPLATES, documentLifecycleProblem, linkProblem, roleAllows, rolesWith, stateTransitionProblem, workItemStatusProblem } from './rules'
import { PROJECT_SETTING_DEFINITIONS, checkProjectSetting, moduleEnablementDefinitions } from './settings'

describe('roles and permissions', () => {
  it('orders roles reader < editor < reviewer < administrator', () => {
    expect(rolesWith('read')).toEqual(['reader', 'editor', 'reviewer', 'administrator'])
    expect(rolesWith('edit')).toEqual(['editor', 'reviewer', 'administrator'])
    expect(rolesWith('review')).toEqual(['reviewer', 'administrator'])
    expect(rolesWith('administer')).toEqual(['administrator'])
    expect(roleAllows(null, 'read')).toBe(false)
    expect(roleAllows('owner', 'read')).toBe(false)
  })
})

describe('project lifecycle', () => {
  it('allows archive only from active, delete from active or archived, restore within retention', () => {
    expect(stateTransitionProblem('active', 'archive')).toBeNull()
    expect(stateTransitionProblem('archived', 'archive')).toMatch(/Only an active project/)
    expect(stateTransitionProblem('archived', 'delete')).toBeNull()
    expect(stateTransitionProblem('deleted', 'delete')).toMatch(/already deleted/)
    expect(stateTransitionProblem('active', 'restore')).toMatch(/already active/)
    const now = new Date('2026-10-15T12:00:00Z')
    expect(stateTransitionProblem('deleted', 'restore', new Date('2026-11-14T12:00:00Z'), now)).toBeNull()
    expect(stateTransitionProblem('deleted', 'restore', new Date('2026-10-15T11:00:00Z'), now)).toMatch(/retention period has ended/)
  })

  it('validates project keys', () => {
    expect(['EEP', 'ACT-200', 'A1'].every((k) => PROJECT_KEY.test(k))).toBe(true)
    expect(['e', '1AB', 'AB_C', 'A'.repeat(21)].some((k) => PROJECT_KEY.test(k))).toBe(false)
  })

  it('ships templates that never contain engineering artifacts', () => {
    expect(TEMPLATES[0]).toMatchObject({ id: 'blank', milestones: [], workItems: [], settings: {} })
    for (const t of TEMPLATES) {
      expect(t.content).toBe('blank')
      expect(t.workItems.every((w) => w.kind === 'task')).toBe(true)
      for (const [id, value] of Object.entries(t.settings)) {
        const def = PROJECT_SETTING_DEFINITIONS.find((d) => d.id === id)
        expect(def, id).toBeDefined()
        expect(checkProjectSetting(def!, value)).toBeNull()
      }
    }
  })
})

describe('work items and documents', () => {
  it('applies status rules per kind', () => {
    expect(workItemStatusProblem({ kind: 'task', to: 'done', role: 'editor' })).toBeNull()
    expect(workItemStatusProblem({ kind: 'task', to: 'accepted', role: 'editor' })?.code).toBe('invalid')
    expect(workItemStatusProblem({ kind: 'risk', to: 'accepted', role: 'editor', rationale: 'x' })?.code).toBe('forbidden')
    expect(workItemStatusProblem({ kind: 'risk', to: 'accepted', role: 'reviewer' })?.code).toBe('invalid')
    expect(workItemStatusProblem({ kind: 'risk', to: 'accepted', role: 'reviewer', rationale: 'Margin' })).toBeNull()
    expect(workItemStatusProblem({ kind: 'issue', to: 'closed', role: 'editor' })?.code).toBe('invalid')
    expect(workItemStatusProblem({ kind: 'issue', to: 'closed', role: 'editor', issueResolution: 'Fixed' })).toBeNull()
  })

  it('needs a reviewer and a version to release a document', () => {
    expect(documentLifecycleProblem('working', 'released', 'editor', 1)?.code).toBe('forbidden')
    expect(documentLifecycleProblem('working', 'released', 'reviewer', 0)?.code).toBe('invalid')
    expect(documentLifecycleProblem('working', 'released', 'reviewer', 1)).toBeNull()
    expect(documentLifecycleProblem('retired', 'working', 'administrator', 1)?.code).toBe('invalid')
  })
})

describe('link rules', () => {
  const task = { category: 'work-item', kind: 'task' }
  const risk = { category: 'work-item', kind: 'risk' }
  const part = { category: 'product-element', kind: 'product-element' }
  const cad = { category: 'geometry', kind: 'cad-document' }
  it('checks endpoints and refuses meanings owned by modules', () => {
    expect(linkProblem('subject-of', task, cad)).toBeNull()
    expect(linkProblem('represents', cad, part)).toBeNull()
    expect(linkProblem('represents', task, part)).toMatch(/starts at/)
    expect(linkProblem('mitigated-by', risk, task)).toBeNull()
    expect(linkProblem('mitigated-by', task, risk)).toMatch(/starts at risk/)
    expect(linkProblem('nonsense', task, task)).toMatch(/Unknown link type/)
    for (const t of Object.keys(MODULE_OWNED_LINKS)) expect(linkProblem(t, task, task)).toBe(MODULE_OWNED_LINKS[t])
    expect(LINK_RULES['relates-to'].impact).toBe(false)
  })
})

describe('settings definitions', () => {
  it('are namespaced project settings with valid defaults', () => {
    const defs = [...PROJECT_SETTING_DEFINITIONS, ...moduleEnablementDefinitions([{ id: 'requirements', name: 'Requirements' }])]
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length)
    for (const d of defs) {
      expect(d.id).toMatch(/^projects\.[a-z0-9-]+\.[a-z0-9-]+(\.[a-z0-9-]+)*$/)
      expect(d.scope).toBe('project')
      expect(checkProjectSetting(d, d.default)).toBeNull()
    }
    const retention = defs.find((d) => d.id === 'projects.retention.deleted-days')!
    expect(checkProjectSetting(retention, 3)).toMatch(/between 7 and 3650/)
  })
})

describe('blob stores', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ews-blobs-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  for (const [name, make] of [
    ['memory', () => memoryBlobStore()],
    ['local filesystem', () => localBlobStore(dir)],
  ] as const) {
    it(`${name}: content-addressed, deduplicated, verified`, async () => {
      const store = make()
      const bytes = new TextEncoder().encode(`hello ${name}`)
      const a = await store.put(bytes)
      const b = await store.put(bytes)
      expect(a).toEqual(b)
      expect(a.key).toBe(keyOf(sha256Of(bytes)))
      expect(await store.get(a.key, { verify: true })).toEqual(bytes)
      expect(await store.has(a.key)).toBe(true)
      const missing = keyOf('0'.repeat(64))
      await expect(store.get(missing)).rejects.toBeInstanceOf(BlobNotFoundError)
      await expect(store.get('../../etc/passwd')).rejects.toThrow(/Invalid blob key/)
    })
  }

  it('detects corruption on disk', async () => {
    const store = localBlobStore(dir)
    const { key } = await store.put(new TextEncoder().encode('original'))
    const path = join(dir, ...key.split('/'))
    expect(readFileSync(path, 'utf8')).toBe('original')
    writeFileSync(path, 'tampered')
    await expect(store.get(key, { verify: true })).rejects.toBeInstanceOf(BlobIntegrityError)
    expect(new TextDecoder().decode(await store.get(key))).toBe('tampered')
  })
})
