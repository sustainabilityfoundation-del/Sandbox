import { randomBytes } from 'node:crypto'
import type { AssistantActionResult, DeclarativeProposal } from '@ews/platform-sdk'
import { expect } from 'vitest'
import type { TestEnv } from './helpers'

const A = '/api/assistant/v1'
let seq = 0

export interface PlatformApply {
  /** The stored proposal (as the workspace stores it after the action returns). */
  id: string
  status: number
  body: { proposal?: { status: string; results?: { index: number; status: string; httpStatus: number; summary: string }[]; createdIds?: string[] }; error?: { code: string; message: string } }
}

/**
 * Stores a declarative proposal in the assistant service and applies it, exactly as the platform does after
 * the person chooses Apply: identity, membership, entitlements, project, expected revisions and idempotency
 * are checked again, then the module operations run through the module API as that person.
 */
export async function storeProposal(env: TestEnv, user: string, result: AssistantActionResult, projectId: string): Promise<string> {
  expect(result.kind).toBe('declarative-proposal')
  const p = result as DeclarativeProposal
  const stored = await env.call(user, 'POST', `${A}/proposals`, {
    projectId: p.projectId ?? projectId,
    conversationId: `C-REQ-${randomBytes(3).toString('hex')}`,
    messageId: 'M1',
    key: `RQ-${++seq}`,
    kind: 'declarative',
    module: p.module,
    title: p.title,
    explanation: p.explanation,
    preview: p.preview,
    assumptions: p.assumptions,
    operations: p.operations,
    expected: p.expected,
  })
  expect(stored.status, JSON.stringify(stored.body)).toBe(201)
  return stored.body.proposal.id as string
}

export async function applyProposal(env: TestEnv, user: string, id: string, projectId: string): Promise<PlatformApply> {
  const res = await env.call(user, 'POST', `${A}/proposals/${id}/apply?projectId=${projectId}`, {})
  return { id, status: res.status, body: res.body }
}

/** Store, then apply. A proposal the platform refuses to store (its operations do not validate against the module API) is returned as the refusal. */
export async function storeAndApply(env: TestEnv, user: string, result: AssistantActionResult, projectId: string): Promise<PlatformApply> {
  const p = result as DeclarativeProposal
  const stored = await env.call(user, 'POST', `${A}/proposals`, {
    projectId: p.projectId ?? projectId,
    conversationId: `C-REQ-${randomBytes(3).toString('hex')}`,
    messageId: 'M1',
    key: `RQ-${++seq}`,
    kind: 'declarative',
    module: p.module,
    title: p.title,
    explanation: p.explanation,
    preview: p.preview,
    assumptions: p.assumptions,
    operations: p.operations,
    expected: p.expected,
  })
  if (stored.status !== 201) return { id: '', status: stored.status, body: stored.body }
  return applyProposal(env, user, stored.body.proposal.id as string, projectId)
}
