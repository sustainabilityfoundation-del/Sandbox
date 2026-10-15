import type { RequirementsEvent, RequirementsEventType } from '@ews/platform-sdk'
import { describe, expect, it } from 'vitest'
import { requirementLifecycle, toArtifactChange } from './artifacts'

const event = (type: RequirementsEventType): RequirementsEvent => ({ eventId: 'e1', type, projectId: 'P', entityId: 'X', committedRevision: 1, occurredAt: '2026-10-15T00:00:00.000Z', actor: 'eli' })

describe('artifact source mappings (CR-PM-REG-1)', () => {
  it('maps outbox events to registry changes', () => {
    const kindOf = (t: RequirementsEventType) => {
      const c = toArtifactChange(event(t))
      return c.kind === 'reconcile' ? 'reconcile' : `${c.kind}:${c.refs[0].kind}`
    }
    expect(kindOf('requirement.created')).toBe('upserted:requirement')
    expect(kindOf('requirement.updated')).toBe('upserted:requirement')
    expect(kindOf('requirement.restored')).toBe('upserted:requirement')
    expect(kindOf('requirement.relationships-changed')).toBe('upserted:requirement')
    expect(kindOf('requirement.archived')).toBe('retired:requirement')
    expect(kindOf('requirements.baseline-created')).toBe('upserted:requirements-baseline')
    expect(kindOf('requirements.collection-changed')).toBe('upserted:requirement-collection')
    expect(kindOf('requirements.import-completed')).toBe('reconcile')
    expect(kindOf('requirements.something-new' as RequirementsEventType)).toBe('reconcile')
    expect(toArtifactChange(event('requirement.created'))).toEqual({ kind: 'upserted', eventId: 'e1', projectId: 'P', occurredAt: '2026-10-15T00:00:00.000Z', actor: 'eli', refs: [{ module: 'requirements', kind: 'requirement', id: 'X' }] })
  })

  it('maps lifecycle status to the normalised lifecycle', () => {
    expect(requirementLifecycle('draft', false)).toBe('working')
    expect(requirementLifecycle('in-review', false)).toBe('in-review')
    expect(requirementLifecycle('approved', false)).toBe('released')
    expect(requirementLifecycle('retired', false)).toBe('retired')
    expect(requirementLifecycle('approved', true)).toBe('retired')
  })
})
