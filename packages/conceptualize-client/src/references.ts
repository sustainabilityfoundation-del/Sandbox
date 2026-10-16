import type { CadService, ProjectsService, SysmlModelService } from '@ews/platform-sdk'

/**
 * Resolution of references to the real modules (integration milestone 1, C3 and C5):
 *
 * - `product` / `product-element` (Project Management product registry) and `projects` entities;
 * - `sysml` / `sysml-model-element`, id `<projectId>/<elementId>`, revision = commit number on the SysML
 *   project's default branch;
 * - `cad` / `cad-modeler-entity`, id `<documentUuid>/<entityId>`, revision = CAD document revision.
 *
 * The real path is the Project Management registry (`ProjectsService.resolve`, SDK 1.7). The SysML and CAD
 * Modeler read clients (`PlatformServices.sysml` / `.cad`) arrive with SDK 1.8; until then hosts inject
 * **labelled adapters** (`adapter: true`), shown as such in the UI. Existence and revisions are always read
 * from the owning module; Conceptualize never copies the artifact's data.
 */

export interface ReferenceTarget {
  module: string
  kind?: string | null
  id: string
  revision?: number | null
}

export interface ReferenceResolution {
  /** found: exists (latest revision when known); missing: the owning module says it does not exist; unavailable: cannot be checked now. */
  state: 'found' | 'missing' | 'unavailable'
  label?: string
  latest?: number
  detail?: string
}

export interface ReferencePort {
  readonly name: string
  /** True for adapters that stand in for an SDK read client (shown as "adapter" in the UI). */
  readonly adapter: boolean
  supports(ref: ReferenceTarget): boolean
  resolve(projectId: string, ref: ReferenceTarget): Promise<ReferenceResolution>
}

/** Kinds of the real modules (C3). Legacy twin objects (SYS-…, CAD-…, ROD-…) are the PRJ-ACT100 demo. */
export const REAL_MODULE_KINDS: Record<string, string[]> = {
  product: ['product-element'],
  projects: ['document', 'task', 'issue', 'risk', 'milestone', 'project-baseline'],
  sysml: ['sysml-model-element'],
  cad: ['cad-modeler-entity', 'cad-document'],
}

/** Default kind for a module and id: scoped ids (`a/b`) of sysml and cad are the real modelers' entities. */
export function referenceKind(ref: ReferenceTarget): string | undefined {
  if (ref.kind) return ref.kind
  if (ref.module === 'product') return 'product-element'
  if (ref.module === 'sysml' && ref.id.includes('/')) return 'sysml-model-element'
  if (ref.module === 'cad' && ref.id.includes('/')) return 'cad-modeler-entity'
  return undefined
}

export const isRealModuleReference = (ref: ReferenceTarget) => {
  const kind = referenceKind(ref)
  return !!kind && (REAL_MODULE_KINDS[ref.module] ?? []).includes(kind)
}

/** Legacy twin objects of the illustrative SysML and mock CAD tools (PRJ-ACT100 demo data). */
export const isLegacyTwinReference = (ref: ReferenceTarget) => ['sysml', 'cad', 'twin'].includes(ref.module) && !isRealModuleReference(ref)

/** Splits `<container>/<entity>`; undefined when the id is not scoped. */
export function scopedId(id: string): { container: string; entity: string } | undefined {
  const i = id.indexOf('/')
  if (i <= 0 || i === id.length - 1) return undefined
  return { container: id.slice(0, i), entity: id.slice(i + 1) }
}

