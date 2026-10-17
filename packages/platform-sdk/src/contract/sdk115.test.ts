import { describe, expect, it } from 'vitest'
import {
  SDK_VERSION,
  isSdkCompatible,
  type ContextBlock,
  type ContextBundle,
  type ContextPackage,
  type ContextRef,
  type ContextSnapshotItem,
  type EvaluationFinding,
  type SelectContextRequest,
  type SelectContextResponse,
  type ServerModuleDescriptor,
} from '../index'

/*
 * Type-level tests of the SDK 1.15 additions (ECII plan Amendment 2, ADR-0085, ADR-0086). Most assertions are the
 * assignments themselves: if a shape changes, this file stops compiling under the typecheck.
 */

// Structural copies of the shapes the SDK types must stay compatible with (the SDK cannot import either package).
// Design Reasoning core (packages/design-reasoning-core/src/refs.ts, runs.ts):
interface DesignRefShape { module: 'conceptualize'; type: 'decision' | 'constraint'; id: string; revision?: number }
interface ArtifactRefXShape { module: 'requirements' | 'cad' | 'reasoning'; id: string; revision?: number; kind?: string }
type AnyRefShape = DesignRefShape | ArtifactRefXShape
interface ContextManifestItemShape {
  ref: AnyRefShape
  revision: number | null
  via: 'seed' | 'graph' | 'filter' | 'search' | 'requirements-api' | 'client-attested'
  adapter?: 'test-adapter' | 'test-fixture'
  fields: string[]
}
// AI gateway (feature/ai-infra-c-gateway, services/assistant/src/providers/types.ts):
interface GatewayContextBundleShape { blocks: { id: string; text: string; trust: 'platform-data' | 'external-data'; cacheable: boolean }[] }

describe('SDK 1.15 additive contract', () => {
  it('is an additive minor version', () => {
    expect(SDK_VERSION).toBe('1.15.0')
    expect(isSdkCompatible('^1.14.0')).toBe(true)
    expect(isSdkCompatible('^1.15.0')).toBe(true)
    expect(isSdkCompatible('^1.16.0')).toBe(false)
  })

  it('lets Design Reasoning core alias ContextManifestItem as ContextSnapshotItem<AnyRef>', () => {
    const drItem: ContextManifestItemShape = { ref: { module: 'conceptualize', type: 'decision', id: 'DEC-1', revision: 3 }, revision: 3, via: 'graph', fields: ['rationale'] }
    // The DR item is a valid SDK item with DR's narrower reference, and the narrower ref is a ContextRef.
    const aliased: ContextSnapshotItem<AnyRefShape> = drItem
    const widened: ContextSnapshotItem = aliased
    const ref: ContextRef = drItem.ref
    expect(widened.ref).toBe(ref)
  })

  it('keeps the gateway context bundle and the SDK bundle mutually assignable', () => {
    const gateway: GatewayContextBundleShape = { blocks: [{ id: 'digest', text: 'Active intent INT-1', trust: 'platform-data', cacheable: true }] }
    const sdk: ContextBundle = gateway
    const back: GatewayContextBundleShape = sdk
    const block: ContextBlock = { id: 'ev-1', text: 'Product page excerpt', trust: 'external-data', cacheable: false }
    expect(back.blocks[0].trust).toBe('platform-data')
    expect(block.trust).toBe('external-data')
  })

  it('describes a package, a selector exchange and a finding', () => {
    const budget = { maxTokens: 12_000, maxItems: 400, maxBytes: 256 * 1024 }
    const item: ContextSnapshotItem = {
      ref: { module: 'conceptualize', type: 'constraint', id: 'CON-7', revision: 2 },
      revision: 2,
      via: 'selector',
      fields: ['bounds'],
      section: 'constraints',
      mandatory: true,
      projection: { label: 'Clearance to battery', quantities: [{ name: 'clearance', value: 4, unit: 'mm', tolerance: { minus: 0.5, plus: 0.5 }, datum: 'IFC-2' }], status: 'documented' },
      selectedBy: 'conceptualize',
    }
    const request: SelectContextRequest = { projectId: 'P1', operation: 'conceptualize.generate_concepts', targets: [{ module: 'conceptualize', id: 'C-1' }], budget }
    const response: SelectContextResponse = { module: 'conceptualize', selectorVersion: '1', items: [item], omitted: [{ count: 2, reason: 'budget', refs: [{ module: 'projects', id: 'DOC-1', revision: 1 }] }] }
    const pkg: ContextPackage = {
      contextId: 'CTX-1',
      schemaVersion: 1,
      projectId: request.projectId,
      mode: 'full',
      task: { operation: request.operation, targets: request.targets },
      items: response.items,
      omitted: response.omitted,
      budget,
      used: { estimatedTokens: 120, items: 1, bytes: 480 },
      overBudget: false,
      selectors: [{ module: response.module, version: response.selectorVersion }],
      assembledFor: 'user:dev',
      assembledAt: '2026-10-17T00:00:00.000Z',
    }
    const finding: EvaluationFinding = {
      id: 'EF-1',
      contextId: pkg.contextId,
      check: 'numeric.sourced',
      kind: 'deterministic',
      source: { module: 'conceptualize', operation: 'conceptualize.check' },
      outcome: 'fail',
      severity: 'major',
      message: 'A numeric interface value has no source and is not labelled assumed or estimated.',
      refs: [item.ref],
      suggestedAction: 'retrieve-context',
      createdAt: pkg.assembledAt,
    }
    const descriptor: ServerModuleDescriptor = {
      id: 'conceptualize',
      name: 'Conceptualize',
      basePath: '/api/conceptualize/v1',
      selectContext: { path: '/context/select', operations: ['conceptualize.'], version: '1' },
    }
    const minimal: ServerModuleDescriptor = { id: 'x', name: 'X', basePath: '/api/x/v1' }
    expect(pkg.items[0].mandatory).toBe(true)
    expect(finding.kind).toBe('deterministic')
    expect(descriptor.selectContext?.operations).toEqual(['conceptualize.'])
    expect(minimal.selectContext).toBeUndefined()
  })
})
