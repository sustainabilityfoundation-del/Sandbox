import { ActionError, argOptionalString, argString, type AssistantActionContext, type AssistantActionDefinition, type AssistantContribution, type ServiceProposal } from '@ews/platform-sdk'
import { getProjectsClient } from './adapters'
import type { ElementKind, FileProvenance, PropertyValue } from './types'

/**
 * Project Management operations for the assistant (D1-PM, ai-operations.md). Headless: they need only the platform
 * services passed in the action context, never a mounted view. Reads return data; every change is a service proposal
 * the person previews and applies, executed through the Project Management API with the conversation's provenance
 * (the server enforces roles, record state, idempotency and project scope exactly as for the UI).
 *
 * Registered through the module's `ClientModule` (module.ts), which the workspace lists in `INSTALLED_MODULES`.
 */
const MODULE = 'projects'
const ELEMENT_KINDS: ElementKind[] = ['product', 'system', 'subsystem', 'assembly', 'part', 'other']

function clientOf(ctx: AssistantActionContext) {
  const service = ctx.services?.projects
  const client = service ? getProjectsClient(service) : undefined
  if (!client) throw new ActionError('not-allowed', 'Project Management is not available in this window (demo mode or the backend is not reachable).')
  return client
}

const provenanceOf = (p: { conversationId: string; proposalId: string; messageId: string }) => ({ sourceKind: 'assistant' as const, ...p })

