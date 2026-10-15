import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import { forbidden, invalid, notFound } from '../errors'
import { PERMISSIONS, TEMPLATES, roleAllows, templateById, type Permission, type Role } from '../domain/rules'
import { isoRequired, withTransaction, type Ctx } from '../store/context'
import {
  countsOf,
  createProject,
  creationRecord,
  getProject,
  lifecycleHistory,
  listProjects,
  loadProject,
  moduleStates,
  projectJson,
  recentProjects,
  recordOpened,
  removeMember,
  setMember,
  setModuleState,
  transitionProject,
  updateProject,
  type CreateProjectInput,
} from '../store/projects'
import { artifactHistory, artifactJson, listArtifacts, loadArtifact } from '../store/artifacts'
import { createLink, listLinks, removeLink } from '../store/links'
import { createWorkItem, getWorkItem, listWorkItems, updateWorkItem, workItemHistory } from '../store/workItems'
import { createMilestone, getMilestone, listMilestones, updateMilestone } from '../store/milestones'
import { addDocumentVersion, createDocument, getDocument, listDocuments, readDocumentVersion, updateDocument } from '../store/documents'
import { registerRoute, type HostServices, type RequestContext, type RouteSpec } from './route'
import * as S from './schemas'

const P = Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }) })
const PI = (name: string) => Type.Object({ projectId: Type.String({ minLength: 1, maxLength: 100 }), [name]: Type.String({ minLength: 1, maxLength: 100 }) })
const DryRunQ = Type.Object({ dryRun: Type.Optional(Type.Boolean()) }, { additionalProperties: false })
const ref = (id: string) => Type.Ref(id)
const err = (description: string) => ({ description, schema: ref('Error') })
const E403 = err('Not a member, role too low, or the project is archived or deleted')
const E404 = err('Not found')
const E409 = err('Stale revision (details.currentRevision)')
const E422 = err('Invalid input')

function activityJson(r: { id: string; entity_type: string; entity_id: string; action: string; revision: number | null; actor: string; occurred_at: Date; reason: string; source_kind: string; conversation_id: string | null; proposal_id: string | null; details: Record<string, unknown> }) {
  return {
    id: Number(r.id),
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    revision: r.revision,
    actor: r.actor,
    occurredAt: isoRequired(r.occurred_at),
    reason: r.reason,
    sourceKind: r.source_kind,
    ...(r.conversation_id ? { conversationId: r.conversation_id } : {}),
    ...(r.proposal_id ? { proposalId: r.proposal_id } : {}),
    details: r.details,
  }
}

/** Writes the requested initial settings after the creation transaction committed (the creator is administrator now). */
async function applyInitialSettings(services: HostServices, projectId: string, values: Record<string, boolean | number | string | null>, actor: string) {
  if (!services.settings || !Object.keys(values).length) return
  const ctxBase = { projectId, actor, provenance: { sourceKind: 'system' as const }, role: 'administrator', services: { memberships: services.memberships, blobs: services.blobs } }
  try {
    await services.settings.write(projectId, values, actor)
    await withTransaction(services.pool, ctxBase, (ctx) => setModuleState(ctx.db, projectId, 'settings', 'provisioned', null, ctx.now))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await withTransaction(services.pool, ctxBase, (ctx) => setModuleState(ctx.db, projectId, 'settings', 'failed', message.slice(0, 1000), ctx.now)).catch(() => undefined)
  }
}

