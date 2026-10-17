import type { ConstraintSummary } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext } from '@ews/platform-sdk/react'
import { useEffect, useState } from 'react'

export interface ConstraintLabel {
  /** Stable ID such as CST-004, or null while unknown. */
  key: string | null
  /** The constraint's statement (its title), when readable. */
  title: string | null
  state: 'loading' | 'ready' | 'unreadable'
}

const cache = new Map<string, ConstraintLabel>()

/**
 * Stable ID (CST-nnn) and title of the Conceptualize constraint a parameter binding points at, read through the existing
 * ConceptsService port. UUIDs are never shown (AUD-4): while the constraint is being read or when it cannot be read the
 * label says so instead.
 */
export function useConstraintLabel(ref: { module: string; kind: string; id: string; revision?: number }): ConstraintLabel {
  const concepts = usePlatformServices().concepts
  const { projectId } = useSharedContext()
  const readable = ref.module === 'conceptualize' && ref.kind === 'constraint' && !!concepts?.getConstraint
  const cacheKey = `${projectId}|${ref.id}|${ref.revision ?? 'latest'}`
  const [label, setLabel] = useState<ConstraintLabel>(() => cache.get(cacheKey) ?? { key: null, title: null, state: readable ? 'loading' : 'unreadable' })
  useEffect(() => {
    if (!readable) return setLabel({ key: null, title: null, state: 'unreadable' })
    const hit = cache.get(cacheKey)
    if (hit) return setLabel(hit)
    let live = true
    setLabel({ key: null, title: null, state: 'loading' })
    concepts!.getConstraint!(ref.id, { projectId, ...(ref.revision !== undefined ? { revision: ref.revision } : {}) }).then(
      (c: ConstraintSummary | undefined) => {
        const next: ConstraintLabel = c ? { key: c.key, title: c.statement, state: 'ready' } : { key: null, title: null, state: 'unreadable' }
        if (c) cache.set(cacheKey, next)
        if (live) setLabel(next)
      },
      () => live && setLabel({ key: null, title: null, state: 'unreadable' }),
    )
    return () => {
      live = false
    }
  }, [cacheKey, readable, concepts, projectId, ref.id, ref.revision])
  return label
}
