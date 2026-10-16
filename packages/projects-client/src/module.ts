import type { ModuleManifest, PlatformModuleContribution } from '@ews/platform-sdk'
import { projectsAssistant, type ProjectsModuleHost } from './assistant'
import { PROJECTS_CAPABILITIES } from './capabilities'
import { projectsHelp } from './help'

/**
 * Project Management's client module (docs/specifications/module-registration.md, M1): its manifest (capability
 * entries) and its headless platform module (assistant operations and help). It is structurally a
 * `ClientModule` of `@ews/platform-sdk/react`; the workspace lists it in `INSTALLED_MODULES`. The AI module
 * descriptor and operation classes are policy and live in the server manifest of `@ews/projects-service`.
 */
export const PROJECTS_MANIFEST: ModuleManifest = {
  schemaVersion: 1,
  id: 'projects',
  name: 'Project Management',
  capabilities: PROJECTS_CAPABILITIES,
}

export interface ProjectsClientModule {
  manifest: ModuleManifest
  platformModule: () => PlatformModuleContribution
}

/** The module for a window; the host supplies how the window switches project (a reload with the project in the URL). */
export function projectsModule(host: ProjectsModuleHost): ProjectsClientModule {
  return {
    manifest: PROJECTS_MANIFEST,
    platformModule: () => ({ id: 'projects', name: 'Project Management', assistant: projectsAssistant(host), help: projectsHelp }),
  }
}
