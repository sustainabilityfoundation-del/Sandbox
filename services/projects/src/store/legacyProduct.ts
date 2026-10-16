import type { Pool } from 'pg'
import { withTransaction } from './context'
import { createBreakdown, createElement, type ElementKind } from './product'
import type { MembershipPort } from '../ports'
import type { BlobStore } from '../blob/blobStore'

/**
 * The example project's physical components as seeded by packages/model-service (seed.ts), at their twin
 * revisions. Imported into the product registry with their twin IDs as aliases (ADR-0063 §4, integration milestone 1
 * C2): additive, idempotent, never changing the browser twin. test/legacyProduct.test.ts fails if this fixture and
 * the model-service seed diverge.
 */
export const LEGACY_COMPONENTS: { alias: string; name: string; elementKind: ElementKind; parent: string | null; twinRevision: number; properties: Record<string, string | { value: number; unit: string }> }[] = [
  { alias: 'ACT-100', name: 'Actuator assembly', elementKind: 'assembly', parent: null, twinRevision: 1, properties: { partNumber: 'ACT-100-A', stroke: { value: 300, unit: 'mm' }, mass: { value: 6.8, unit: 'kg' } } },
  {
    alias: 'HSG-110',
    name: 'Housing',
    elementKind: 'part',
    parent: 'ACT-100',
    twinRevision: 2,
    properties: { partNumber: 'HSG-110-B', material: 'Aluminium 6082-T6', length: { value: 420, unit: 'mm' }, outerDiameter: { value: 60, unit: 'mm' }, wallThickness: { value: 5, unit: 'mm' }, mass: { value: 2.1, unit: 'kg' } },
  },
  { alias: 'ROD-120', name: 'Rod', elementKind: 'part', parent: 'ACT-100', twinRevision: 2, properties: { partNumber: 'ROD-120-A', material: 'Steel 42CrMo4', diameter: { value: 25, unit: 'mm' }, effectiveLength: { value: 600, unit: 'mm' }, mass: { value: 2.3, unit: 'kg' } } },
  { alias: 'MTR-130', name: 'Motor', elementKind: 'part', parent: 'ACT-100', twinRevision: 2, properties: { partNumber: 'MTR-130-C', type: 'BLDC, 48 V', ratedPower: { value: 350, unit: 'W' }, ratedSpeed: { value: 3000, unit: 'rpm' }, mass: { value: 1.6, unit: 'kg' } } },
]

/** Fixed IDs so every development database gives the example's product elements the same identities. */
export const LEGACY_ELEMENT_IDS: Record<string, string> = {
  'ACT-100': 'b0d3a1e0-0100-4a7c-8f00-00000000a100',
  'HSG-110': 'b0d3a1e0-0110-4a7c-8f00-00000000a110',
  'ROD-120': 'b0d3a1e0-0120-4a7c-8f00-00000000a120',
  'MTR-130': 'b0d3a1e0-0130-4a7c-8f00-00000000a130',
}
const LEGACY_BREAKDOWN = 'b0d3a1e0-0000-4a7c-8f00-0000000bd001'

export async function importLegacyProduct(pool: Pool, services: { memberships: MembershipPort; blobs: BlobStore }): Promise<{ seeded: boolean; message: string }> {
  const project = await pool.query('SELECT 1 FROM projects.projects WHERE id = $1', ['PRJ-ACT100'])
  if (!project.rowCount) return { seeded: false, message: 'Products: PRJ-ACT100 is not registered; nothing imported.' }
  const done = await pool.query(`SELECT 1 FROM projects.product_element_aliases WHERE project_id = 'PRJ-ACT100' AND alias = 'ACT-100'`)
  if (done.rowCount) return { seeded: false, message: 'Products: example components already imported.' }
  await withTransaction(pool, { projectId: 'PRJ-ACT100', actor: 'import', provenance: { sourceKind: 'import' }, role: 'administrator', services }, async (ctx) => {
    const b = await createBreakdown(ctx, { name: 'Product breakdown', purpose: 'product-breakdown', description: 'Imported from the example twin (parentId).' }, LEGACY_BREAKDOWN)
    for (const c of LEGACY_COMPONENTS) {
      await createElement(
        ctx,
        { key: c.alias, name: c.name, elementKind: c.elementKind, properties: c.properties, aliases: [c.alias], placement: { breakdownId: b.id, parentId: c.parent ? LEGACY_ELEMENT_IDS[c.parent] : null } },
        { id: LEGACY_ELEMENT_IDS[c.alias], summary: `Imported from the twin (${c.alias} at twin revision ${c.twinRevision})` },
      )
    }
  })
  return { seeded: true, message: 'Products: imported the example components ACT-100, HSG-110, ROD-120 and MTR-130 with their twin IDs as aliases.' }
}
