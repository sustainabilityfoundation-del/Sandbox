import { useConversation } from '../../assistant/conversation'
import type { ChangeProposal, PreviewChange, ProposalStatus } from '../../assistant/types'
import type { ServiceProposalItem } from '@ews/platform-sdk'
import { formatValue } from '@ews/model-service'
import { useWorkspaceStore } from '../../platform/store'
import { Badge, Button, Notice, Spinner, type IconName, type Tone } from '@ews/design-system'
import { Reference } from './MessageText'

const STATUS: Record<ProposalStatus, { label: string; tone: Tone; icon: IconName }> = {
  pending: { label: 'Awaiting review', tone: 'info', icon: 'pending' },
  applying: { label: 'Applying…', tone: 'info', icon: 'spinner' },
  applied: { label: 'Applied', tone: 'success', icon: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral', icon: 'rejected' },
  conflict: { label: 'Preview refreshed', tone: 'warning', icon: 'conflict' },
  failed: { label: 'Failed', tone: 'danger', icon: 'error' },
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
          {change.note && <span className="text-fg-3"> ({change.note})</span>}
        </td>
      </tr>
    )
  }
  if (change.kind === 'create-object') {
    return (
      <tr>
        <td className="font-mono">{change.ref}</td>
        <td>New {change.type}</td>
        <td className="as-old">Does not exist</td>
        <td className="as-new">
          “{change.name}”{change.parentId ? ` in ${change.parentId}` : ''}
          {Object.keys(change.properties).length > 0 && (
            <span className="text-fg-3"> ({Object.entries(change.properties).map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')})</span>
          )}
        </td>
      </tr>
    )
  }
  const adding = change.kind === 'add-relationship'
  return (
    <tr>
      <td>
        {change.from.startsWith('$') ? <span className="font-mono">{change.from}</span> : <Reference id={change.from} />} →{' '}
        {change.to.startsWith('$') ? <span className="font-mono">{change.to}</span> : <Reference id={change.to} />}
      </td>
      <td>Relationship “{change.type}”</td>
      <td className="as-old">{adding ? 'Not linked' : 'Linked'}</td>
      <td className="as-new">{adding ? 'Linked' : 'Removed'}</td>
    </tr>
  )
}

const BASIS_LABEL: Record<NonNullable<ServiceProposalItem['basis']>, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  'user-statement': { label: 'Your statement', tone: 'neutral' },
  'ai-hypothesis': { label: 'AI hypothesis', tone: 'warning' },
  assumption: { label: 'Assumption', tone: 'warning' },
  estimate: { label: 'Preliminary estimate', tone: 'info' },
  evidence: { label: 'Evidence', tone: 'success' },
}

/** Preview of a change to a service-backed module: what will be created or changed, and on what basis. */
function ServicePreview({ service }: { service: NonNullable<ChangeProposal['service']> }) {
  return (
    <div className="as-card-table" data-service-module={service.module}>
      <table className="ws-table ws-table-compact" aria-label="Proposed changes">
        <thead>
          <tr>
            <th>Item</th>
            <th>Current</th>
            <th>Proposed</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          {service.items.map((item, i) => (
            <tr key={i}>
              <td>{item.label}{item.targetId ? <span className="text-fg-3"> {item.targetId}</span> : null}</td>
              <td>{item.current ?? <span className="text-fg-3">(new)</span>}</td>
              <td>{item.proposed}</td>
              <td>{item.basis ? <Badge tone={BASIS_LABEL[item.basis].tone}>{BASIS_LABEL[item.basis].label}</Badge> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {service.assumptions.length > 0 && (
        <div className="as-card-why">
          <strong>Assumptions to check:</strong>
          <ul className="m-0 pl-5">
            {service.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {service.appliedSummary && <p className="as-card-why">{service.appliedSummary}</p>}
    </div>
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
  // A stale declarative proposal is never re-applied with a changed intention: it must be prepared again.
  const staleDeclarative = proposal.status === 'conflict' && !!proposal.service?.declarative
  const reviewable = proposal.status === 'pending' || (proposal.status === 'conflict' && !staleDeclarative)

  return (
    <div className={`as-card is-${proposal.status}`} data-proposal-id={proposal.id}>
      <header className="as-card-head">
        <span className="font-mono">{proposal.id}</span>
        <strong>{proposal.title}</strong>
        {proposal.undoOf && <Badge tone="neutral" icon="undo">Undo of {proposal.undoOf}</Badge>}
        <Badge tone={status.tone} icon={status.icon} spin={proposal.status === 'applying'}>
          {status.label}
        </Badge>
        {proposal.reopened && <Badge tone="info" icon="history">From an earlier session</Badge>}
        {proposal.server?.kind === 'closure' && <Badge tone="warning">Fallback: applies only in the window that prepared it</Badge>}
        {proposal.server?.kind === 'declarative' && <Badge tone="neutral" icon="saved">Saved; applied by the {proposal.service?.module} API</Badge>}
      </header>
      {proposal.service ? (
        <ServicePreview service={proposal.service} />
      ) : (
        <div className="as-card-table">
          <table className="ws-table ws-table-compact" aria-label={`Changes in ${proposal.id}`}>
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
      )}
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
        {proposal.createdIds && (
          <div>
            <dt>Created</dt>
            <dd>
              {proposal.createdIds.map((id) => (
                <Reference key={id} id={id} />
              ))}
            </dd>
          </div>
        )}
        {(proposal.requiredEntitlements ?? []).length > 0 && (
          <div>
            <dt>Needs</dt>
            <dd>{(proposal.requiredEntitlements ?? []).map((e) => e.replace('tool:', '')).join(', ')}</dd>
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
            <Button size="sm" variant="filled" icon="check" onPress={() => void apply(proposal.id)}>
              {proposal.status === 'conflict' ? 'Apply refreshed preview' : 'Apply'}
            </Button>
            <Button size="sm" variant="outlined" icon="close" onPress={() => reject(proposal.id)}>
              Reject
            </Button>
          </>
        )}
        {staleDeclarative && (
          <>
            <span className="text-fg-3">Ask the assistant again for a current preview.</span>
            <Button size="sm" variant="outlined" onPress={() => reject(proposal.id)}>
              Dismiss
            </Button>
          </>
        )}
        {proposal.status === 'failed' && (
          <>
            <Button size="sm" variant="filled" icon="reset" onPress={() => void apply(proposal.id)}>
              Retry
            </Button>
            <Button size="sm" variant="outlined" onPress={() => reject(proposal.id)}>
              Dismiss
            </Button>
          </>
        )}
        {proposal.status === 'applying' && (
          <span className="inline-flex items-center gap-2 text-fg-3">
            <Spinner size={16} /> Validating and committing…
          </span>
        )}
        {proposal.status === 'applied' &&
          (proposal.undoneBy ? (
            <span className="text-fg-3">Undone by {proposal.undoneBy}</span>
          ) : (
            <Button size="sm" variant="outlined" icon="undo" onPress={() => void undo(proposal.id)}>
              Undo
            </Button>
          ))}
      </footer>
    </div>
  )
}
