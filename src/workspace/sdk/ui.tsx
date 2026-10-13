import type { ReactNode } from 'react'
import type { EngineeringObject, ReviewStatus } from '../domain/types'
import type { Freshness } from '../domain/freshness'
import { useWorkspaceStore } from './store'
import { Icons, iconForType } from './icons'

/** Small presentational building blocks shared by the workspace and tools. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`ws-badge ws-tone-${tone}`} title={title}>
      {children}
    </span>
  )
}

const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  draft: 'neutral',
  'in-review': 'info',
  approved: 'success',
  rejected: 'danger',
}

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  draft: 'Review: draft',
  'in-review': 'Review: in review',
  approved: 'Review: approved',
  rejected: 'Review: rejected',
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_TONE[status]}>{REVIEW_LABEL[status]}</Badge>
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  return freshness.stale ? (
    <Badge tone="warning" title={`Inputs changed since this output was saved:\n${freshness.reasons.join('\n')}`}>
      Potentially stale
    </Badge>
  ) : (
    <Badge tone="neutral" title="All inputs unchanged since this output was saved">
      Inputs unchanged
    </Badge>
  )
}

export const COMPLIANCE_LABEL: Record<string, string> = {
  'not-assessed': 'Not assessed',
  compliant: 'Compliant',
  'non-compliant': 'Non-compliant',
}

export function ComplianceBadge({ value }: { value: unknown }) {
  const key = typeof value === 'string' ? value : 'not-assessed'
  const tone: Tone = key === 'compliant' ? 'success' : key === 'non-compliant' ? 'danger' : 'neutral'
  return <Badge tone={tone}>{COMPLIANCE_LABEL[key] ?? key}</Badge>
}

/** A clickable reference to an engineering object that selects it in the shared context. */
export function ObjectRef({ object, showName = true }: { object: EngineeringObject; showName?: boolean }) {
  const select = useWorkspaceStore((s) => s.select)
  const selected = useWorkspaceStore((s) => s.context.selectedIds.includes(object.id))
  const Icon = iconForType(object.type)
  return (
    <button
      type="button"
      className={`ws-objref${selected ? ' is-selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        select([object.id])
      }}
      title={`Select ${object.id} ${object.name}`}
    >
      <Icon width={13} height={13} />
      <span className="ws-mono">{object.id}</span>
      {showName && <span>{object.name}</span>}
    </button>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  const Icon = tone === 'warning' || tone === 'danger' ? Icons.alert : Icons.info
  return (
    <div className={`ws-notice ws-tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="ws-notice-icon" />
      <div className="ws-notice-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {actions && <div className="ws-notice-actions">{actions}</div>}
    </div>
  )
}

export function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`ws-panel ${className}`}>
      <header className="ws-panel-header">
        <h3>{title}</h3>
        {actions && <div className="ws-panel-actions">{actions}</div>}
      </header>
      <div className="ws-panel-body">{children}</div>
    </section>
  )
}

export function DemoTag({ children = 'Demo calculation' }: { children?: ReactNode }) {
  return <span className="ws-demo-tag">{children}</span>
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
