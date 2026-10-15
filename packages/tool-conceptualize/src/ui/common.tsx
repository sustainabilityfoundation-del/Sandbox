import { Badge, Button, Notice } from '@ews/design-system'
import type { ConceptMaturity } from '@ews/platform-sdk'
import { useToolViewState } from '@ews/platform-sdk/react'
import type { Basis, ProvenanceInfo } from '@ews/conceptualize-client'
import type { ReactNode } from 'react'
import { errorInfo } from '../data'
import { BASIS, MATURITY, type ConceptualizeViewState } from '../domain'

export function MaturityBadge({ maturity }: { maturity: ConceptMaturity }) {
  const m = MATURITY[maturity]
  return (
    <Badge tone={m.tone} icon={m.icon} title="Maturity (separate from implementation and verification status)">
      {m.label}
    </Badge>
  )
}

/** Basis of a statement, score or record: AI hypotheses, assumptions and estimates are labelled as such. */
export function BasisBadge({ basis }: { basis: Basis }) {
  const b = BASIS[basis]
  return (
    <Badge tone={b.tone} icon={b.icon} title={b.title}>
      {b.label}
    </Badge>
  )
}

export function ProvenanceBadge({ provenance }: { provenance: ProvenanceInfo }) {
  if (provenance.sourceKind !== 'assistant') return null
  return (
    <Badge tone="warning" icon="assistant" title={`Applied from assistant proposal ${provenance.proposalId ?? ''} (conversation ${provenance.conversationId ?? ''})`}>
      From assistant {provenance.proposalId}
    </Badge>
  )
}

/** A link to another Concept: opens it in this view. */
export function ConceptLinkButton({ id, label }: { id: string; label: ReactNode }) {
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  return (
    <Button size="sm" variant="text" className="con-link" onPress={() => setState({ conceptId: id, page: 'explorer' })}>
      {label}
    </Button>
  )
}

export function ApiErrorNotice({ error, title, onReload }: { error: unknown; title?: string; onReload?: () => void }) {
  const info = errorInfo(error)
  const conflict = info.code === 'conflict'
  return (
    <Notice
      tone={conflict ? 'warning' : 'danger'}
      title={title ?? (conflict ? 'Someone else changed this first' : info.code === 'forbidden' ? 'Not allowed' : info.code === 'unavailable' ? 'The Conceptualize service is not reachable' : 'Not saved')}
      actions={
        conflict && onReload ? (
          <Button size="sm" variant="outlined" icon="sync" onPress={onReload}>
            Load latest
          </Button>
        ) : undefined
      }
    >
      <span>{info.message}</span>
      {info.fields && (
        <ul className="con-field-errors">
          {Object.entries(info.fields).map(([k, v]) => (
            <li key={k}>
              <code>{k}</code>: {v}
            </li>
          ))}
        </ul>
      )}
    </Notice>
  )
}

export function Section({ title, actions, children, helpId }: { title: ReactNode; actions?: ReactNode; children: ReactNode; helpId?: string }) {
  return (
    <section className="con-section" data-help-id={helpId}>
      <header className="con-section-head">
        <h4>{title}</h4>
        {actions && <div className="con-row">{actions}</div>}
      </header>
      {children}
    </section>
  )
}
