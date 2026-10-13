import { useConversation } from '../../assistant/conversation'
import type { PreviewChange, ProposalStatus } from '../../assistant/types'
import { formatValue } from '../../domain/units'
import { useWorkspaceStore } from '../../sdk/store'
import { Badge, Notice, type Tone } from '../../sdk/ui'
import { Reference } from './MessageText'

const STATUS: Record<ProposalStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting review', tone: 'info' },
  applying: { label: 'Applying…', tone: 'info' },
  applied: { label: 'Applied', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  conflict: { label: 'Preview refreshed', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
}

function ChangeRow({ change }: { change: PreviewChange }) {
  if (change.kind === 'set-property') {
    return (
      <tr>
        <td>
          <Reference id={change.targetId} />
        </td>
        <td>{change.label}</td>
        <td className="as-old">{formatValue(change.current)}</td>
        <td className="as-new">
          {formatValue(change.proposed)}
          {change.note && <span className="ws-muted"> ({change.note})</span>}
        </td>
      </tr>
    )
  }
  const adding = change.kind === 'add-relationship'
  return (
    <tr>
      <td>
        <Reference id={change.from} /> → <Reference id={change.to} />
      </td>
      <td>Relationship “{change.type}”</td>
      <td className="as-old">{adding ? 'Not linked' : 'Linked'}</td>
      <td className="as-new">{adding ? 'Linked' : 'Removed'}</td>
    </tr>
  )
}

/** Compact preview of a proposed transaction with Apply / Reject / Undo. */
export function ChangeCard({ proposalId }: { proposalId: string }) {
  const proposal = useConversation((s) => s.proposals[proposalId])
  const apply = useConversation((s) => s.applyProposal)
  const reject = useConversation((s) => s.rejectProposal)
  const undo = useConversation((s) => s.undoProposal)
  const configurations = useWorkspaceStore((s) => s.model?.snapshot.configurations ?? [])
  if (!proposal) return null

  const status = STATUS[proposal.status]
  const configuration = configurations.find((c) => c.id === proposal.configurationId)
  const expected = proposal.changes
    .filter((c): c is Extract<PreviewChange, { kind: 'set-property' }> => c.kind === 'set-property')
    .map((c) => `${c.targetId} rev ${c.expectedRevision}`)
  const reviewable = proposal.status === 'pending' || proposal.status === 'conflict'

  return (
    <div className={`as-card is-${proposal.status}`} data-proposal-id={proposal.id}>
      <header className="as-card-head">
        <span className="ws-mono">{proposal.id}</span>
        <strong>{proposal.title}</strong>
        {proposal.undoOf && <Badge tone="neutral">Undo of {proposal.undoOf}</Badge>}
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <div className="as-card-table">
        <table className="ws-table ws-table-compact">
          <thead>
            <tr>
              <th>Target</th>
              <th>Property / relationship</th>
              <th>Current</th>
              <th>Proposed</th>
            </tr>
          </thead>
          <tbody>
            {proposal.changes.map((c, i) => (
              <ChangeRow key={i} change={c} />
            ))}
          </tbody>
        </table>
      </div>
      <dl className="as-card-meta">
        <div>
          <dt>Configuration</dt>
          <dd>
            {proposal.configurationId}
            {configuration ? ` · ${configuration.name}` : ''}
          </dd>
        </div>
        {expected.length > 0 && (
          <div>
            <dt>Expected revision</dt>
            <dd>{expected.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt>Preview at</dt>
          <dd>model rev {proposal.previewModelRevision}</dd>
        </div>
        {proposal.committedRevision !== undefined && (
          <div>
            <dt>Committed</dt>
            <dd>
              <strong>model rev {proposal.committedRevision}</strong>
            </dd>
          </div>
        )}
      </dl>
      <p className="as-card-why">{proposal.explanation}</p>
      {proposal.affectedOutputIds.length > 0 && (
        <p className="as-card-affected">
          {proposal.status === 'applied' ? 'Marked potentially stale:' : 'Will mark potentially stale:'}{' '}
          {proposal.affectedOutputIds.map((id) => (
            <Reference key={id} id={id} />
          ))}
        </p>
      )}
      {proposal.message && (
        <Notice tone={proposal.status === 'failed' ? 'danger' : 'warning'} title={proposal.status === 'failed' ? 'Not applied' : 'The model changed'}>
          {proposal.message}
        </Notice>
      )}
      <footer className="as-card-actions">
        {reviewable && (
          <>
            <button type="button" className="ws-button ws-button-small ws-button-primary" onClick={() => void apply(proposal.id)}>
              {proposal.status === 'conflict' ? 'Apply refreshed preview' : 'Apply'}
            </button>
            <button type="button" className="ws-button ws-button-small" onClick={() => reject(proposal.id)}>
              Reject
            </button>
          </>
        )}
        {proposal.status === 'failed' && (
          <>
            <button type="button" className="ws-button ws-button-small ws-button-primary" onClick={() => void apply(proposal.id)}>
              Retry
            </button>
            <button type="button" className="ws-button ws-button-small" onClick={() => reject(proposal.id)}>
              Dismiss
            </button>
          </>
        )}
        {proposal.status === 'applying' && (
          <span className="ws-muted">
            <span className="ws-spinner ws-spinner-small" aria-hidden="true" /> Validating and committing…
          </span>
        )}
        {proposal.status === 'applied' &&
          (proposal.undoneBy ? (
            <span className="ws-muted">Undone by {proposal.undoneBy}</span>
          ) : (
            <button type="button" className="ws-button ws-button-small" onClick={() => void undo(proposal.id)}>
              Undo
            </button>
          ))}
      </footer>
    </div>
  )
}
