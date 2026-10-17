import type { ArtifactChange, ArtifactDescriptor, ArtifactKindInfo, ArtifactPage, ArtifactSource, NativeRef, ProvisionRequest, ProvisionResult } from '@ews/platform-sdk'
import { ARTIFACT_SOURCE_CONTRACT_VERSION } from '@ews/platform-sdk'
import { definitionKeyword, isKindOf, readMetadataValues, relationshipMatrix, representations, semanticsOf, usageKeyword, type Model } from '@ews/sysml-core'
import type { SysmlEvent, SysmlEventHub } from './events'
import type { ProjectRow, SysmlRepository, TagRow } from './repository'
import { isUuid } from './repository'

/**
 * Project Management artifact source for the System Model (CR-PM-REG-3, SDK 1.7 `ArtifactSource`,
 * docs/modules/projects/registration-and-provisioning.md §4). Read-only over the SysML repository:
 *
 * - `sysml-project` (id = SysML project UUID), `sysml-tag` (id = `<projectId>/<tagId>`) and
 *   `sysml-model-element` (id = `<projectId>/<elementId>`, CR-SYSML-02) for the **named definitions and
 *   usages** at the head of each project's default branch. Other branches are not registered.
 * - `projectId` in this interface is the platform project; SysML projects belong to one platform project.
 * - Events: `sysml.project-created` → upserted project; `sysml.commit-created` on a default branch →
 *   upserted / retired elements changed by the commit; `sysml.tag-created` → upserted tag. Branch
 *   creation registers nothing.
 * - `provision` is `not-needed`: a new platform project has no SysML project; the modeler creates one
 *   when a person starts modelling (no seed outside the development example PRJ-ACT100).
 */

export const SYSML_ARTIFACT_KINDS: ArtifactKindInfo[] = [
  { kind: 'sysml-project', label: 'SysML project', category: 'model', navigable: true },
  { kind: 'sysml-model-element', label: 'SysML model element', category: 'model', navigable: true },
  { kind: 'sysml-tag', label: 'SysML tag (baseline)', category: 'baseline', navigable: true },
]

const MAX_PAGE = 500
const RANK: Record<string, number> = { 'sysml-project': 0, 'sysml-tag': 1, 'sysml-model-element': 2 }

/** Named definitions and usages are registered; relationships, anonymous features and packages are not. */
export function isRegisteredElement(metaclass: string, name: string | null | undefined): boolean {
  return !!name && (isKindOf(metaclass, 'Definition') || isKindOf(metaclass, 'Usage'))
}

interface ElementRecord {
  element_id: string
  metaclass: string
  name: string | null
  commit_number: number
  modified_at: Date
  modified_by: string
  created_at: Date
  created_by: string
}

const iso = (d: Date | string) => new Date(d).toISOString()

