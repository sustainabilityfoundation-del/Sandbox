import type { ReactNode } from 'react'
import { ProgressBar } from 'react-aria-components'
import { cx } from './cx'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-2 border-line',
  info: 'bg-info-soft text-info border-info-line',
  success: 'bg-success-soft text-success border-success',
  warning: 'bg-warning-soft text-warning border-warning-line',
  danger: 'bg-error-soft text-error border-error-line',
}

/** Indeterminate progress indicator; announced as busy when it has a label. */
export function Spinner({ size = 18, label, className }: { size?: number; label?: string; className?: string }) {
  const icon = <Icon name="spinner" size={size} className={cx('ws-spin', className)} />
  if (!label) return icon
  return (
    <ProgressBar isIndeterminate aria-label={label} className="inline-flex">
      {icon}
    </ProgressBar>
  )
}

/** A small label with icon and text. Status is never conveyed by colour alone. */
export function Badge({
  tone = 'neutral',
  icon,
  spin,
  children,
  title,
  className,
}: {
  tone?: Tone
  icon?: IconName
  spin?: boolean
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex h-[22px] max-w-full items-center gap-1 whitespace-nowrap rounded-sm border px-2 text-ui-xs font-medium',
        TONE[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={14} className={spin ? 'ws-spin' : undefined} />}
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * The workspace's model states. Each has its own words and icon so they stay
 * distinct: saving is not analysis, a stale output is not a failed one,
 * compliance (does the design meet the requirement?) is not review (has a
 * person approved this result?).
 */
export const STATUS = {
  unsaved: { tone: 'warning', icon: 'unsaved', label: 'Unsaved changes' },
  saving: { tone: 'info', icon: 'spinner', label: 'Saving…', spin: true },
  saved: { tone: 'success', icon: 'saved', label: 'Saved' },
  'save-failed': { tone: 'danger', icon: 'conflict', label: 'Save failed' },
  running: { tone: 'info', icon: 'spinner', label: 'Analysis running', spin: true },
  'run-failed': { tone: 'danger', icon: 'error', label: 'Analysis failed' },
  'run-interrupted': { tone: 'warning', icon: 'warning', label: 'Run interrupted' },
  current: { tone: 'neutral', icon: 'success', label: 'Inputs unchanged' },
  stale: { tone: 'warning', icon: 'history', label: 'Potentially stale' },
  compliant: { tone: 'success', icon: 'success', label: 'Compliant' },
  'non-compliant': { tone: 'danger', icon: 'failed', label: 'Non-compliant' },
  'not-assessed': { tone: 'neutral', icon: 'minus', label: 'Not assessed' },
  'review-draft': { tone: 'neutral', icon: 'draft', label: 'Review: draft' },
  'review-in-review': { tone: 'info', icon: 'pending', label: 'Review: in review' },
  'review-approved': { tone: 'success', icon: 'approved', label: 'Review: approved' },
  'review-rejected': { tone: 'danger', icon: 'rejected', label: 'Review: rejected' },
} as const satisfies Record<string, { tone: Tone; icon: IconName; label: string; spin?: boolean }>

export type StatusKind = keyof typeof STATUS

export function StatusBadge({ status, label, title }: { status: StatusKind; label?: ReactNode; title?: string }) {
  const s = STATUS[status] as { tone: Tone; icon: IconName; label: string; spin?: boolean }
  return (
    <Badge tone={s.tone} icon={s.icon} spin={s.spin} title={title}>
      {label ?? s.label}
    </Badge>
  )
}

/** Inline message with an optional action area; danger and warning are announced. */
export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  const icon: IconName = tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'info'
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cx('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-card border px-3 py-2.5 text-fg', TONE[tone], 'text-fg', className)}
    >
      <Icon name={icon} size={20} className={cx('mt-px', tone === 'neutral' ? 'text-fg-2' : TONE[tone].split(' ')[1])} />
      <div className="min-w-[min(14rem,100%)] flex-1 basis-0 text-ui-sm">
        {title && <strong className="block font-medium text-fg">{title}</strong>}
        {children && <div className="text-fg-2">{children}</div>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  )
}

/** Loading placeholder for a region. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cx('flex flex-1 items-center justify-center gap-3 p-6 text-ui-sm text-fg-3', className)}>
      <Spinner size={22} label={label} />
      <span>{label}</span>
    </div>
  )
}

/** Empty region with a short explanation and an optional action. */
export function EmptyState({ icon = 'info', title, children, action }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <Icon name={icon} size={28} className="text-fg-3" />
      <strong className="text-ui font-medium text-fg">{title}</strong>
      {children && <p className="m-0 max-w-96 text-ui-sm text-fg-2">{children}</p>}
      {action}
    </div>
  )
}
