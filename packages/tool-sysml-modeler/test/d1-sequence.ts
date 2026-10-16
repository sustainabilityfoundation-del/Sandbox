import type { ArtifactSummary, AssistantActionContext, AssistantActionDefinition, AssistantActionResult, PlatformServices, RequirementSummary, ServiceProposal } from '@ews/platform-sdk'

type ToolWithAssistant = { assistant?: { actions: AssistantActionDefinition[] } }

/**
 * D1-SYS (docs/specifications/demo-ai-engineering.md, step 4 "Architecture"): the SysML part of the
 * architecture step, driven only through the assistant operations, headless (no view mounted), in a
 * NEW, empty platform project. Shared by the in-browser-client test and the PostgreSQL/HTTP test.
 */

export const D1_PRODUCT = { gripper: '3f0c9a52-6d1e-4b8a-9c1f-0a1b2c3d4e01', finger: '3f0c9a52-6d1e-4b8a-9c1f-0a1b2c3d4e02' }
export const D1_REQUIREMENT: RequirementSummary = { id: '9a7d3c11-2b4e-4f6a-8c0d-112233445566', key: 'REQ-101', title: 'Grip force', statement: 'The gripper shall hold a part with 50 N.', status: 'approved', revision: 2 } as RequirementSummary

/** Fake platform services: Requirements and Project Management as the host would provide them. */
export function d1Services(): PlatformServices {
  const product = (id: string, key: string, title: string): ArtifactSummary => ({ artifactId: `art-${key}`, ref: { module: 'product', kind: 'product-element', id }, key, title, category: 'product-element', lifecycle: 'working', version: { value: 3 }, availability: 'available' })
  const known = [product(D1_PRODUCT.gripper, 'PE-1', 'Gripper'), product(D1_PRODUCT.finger, 'PE-2', 'Finger')]
  return {
    requirements: { get: async (id: string) => (id === D1_REQUIREMENT.id ? D1_REQUIREMENT : undefined), resolve: async (key: string) => (key === D1_REQUIREMENT.key ? D1_REQUIREMENT : undefined) },
    projects: { resolve: async (_p: string, refs: { id: string }[]) => known.filter((k) => refs.some((r) => r.id === k.ref.id)), artifacts: async () => ({ items: known }) },
  } as unknown as PlatformServices
}

export const D1_TEXT = `private import ScalarValues::*;
package Functions {
    doc /* Functional decomposition of the gripping function. */
    action def GraspPart {
        action detectPart;
        action closeFingers;
        action holdPart;
        first detectPart then closeFingers;
        first closeFingers then holdPart;
    }
}
package Physical {
    doc /* Physical decomposition. */
    part def Finger;
    part def Actuator;
    part def ContactSensor;
    part def Gripper {
        part fingers : Finger[2];
        part actuator : Actuator;
        part sensor : ContactSensor;
    }
    part gripper : Gripper;
}
package Requirements {
    requirement def GripForce {
        doc /* Hold a part with 50 N. */
    }
    requirement gripForce : GripForce;
    satisfy gripForce by Physical::gripper;
}
`

export interface D1Outcome {
  sysmlProjectId: string
  validationErrors: number
  coverage: { requirement: string; status: string }[]
  steps: string[]
}

export async function runD1Sequence(tool: ToolWithAssistant, platformProjectId: string, services: PlatformServices = d1Services()): Promise<D1Outcome> {
  const ctx = { model: undefined as never, artifacts: [], captured: { projectId: platformProjectId, configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] }, services } satisfies AssistantActionContext
  const action = (name: string) => {
    const a = tool.assistant!.actions.find((x) => x.name === `sysml-modeler.${name}`)
    if (!a) throw new Error(`No operation sysml-modeler.${name}`)
    return a
  }
  const run = async (name: string, args: Record<string, unknown>): Promise<AssistantActionResult> => action(name).run(args, ctx)
  const steps: string[] = []
  let n = 0
  const apply = async (name: string, args: Record<string, unknown>) => {
    const p = (await run(name, args)) as ServiceProposal
    if (p.kind !== 'service-proposal') throw new Error(`${name} did not return a proposal`)
    const out = await p.apply({ conversationId: 'd1', proposalId: `d1-${++n}`, messageId: `m${n}` })
    steps.push(`${name}: ${out.summary}`)
    return out
  }

  // 1. A new platform project has no SysML model: reads explain how to start one.
  await run('validate', {}).then(
    () => {
      throw new Error('expected no SysML project in a new platform project')
    },
    (e: Error) => {
      if (!/create_project/.test(e.message)) throw e
    },
  )
  // 2. Create the SysML project.
  const created = await apply('create_project', { name: 'Gripper architecture', initialText: 'package Gripper;' })
  // 3. Functional and physical decomposition, and satisfy links, as one text proposal.
  await apply('propose_text', { namespace: 'Gripper', mode: 'append', text: D1_TEXT, title: 'Gripper architecture', explanation: 'D1 step 4: functional and physical decomposition with requirement satisfaction.' })
  // 4. The SysML requirement stands for the managed requirement.
  await apply('link_requirement', { element: 'Gripper::Requirements::gripForce', requirement: D1_REQUIREMENT.key })
  // 5. Parts represent product elements (pinned to the revision Project Management reports).
  await apply('link_product_element', { element: 'Gripper::Physical::Gripper', productElement: D1_PRODUCT.gripper })
  await apply('link_product_element', { element: 'Gripper::Physical::Finger', productElement: D1_PRODUCT.finger })
  // 6. Validation pass and coverage.
  const v = (await run('validate', {})) as { kind: 'data'; data: { counts: { error: number } } }
  const cov = (await run('coverage', {})) as { kind: 'data'; data: { requirements: { requirement: string; status: string }[] } }
  return { sysmlProjectId: created.createdIds?.[0] ?? '', validationErrors: v.data.counts.error, coverage: cov.data.requirements, steps }
}
