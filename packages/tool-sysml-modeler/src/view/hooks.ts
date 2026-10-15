import { useSharedContext, useToolViewState } from '@ews/platform-sdk/react'
import { useEffect, useSyncExternalStore } from 'react'
import { sessionFor, type ModelerSession, type SessionState } from '../session'
import type { ModelerViewState } from '../state'

const EMPTY: SessionState = { status: 'idle', projects: [], branches: [], commits: [], revision: 0, busy: false }

/** The shared session of the view's platform project, opened on first use. */
export function useSession(): { session: ModelerSession | undefined; state: SessionState } {
  const { projectId } = useSharedContext()
  const session = sessionFor(projectId)
  const state = useSyncExternalStore(session?.subscribe ?? noop, session?.getState ?? empty, session?.getState ?? empty)
  useEffect(() => {
    if (session && state.status === 'idle') void session.open(projectId)
  }, [session, state.status, projectId])
  return { session, state }
}

export function useViewState() {
  return useToolViewState<ModelerViewState>()
}

const noop = () => () => undefined
const empty = () => EMPTY
