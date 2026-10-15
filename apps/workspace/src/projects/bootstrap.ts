import { create } from 'zustand'
import type { EngineeringRepository } from '@ews/model-service'
import { PROJECT_ID } from '@ews/model-service'
import type { CurrentProject, ProjectsService } from '@ews/platform-sdk'
import { getProjectsClient, type ProjectContext } from '@ews/projects-client'
import { currentProjectId, isLegacyProject } from './currentProject'

/**
 * Opening the window's project (CR-PM-WS-1). With Project Management available the project is opened through its
 * API (recorded as recently opened, provisioning retried), its twin is ensured (empty for a new project, never
 * seeded) and the workspace opens the project's default tools (C12). The example project PRJ-ACT100 keeps working
 * without the API (demo mode, outage) exactly as before.
 */
export interface OpenedProject {
  current: CurrentProject
  legacy: boolean
  defaultTools: string[]
  context: ProjectContext | null
}

interface CurrentProjectState {
  opened: OpenedProject | null
  /** Why Project Management could not be reached for the example project (shown, never hidden). */
  warning: string | null
}

export const useCurrentProject = create<CurrentProjectState>()(() => ({ opened: null, warning: null }))

export class ProjectOpenError extends Error {
  constructor(
    message: string,
    readonly projectId: string,
  ) {
    super(message)
    this.name = 'ProjectOpenError'
  }
}

export async function openCurrentProject(options: { repository: EngineeringRepository; projects?: ProjectsService; legacyTools: string[] }): Promise<OpenedProject> {
  const projectId = currentProjectId
  const legacy = isLegacyProject(projectId)
  const client = options.projects ? getProjectsClient(options.projects) : undefined
  let context: ProjectContext | null = null
  let warning: string | null = null
  if (client) {
    try {
      context = await client.openProject(projectId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (!legacy) throw new ProjectOpenError(`Project ${projectId} could not be opened: ${message}`, projectId)
      warning = `Project Management is not available (${message}); the example project opens from this browser as before.`
    }
  } else if (!legacy) {
    throw new ProjectOpenError(`Project ${projectId} needs the Project Management API, which is not available in demo mode.`, projectId)
  }
  if (!legacy && context) await options.repository.ensureProject?.({ id: projectId, name: context.project.name })
  const opened: OpenedProject = {
    current: context
      ? { projectId, key: context.project.key, name: context.project.name, role: context.role }
      : { projectId: PROJECT_ID, key: 'ACT100', name: 'ACT-100 Linear actuator', role: 'reader' },
    legacy,
    defaultTools: legacy ? options.legacyTools : (context?.workspace.defaultTools ?? options.legacyTools),
    context,
  }
  useCurrentProject.setState({ opened, warning })
  return opened
}
