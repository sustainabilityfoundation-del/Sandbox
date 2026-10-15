import { Type, type TSchema } from '@sinclair/typebox'
import { ARTIFACT_CATEGORIES, ARTIFACT_LIFECYCLES } from '@ews/platform-sdk'
import { DISCIPLINES, DOCUMENT_KINDS, DOCUMENT_LIFECYCLES, LINK_TYPES, MILESTONE_STATUSES, PRIORITIES, PROJECT_STATES, PROJECT_STATUSES, ROLES, WORK_ITEM_KINDS } from '../domain/rules'

/** Request and response schemas (TypeBox → JSON Schema, published as OpenAPI components by `$id`). */
const L = (...values: readonly string[]) => Type.Union(values.map((v) => Type.Literal(v)))
const Nullable = <T extends TSchema>(t: T) => Type.Union([t, Type.Null()])
const DateTime = Type.String({ format: 'date-time' })
const Day = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' })
const SettingValue = Type.Union([Type.Boolean(), Type.Number(), Type.String({ maxLength: 1000 }), Type.Null()])

export const Role = L(...ROLES)
export const ProjectStatus = L(...PROJECT_STATUSES)
export const ProjectState = L(...PROJECT_STATES)
export const Discipline = L(...DISCIPLINES)

export const ErrorSchema = Type.Object(
  { error: Type.Object({ code: L('invalid', 'unauthenticated', 'forbidden', 'not-found', 'conflict', 'unavailable'), message: Type.String(), details: Type.Optional(Type.Record(Type.String(), Type.Unknown())) }) },
  { $id: 'Error' },
)

export const Project = Type.Object(
  {
    id: Type.String(),
    key: Type.String(),
    name: Type.String(),
    description: Type.String(),
    objectives: Type.Array(Type.String()),
    scope: Type.String(),
    disciplines: Type.Array(Type.String()),
    status: ProjectStatus,
    state: ProjectState,
    templateId: Type.String(),
    ownerId: Type.String(),
    tags: Type.Array(Type.String()),
    legacy: Type.Boolean(),
    archivedAt: Type.Optional(DateTime),
    deletedAt: Type.Optional(DateTime),
    purgeAfter: Type.Optional(DateTime),
    createdAt: DateTime,
    createdBy: Type.String(),
    updatedAt: DateTime,
    updatedBy: Type.String(),
    revision: Type.Integer({ minimum: 1 }),
    role: Type.Optional(Nullable(Type.String())),
    openedAt: Type.Optional(DateTime),
    counts: Type.Optional(Type.Object({ members: Type.Integer(), artifacts: Type.Integer(), openWorkItems: Type.Integer(), milestones: Type.Integer(), documents: Type.Integer() })),
  },
  { $id: 'Project' },
)

export const ProjectPage = Type.Object({ items: Type.Array(Type.Ref('Project')), nextCursor: Type.Optional(Type.String()), total: Type.Integer() }, { $id: 'ProjectPage' })

export const CreateProject = Type.Object(
  {
    key: Type.String({ minLength: 2, maxLength: 20, description: 'Display key, e.g. EEP; letters, digits, hyphens; stored upper-case' }),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.Optional(Type.String({ maxLength: 20000 })),
    objectives: Type.Optional(Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 50 })),
    scope: Type.Optional(Type.String({ maxLength: 20000 })),
    disciplines: Type.Optional(Type.Array(Discipline, { maxItems: 20 })),
    status: Type.Optional(ProjectStatus),
    templateId: Type.Optional(Type.String({ maxLength: 60 })),
    tags: Type.Optional(Type.Array(Type.String({ maxLength: 60 }), { maxItems: 30 })),
    settings: Type.Optional(Type.Record(Type.String({ pattern: '^projects\\.[a-z0-9.-]+$' }), SettingValue, { description: 'Initial project settings (projects.* IDs); written through the settings service' })),
    modules: Type.Optional(Type.Array(Type.String({ pattern: '^[a-z][a-z0-9-]{0,39}$' }), { maxItems: 50 })),
    members: Type.Optional(Type.Array(Type.Object({ userId: Type.String({ minLength: 1, maxLength: 64 }), role: Role }, { additionalProperties: false }), { maxItems: 200 })),
    milestones: Type.Optional(Type.Array(Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }), due: Type.Optional(Day) }, { additionalProperties: false }), { maxItems: 50 })),
  },
  {
    additionalProperties: false,
    $id: 'CreateProject',
    examples: [{ key: 'EEP', name: 'Example Engineering Product', description: 'A product developed from first principles.', disciplines: ['mechanical', 'systems'], templateId: 'blank', settings: { 'projects.units.system': 'si' } }],
  },
)

