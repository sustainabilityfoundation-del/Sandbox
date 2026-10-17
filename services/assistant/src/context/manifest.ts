import type { ContextManifest, ContextManifestItem } from '@ews/design-reasoning-core'
import type { ContextPackage } from '@ews/platform-sdk'

/**
 * A snapshot as a Design Reasoning `ContextManifest` (ADR-0086): the same items (`ContextSnapshotItem` is the promoted
 * `ContextManifestItem`), so a reasoning run record can cite the snapshot a tool call was made from (`ToolInvocation.manifestId`).
 * The snapshot stays the record of truth; this is a view of it. Omissions lose their references (the manifest type keeps counts only);
 * a `not-authorized` omission has no count, so it is reported as one.
 */
export function toManifest(pkg: ContextPackage, runId: string, stepId: string): ContextManifest {
  return {
    id: pkg.contextId,
    runId,
    stepId,
    builtAt: pkg.assembledAt,
    items: pkg.items as unknown as ContextManifestItem[],
    omitted: pkg.omitted.map((o) => ({ count: o.reason === 'not-authorized' ? 1 : o.count, reason: o.reason })),
  }
}
