import type { ArtifactSummary, AssistantActionContext, AssistantActionDefinition, PlatformServices, RequirementSummary, ServiceProposal } from '@ews/platform-sdk'
import { D1_REQUIREMENT } from './d1-sequence'

type ToolWithAssistant = { assistant?: { actions: AssistantActionDefinition[] } }

/** The SysML text the real model sent in the live D1 run (CP-16), verbatim apart from one shortened doc. */
export const LIVE_CP16_TEXT = `package BitHolderArchitecture {
  doc /* AI-proposed architecture based on CON-001 revision 1. No dimensions or mounting standard are assumed. Drill and bits are external context, not supplied product parts. */
  part def HolderBody {
    doc /* One body provides six bit pockets. Retention is a functional provision; no separate insert, magnet, material or fit is selected. */
  }
  part def MountingProvision {
    doc /* Logical physical grouping for drill attachment. May be integral with the body or use separate hardware; quantity and interface dimensions remain unresolved. Do not interpret as a selected separate manufactured part. */
  }
  part def BitHolder {
    part body : HolderBody;
    part mounting : MountingProvision;
    action carryAndPresentBits {
      action receiveSixBits;
      action retainBitsDuringHandling;
      action permitDeliberateManualRemoval;
    }
    action attachToDrill;
    allocate carryAndPresentBits to body;
    allocate attachToDrill to mounting;
    doc /* Functional allocations are design responsibility proposals, not evidence of performance. */
  }
  part holder : BitHolder;
}`

export const LIVE_REQUIREMENTS: RequirementSummary[] = [
  { id: '11111111-2222-4333-8444-000000000001', key: 'REQ-001', title: 'Capacity for six bits', statement: 'The holder shall carry six bits.', status: 'draft', revision: 1 } as RequirementSummary,
  { id: '11111111-2222-4333-8444-000000000004', key: 'REQ-004', title: 'Holder mass', statement: 'The holder mass shall be at most 50 g.', status: 'draft', revision: 1 } as RequirementSummary,
]
export const LIVE_PRODUCT = '18bdd40c-79fb-4124-98ba-bd79b8fc0fdc'

export function liveServices(): PlatformServices {
  const all = [D1_REQUIREMENT, ...LIVE_REQUIREMENTS]
  const pe: ArtifactSummary = { artifactId: 'art-PE-001', ref: { module: 'product', kind: 'product-element', id: LIVE_PRODUCT }, key: 'PE-001', title: 'Six-bit drill-mounted holder', category: 'product-element', lifecycle: 'working', version: { value: 1 }, availability: 'available' }
  return {
    requirements: { get: async (id: string) => all.find((r) => r.id === id), resolve: async (key: string) => all.find((r) => r.key === key) },
    projects: { resolve: async (_p: string, refs: { id: string }[]) => (refs.some((r) => r.id === LIVE_PRODUCT) ? [pe] : []), artifacts: async () => ({ items: [pe] }) },
  } as unknown as PlatformServices
}

export function liveContext(platformProjectId: string, services: PlatformServices = liveServices()) {
  return { model: undefined as never, artifacts: [], captured: { projectId: platformProjectId, configurationId: 'CFG', scenarioId: 'SCN', modelRevision: 1, selectionIds: [] }, services } satisfies AssistantActionContext
}

/**
 * The live run's architecture turn, as a model does it with the improved operations: ONE create_project
 * proposal with the model's text, two requirement allocations and the represents link to the (already
 * applied) product element; then a follow-up allocation with satisfy_requirement.
 */
export async function runLiveArchitecture(tool: ToolWithAssistant, platformProjectId: string, services: PlatformServices = liveServices()) {
  const ctx = liveContext(platformProjectId, services)
  const run = async (name: string, args: Record<string, unknown>) => tool.assistant!.actions.find((a) => a.name === `sysml-modeler.${name}`)!.run(args, ctx)
  let n = 0
  const apply = async (name: string, args: Record<string, unknown>) => {
    const proposal = (await run(name, args)) as ServiceProposal
    return { proposal, applied: await proposal.apply({ conversationId: 'live', proposalId: `CP-${++n}`, messageId: `M${n}` }) }
  }
  const created = await apply('create_project', {
    name: 'Six-bit holder architecture',
    initialText: LIVE_CP16_TEXT,
    requirements: [
      { requirement: 'REQ-001', satisfiedBy: ['BitHolderArchitecture::BitHolder::body'] },
      { requirement: 'REQ-004', satisfiedBy: ['BitHolderArchitecture::holder'] },
    ],
    productElements: [{ element: 'BitHolderArchitecture::BitHolder', productElement: LIVE_PRODUCT }],
  })
  const sysmlProjectId = created.applied.createdIds![0]
  const followUp = await apply('satisfy_requirement', { projectId: sysmlProjectId, requirements: [{ requirement: D1_REQUIREMENT.key, satisfiedBy: ['BitHolderArchitecture::MountingProvision'] }] })
  const validation = (await run('validate', { projectId: sysmlProjectId })) as { kind: 'data'; data: { counts: { error: number } } }
  const coverage = (await run('coverage', { projectId: sysmlProjectId })) as { kind: 'data'; data: { requirements: { requirement: string; status: string; managedRequirementId?: string }[] } }
  return { sysmlProjectId, created, followUp, validationErrors: validation.data.counts.error, coverage: coverage.data.requirements }
}