export const UpdateProject = Type.Object(
  {
    expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    key: Type.Optional(Type.String({ minLength: 2, maxLength: 20 })),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    description: Type.Optional(Type.String({ maxLength: 20000 })),
    objectives: Type.Optional(Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 50 })),
    scope: Type.Optional(Type.String({ maxLength: 20000 })),
    disciplines: Type.Optional(Type.Array(Discipline, { maxItems: 20 })),
    status: Type.Optional(ProjectStatus),
    tags: Type.Optional(Type.Array(Type.String({ maxLength: 60 }), { maxItems: 30 })),
    ownerId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false, $id: 'UpdateProject' },
)

export const Transition = Type.Object({ reason: Type.Optional(Type.String({ maxLength: 2000 })) }, { additionalProperties: false, $id: 'Transition' })

export const Template = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    description: Type.String(),
    content: Type.Literal('blank'),
    disciplines: Type.Array(Type.String()),
    settings: Type.Record(Type.String(), SettingValue),
    milestones: Type.Array(Type.Object({ name: Type.String(), offsetDays: Type.Optional(Type.Integer()) })),
    workItems: Type.Array(Type.Object({ kind: Type.Literal('task'), title: Type.String() })),
    builtIn: Type.Boolean(),
    version: Type.Integer(),
  },
  { $id: 'Template' },
)

export const ModuleState = Type.Object({ module: Type.String(), enabled: Type.Boolean(), status: Type.String(), attempts: Type.Integer(), lastError: Type.Optional(Type.String()), updatedAt: DateTime }, { $id: 'ModuleState' })

export const ProjectContext = Type.Object(
  {
    project: Type.Ref('Project'),
    role: Role,
    permissions: Type.Array(Type.String()),
    modules: Type.Array(Type.Ref('ModuleState')),
    settings: Type.Object({ available: Type.Boolean(), source: Type.String(), values: Type.Record(Type.String(), SettingValue), requested: Type.Record(Type.String(), SettingValue) }),
    creation: Nullable(Type.Object({ templateId: Type.String(), templateVersion: Type.Integer(), requested: Type.Record(Type.String(), Type.Unknown()), duplicatedFrom: Nullable(Type.String()), createdAt: DateTime, createdBy: Type.String() })),
  },
  { $id: 'ProjectContext' },
)

export const Member = Type.Object({ userId: Type.String(), name: Type.String(), role: Role }, { $id: 'Member' })
export const SetMember = Type.Object({ role: Role }, { additionalProperties: false, $id: 'SetMember' })

export const Artifact = Type.Object(
  {
    artifactId: Type.String({ format: 'uuid' }),
    projectId: Type.String(),
    ref: Type.Object({ module: Type.String(), kind: Type.String(), id: Type.String() }),
    key: Type.String(),
    title: Type.String(),
    kind: Type.String(),
    category: L(...ARTIFACT_CATEGORIES),
    ownerModule: Type.String(),
    lifecycle: L(...ARTIFACT_LIFECYCLES),
    moduleState: Type.Optional(Type.String()),
    version: Type.Object({ value: Type.Union([Type.Integer(), Type.String()]), label: Type.Optional(Type.String()), at: DateTime }),
    createdAt: DateTime,
    createdBy: Type.String(),
    modifiedAt: DateTime,
    modifiedBy: Type.String(),
    confirmedAt: DateTime,
    availability: L('available', 'module-unavailable', 'missing-in-module'),
    source: Type.String(),
    containerId: Type.Optional(Type.String()),
    open: Type.Optional(Type.Object({ toolId: Type.String(), params: Type.Record(Type.String(), Type.String()) })),
    revision: Type.Integer(),
  },
  { $id: 'Artifact' },
)

export const ArtifactPage = Type.Object({ items: Type.Array(Type.Ref('Artifact')), nextCursor: Type.Optional(Type.String()), total: Type.Integer() }, { $id: 'ArtifactPage' })

const ArtifactBrief = Type.Object({ artifactId: Type.String(), key: Type.String(), title: Type.String(), kind: Type.String(), category: Type.String(), availability: Type.String() })
const LinkEnd = Type.Object({ artifactId: Type.String({ format: 'uuid' }), revision: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Integer()])) }, { additionalProperties: false })