/** Real path: the Project Management artifact registry (SDK 1.7 ProjectsService.resolve). */
export function createRegistryReferencePort(projects: ProjectsService): ReferencePort {
  return {
    name: 'Project Management registry',
    adapter: false,
    supports: (ref) => projects.mode === 'api' && isRealModuleReference(ref),
    async resolve(projectId, ref) {
      const kind = referenceKind(ref)!
      try {
        const [s] = await projects.resolve(projectId, [{ module: ref.module, kind, id: ref.id }])
        if (!s) return { state: 'unavailable', detail: 'The registry has no entry for this reference yet.' }
        if (s.availability === 'missing-in-module') return { state: 'missing', label: `${s.key} ${s.title}`, detail: 'The owning module no longer has it (kept, never deleted).' }
        if (s.availability !== 'available') return { state: 'unavailable', label: `${s.key} ${s.title}`, detail: s.availability === 'module-unavailable' ? 'The owning module is not available.' : 'You are not entitled to that module.' }
        const latest = typeof s.version.value === 'number' ? s.version.value : undefined
        return { state: 'found', label: `${s.key} ${s.title}`, ...(latest !== undefined ? { latest } : {}) }
      } catch (e) {
        return { state: 'unavailable', detail: `Project Management not reachable: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  }
}

/**
 * ADAPTER until SDK 1.8 (`PlatformServices.sysml`): reads the SysML Modeler HTTP API. Resolves an element
 * at the head of the SysML project's default branch and reports the head commit number. It checks
 * existence only, not whether the element changed since the pinned commit.
 */
export function createSysmlModelerReferenceAdapter(options: { baseUrl: string; devUser?: string; fetch?: typeof fetch }): ReferencePort {
  const f = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const get = async (path: string) => {
    const res = await f(`${options.baseUrl}${path}`, { headers: { Accept: 'application/json', ...(options.devUser ? { 'X-Dev-User': options.devUser } : {}) } })
    // 404: unknown; 400: not a SysML Modeler ID (project and element IDs are UUIDs).
    if (res.status === 404 || res.status === 400) return null
    if (!res.ok) throw new Error(`SysML Modeler answered ${res.status}`)
    return res.json() as Promise<Record<string, unknown>>
  }
  return {
    name: 'SysML Modeler HTTP adapter (until the SDK 1.8 read client)',
    adapter: true,
    supports: (ref) => ref.module === 'sysml' && referenceKind(ref) === 'sysml-model-element',
    async resolve(_projectId, ref) {
      const s = scopedId(ref.id)
      if (!s) return { state: 'missing', detail: 'Expected <projectId>/<elementId>.' }
      try {
        const project = await get(`/projects/${encodeURIComponent(s.container)}`)
        if (!project) return { state: 'missing', detail: `SysML project ${s.container} not found.` }
        const branchId = (project.defaultBranch as { '@id'?: string } | null)?.['@id']
        if (!branchId) return { state: 'missing', detail: 'The SysML project has no default branch yet.' }
        const branch = await get(`/projects/${encodeURIComponent(s.container)}/branches/${branchId}`)
        const headId = (branch?.head as { '@id'?: string } | null)?.['@id']
        if (!headId) return { state: 'missing', detail: 'The default branch has no commits yet.' }
        const [commit, element] = await Promise.all([get(`/projects/${encodeURIComponent(s.container)}/commits/${headId}`), get(`/projects/${encodeURIComponent(s.container)}/commits/${headId}/elements/${encodeURIComponent(s.entity)}?derived=true`)])
        if (!element) return { state: 'missing', detail: 'The element is not in the head of the default branch.' }
        const latest = typeof commit?.number === 'number' ? commit.number : undefined
        const name = typeof element.name === 'string' ? element.name : typeof element.declaredName === 'string' ? element.declaredName : s.entity
        return { state: 'found', label: `${name} (${String(project.name ?? s.container)})`, ...(latest !== undefined ? { latest } : {}), detail: 'Checked through an adapter: existence at the branch head only.' }
      } catch (e) {
        return { state: 'unavailable', detail: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}

/** SDK 1.8 read client of the SysML Modeler (`PlatformServices.sysml`). */
export function createSysmlServicePort(sysml: SysmlModelService): ReferencePort {
  return {
    name: 'SysML Modeler (SDK read client)',
    adapter: false,
    supports: (ref) => ref.module === 'sysml' && referenceKind(ref) === 'sysml-model-element',
    async resolve(projectId, ref) {
      try {
        const [r] = await sysml.resolve(projectId, [{ module: 'sysml', kind: 'sysml-model-element', id: ref.id, ...(ref.revision ? { revision: ref.revision } : {}) }])
        if (!r || r.status === 'missing') return { state: 'missing', detail: 'The SysML Modeler has no such element in this project (or at that commit).' }
        if (r.status === 'forbidden') return { state: 'unavailable', detail: 'You may not read the SysML Modeler here (entitlement or membership).' }
        const e = r.element
        return { state: 'found', label: `${e.name ?? e.shortName ?? e.elementId} (${e.metaclass})`, latest: e.latestRevision }
      } catch (err) {
        return { state: 'unavailable', detail: `SysML Modeler not reachable: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  }
}

/** SDK 1.8 read client of the CAD Modeler (`PlatformServices.cad`). */
export function createCadServicePort(cad: CadService): ReferencePort {
  return {
    name: 'CAD Modeler (SDK read client)',
    adapter: false,
    supports: (ref) => ref.module === 'cad' && (referenceKind(ref) === 'cad-modeler-entity' || referenceKind(ref) === 'cad-document'),
    async resolve(projectId, ref) {
      try {
        // A whole document is read as '<documentUuid>/<documentUuid>' (SDK 1.8 CadArtifactRefInput).
        const id = referenceKind(ref) === 'cad-document' ? `${ref.id}/${ref.id}` : ref.id
        const r = await cad.summary(projectId, { module: 'cad', kind: 'cad-modeler-entity', id, ...(ref.revision ? { revision: ref.revision } : {}) })
        if (r.status === 'missing') return { state: 'missing', detail: r.message }
        if (r.status === 'unavailable') return { state: 'unavailable', detail: r.message }
        const v = r.value
        return { state: 'found', label: `${v.label} (${v.entityType}, ${v.documentTitle})${v.archived ? ', archived' : ''}`, latest: v.latestRevision, ...(v.verifiedInGeometry ? {} : { detail: 'Named in the model; only regeneration confirms it in the geometry.' }) }
      } catch (err) {
        return { state: 'unavailable', detail: `CAD Modeler not reachable: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  }
}

/** Ports in order: SDK read clients, then the Project Management registry, then injected adapters. */
export function referencePortsFor(services: { sysml?: SysmlModelService; cad?: CadService; projects?: ProjectsService }, extra: readonly ReferencePort[] = []): ReferencePort[] {
  return [...(services.sysml ? [createSysmlServicePort(services.sysml)] : []), ...(services.cad ? [createCadServicePort(services.cad)] : []), ...(services.projects ? [createRegistryReferencePort(services.projects)] : []), ...extra]
}
