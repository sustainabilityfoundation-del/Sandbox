import { ACTUATOR_EXAMPLE, ACTUATOR_EXAMPLE_NAME } from '@ews/sysml-core'
import type { SysmlRepository } from './repository'

/** Fixed ID of the seeded example project (development and tests). */
export const SEED_PROJECT_ID = 'a1c7e5d0-5153-4d4c-9a3e-000000000100'
export const SEED_PLATFORM_PROJECT = 'PRJ-ACT100'

/** Seeds the multidisciplinary actuator example once (development only; never in production). */
export async function seedSysml(repo: SysmlRepository): Promise<{ seeded: boolean; message: string }> {
  const existing = await repo.listProjects([SEED_PLATFORM_PROJECT])
  if (existing.length) return { seeded: false, message: 'SysML: example already present.' }
  await repo.createProject('system', {
    id: SEED_PROJECT_ID,
    name: ACTUATOR_EXAMPLE_NAME,
    description: 'Seeded example: mechanical, electrical, software and control parts of the ACT-100 actuator, with interfaces, behaviour, requirements, satisfaction and allocation.',
    platformProjectId: SEED_PLATFORM_PROJECT,
    initialText: ACTUATOR_EXAMPLE,
    source: { kind: 'seed' },
  })
  return { seeded: true, message: 'SysML: seeded the actuator example.' }
}