export function createSysmlArtifactSource(repo: SysmlRepository, events: SysmlEventHub): ArtifactSource {
  const pool = repo.pool

  async function projectsOf(platformProjectId: string): Promise<ProjectRow[]> {
    return repo.listProjects([platformProjectId])
  }

  async function headOf(p: ProjectRow): Promise<{ id: string; number: number; created_at: Date; actor: string } | undefined> {
    if (!p.default_branch_id) return undefined
    const { rows } = await pool.query<{ id: string; number: number; created_at: Date; actor: string }>(
      'SELECT c.id, c.number, c.created_at, c.actor FROM sysml.branches b JOIN sysml.commits c ON c.id = b.head_commit_id WHERE b.id = $1',
      [p.default_branch_id],
    )
    return rows[0]
  }

  /** Head-index records with first and latest version provenance (default branch). */
  async function elementRecords(p: ProjectRow, elementIds?: string[]): Promise<ElementRecord[]> {
    if (!p.default_branch_id || (elementIds && !elementIds.length)) return []
    const { rows } = await pool.query<ElementRecord>(
      `SELECT be.element_id, be.metaclass, be.name, ev.commit_number, mc.created_at AS modified_at, mc.actor AS modified_by, fc.created_at, fc.actor AS created_by
       FROM sysml.branch_elements be
       JOIN sysml.element_versions ev ON ev.version_id = be.version_id
       JOIN sysml.commits mc ON mc.id = ev.commit_id
       JOIN LATERAL (SELECT c.created_at, c.actor FROM sysml.element_versions e2 JOIN sysml.commits c ON c.id = e2.commit_id
                     WHERE e2.project_id = $2 AND e2.element_id = be.element_id ORDER BY e2.commit_number LIMIT 1) fc ON true
       WHERE be.branch_id = $1 AND be.name IS NOT NULL AND ($3::uuid[] IS NULL OR be.element_id = ANY($3::uuid[]))`,
      [p.default_branch_id, p.id, elementIds ?? null],
    )
    return rows.filter((r) => isRegisteredElement(r.metaclass, r.name))
  }

  function projectDescriptor(p: ProjectRow, head: Awaited<ReturnType<typeof headOf>>): ArtifactDescriptor {
    return {
      ref: { module: 'sysml', kind: 'sysml-project', id: p.id },
      key: p.name,
      title: p.name,
      lifecycle: 'working',
      version: { value: head?.number ?? 0, label: head ? `commit #${head.number}` : 'no commits', at: iso(head?.created_at ?? p.created_at) },
      createdAt: iso(p.created_at),
      createdBy: p.created_by,
      modifiedAt: iso(head?.created_at ?? p.created_at),
      modifiedBy: head?.actor ?? p.created_by,
      open: { toolId: 'sysml-modeler', params: { sysmlProjectId: p.id } },
    }
  }

  async function tagDescriptors(p: ProjectRow, tagIds?: string[]): Promise<ArtifactDescriptor[]> {
    const tags = (await repo.listTags(p.id)).filter((t) => !tagIds || tagIds.includes(t.id))
    if (!tags.length) return []
    const { rows } = await pool.query<{ id: string; number: number }>('SELECT id, number FROM sysml.commits WHERE id = ANY($1::uuid[])', [tags.map((t) => t.commit_id)])
    const numbers = new Map(rows.map((r) => [r.id, r.number]))
    return tags.map((t: TagRow) => ({
      ref: { module: 'sysml', kind: 'sysml-tag', id: `${p.id}/${t.id}` },
      key: `${p.name} @ ${t.name}`,
      title: t.name,
      moduleState: 'tag',
      lifecycle: 'released',
      version: { value: numbers.get(t.commit_id) ?? 0, label: `commit #${numbers.get(t.commit_id) ?? '?'}`, at: iso(t.created_at) },
      createdAt: iso(t.created_at),
      createdBy: t.created_by,
      modifiedAt: iso(t.created_at),
      modifiedBy: t.created_by,
      container: { module: 'sysml', kind: 'sysml-project', id: p.id },
      open: { toolId: 'sysml-modeler', params: { sysmlProjectId: p.id, tagId: t.id } },
    }))
  }

  /** Module-owned relationships of each element (SysML `satisfy`/`allocate`, references it holds). */
  function relationsOf(p: ProjectRow, model: Model): Map<string, NonNullable<ArtifactDescriptor['relations']>> {
    const out = new Map<string, NonNullable<ArtifactDescriptor['relations']>>()
    const add = (from: string, r: NonNullable<ArtifactDescriptor['relations']>[number]) => out.set(from, [...(out.get(from) ?? []), r])
    const el = (id: string): NativeRef => ({ module: 'sysml', kind: 'sysml-model-element', id: `${p.id}/${id}` })
    for (const kind of ['satisfy', 'allocate'] as const) {
      const m = relationshipMatrix(model, kind, model.rootId)
      for (const c of m.cells) {
        const [source, target] = kind === 'satisfy' ? [c.col, c.row] : [c.row, c.col]
        // Feature chains (a.b) are reported from their first feature.
        add(source.split('.')[0], { type: kind === 'satisfy' ? 'satisfies' : 'allocated-to', to: el(target.split('.')[0]) })
      }
    }
    for (const r of representations(model)) if (r.valid) add(r.elementId, { type: 'represents', to: { module: r.ref.module, kind: r.ref.kind, id: r.ref.id }, ...(r.ref.revision !== undefined ? { toRevision: r.ref.revision } : {}) })
    const s = semanticsOf(model)
    for (const e of model.elements()) {
      if (e['@type'] !== 'MetadataUsage' || !s.featureTypes(e['@id']).some((t) => s.qualifiedName(t) === 'EWS::ManagedRequirement')) continue
      const owner = s.owner(e['@id'])?.['@id']
      const values = readMetadataValues(s, e['@id'])
      const id = values.requirementId
      const rev = values.revision
      if (owner && typeof id === 'string' && isUuid(id)) add(owner, { type: 'stands-for', to: { module: 'requirements', kind: 'requirement', id }, ...(typeof rev === 'number' && Number.isInteger(rev) ? { toRevision: rev } : {}) })
    }
    return out
  }

  async function elementDescriptors(p: ProjectRow, elementIds?: string[]): Promise<ArtifactDescriptor[]> {
    const records = await elementRecords(p, elementIds)
    if (!records.length) return []
    const head = await headOf(p)
    if (!head) return []
    const model = await repo.loadModel(p.id, head.id)
    const s = semanticsOf(model)
    const relations = relationsOf(p, model)
    return records.map((r) => {
      const el = model.get(r.element_id)
      const def = el ? definitionKeyword(el['@type']) : undefined
      const keyword = (def ? `${def} def` : el && usageKeyword(el['@type'])) || r.metaclass
      return {
        ref: { module: 'sysml', kind: 'sysml-model-element', id: `${p.id}/${r.element_id}` },
        key: s.qualifiedName(r.element_id) ?? r.name ?? r.element_id,
        title: `${keyword} ${r.name}`,
        moduleState: r.metaclass,
        lifecycle: 'working' as const,
        version: { value: r.commit_number, label: `commit #${r.commit_number}`, at: iso(r.modified_at) },
        createdAt: iso(r.created_at),
        createdBy: r.created_by,
        modifiedAt: iso(r.modified_at),
        modifiedBy: r.modified_by,
        container: { module: 'sysml', kind: 'sysml-project', id: p.id },
        ...(relations.get(r.element_id)?.length ? { relations: relations.get(r.element_id) } : {}),
        open: { toolId: 'sysml-modeler', params: { sysmlProjectId: p.id, elementId: r.element_id } },
      }
    })
  }

  /** Stable order: projects by creation, then within a project the project, its tags, its elements by ID. */
  const sortKey = (p: ProjectRow, kind: string, id: string) => `${iso(p.created_at)}|${p.id}|${RANK[kind]}|${id}`

  // Platform project of each SysML project (events carry the SysML project ID).
  const platformOf = new Map<string, ProjectRow>()
  async function projectRow(id: string): Promise<ProjectRow | undefined> {
    const hit = platformOf.get(id)
    if (hit) return hit
    const p = await repo.getProject(id).catch(() => undefined)
    if (p) platformOf.set(id, p)
    return p
  }

  async function changesOf(e: SysmlEvent): Promise<ArtifactChange[]> {
    const p = await projectRow(e.projectId)
    if (!p) return []
    const base = { eventId: e.eventId, projectId: p.platform_project_id, occurredAt: e.occurredAt, actor: e.actor }
    if (e.type === 'sysml.project-created') return [{ kind: 'upserted', ...base, refs: [{ module: 'sysml', kind: 'sysml-project', id: p.id }] }]
    if (e.type === 'sysml.tag-created') return [{ kind: 'upserted', ...base, refs: [{ module: 'sysml', kind: 'sysml-tag', id: `${p.id}/${e.entityId}` }] }]
    if (e.type !== 'sysml.commit-created') return []
    // Refresh the default branch (it is set after the first commit of a new project).
    const current = (await repo.getProject(p.id).catch(() => p)) ?? p
    platformOf.set(p.id, current)
    if (e.branchId && current.default_branch_id && e.branchId !== current.default_branch_id) return []
    const { rows } = await pool.query<{ element_id: string; metaclass: string; name: string | null; live: boolean }>(
      'SELECT element_id, metaclass, name, payload IS NOT NULL AS live FROM sysml.element_versions WHERE commit_id = $1',
      [e.entityId],
    )
    const ref = (id: string): NativeRef => ({ module: 'sysml', kind: 'sysml-model-element', id: `${p.id}/${id}` })
    const upserted = rows.filter((r) => r.live && isRegisteredElement(r.metaclass, r.name)).map((r) => ref(r.element_id))
    // Deleted, or no longer a named definition/usage (renamed to nothing): no longer registered.
    const retired = rows.filter((r) => !r.live || !isRegisteredElement(r.metaclass, r.name)).map((r) => ref(r.element_id))
    // The project's own version (head commit number) changes with every commit.
    const out: ArtifactChange[] = [{ kind: 'upserted', ...base, refs: [{ module: 'sysml', kind: 'sysml-project', id: p.id }, ...upserted] }]
    if (retired.length) out.push({ kind: 'retired', ...base, eventId: `${e.eventId}:retired`, refs: retired })
    return out
  }

  return {
    module: 'sysml',
    contractVersion: ARTIFACT_SOURCE_CONTRACT_VERSION,
    describeModule: () => ({ name: 'System Model', kinds: SYSML_ARTIFACT_KINDS }),

    async list(projectId, options = {}): Promise<ArtifactPage> {
      const limit = Math.min(Math.max(options.limit ?? MAX_PAGE, 1), MAX_PAGE)
      const kinds = options.kinds?.length ? new Set(options.kinds) : undefined
      const keys: { key: string; p: ProjectRow; kind: string; id: string }[] = []
      for (const p of await projectsOf(projectId)) {
        if (!kinds || kinds.has('sysml-project')) keys.push({ key: sortKey(p, 'sysml-project', p.id), p, kind: 'sysml-project', id: p.id })
        if (!kinds || kinds.has('sysml-tag')) for (const t of await repo.listTags(p.id)) keys.push({ key: sortKey(p, 'sysml-tag', t.id), p, kind: 'sysml-tag', id: t.id })
        if (!kinds || kinds.has('sysml-model-element')) {
          if (p.default_branch_id) {
            const { rows } = await pool.query<{ element_id: string; metaclass: string; name: string }>('SELECT element_id, metaclass, name FROM sysml.branch_elements WHERE branch_id = $1 AND name IS NOT NULL', [p.default_branch_id])
            for (const r of rows) if (isRegisteredElement(r.metaclass, r.name)) keys.push({ key: sortKey(p, 'sysml-model-element', r.element_id), p, kind: 'sysml-model-element', id: r.element_id })
          }
        }
      }
      keys.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      const after = options.cursor ? Buffer.from(options.cursor, 'base64url').toString('utf8') : ''
      const start = after ? keys.findIndex((k) => k.key > after) : 0
      const page = start < 0 ? [] : keys.slice(start, start + limit)
      const items: ArtifactDescriptor[] = []
      for (const p of [...new Set(page.map((k) => k.p))]) {
        const mine = page.filter((k) => k.p === p)
        const byKind = (kind: string) => mine.filter((k) => k.kind === kind).map((k) => k.id)
        const found = new Map<string, ArtifactDescriptor>()
        if (byKind('sysml-project').length) found.set(`sysml-project|${p.id}`, projectDescriptor(p, await headOf(p)))
        for (const d of await tagDescriptors(p, byKind('sysml-tag'))) found.set(`sysml-tag|${d.ref.id.split('/')[1]}`, d)
        for (const d of await elementDescriptors(p, byKind('sysml-model-element'))) found.set(`sysml-model-element|${d.ref.id.split('/')[1]}`, d)
        for (const k of mine) {
          const d = found.get(`${k.kind}|${k.id}`)
          if (d) items.push(d)
        }
      }
      const more = start >= 0 && start + limit < keys.length
      return { items, ...(more && page.length ? { nextCursor: Buffer.from(page[page.length - 1].key, 'utf8').toString('base64url') } : {}) }
    },

    async describe(projectId, refs) {
      const mine = await projectsOf(projectId)
      const byId = new Map(mine.map((p) => [p.id, p]))
      const out: ArtifactDescriptor[] = []
      const groups = new Map<string, { p: ProjectRow; project: boolean; tags: string[]; elements: string[] }>()
      for (const r of refs) {
        if (r.module !== 'sysml') continue
        const [pid, sub] = r.id.split('/')
        const p = byId.get(pid)
        if (!p) continue
        const g = groups.get(p.id) ?? { p, project: false, tags: [], elements: [] }
        groups.set(p.id, g)
        if (r.kind === 'sysml-project' && !sub) g.project = true
        else if (r.kind === 'sysml-tag' && sub && isUuid(sub)) g.tags.push(sub)
        else if (r.kind === 'sysml-model-element' && sub && isUuid(sub)) g.elements.push(sub)
      }
      for (const g of groups.values()) {
        if (g.project) out.push(projectDescriptor(g.p, await headOf(g.p)))
        if (g.tags.length) out.push(...(await tagDescriptors(g.p, g.tags)))
        if (g.elements.length) out.push(...(await elementDescriptors(g.p, g.elements)))
      }
      return out
    },

    subscribe(listener) {
      return events.subscribeAll((e) => {
        void changesOf(e).then(
          (changes) => {
            for (const c of changes) listener(c)
          },
          // Mapping failed (database unavailable): ask the consumer to reconcile the project later.
          () => listener({ kind: 'reconcile', eventId: `${e.eventId}:reconcile`, projectId: platformOf.get(e.projectId)?.platform_project_id ?? e.projectId, reason: 'The SysML event could not be itemised.', occurredAt: e.occurredAt }),
        )
      })
    },

    async provision(request: ProvisionRequest): Promise<ProvisionResult> {
      void request
      // A new platform project has no SysML project; people create one when they start modelling.
      return { status: 'not-needed' }
    },
  }
}