export const Link = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    projectId: Type.String(),
    type: Type.String(),
    from: Type.Object({ artifactId: Type.String(), revision: Type.Optional(Type.String()) }),
    to: Type.Object({ artifactId: Type.String(), revision: Type.Optional(Type.String()) }),
    note: Type.String(),
    createdAt: DateTime,
    createdBy: Type.String(),
    sourceKind: Type.String(),
    removedAt: Type.Optional(DateTime),
    removedBy: Type.Optional(Nullable(Type.String())),
    removalReason: Type.Optional(Type.String()),
    impact: Type.Boolean(),
    revision: Type.Integer(),
    fromArtifact: Type.Optional(ArtifactBrief),
    toArtifact: Type.Optional(ArtifactBrief),
  },
  { $id: 'Link' },
)

export const CreateLink = Type.Object({ type: Type.String({ minLength: 1, maxLength: 60, description: `One of ${LINK_TYPES.join(', ')}` }), from: LinkEnd, to: LinkEnd, note: Type.Optional(Type.String({ maxLength: 2000 })) }, { additionalProperties: false, $id: 'CreateLink' })
export const RemoveLink = Type.Object({ reason: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false, $id: 'RemoveLink' })

const RiskInput = Type.Object(
  { likelihood: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })), impact: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })), mitigation: Type.Optional(Type.String({ maxLength: 5000 })), response: Type.Optional(L('avoid', 'mitigate', 'transfer', 'accept')) },
  { additionalProperties: false },
)
const IssueInput = Type.Object({ severity: Type.Optional(L('minor', 'major', 'critical')), detectedIn: Type.Optional(Type.String({ maxLength: 300 })), resolution: Type.Optional(Type.String({ maxLength: 5000 })) }, { additionalProperties: false })

const workItemFields = {
  title: Type.String({ minLength: 1, maxLength: 300 }),
  description: Type.Optional(Type.String({ maxLength: 20000 })),
  status: Type.Optional(Type.String({ maxLength: 40 })),
  statusNote: Type.Optional(Type.String({ maxLength: 5000, description: 'Recorded with a status change (risk acceptance rationale, issue resolution)' })),
  priority: Type.Optional(L(...PRIORITIES)),
  assigneeId: Type.Optional(Nullable(Type.String({ maxLength: 64 }))),
  due: Type.Optional(Nullable(Day)),
  milestoneId: Type.Optional(Nullable(Type.String({ format: 'uuid' }))),
  risk: Type.Optional(RiskInput),
  issue: Type.Optional(IssueInput),
  subjects: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { maxItems: 100, description: 'Artifact IDs the work item concerns (subject-of links)' })),
}

export const CreateWorkItem = Type.Object({ kind: L(...WORK_ITEM_KINDS), ...workItemFields }, { additionalProperties: false, $id: 'CreateWorkItem', examples: [{ kind: 'task', title: 'Check the housing wall thickness', priority: 'high' }] })
export const UpdateWorkItem = Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), ...workItemFields, title: Type.Optional(workItemFields.title) }, { additionalProperties: false, $id: 'UpdateWorkItem' })

export const WorkItem = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    projectId: Type.String(),
    key: Type.String(),
    kind: L(...WORK_ITEM_KINDS),
    title: Type.String(),
    description: Type.String(),
    status: Type.String(),
    closed: Type.Boolean(),
    priority: L(...PRIORITIES),
    assigneeId: Type.Optional(Type.String()),
    due: Type.Optional(Type.String()),
    milestoneId: Type.Optional(Type.String()),
    risk: Type.Optional(Type.Object({ likelihood: Type.Integer(), impact: Type.Integer(), mitigation: Type.String(), response: Type.String(), score: Type.Integer() })),
    issue: Type.Optional(Type.Object({ severity: Type.String(), detectedIn: Type.Optional(Type.String()), resolution: Type.Optional(Type.String()) })),
    statusNote: Type.Optional(Type.String()),
    artifactId: Type.Optional(Type.String()),
    subjects: Type.Array(Type.String()),
    sourceKind: Type.String(),
    createdAt: DateTime,
    createdBy: Type.String(),
    updatedAt: DateTime,
    updatedBy: Type.String(),
    revision: Type.Integer(),
    warnings: Type.Optional(Type.Array(Type.String())),
  },
  { $id: 'WorkItem' },
)