export function registerProjectRoutes(app: FastifyInstance, services: HostServices, registry: RouteSpec[]) {
  const route = (spec: RouteSpec) => registerRoute(app, services, spec, registry)
  const maxUpload = services.maxUploadBytes ?? 200 * 1024 * 1024
  const memberProjects = (ctx: Ctx) => services.memberships.projectsOf(ctx.db, ctx.actor)

  // ---- projects -----------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects',
    operationId: 'listProjects',
    tag: 'Projects',
    summary: 'Projects you are a member of (search, filter, sort)',
    permission: 'authenticated',
    query: Type.Object(
      {
        q: Type.Optional(Type.String({ maxLength: 200, description: 'Matches key, name and description' })),
        status: Type.Optional(Type.Array(S.ProjectStatus)),
        state: Type.Optional(Type.Union([S.ProjectState, Type.Literal('all')], { description: 'Default active' })),
        discipline: Type.Optional(S.Discipline),
        sort: Type.Optional(Type.String({ pattern: '^-?(name|key|updated|created|opened)$', description: 'name, key, updated, created, opened; prefix - for descending (default -updated)' })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
        cursor: Type.Optional(Type.String({ maxLength: 100 })),
      },
      { additionalProperties: false },
    ),
    responses: { 200: { description: 'A page of projects', schema: ref('ProjectPage') } },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => listProjects(ctx, await memberProjects(ctx), rc.query as never)) }),
  })

  route({
    method: 'POST',
    path: '/projects',
    operationId: 'createProject',
    tag: 'Projects',
    summary: 'Create a blank project or one from a template; you become its administrator',
    description:
      'One transaction: project, revision 1, creation record, your administrator membership (platform), invited members, template planning items (milestones, tasks), audit and event. A blank project has no artifacts in any module. Requested settings are written through the settings service after commit; their state is reported in the project context (module `settings`).',
    permission: 'authenticated',
    body: ref('CreateProject') as never,
    query: DryRunQ,
    idempotency: 'required',
    dryRun: true,
    responses: { 201: { description: 'Created', schema: ref('Project') }, 200: { description: 'Dry run (nothing committed)', schema: ref('DryRun') }, 409: err('The key is taken'), 422: E422 },
    handler: async (rc) => {
      const input = rc.body as CreateProjectInput
      const handled = await rc.write(async (ctx) => {
        const { project, requestedSettings } = await createProject(ctx, input)
        return { status: 201, etag: project.revision, headers: { Location: `/api/projects/v1/projects/${project.id}` }, body: { ...projectJson(project, { role: 'administrator' }), requestedSettings } }
      })
      if (!rc.dryRun && handled.status === 201 && !handled.headers?.['Idempotency-Replayed']) {
        const body = handled.body as { id: string; requestedSettings: Record<string, boolean | number | string | null> }
        await applyInitialSettings(services, body.id, body.requestedSettings, rc.principal.userId)
      }
      if (handled.body && typeof handled.body === 'object' && 'requestedSettings' in (handled.body as object)) {
        const { requestedSettings: _ignored, ...project } = handled.body as Record<string, unknown>
        void _ignored
        return { ...handled, body: project }
      }
      return handled
    },
  })

  route({
    method: 'GET',
    path: '/projects/{projectId}',
    operationId: 'getProject',
    tag: 'Projects',
    summary: 'A project with counts',
    params: P,
    permission: 'read',
    anyState: true,
    responses: { 200: { description: 'The project', schema: ref('Project') }, 403: E403, 404: E404 },
    handler: async (rc) => {
      const body = await rc.read((ctx) => getProject(ctx, rc.projectId))
      if (body.state === 'deleted' && !roleAllows(rc.role, 'administer')) throw notFound(`No project ${rc.projectId}.`)
      return { etag: body.revision, body }
    },
  })

  route({
    method: 'PATCH',
    path: '/projects/{projectId}',
    operationId: 'updateProject',
    tag: 'Projects',
    summary: 'Edit project metadata and lifecycle status (key and owner need administrator)',
    params: P,
    body: ref('UpdateProject') as never,
    permission: 'edit',
    concurrency: 'Required: If-Match "<revision>" or expectedRevision',
    idempotency: 'optional',
    responses: { 200: { description: 'Updated', schema: ref('Project') }, 403: E403, 409: E409, 422: E422 },
    handler: async (rc) => {
      const { expectedRevision, ...input } = rc.body as { expectedRevision?: number } & Record<string, unknown>
      const expected = rc.expected(expectedRevision)
      return rc.write(async (ctx) => {
        const p = await updateProject(ctx, rc.projectId, expected, input, roleAllows(rc.role, 'administer'))
        return { etag: p.revision, body: projectJson(p, { role: rc.role }) }
      })
    },
  })

  route({
    method: 'POST',
    path: '/projects/{projectId}/open',
    operationId: 'openProject',
    tag: 'Projects',
    summary: 'Open a project: records it as recently opened for you and returns the project context',
    description: 'Recently opened is a per-user convenience, not engineering data. The context lists module and settings states; settings values come from the settings service when it is available.',
    params: P,
    permission: 'read',
    anyState: true,
    responses: { 200: { description: 'Project context', schema: ref('ProjectContext') }, 403: E403 },
    handler: async (rc) => {
      const state = (await services.pool.query<{ state: string }>('SELECT state FROM projects.projects WHERE id = $1', [rc.projectId])).rows[0]?.state
      if (state === 'deleted') throw forbidden('The project is deleted. An administrator can restore it within the retention period.', { reason: 'deleted' })
      await rc.write(async (ctx) => {
        await recordOpened(ctx, rc.projectId)
        return {}
      })
      return { body: await projectContext(rc) }
    },
  })

  async function projectContext(rc: RequestContext) {
    const { project, modules, creation } = await rc.read(async (ctx) => ({ project: projectJson(await loadProject(ctx.db, rc.projectId), { role: rc.role, counts: await countsOf(ctx, rc.projectId) }), modules: await moduleStates(ctx, rc.projectId), creation: await creationRecord(ctx, rc.projectId) }))
    let values: Record<string, boolean | number | string | null> = {}
    let available = false
    if (services.settings) {
      try {
        values = await services.settings.read(rc.projectId)
        available = true
      } catch {
        available = false
      }
    }
    const requested = ((creation?.requested as { settings?: Record<string, boolean | number | string | null> } | undefined)?.settings ?? {}) as Record<string, boolean | number | string | null>
    return {
      project,
      role: rc.role as Role,
      permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => roleAllows(rc.role, p)),
      modules,
      settings: { available, source: services.settings?.description ?? 'settings service not connected', values, requested },
      creation,
    }
  }

  route({
    method: 'GET',
    path: '/projects/{projectId}/context',
    operationId: 'getProjectContext',
    tag: 'Projects',
    summary: 'The project context without recording a recent entry (for the assistant and refreshes)',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Project context', schema: ref('ProjectContext') }, 403: E403 },
    handler: async (rc) => ({ body: await projectContext(rc) }),
  })

  route({
    method: 'GET',
    path: '/me/recent-projects',
    operationId: 'recentProjects',
    tag: 'Projects',
    summary: 'Projects you opened recently (newest first, at most 20)',
    permission: 'authenticated',
    responses: { 200: { description: 'Recent projects', schema: Type.Array(ref('Project')) as never } },
    handler: async (rc) => ({ body: await rc.read(async (ctx) => recentProjects(ctx, await memberProjects(ctx))) }),
  })

  for (const [transition, path, operationId, summary, permission, confirm] of [
    ['archive', 'archive', 'archiveProject', 'Archive: read-only for every member; module data unchanged', 'administer', false],
    ['restore', 'restore', 'restoreProject', 'Restore an archived project, or a deleted one within its retention period', 'administer', false],
  ] as const) {
    route({
      method: 'POST',
      path: `/projects/{projectId}/${path}`,
      operationId,
      tag: 'Lifecycle',
      summary,
      params: P,
      query: DryRunQ,
      body: ref('Transition') as never,
      permission,
      anyState: true,
      confirm,
      dryRun: true,
      idempotency: 'optional',
      responses: { 200: { description: 'The project after the transition (or the dry run)', schema: ref('Project') }, 403: E403, 422: E422 },
      handler: async (rc) =>
        rc.write(async (ctx) => {
          const { project, effects } = await transitionProject(ctx, rc.projectId, transition, { reason: (rc.body as { reason?: string } | undefined)?.reason })
          return { etag: project.revision, body: { ...projectJson(project, { role: rc.role }), ...(rc.dryRun ? { effects } : {}) } }
        }),
    })
  }

  route({
    method: 'DELETE',
    path: '/projects/{projectId}',
    operationId: 'deleteProject',
    tag: 'Lifecycle',
    summary: 'Soft-delete a project (restorable during the retention period); module data is never deleted',
    description: 'Needs `X-Confirm: <project key>`. The dry run lists the effects. Retention default 30 days.',
    params: P,
    query: DryRunQ,
    permission: 'administer',
    anyState: true,
    confirm: true,
    dryRun: true,
    idempotency: 'optional',
    responses: { 200: { description: 'The deleted project (or the dry run)', schema: ref('Project') }, 403: E403, 422: E422, 428: err('Confirmation missing (X-Confirm)') },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const { project, effects } = await transitionProject(ctx, rc.projectId, 'delete')
        return { etag: project.revision, body: { ...projectJson(project, { role: rc.role }), ...(rc.dryRun ? { effects } : {}) } }
      }),
  })

  route({
    method: 'POST',
    path: '/projects/{projectId}/duplicate',
    operationId: 'duplicateProject',
    tag: 'Lifecycle',
    summary: 'Duplicate a project’s configuration (and optionally members and planning items) into a new project',
    description: 'Module content is not copied: that needs every module’s exporter and importer (ADR-0064) and is refused with `include.moduleContent`.',
    params: P,
    query: DryRunQ,
    body: Type.Object(
      { key: Type.String({ minLength: 2, maxLength: 20 }), name: Type.String({ minLength: 1, maxLength: 200 }), include: Type.Optional(Type.Object({ members: Type.Optional(Type.Boolean()), milestones: Type.Optional(Type.Boolean()), workItems: Type.Optional(Type.Boolean()), moduleContent: Type.Optional(Type.Boolean()) }, { additionalProperties: false })) },
      { additionalProperties: false },
    ),
    permission: 'administer',
    anyState: true,
    dryRun: true,
    idempotency: 'required',
    responses: { 201: { description: 'The new project', schema: ref('Project') }, 403: E403, 409: err('The key is taken'), 422: E422 },
    handler: async (rc) => {
      const body = rc.body as { key: string; name: string; include?: { members?: boolean; milestones?: boolean; workItems?: boolean; moduleContent?: boolean } }
      if (body.include?.moduleContent) throw invalid('Copying module content needs module exporters and importers, which no module provides yet (ADR-0064). Duplicate without moduleContent.', { 'include.moduleContent': 'not available' })
      return rc.write(async (ctx) => {
        const source = await loadProject(ctx.db, rc.projectId)
        const creation = await creationRecord(ctx, rc.projectId)
        const requested = (creation?.requested ?? {}) as { settings?: Record<string, boolean | number | string | null>; modules?: string[] }
        const members = body.include?.members ? (await services.memberships.list(ctx.db, rc.projectId)).map((m) => ({ userId: m.userId, role: m.role })) : []
        const { project } = await createProject(
          ctx,
          { key: body.key, name: body.name, description: source.description, objectives: source.objectives, scope: source.scope, disciplines: source.disciplines, status: 'planning', templateId: 'blank', tags: source.tags, settings: requested.settings, modules: requested.modules, members },
          { duplicatedFrom: source.id },
        )
        const target: Ctx = { ...ctx, projectId: project.id, role: 'administrator' }
        if (body.include?.milestones) {
          const ms = await listMilestones(ctx)
          for (const m of ms) await createMilestone(target, { name: m.name, description: m.description, due: m.due })
        }
        if (body.include?.workItems) {
          const items = await listWorkItems(ctx, { limit: 200 })
          for (const w of items.items) await createWorkItem(target, { kind: w.kind, title: w.title, description: w.description, priority: w.priority, ...(w.risk ? { risk: w.risk } : {}), ...(w.issue ? { issue: { severity: w.issue.severity as 'minor' } } : {}) })
        }
        return { status: 201, etag: project.revision, headers: { Location: `/api/projects/v1/projects/${project.id}` }, body: projectJson(project, { role: 'administrator' }) }
      })
    },
  })

  route({
    method: 'GET',
    path: '/projects/{projectId}/lifecycle',
    operationId: 'lifecycleHistory',
    tag: 'Lifecycle',
    summary: 'Project revisions: metadata, lifecycle status and record-state changes',
    params: P,
    permission: 'read',
    anyState: true,
    responses: { 200: { description: 'Newest first', schema: Type.Array(Type.Object({ revision: Type.Integer(), changedAt: Type.String(), changedBy: Type.String(), summary: Type.String(), sourceKind: Type.String(), state: Type.String(), status: Type.String() })) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => lifecycleHistory(ctx, rc.projectId)) }),
  })

  // ---- templates ----------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/templates',
    operationId: 'listTemplates',
    tag: 'Templates',
    summary: 'Built-in project templates (configuration and planning items only; never engineering artifacts)',
    permission: 'authenticated',
    responses: { 200: { description: 'Templates', schema: Type.Array(ref('Template')) as never } },
    handler: async () => ({ body: TEMPLATES }),
  })
  route({
    method: 'GET',
    path: '/templates/{templateId}',
    operationId: 'getTemplate',
    tag: 'Templates',
    summary: 'A template',
    params: Type.Object({ templateId: Type.String({ maxLength: 60 }) }),
    permission: 'authenticated',
    responses: { 200: { description: 'Template', schema: ref('Template') }, 404: E404 },
    handler: async (rc) => {
      const t = templateById(rc.params.templateId)
      if (!t) throw notFound(`No template ${rc.params.templateId}.`)
      return { body: t }
    },
  })

  // ---- members ------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/members',
    operationId: 'listMembers',
    tag: 'Members',
    summary: 'Members and roles (the platform membership is the single authorization source)',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Members', schema: Type.Array(ref('Member')) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => services.memberships.list(ctx.db, rc.projectId)) }),
  })
  route({
    method: 'PUT',
    path: '/projects/{projectId}/members/{userId}',
    operationId: 'setMember',
    tag: 'Members',
    summary: 'Add a member or change a role (the last administrator and the owner stay administrators)',
    params: PI('userId'),
    body: ref('SetMember') as never,
    permission: 'administer',
    idempotency: 'optional',
    responses: { 200: { description: 'Membership', schema: Type.Object({ userId: Type.String(), role: S.Role }) as never }, 403: E403, 422: E422 },
    handler: async (rc) => {
      if (rc.provenance.sourceKind === 'assistant') throw invalid('Membership changes are a person’s decision; the assistant may not apply them.', { 'X-Source-Kind': 'assistant' }, 403)
      return rc.write(async (ctx) => ({ body: await setMember(ctx, rc.projectId, rc.params.userId, (rc.body as { role: Role }).role) }))
    },
  })
  route({
    method: 'DELETE',
    path: '/projects/{projectId}/members/{userId}',
    operationId: 'removeMember',
    tag: 'Members',
    summary: 'Remove a member',
    params: PI('userId'),
    permission: 'administer',
    idempotency: 'optional',
    responses: { 204: { description: 'Removed' }, 403: E403, 404: E404, 422: E422 },
    handler: async (rc) => {
      if (rc.provenance.sourceKind === 'assistant') throw invalid('Membership changes are a person’s decision; the assistant may not apply them.', { 'X-Source-Kind': 'assistant' }, 403)
      return rc.write(async (ctx) => {
        await removeMember(ctx, rc.projectId, rc.params.userId)
        return { status: 204 }
      })
    },
  })

  // ---- registry ------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/artifacts',
    operationId: 'listArtifacts',
    tag: 'Registry',
    summary: 'Artifact registry of the project (search, filter, sort)',
    params: P,
    query: Type.Object(
      {
        q: Type.Optional(Type.String({ maxLength: 200 })),
        module: Type.Optional(Type.String({ maxLength: 40 })),
        kind: Type.Optional(Type.String({ maxLength: 60 })),
        category: Type.Optional(Type.String({ maxLength: 40 })),
        lifecycle: Type.Optional(Type.String({ maxLength: 20 })),
        availability: Type.Optional(Type.String({ maxLength: 30 })),
        sort: Type.Optional(Type.String({ pattern: '^-?(title|key|modified|created)$' })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
        cursor: Type.Optional(Type.String({ maxLength: 100 })),
      },
      { additionalProperties: false },
    ),
    permission: 'read',
    responses: { 200: { description: 'A page of registry records', schema: ref('ArtifactPage') } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listArtifacts(ctx, rc.query as never)) }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/artifacts/{artifactId}',
    operationId: 'getArtifact',
    tag: 'Registry',
    summary: 'A registry record with its links (both directions)',
    params: PI('artifactId'),
    permission: 'read',
    responses: { 200: { description: 'The record', schema: Type.Intersect([ref('Artifact'), Type.Object({ links: Type.Array(ref('Link')) })]) as never }, 404: E404 },
    handler: async (rc) =>
      rc.read(async (ctx) => {
        const a = artifactJson(await loadArtifact(ctx, rc.params.artifactId))
        return { etag: a.revision, body: { ...a, links: await listLinks(ctx, { artifactId: a.artifactId }) } }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/artifacts/{artifactId}/history',
    operationId: 'artifactHistory',
    tag: 'Registry',
    summary: 'Observations of a registry record (versions seen, lifecycle, availability); module history stays in the module',
    params: PI('artifactId'),
    permission: 'read',
    responses: { 200: { description: 'Newest first', schema: Type.Array(Type.Object({ recordRevision: Type.Integer(), version: Type.String(), lifecycle: Type.String(), availability: Type.String(), observedAt: Type.String(), via: Type.String(), actor: Type.String() })) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => artifactHistory(ctx, rc.params.artifactId)) }),
  })

  // ---- links ---------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/links',
    operationId: 'listLinks',
    tag: 'Links',
    summary: 'Links owned by Project Management',
    params: P,
    query: Type.Object(
      { artifactId: Type.Optional(Type.String({ format: 'uuid' })), direction: Type.Optional(Type.Union([Type.Literal('out'), Type.Literal('in'), Type.Literal('both')])), type: Type.Optional(Type.String({ maxLength: 60 })), includeRemoved: Type.Optional(Type.Boolean()) },
      { additionalProperties: false },
    ),
    permission: 'read',
    responses: { 200: { description: 'Links', schema: Type.Array(ref('Link')) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listLinks(ctx, rc.query as never)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/links',
    operationId: 'createLink',
    tag: 'Links',
    summary: 'Create a link (validated by the link rules; meanings owned by a module are refused)',
    params: P,
    query: DryRunQ,
    body: ref('CreateLink') as never,
    permission: 'edit',
    dryRun: true,
    idempotency: 'optional',
    responses: { 201: { description: 'Created', schema: ref('Link') }, 409: err('Same link exists'), 422: E422 },
    handler: async (rc) => rc.write(async (ctx) => ({ status: 201, body: await createLink(ctx, rc.body as never) })),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/links/{linkId}/remove',
    operationId: 'removeLink',
    tag: 'Links',
    summary: 'Remove a link (recorded; never deleted)',
    params: PI('linkId'),
    body: ref('RemoveLink') as never,
    permission: 'edit',
    idempotency: 'optional',
    responses: { 200: { description: 'Removed', schema: ref('Link') }, 404: E404, 422: E422 },
    handler: async (rc) => rc.write(async (ctx) => ({ body: await removeLink(ctx, rc.params.linkId, (rc.body as { reason: string }).reason) })),
  })

  // ---- work items ----------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/work-items',
    operationId: 'listWorkItems',
    tag: 'Work items',
    summary: 'Tasks, issues and risks',
    params: P,
    query: Type.Object(
      {
        kind: Type.Optional(Type.Union([Type.Literal('task'), Type.Literal('issue'), Type.Literal('risk')])),
        status: Type.Optional(Type.String({ maxLength: 40 })),
        open: Type.Optional(Type.Boolean()),
        assignee: Type.Optional(Type.String({ maxLength: 64 })),
        priority: Type.Optional(Type.String({ maxLength: 20 })),
        milestone: Type.Optional(Type.String({ format: 'uuid' })),
        subject: Type.Optional(Type.String({ format: 'uuid', description: 'Artifact ID the work items concern' })),
        q: Type.Optional(Type.String({ maxLength: 200 })),
        sort: Type.Optional(Type.String({ pattern: '^-?(key|updated|due|priority|title)$' })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
        cursor: Type.Optional(Type.String({ maxLength: 100 })),
      },
      { additionalProperties: false },
    ),
    permission: 'read',
    responses: { 200: { description: 'A page of work items', schema: ref('WorkItemPage') } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listWorkItems(ctx, rc.query as never)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/work-items',
    operationId: 'createWorkItem',
    tag: 'Work items',
    summary: 'Create a task, issue or risk, optionally about artifacts (subject-of links, same transaction)',
    params: P,
    query: DryRunQ,
    body: ref('CreateWorkItem') as never,
    permission: 'edit',
    dryRun: true,
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: ref('WorkItem') }, 200: { description: 'Dry run', schema: ref('DryRun') }, 403: E403, 422: E422 },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const w = await createWorkItem(ctx, rc.body as never)
        return { status: 201, etag: w.revision, body: w }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/work-items/{workItemId}',
    operationId: 'getWorkItem',
    tag: 'Work items',
    summary: 'A work item',
    params: PI('workItemId'),
    permission: 'read',
    responses: { 200: { description: 'The work item', schema: ref('WorkItem') }, 404: E404 },
    handler: async (rc) => {
      const w = await rc.read((ctx) => getWorkItem(ctx, rc.params.workItemId))
      return { etag: w.revision, body: w }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/work-items/{workItemId}',
    operationId: 'updateWorkItem',
    tag: 'Work items',
    summary: 'Edit a work item; status changes follow the rules per kind (accepting a risk needs a reviewer and a rationale)',
    params: PI('workItemId'),
    query: DryRunQ,
    body: ref('UpdateWorkItem') as never,
    permission: 'edit',
    concurrency: 'Required: If-Match "<revision>" or expectedRevision',
    dryRun: true,
    idempotency: 'optional',
    responses: { 200: { description: 'Updated', schema: ref('WorkItem') }, 403: E403, 409: E409, 422: E422 },
    handler: async (rc) => {
      const { expectedRevision, ...input } = rc.body as { expectedRevision?: number } & Record<string, unknown>
      const expected = rc.expected(expectedRevision)
      return rc.write(async (ctx) => {
        const w = await updateWorkItem(ctx, rc.params.workItemId, expected, input as never)
        return { etag: w.revision, body: w }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/work-items/{workItemId}/history',
    operationId: 'workItemHistory',
    tag: 'Work items',
    summary: 'Immutable revisions of a work item',
    params: PI('workItemId'),
    permission: 'read',
    responses: { 200: { description: 'Newest first', schema: Type.Array(Type.Object({ revision: Type.Integer(), changedAt: Type.String(), changedBy: Type.String(), snapshot: Type.Unknown() })) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => workItemHistory(ctx, rc.params.workItemId)) }),
  })

  // ---- milestones -----------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/milestones',
    operationId: 'listMilestones',
    tag: 'Milestones',
    summary: 'Milestones by due date',
    params: P,
    permission: 'read',
    responses: { 200: { description: 'Milestones', schema: Type.Array(ref('Milestone')) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listMilestones(ctx)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/milestones',
    operationId: 'createMilestone',
    tag: 'Milestones',
    summary: 'Create a milestone (deliverables: artifact IDs, delivers links)',
    params: P,
    query: DryRunQ,
    body: ref('CreateMilestone') as never,
    permission: 'edit',
    dryRun: true,
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: ref('Milestone') }, 422: E422 },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const m = await createMilestone(ctx, rc.body as never)
        return { status: 201, etag: m.revision, body: m }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/milestones/{milestoneId}',
    operationId: 'getMilestone',
    tag: 'Milestones',
    summary: 'A milestone',
    params: PI('milestoneId'),
    permission: 'read',
    responses: { 200: { description: 'The milestone', schema: ref('Milestone') }, 404: E404 },
    handler: async (rc) => {
      const m = await rc.read((ctx) => getMilestone(ctx, rc.params.milestoneId))
      return { etag: m.revision, body: m }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/milestones/{milestoneId}',
    operationId: 'updateMilestone',
    tag: 'Milestones',
    summary: 'Edit a milestone (achieving one with open work returns warnings, never refuses)',
    params: PI('milestoneId'),
    body: ref('UpdateMilestone') as never,
    permission: 'edit',
    concurrency: 'Required: If-Match "<revision>" or expectedRevision',
    idempotency: 'optional',
    responses: { 200: { description: 'Updated', schema: ref('Milestone') }, 409: E409, 422: E422 },
    handler: async (rc) => {
      const { expectedRevision, ...input } = rc.body as { expectedRevision?: number } & Record<string, unknown>
      const expected = rc.expected(expectedRevision)
      return rc.write(async (ctx) => {
        const m = await updateMilestone(ctx, rc.params.milestoneId, expected, input as never)
        return { etag: m.revision, body: m }
      })
    },
  })

  // ---- documents ------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/documents',
    operationId: 'listDocuments',
    tag: 'Documents',
    summary: 'Documents and attachments',
    params: P,
    query: Type.Object({ q: Type.Optional(Type.String({ maxLength: 200 })), documentKind: Type.Optional(Type.String({ maxLength: 40 })), lifecycle: Type.Optional(Type.String({ maxLength: 20 })) }, { additionalProperties: false }),
    permission: 'read',
    responses: { 200: { description: 'Documents', schema: Type.Array(ref('Document')) as never } },
    handler: async (rc) => ({ body: await rc.read((ctx) => listDocuments(ctx, rc.query as never)) }),
  })
  route({
    method: 'POST',
    path: '/projects/{projectId}/documents',
    operationId: 'createDocument',
    tag: 'Documents',
    summary: 'Create a document record (content is uploaded as versions)',
    params: P,
    body: ref('CreateDocument') as never,
    permission: 'edit',
    idempotency: 'required',
    responses: { 201: { description: 'Created', schema: ref('Document') }, 422: E422 },
    handler: async (rc) =>
      rc.write(async (ctx) => {
        const d = await createDocument(ctx, rc.body as never)
        return { status: 201, etag: d.revision, body: d }
      }),
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/documents/{documentId}',
    operationId: 'getDocument',
    tag: 'Documents',
    summary: 'A document with its versions',
    params: PI('documentId'),
    permission: 'read',
    responses: { 200: { description: 'The document', schema: ref('Document') }, 404: E404 },
    handler: async (rc) => {
      const d = await rc.read((ctx) => getDocument(ctx, rc.params.documentId))
      return { etag: d.revision, body: d }
    },
  })
  route({
    method: 'PATCH',
    path: '/projects/{projectId}/documents/{documentId}',
    operationId: 'updateDocument',
    tag: 'Documents',
    summary: 'Edit document metadata or lifecycle (release needs a reviewer)',
    params: PI('documentId'),
    body: ref('UpdateDocument') as never,
    permission: 'edit',
    concurrency: 'Required: If-Match "<revision>" or expectedRevision',
    idempotency: 'optional',
    responses: { 200: { description: 'Updated', schema: ref('Document') }, 403: E403, 409: E409, 422: E422 },
    handler: async (rc) => {
      const { expectedRevision, ...input } = rc.body as { expectedRevision?: number } & Record<string, unknown>
      const expected = rc.expected(expectedRevision)
      return rc.write(async (ctx) => {
        const d = await updateDocument(ctx, rc.params.documentId, expected, input as never)
        return { etag: d.revision, body: d }
      })
    },
  })
  // Uploads are raw bytes of any type: registered in a child scope whose only parser keeps the body as a Buffer.
  const uploadRoute = (spec: RouteSpec) =>
    void app.register(async (child) => {
      child.removeAllContentTypeParsers()
      child.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: maxUpload + 1024 }, (_request, body, done) => done(null, body))
      registerRoute(child, services, spec, registry)
    })
  uploadRoute({
    method: 'POST',
    path: '/projects/{projectId}/documents/{documentId}/versions',
    operationId: 'uploadDocumentVersion',
    tag: 'Documents',
    summary: 'Upload a new immutable version (raw bytes)',
    description: `Body: the file's bytes (any content type). Headers: X-File-Name (required), If-Match (document revision), optional Content-Digest \`sha-256=:<base64>:\` (verified), optional X-Version-Note. Limit ${maxUpload} bytes.`,
    params: PI('documentId'),
    rawBody: { mediaType: 'application/octet-stream', description: 'The file content' },
    permission: 'edit',
    concurrency: 'Required: If-Match "<document revision>"',
    idempotency: 'optional',
    responses: { 201: { description: 'The document with the new version', schema: ref('Document') }, 409: E409, 413: err('Too large'), 422: E422 },
    handler: async (rc) => {
      const bytes = rc.body
      if (!Buffer.isBuffer(bytes)) throw invalid('Send the file content as the request body.', { body: 'required' }, 400)
      const fileName = decodeURIComponent(String(rc.request.headers['x-file-name'] ?? ''))
      if (!fileName) throw invalid('X-File-Name is required.', { 'X-File-Name': 'required' }, 400)
      const digest = String(rc.request.headers['content-digest'] ?? '')
      let expectedSha256: string | undefined
      if (digest) {
        const m = /sha-256=:([A-Za-z0-9+/=]+):/.exec(digest)
        if (!m) throw invalid('Content-Digest must be sha-256=:<base64>: (RFC 9530).', { 'Content-Digest': 'malformed' }, 400)
        expectedSha256 = Buffer.from(m[1], 'base64').toString('hex')
      }
      const expected = rc.expected(undefined, 'If-Match')
      const mediaType = String(rc.request.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream'
      return rc.write(async (ctx) => {
        const d = await addDocumentVersion(ctx, rc.params.documentId, expected, { bytes: new Uint8Array(bytes), fileName, mediaType, note: rc.request.headers['x-version-note'] ? decodeURIComponent(String(rc.request.headers['x-version-note'])) : '', expectedSha256, maxBytes: maxUpload })
        return { status: 201, etag: d.revision, body: d }
      })
    },
  })
  route({
    method: 'GET',
    path: '/projects/{projectId}/documents/{documentId}/versions/{version}/content',
    operationId: 'downloadDocumentVersion',
    tag: 'Documents',
    summary: 'Download a version (hash verified on read)',
    params: Type.Object({ projectId: Type.String(), documentId: Type.String(), version: Type.Integer({ minimum: 1 }) }),
    permission: 'read',
    responses: { 200: { description: 'The bytes', contentType: 'application/octet-stream' }, 404: E404, 503: err('Stored content missing or corrupt') },
    handler: async (rc) => {
      const { bytes, version } = await rc.read((ctx) => readDocumentVersion(ctx, rc.params.documentId, Number(rc.params.version)))
      return {
        bytes,
        contentType: version.mediaType,
        headers: { ETag: `"sha256-${version.sha256}"`, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(version.fileName)}`, 'Cache-Control': 'private, max-age=0' },
      }
    },
  })

  // ---- activity -------------------------------------------------------------------------------------------
  route({
    method: 'GET',
    path: '/projects/{projectId}/activity',
    operationId: 'listActivity',
    tag: 'Activity',
    summary: 'Audit events of the project, newest first (module audits stay in the modules)',
    params: P,
    query: Type.Object(
      { entityType: Type.Optional(Type.String({ maxLength: 30 })), entityId: Type.Optional(Type.String({ maxLength: 100 })), actor: Type.Optional(Type.String({ maxLength: 64 })), before: Type.Optional(Type.Integer({ minimum: 1 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
      { additionalProperties: false },
    ),
    permission: 'read',
    anyState: true,
    responses: { 200: { description: 'Audit events', schema: Type.Array(ref('ActivityEntry')) as never } },
    handler: async (rc) => {
      const q = rc.query as { entityType?: string; entityId?: string; actor?: string; before?: number; limit?: number }
      return {
        body: await rc.read(async (ctx) => {
          const params: unknown[] = [rc.projectId]
          const where = ['project_id = $1']
          if (q.entityType) where.push(`entity_type = $${params.push(q.entityType)}`)
          if (q.entityId) where.push(`entity_id = $${params.push(q.entityId)}`)
          if (q.actor) where.push(`actor = $${params.push(q.actor)}`)
          if (q.before) where.push(`id < $${params.push(q.before)}`)
          const { rows } = await ctx.db.query(`SELECT * FROM projects.audit_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${Math.min(q.limit ?? 50, 200)}`, params)
          return rows.map(activityJson as never)
        }),
      }
    },
  })
}
