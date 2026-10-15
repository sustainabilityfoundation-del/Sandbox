/**
 * Types of the Project Management API (mirror services/projects/src/http/schemas.ts and productRoutes.ts; change
 * both together). The OpenAPI document at /api/projects/v1/openapi.json is authoritative.
 */
import type { ArtifactCategory, ArtifactLifecycle, NativeRef, ProjectLifecycleStatus, ProjectRecordState, ProjectRole } from '@ews/platform-sdk'

export type SettingValue = boolean | number | string | null

export interface Project {
  id: string
  key: string
  name: string
  description: string
  objectives: string[]
  scope: string
  disciplines: string[]
  status: ProjectLifecycleStatus
  state: ProjectRecordState
  templateId: string
  ownerId: string
  tags: string[]
  legacy: boolean
  archivedAt?: string
  deletedAt?: string
  purgeAfter?: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  revision: number
  role?: ProjectRole | null
  openedAt?: string
  counts?: { members: number; artifacts: number; openWorkItems: number; milestones: number; documents: number }
}

export interface CreateProjectInput {
  key: string
  name: string
  description?: string
  objectives?: string[]
  scope?: string
  disciplines?: string[]
  status?: ProjectLifecycleStatus
  templateId?: string
  tags?: string[]
  settings?: Record<string, SettingValue>
  modules?: string[]
  members?: { userId: string; role: ProjectRole }[]
  milestones?: { name: string; due?: string }[]
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  content: 'blank'
  disciplines: string[]
  settings: Record<string, SettingValue>
  milestones: { name: string; offsetDays?: number }[]
  workItems: { kind: 'task'; title: string }[]
  builtIn: boolean
  version: number
}

export interface ModuleState {
  module: string
  name: string
  enabled: boolean
  status: 'pending' | 'ready' | 'not-needed' | 'failed' | 'unavailable'
  reason?: string
  attempts: number
  lastError?: string
  updatedAt: string
}

export interface ProjectContext {
  project: Project
  role: ProjectRole
  permissions: string[]
  modules: ModuleState[]
  settings: { available: boolean; source: string; values: Record<string, SettingValue>; requested: Record<string, SettingValue> }
  creation: { templateId: string; templateVersion: number; requested: Record<string, unknown>; duplicatedFrom: string | null; createdAt: string; createdBy: string } | null
  workspace: { defaultTools: string[]; demoToolsLabelled: boolean }
}

export interface Member {
  userId: string
  name: string
  role: ProjectRole
}

export interface Artifact {
  artifactId: string
  projectId: string
  ref: NativeRef
  key: string
  title: string
  kind: string
  category: ArtifactCategory
  ownerModule: string
  lifecycle: ArtifactLifecycle
  moduleState?: string
  version: { value: number | string; label?: string; at: string }
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
  confirmedAt: string
  availability: 'available' | 'module-unavailable' | 'missing-in-module'
  source: string
  containerId?: string
  open?: { toolId: string; params: Record<string, string> }
  revision: number
}

export interface Link {
  id: string
  projectId: string
  type: string
  from: { artifactId: string; revision?: string }
  to: { artifactId: string; revision?: string }
  note: string
  createdAt: string
  createdBy: string
  sourceKind: string
  removedAt?: string
  impact: boolean
  revision: number
  fromArtifact?: { artifactId: string; key: string; title: string; kind: string; category: string; availability: string }
  toArtifact?: { artifactId: string; key: string; title: string; kind: string; category: string; availability: string }
}

export type WorkItemKind = 'task' | 'issue' | 'risk'

export interface WorkItem {
  id: string
  projectId: string
  key: string
  kind: WorkItemKind
  title: string
  description: string
  status: string
  closed: boolean
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigneeId?: string
  due?: string
  milestoneId?: string
  risk?: { likelihood: number; impact: number; mitigation: string; response: string; score: number }
  issue?: { severity: string; detectedIn?: string; resolution?: string }
  statusNote?: string
  artifactId?: string
  subjects: string[]
  sourceKind: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  revision: number
  warnings?: string[]
}

export interface WorkItemInput {
  kind: WorkItemKind
  title: string
  description?: string
  status?: string
  statusNote?: string
  priority?: WorkItem['priority']
  assigneeId?: string | null
  due?: string | null
  milestoneId?: string | null
  risk?: Partial<{ likelihood: number; impact: number; mitigation: string; response: 'avoid' | 'mitigate' | 'transfer' | 'accept' }>
  issue?: Partial<{ severity: 'minor' | 'major' | 'critical'; detectedIn: string; resolution: string }>
  subjects?: string[]
}

export interface Milestone {
  id: string
  projectId: string
  key: string
  name: string
  description: string
  due?: string
  status: 'planned' | 'in-progress' | 'achieved' | 'missed' | 'cancelled'
  artifactId?: string
  revision: number
  warnings?: string[]
}

export interface DocumentVersion {
  version: number
  fileName: string
  mediaType: string
  byteSize: number
  sha256: string
  note: string
  uploadedAt: string
  uploadedBy: string
}

export interface ProjectDocument {
  id: string
  projectId: string
  key: string
  title: string
  description: string
  documentKind: string
  lifecycle: ArtifactLifecycle
  currentVersion: number
  artifactId?: string
  versions?: DocumentVersion[]
  revision: number
}

export type ElementKind = 'product' | 'system' | 'subsystem' | 'assembly' | 'part' | 'other'
export type PropertyValue = string | number | boolean | string[] | { value: number; unit: string }

export interface ProductElement {
  id: string
  projectId: string
  key: string
  name: string
  elementKind: ElementKind
  description: string
  properties: Record<string, PropertyValue>
  lifecycle: string
  aliases: string[]
  artifactId?: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  revision: number
}

export interface Breakdown {
  id: string
  projectId: string
  name: string
  purpose: 'product-breakdown' | 'physical-assembly' | 'other'
  description: string
  revision: number
  createdAt: string
  createdBy: string
}

export interface BreakdownNode {
  edgeId: string
  element: ProductElement | undefined
  quantity: number | null
  children: BreakdownNode[]
}

export interface ActivityEntry {
  id: number
  entityType: string
  entityId: string
  action: string
  revision: number | null
  actor: string
  occurredAt: string
  reason: string
  sourceKind: string
  details: Record<string, unknown>
}

export interface Page<T> {
  items: T[]
  nextCursor?: string
  total: number
}