export const WorkItemPage = Type.Object({ items: Type.Array(Type.Ref('WorkItem')), nextCursor: Type.Optional(Type.String()), total: Type.Integer() }, { $id: 'WorkItemPage' })

export const Milestone = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    projectId: Type.String(),
    key: Type.String(),
    name: Type.String(),
    description: Type.String(),
    due: Type.Optional(Type.String()),
    status: L(...MILESTONE_STATUSES),
    artifactId: Type.Optional(Type.String()),
    createdAt: DateTime,
    createdBy: Type.String(),
    updatedAt: DateTime,
    updatedBy: Type.String(),
    revision: Type.Integer(),
    warnings: Type.Optional(Type.Array(Type.String())),
  },
  { $id: 'Milestone' },
)
const milestoneFields = {
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 20000 })),
  due: Type.Optional(Day),
  status: Type.Optional(L(...MILESTONE_STATUSES)),
  deliverables: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { maxItems: 200 })),
}
export const CreateMilestone = Type.Object(milestoneFields, { additionalProperties: false, $id: 'CreateMilestone' })
export const UpdateMilestone = Type.Object({ expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), ...milestoneFields, name: Type.Optional(milestoneFields.name), due: Type.Optional(Nullable(Day)) }, { additionalProperties: false, $id: 'UpdateMilestone' })

const DocumentVersion = Type.Object({ version: Type.Integer(), fileName: Type.String(), mediaType: Type.String(), byteSize: Type.Integer(), sha256: Type.String(), note: Type.String(), uploadedAt: DateTime, uploadedBy: Type.String() })
export const Document = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    projectId: Type.String(),
    key: Type.String(),
    title: Type.String(),
    description: Type.String(),
    documentKind: L(...DOCUMENT_KINDS),
    lifecycle: L(...DOCUMENT_LIFECYCLES),
    currentVersion: Type.Integer(),
    artifactId: Type.Optional(Type.String()),
    versions: Type.Optional(Type.Array(DocumentVersion)),
    createdAt: DateTime,
    createdBy: Type.String(),
    updatedAt: DateTime,
    updatedBy: Type.String(),
    revision: Type.Integer(),
  },
  { $id: 'Document' },
)
export const CreateDocument = Type.Object(
  { title: Type.String({ minLength: 1, maxLength: 300 }), description: Type.Optional(Type.String({ maxLength: 20000 })), documentKind: Type.Optional(L(...DOCUMENT_KINDS)), subjects: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { maxItems: 100 })) },
  { additionalProperties: false, $id: 'CreateDocument' },
)
export const UpdateDocument = Type.Object(
  { expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })), title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })), description: Type.Optional(Type.String({ maxLength: 20000 })), documentKind: Type.Optional(L(...DOCUMENT_KINDS)), lifecycle: Type.Optional(L(...DOCUMENT_LIFECYCLES)) },
  { additionalProperties: false, $id: 'UpdateDocument' },
)

export const ActivityEntry = Type.Object(
  { id: Type.Integer(), entityType: Type.String(), entityId: Type.String(), action: Type.String(), revision: Nullable(Type.Integer()), actor: Type.String(), occurredAt: DateTime, reason: Type.String(), sourceKind: Type.String(), conversationId: Type.Optional(Type.String()), proposalId: Type.Optional(Type.String()), details: Type.Record(Type.String(), Type.Unknown()) },
  { $id: 'ActivityEntry' },
)

export const ProjectsEvent = Type.Object({ eventId: Type.String(), type: Type.String(), projectId: Type.String(), entityId: Type.String(), committedRevision: Type.Integer(), occurredAt: DateTime, actor: Type.String() }, { $id: 'ProjectsEvent' })

export const DryRun = Type.Object({ dryRun: Type.Literal(true), result: Type.Unknown() }, { $id: 'DryRun' })

export const SCHEMAS: TSchema[] = [
  ErrorSchema,
  Project,
  ProjectPage,
  CreateProject,
  UpdateProject,
  Transition,
  Template,
  ModuleState,
  ProjectContext,
  Member,
  SetMember,
  Artifact,
  ArtifactPage,
  Link,
  CreateLink,
  RemoveLink,
  CreateWorkItem,
  UpdateWorkItem,
  WorkItem,
  WorkItemPage,
  Milestone,
  CreateMilestone,
  UpdateMilestone,
  Document,
  CreateDocument,
  UpdateDocument,
  ActivityEntry,
  ProjectsEvent,
  DryRun,
]
