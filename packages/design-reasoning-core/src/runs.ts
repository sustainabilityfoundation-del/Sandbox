import type { Basis } from '@ews/engineering-calc'
import type { AnyRef } from './refs'

/**
 * Operational records of the Design Reasoning Engine (ADR-0039, ADR-0045). In R1 they live in memory;
 * in R4 the reasoning service persists them in schema `reasoning`. None of them is design knowledge.
 */

export interface RunBudget {
  maxSteps: number
  maxToolCalls: number
  maxWallMs: number
  maxDrafts: number
}

export const DEFAULT_ASSISTANT_BUDGET: RunBudget = { maxSteps: 50, maxToolCalls: 100, maxWallMs: 10 * 60_000, maxDrafts: 20 }

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'budget-exhausted'

export interface ReasoningRun {
  id: string
  projectId: string
  question: string
  mode: 'assistant-driven' | 'engine-driven'
  actor: string
  status: RunStatus
  budget: RunBudget
  used: { steps: number; toolCalls: number; drafts: number }
  startedAt: string
  endedAt?: string
  parentRunId?: string
  branchKey?: string
}

export interface ContextManifestItem {
  ref: AnyRef
  revision: number | null
  via: 'seed' | 'graph' | 'filter' | 'search' | 'requirements-api' | 'client-attested'
  /** Set when the source was a labelled adapter or fixture rather than the real module. */
  adapter?: 'test-adapter' | 'test-fixture'
  fields: string[]
}

export interface ContextManifest {
  id: string
  runId: string
  stepId: string
  builtAt: string
  items: ContextManifestItem[]
  omitted: { count: number; reason: 'budget' | 'not-authorized' | 'not-found' }[]
}

export interface ToolInvocation {
  id: string
  runId: string
  stepId: string
  tool: string
  toolVersion: string
  input: unknown
  ok: boolean
  output?: unknown
  error?: { code: string; message: string }
  basis?: Basis
  manifestId?: string
  startedAt: string
  durationMs: number
}

export interface Justification {
  id: string
  runId: string
  stepId: string
  conclusion: string
  /** What the conclusion rests on, by reference (never model hidden reasoning). */
  restsOn: AnyRef[]
  basis: Basis
}

/** In-memory run store (R1). The service in R4 implements the same shape on PostgreSQL. */
export class InMemoryRunStore {
  readonly runs = new Map<string, ReasoningRun>()
  readonly invocations: ToolInvocation[] = []
  readonly manifests: ContextManifest[] = []
  readonly justifications: Justification[] = []

  invocationsOf(runId: string) {
    return this.invocations.filter((i) => i.runId === runId)
  }

  manifestsOf(runId: string) {
    return this.manifests.filter((m) => m.runId === runId)
  }
}