/** A key suggestion from a name (initials), for projects created without a key. */
function keyFrom(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const key = (words.length >= 2 ? words.slice(0, 4).map((w) => w[0]).join('') : (words[0] ?? 'PRJ').slice(0, 6)).replace(/^[^A-Z]+/, '')
  return (key || 'PRJ').padEnd(2, 'X')
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new ActionError('invalid-arguments', '“contentBase64” must be base64.')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Files produced in this window (for example a STEP export) are handed to `projects.store_document` by handle through
// `services.files` (SDK 1.9, CR-PM-SDK-4), so the bytes never pass through the model.

function buildActions(host: ProjectsModuleHost): AssistantActionDefinition[] {
  return [
    {
      name: 'projects.get_context',
      label: 'Read project context',
      description: 'Read the open project: key, name, status, your role, modules and their provisioning states, project settings and default tools.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async run(_args, ctx) {
        const context = await clientOf(ctx).context(ctx.captured.projectId)
        return { kind: 'data', data: context, summary: `${context.project.key} ${context.project.name}: ${context.project.status}, your role ${context.role}, ${context.modules.length} modules` }
      },
    },
    {
      name: 'projects.list_projects',
      label: 'List projects',
      description: 'List the projects you are a member of (optionally matching a search text).',
      parameters: { type: 'object', properties: { q: { type: 'string', description: 'Matches key, name and description' } }, additionalProperties: false },
      async run(args, ctx) {
        const page = await clientOf(ctx).listProjects({ q: argOptionalString(args, 'q'), limit: 50 })
        return { kind: 'data', data: page.items.map((p) => ({ id: p.id, key: p.key, name: p.name, status: p.status, role: p.role })), summary: `${page.total} project(s)` }
      },
    },
    {
      name: 'projects.create',
      label: 'Propose a new project',
      description: 'Propose creating a new, genuinely empty project (no engineering artifacts in any module). The person becomes its administrator. After Apply, use projects.open to switch to it.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          key: { type: 'string', description: 'Short display key (letters, digits, hyphens); derived from the name when omitted' },
          description: { type: 'string' },
          disciplines: { type: 'array', items: { type: 'string', enum: ['systems', 'mechanical', 'electrical', 'electronics', 'software', 'controls', 'thermal', 'structural', 'manufacturing', 'quality', 'safety', 'other'] } },
          unitSystem: { type: 'string', enum: ['si', 'imperial', 'mixed'] },
        },
        required: ['name'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const client = clientOf(ctx)
        const name = argString(args, 'name')
        const key = (argOptionalString(args, 'key') ?? keyFrom(name)).toUpperCase()
        const disciplines = Array.isArray(args.disciplines) ? (args.disciplines as string[]) : undefined
        const unitSystem = argOptionalString(args, 'unitSystem')
        const input = { key, name, description: argOptionalString(args, 'description') ?? '', disciplines, templateId: 'blank', ...(unitSystem ? { settings: { 'projects.units.system': unitSystem } } : {}) }
        // Server-side validation without committing (key format and uniqueness, disciplines).
        await client.createProject(input, { dryRun: true })
        const proposal: ServiceProposal = {
          kind: 'service-proposal',
          module: MODULE,
          title: `Create project ${key} “${name}”`,
          explanation: 'A blank project: no requirements, concepts, models, CAD documents or planning items. You become its administrator.',
          preview: [
            { label: 'New project', proposed: `${key} · ${name}` },
            ...(input.description ? [{ label: 'Description', proposed: input.description }] : []),
            ...(disciplines?.length ? [{ label: 'Disciplines', proposed: disciplines.join(', ') }] : []),
            ...(unitSystem ? [{ label: 'Unit system', proposed: unitSystem }] : []),
          ],
          async apply(provenance) {
            const p = await client.createProject(input, { provenance: provenanceOf(provenance) })
            return { summary: `Created ${p.key} (${p.id}). It is empty in every module; open it with projects.open.`, createdIds: [p.id] }
          },
        }
        return proposal
      },
    },
    {
      name: 'projects.open',
      label: 'Propose opening a project',
      description: 'Propose switching this window to another project (by project ID or key). After Apply the window reloads into that project; tools and the assistant then work in it.',
      parameters: { type: 'object', properties: { project: { type: 'string', description: 'Project ID or key' } }, required: ['project'], additionalProperties: false },
      async run(args, ctx) {
        const client = clientOf(ctx)
        const wanted = argString(args, 'project')
        const page = await client.listProjects({ q: wanted, limit: 50, state: 'active' })
        const match = page.items.find((p) => p.id === wanted || p.key.toUpperCase() === wanted.toUpperCase())
        if (!match) throw new ActionError('not-found', `No active project ${wanted} that you are a member of.`)
        if (match.id === ctx.captured.projectId) throw new ActionError('no-op', `${match.key} is already open.`)
        return {
          kind: 'service-proposal',
          module: MODULE,
          title: `Open project ${match.key} “${match.name}”`,
          explanation: 'The window reloads into the project. Nothing is changed in either project.',
          preview: [{ targetId: match.id, label: 'Project', current: ctx.captured.projectId, proposed: `${match.key} · ${match.name}` }],
          async apply() {
            setTimeout(() => host.switchProject(match.id), 300)
            return { summary: `Opening ${match.key}…` }
          },
        }
      },
    },
    {
      name: 'projects.list_artifacts',
      label: 'List project artifacts',
      description: 'List the artifacts registered in the open project across modules (requirements, SysML, CAD, product elements, work items, documents) with their global IDs, kinds, versions and availability.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Matches key and title' },
          module: { type: 'string', description: 'requirements, sysml, cad, product, projects …' },
          category: { type: 'string', enum: ['product-element', 'concept', 'design-knowledge', 'requirement', 'model', 'geometry', 'analysis', 'verification', 'document', 'work-item', 'milestone', 'baseline'] },
          kind: { type: 'string' },
        },
        additionalProperties: false,
      },
      async run(args, ctx) {
        const page = await clientOf(ctx).artifacts(ctx.captured.projectId, { q: argOptionalString(args, 'q'), module: argOptionalString(args, 'module'), category: argOptionalString(args, 'category'), kind: argOptionalString(args, 'kind'), limit: 200 })
        return {
          kind: 'data',
          data: page.items.map((a) => ({ artifactId: a.artifactId, ref: a.ref, key: a.key, title: a.title, category: a.category, version: a.version.value, lifecycle: a.lifecycle, availability: a.availability })),
          summary: `${page.total} artifact(s)`,
          inspected: page.items.slice(0, 20).map((a) => ({ id: a.artifactId, detail: `${a.key} ${a.title} (${a.ref.module}/${a.ref.kind}, v${a.version.value})` })),
        }
      },
    },
    {
      name: 'projects.create_product_element',
      label: 'Propose a product element',
      description:
        'Propose a product-structure element (product, system, subsystem, assembly, part or other) in the open project, optionally below a parent in the product breakdown. Properties are text, numbers, true/false, lists of text or quantities { value, unit }. Other modules reference it as ArtifactRef { module: "product", kind: "product-element", id }.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          elementKind: { type: 'string', enum: ELEMENT_KINDS },
          description: { type: 'string' },
          parentId: { type: 'string', description: 'Product element ID (or key/alias) of the parent in the product breakdown' },
          quantity: { type: 'number', description: 'How many of this element the parent contains (default 1)' },
          properties: { type: 'object', additionalProperties: true },
        },
        required: ['name', 'elementKind'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const client = clientOf(ctx)
        const projectId = ctx.captured.projectId
        const name = argString(args, 'name')
        const elementKind = argString(args, 'elementKind') as ElementKind
        if (!ELEMENT_KINDS.includes(elementKind)) throw new ActionError('invalid-arguments', `“elementKind” is one of ${ELEMENT_KINDS.join(', ')}.`)
        const parentRef = argOptionalString(args, 'parentId')
        const parent = parentRef ? await client.productElement(projectId, parentRef).catch(() => undefined) : undefined
        if (parentRef && !parent) throw new ActionError('not-found', `No product element ${parentRef} in this project.`)
        const properties = (args.properties && typeof args.properties === 'object' ? args.properties : undefined) as Record<string, PropertyValue> | undefined
        const quantity = typeof args.quantity === 'number' ? args.quantity : undefined
        const description = argOptionalString(args, 'description')
        return {
          kind: 'service-proposal',
          module: MODULE,
          title: `Add ${elementKind} “${name}”${parent ? ` below ${parent.key} ${parent.name}` : ''}`,
          explanation: 'Creates a product element in the product registry (revision 1) and places it in the product breakdown.',
          preview: [
            { label: `New ${elementKind}`, proposed: name, basis: 'ai-hypothesis' },
            ...(parent ? [{ targetId: parent.id, label: 'Parent', proposed: `${parent.key} ${parent.name}${quantity ? ` × ${quantity}` : ''}` }] : [{ label: 'Position', proposed: 'top level of the product breakdown' }]),
            ...Object.entries(properties ?? {}).map(([k, v]) => ({ label: k, proposed: typeof v === 'object' && v && 'value' in v ? `${v.value} ${v.unit}` : String(v), basis: 'ai-hypothesis' as const })),
          ],
          async apply(provenance) {
            const breakdowns = await client.breakdowns(projectId)
            const breakdown = breakdowns.find((b) => b.purpose === 'product-breakdown') ?? (await client.createBreakdown(projectId, { name: 'Product breakdown', purpose: 'product-breakdown' }))
            const e = await client.createProductElement(projectId, { name, elementKind, description, properties, placement: { breakdownId: breakdown.id, parentId: parent?.id ?? null, quantity } }, { provenance: provenanceOf(provenance) })
            return { summary: `Created ${e.key} ${e.name} (${e.id})`, createdIds: [e.id] }
          },
        }
      },
    },
    {
      name: 'projects.add_breakdown_edge',
      label: 'Propose a breakdown position',
      description: 'Propose placing an existing product element below a parent in a breakdown (the product breakdown by default). An element may appear under several parents; cycles are refused.',
      parameters: {
        type: 'object',
        properties: {
          childId: { type: 'string', description: 'Product element ID, key or alias' },
          parentId: { type: 'string', description: 'Parent product element ID, key or alias; omit for a top-level position' },
          breakdownId: { type: 'string' },
          quantity: { type: 'number' },
        },
        required: ['childId'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const client = clientOf(ctx)
        const projectId = ctx.captured.projectId
        const child = await client.productElement(projectId, argString(args, 'childId')).catch(() => undefined)
        if (!child) throw new ActionError('not-found', `No product element ${String(args.childId)} in this project.`)
        const parentRef = argOptionalString(args, 'parentId')
        const parent = parentRef ? await client.productElement(projectId, parentRef).catch(() => undefined) : undefined
        if (parentRef && !parent) throw new ActionError('not-found', `No product element ${parentRef} in this project.`)
        const breakdowns = await client.breakdowns(projectId)
        const wantedBreakdown = argOptionalString(args, 'breakdownId')
        const breakdown = wantedBreakdown ? breakdowns.find((b) => b.id === wantedBreakdown) : breakdowns.find((b) => b.purpose === 'product-breakdown')
        if (wantedBreakdown && !breakdown) throw new ActionError('not-found', `No breakdown ${wantedBreakdown}.`)
        const quantity = typeof args.quantity === 'number' ? args.quantity : undefined
        return {
          kind: 'service-proposal',
          module: MODULE,
          title: `Place ${child.key} ${child.name} ${parent ? `below ${parent.key} ${parent.name}` : 'at the top level'}`,
          explanation: `Adds a position in ${breakdown ? `“${breakdown.name}”` : 'a new “Product breakdown”'}. The element itself is unchanged.`,
          preview: [{ targetId: child.id, label: 'Position', proposed: `${parent ? `${parent.key} → ` : ''}${child.key}${quantity ? ` × ${quantity}` : ''}` }],
          async apply() {
            const b = breakdown ?? (await client.createBreakdown(projectId, { name: 'Product breakdown', purpose: 'product-breakdown' }))
            const edge = await client.addEdge(projectId, b.id, { parentId: parent?.id ?? null, childId: child.id, quantity })
            return { summary: `Placed ${child.key} ${parent ? `below ${parent.key}` : 'at the top level'}`, createdIds: [edge.id] }
          },
        }
      },
    },
    {
      name: 'projects.store_document',
      label: 'Propose storing a file in the project',
      description:
        'Propose storing a file (for example an exported STEP file) as a project document with its provenance: the source artifact and exact revision it was produced from (e.g. { module: "cad", kind: "cad-document", id, revision }), and the tool and version that produced it. Pass a staged file handle from the producing operation; contentBase64 is accepted for small files.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          documentKind: { type: 'string', enum: ['specification', 'report', 'drawing', 'datasheet', 'standard', 'minutes', 'image', 'model-file', 'other'] },
          fileHandle: { type: 'string', description: 'Handle of a file staged by the producing operation' },
          contentBase64: { type: 'string' },
          fileName: { type: 'string' },
          mediaType: { type: 'string' },
          source: { type: 'object', properties: { module: { type: 'string' }, kind: { type: 'string' }, id: { type: 'string' }, revision: { type: ['number', 'string'] } }, required: ['module', 'kind', 'id'] },
          tool: { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' } }, required: ['name', 'version'] },
          notes: { type: 'string' },
        },
        required: ['title'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const client = clientOf(ctx)
        const projectId = ctx.captured.projectId
        const title = argString(args, 'title')
        const handle = argOptionalString(args, 'fileHandle')
        const files = ctx.services?.files
        if (handle && !files) throw new ActionError('not-found', 'This window has no file hand-off service.')
        const stagedMeta = handle ? files!.describe(handle) : undefined
        if (handle && !stagedMeta) throw new ActionError('not-found', `No staged file ${handle} in this window (files are kept until the window is closed).`)
        const contentBase64 = argOptionalString(args, 'contentBase64')
        if (!stagedMeta && !contentBase64) throw new ActionError('invalid-arguments', 'Give a fileHandle from the producing operation or contentBase64.')
        const stagedFile = stagedMeta
        const bytes = stagedMeta ? await files!.read(handle!) : base64ToBytes(contentBase64!)
        const fileName = stagedFile?.fileName ?? argString(args, 'fileName')
        const mediaType = stagedFile?.mediaType ?? argOptionalString(args, 'mediaType') ?? 'application/octet-stream'
        const source = (args.source as FileProvenance['source']) ?? stagedFile?.provenance?.source
        const tool = (args.tool as FileProvenance['tool']) ?? stagedFile?.provenance?.tool
        const provenance: FileProvenance = { ...(stagedFile?.provenance ?? {}), ...(source ? { source } : {}), ...(tool ? { tool } : {}), ...(argOptionalString(args, 'notes') ? { notes: argOptionalString(args, 'notes') } : {}), generatedAt: stagedFile?.provenance?.generatedAt ?? new Date().toISOString() }
        const documentKind = argOptionalString(args, 'documentKind') ?? 'model-file'
        return {
          kind: 'service-proposal',
          module: MODULE,
          title: `Store ${fileName} as “${title}”`,
          explanation: 'Creates a project document with one immutable version. The bytes are content-addressed and verified on download; the provenance is recorded with the version.',
          preview: [
            { label: 'Document', proposed: `${title} (${documentKind})` },
            { label: 'File', proposed: `${fileName}, ${bytes.byteLength} bytes, ${mediaType}` },
            ...(source ? [{ label: 'Produced from', proposed: `${source.module}/${source.kind} ${source.id}${source.revision !== undefined ? ` revision ${source.revision}` : ''}` }] : []),
            ...(tool ? [{ label: 'Produced by', proposed: `${tool.name} ${tool.version}` }] : []),
          ],
          async apply(p) {
            const doc = await client.createDocument(projectId, { title, documentKind }, { provenance: provenanceOf(p) })
            const stored = await client.uploadDocumentVersion(projectId, doc.id, doc.revision, { bytes, fileName, mediaType, provenance }, { provenance: provenanceOf(p) })
            if (handle) files?.discard(handle)
            return { summary: `Stored ${stored.key} “${stored.title}” version 1 (sha-256 ${stored.versions?.[0]?.sha256.slice(0, 12)}…)`, createdIds: [stored.id] }
          },
        }
      },
    },
  ]
}

/** What the host window gives the module: reloading into another project is workspace behaviour (shared project context). */
export interface ProjectsModuleHost {
  switchProject(projectId: string): void
}

/** The Project Management assistant contribution. */
export function projectsAssistant(host: ProjectsModuleHost): AssistantContribution {
  return { actions: buildActions(host) }
}
