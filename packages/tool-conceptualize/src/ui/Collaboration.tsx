import { Badge, Button, EmptyState, Notice } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import type { Concept } from '@ews/conceptualize-client'
import { useState } from 'react'
import { useModuleData, useResource } from '../data'
import { KIND_LABEL, formatDate, formatQuantity, type ConceptualizeViewState } from '../domain'
import { ApiErrorNotice, BasisBadge, Section } from './common'

export const EXAMPLE_PROMPTS = [
  'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.',
  'Create a concept: a gripper that holds parts of up to 2 kg and opens in no more than 0.5 s.',
  'What are the next steps for CON-001?',
  'Compare the alternatives of CON-005.',
]

function Hypotheses({ concept }: { concept: Concept }) {
  const { client, invalidate, can } = useModuleData()
  const [error, setError] = useState<unknown>(null)
  const hyps = concept.statements.filter((s) => s.basis === 'ai-hypothesis')
  const assumptions = concept.statements.filter((s) => s.kind === 'assumption' || s.basis === 'assumption')
  const questions = concept.statements.filter((s) => (s.kind === 'question' || s.kind === 'uncertainty') && s.state !== 'resolved')
  /** Confirm (becomes a user statement, recorded with who confirmed it) or remove a hypothesis: one new revision. */
  const decide = async (id: string, action: 'confirm' | 'remove') => {
    setError(null)
    try {
      const statements = concept.statements.filter((s) => action === 'confirm' || s.id !== id).map((s) => ({ id: s.id, kind: s.kind, text: s.text, quantity: s.quantity, state: s.state, evidenceId: s.evidenceId, decisionId: s.decisionId, source: s.source, ...(s.id === id ? { confirm: true } : {}) }))
      await client.updateConcept(concept.id, { statements }, { expectedRevision: concept.revision, reason: action === 'confirm' ? 'Confirmed an AI hypothesis' : 'Removed an AI hypothesis' })
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <>
      <Section title={`AI hypotheses to review (${hyps.length})`} helpId="conceptualize.ai.review">
        <ul className="con-statements">
          {hyps.map((s) => (
            <li key={s.id}>
              <span className="con-statement-text">
                <span className="con-muted">{KIND_LABEL[s.kind]}:</span> {s.text} {s.quantity && <strong>{formatQuantity(s.quantity)}</strong>}
              </span>
              <span className="con-row">
                <BasisBadge basis="ai-hypothesis" />
                {can('author') && (
                  <>
                    <Button size="sm" variant="outlined" icon="check" onPress={() => void decide(s.id, 'confirm')}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="text" icon="close" onPress={() => void decide(s.id, 'remove')}>
                      Remove
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
          {!hyps.length && <li className="con-muted">No unconfirmed AI hypotheses.</li>}
        </ul>
      </Section>
      <Section title="Assumptions">
        <ul className="con-statements">
          {assumptions.map((s) => (
            <li key={s.id}>
              {s.text} {s.quantity && formatQuantity(s.quantity)} <BasisBadge basis={s.basis} />
            </li>
          ))}
          {!assumptions.length && <li className="con-muted">No assumptions recorded.</li>}
        </ul>
      </Section>
      <Section title="Open questions and uncertainties">
        <ul className="con-statements">
          {questions.map((s) => (
            <li key={s.id}>
              <span className="con-muted">{KIND_LABEL[s.kind]}:</span> {s.text}
            </li>
          ))}
          {!questions.length && <li className="con-muted">None open.</li>}
        </ul>
      </Section>
      {error ? <ApiErrorNotice error={error} /> : null}
    </>
  )
}

/** AI collaboration: context, review of AI-generated content, suggested next steps and AI provenance. */
export function CollaborationPage() {
  const { client } = useModuleData()
  const [state] = useToolViewState<ConceptualizeViewState>()
  const id = state.conceptId
  const concept = useResource(id ? () => client.concept(id) : null, [client, id])
  const assessment = useResource(id ? () => client.assessment(id) : null, [client, id])
  const history = useResource(id ? () => client.history(id) : null, [client, id])
  const ai = (history.data ?? []).filter((h) => h.provenance.sourceKind === 'assistant')
  return (
    <div className="con-page" data-help-id="conceptualize.ai">
      <h3 className="con-page-title">AI collaboration</h3>
      <Notice tone="info" title="The assistant is a scripted demo">
        No language model is connected. The demo assistant (ChatGPT panel) understands a few example requests and answers them with Conceptualize operations. Everything it proposes is shown as a preview first; nothing changes until you choose Apply, and its content stays labelled “AI hypothesis” or “Estimate” until a person confirms it.
      </Notice>
      <Section title="Try in the assistant panel">
        <ul className="con-examples">
          {EXAMPLE_PROMPTS.map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
        </ul>
      </Section>
      {!id && <EmptyState title="Open a Concept">Choose a Concept in the explorer to review its AI hypotheses, assumptions and next steps.</EmptyState>}
      {concept.data && (
        <>
          <p>
            Context: <strong>{concept.data.key} {concept.data.name}</strong> (revision {concept.data.revision})
          </p>
          <Hypotheses concept={concept.data} />
        </>
      )}
      {assessment.data && (
        <Section title={`Suggested next steps (completeness ${Math.round(assessment.data.completeness * 100)} %, suggested maturity ${assessment.data.suggestedMaturity})`} helpId="conceptualize.ai.next-steps">
          <ol className="con-steps">
            {assessment.data.nextSteps.map((s) => (
              <li key={s.id}>
                <Badge tone={s.priority === 'high' ? 'warning' : 'neutral'}>{s.priority}</Badge> {s.text} {s.operation && <span className="con-muted">({s.operation})</span>}
              </li>
            ))}
            {!assessment.data.nextSteps.length && <li className="con-muted">No open steps.</li>}
          </ol>
          <p className="con-muted">{assessment.data.note}</p>
        </Section>
      )}
      {id && (
        <Section title="Changes applied from the assistant (traceability)" helpId="conceptualize.ai.provenance">
          <ul className="con-history">
            {ai.map((h) => (
              <li key={h.id}>
                {h.entityType} {h.action} <span className="con-muted">{formatDate(h.occurredAt)}, applied by {h.actor} from proposal {h.provenance.proposalId} (conversation {h.provenance.conversationId})</span>
              </li>
            ))}
            {!ai.length && <li className="con-muted">No assistant changes for this Concept.</li>}
          </ul>
        </Section>
      )}
    </div>
  )
}
