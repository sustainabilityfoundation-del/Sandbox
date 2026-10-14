import { AppIcon, StatusBadge, cx, type IconName, type StatusKind } from '@ews/design-system'
import { displayId, type EngineeringObject, type Freshness, type ObjectType, type RequirementStatus, type ReviewStatus } from '@ews/model-service'
import type { ReactNode } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { shallowEqual, useHostValue, useOptionalToolScope, usePlatformHost } from './host'

/**
 * Engineering presentation helpers shared by the platform and tools, built on
 * the design system. Status helpers map model states onto StatusBadge, so
 * every tool shows them with the same words, icons and colours.
 */

const OBJECT_ICON: Record<ObjectType, IconName> = {
  assembly: 'assembly',
  part: 'component',
  requirement: 'requirement',
  'sysml-element': 'sysml-element',
  'cad-representation': 'cad-representation',
  procedure: 'procedure',
}

/** The semantic icon for an object type (duotone category icons). */
export function iconForType(type: ObjectType): IconName {
  return OBJECT_ICON[type] ?? 'component'
}

export const OBJECT_TYPE_LABEL: Record<ObjectType, string> = {
  assembly: 'Assembly',
  part: 'Part',
  requirement: 'Requirement',
  'sysml-element': 'SysML element',
  'cad-representation': 'CAD representation',
  procedure: 'Verification procedure (retired tool)',
}

const REVIEW: Record<ReviewStatus, StatusKind> = {
  draft: 'review-draft',
  'in-review': 'review-in-review',
  approved: 'review-approved',
  rejected: 'review-rejected',
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <StatusBadge status={REVIEW[status]} />
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  return freshness.stale ? (
    <StatusBadge status="stale" title={`Inputs changed since this artifact was saved:\n${freshness.reasons.join('\n')}`} />
  ) : (
    <StatusBadge status="current" title="All inputs are unchanged since this artifact was saved" />
  )
}

const REQUIREMENT_STATUS: Record<RequirementStatus, { icon: IconName; label: string; tone: string }> = {
  draft: { icon: 'draft', label: 'Draft', tone: 'border-line bg-surface-2 text-fg-2' },
  'in-review': { icon: 'review', label: 'In review', tone: 'border-info-line bg-info-soft text-info' },
  approved: { icon: 'approved', label: 'Approved', tone: 'border-success bg-success-soft text-success' },
  obsolete: { icon: 'archive', label: 'Obsolete', tone: 'border-line bg-surface-3 text-fg-3' },
}

/** Requirement lifecycle status (not compliance, not review of an artifact). */
export function RequirementStatusBadge({ status, unset }: { status: RequirementStatus; unset?: boolean }) {
  const s = REQUIREMENT_STATUS[status]
  return (
    <span
      className={cx('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-sm border px-2 text-ui-xs font-medium', s.tone)}
      title={unset ? 'No status recorded yet (saved by an earlier version); shown as Draft' : undefined}
    >
      <AppIcon name={s.icon} size="xs" />
      {s.label}
      {unset && <span className="text-fg-3">*</span>}
    </span>
  )
}

/** A reference to an engineering object; pressing it selects the object for this view. */
export function ObjectRef({ object, showName = true }: { object: EngineeringObject; showName?: boolean }) {
  const host = usePlatformHost()
  const viewId = useOptionalToolScope()?.viewId ?? ''
  const selected = useHostValue((h) => h.getContext(viewId).selectedIds.includes(object.id), shallowEqual)
  return (
    <RefChip label={`Select ${displayId(object)} ${object.name}`} selected={selected} onPress={() => host.select([object.id], viewId)}>
      <AppIcon name={iconForType(object.type)} size="xs" />
      <span className="font-mono">{displayId(object)}</span>
      {showName && <span className="truncate">{object.name}</span>}
    </RefChip>
  )
}

/** Compact clickable reference chip (objects, scenarios, saved artifacts). */
export function RefChip({ label, selected, onPress, children }: { label: string; selected?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <AriaButton
      onPress={onPress}
      aria-label={label}
      className={cx(
        'inline-flex min-h-[max(24px,var(--ws-touch-target))] max-w-full cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 align-middle text-ui-xs outline-none',
        'transition-colors duration-[var(--ws-motion-short)] ease-standard',
        selected ? 'border-accent-line bg-selected text-selected-fg' : 'border-line bg-surface-2 text-fg data-[hovered]:border-accent data-[hovered]:text-accent',
        'data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-1 data-[focus-visible]:outline-focus',
      )}
    >
      {children}
    </AriaButton>
  )
}

/** Marks mock or illustrative content, e.g. mock CAD geometry or illustrative SysML notation. */
export function MockTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-sm border border-dashed border-warning bg-warning-soft px-2 text-ui-xs font-medium text-warning">
      <AppIcon name="warning" size="xs" />
      {children}
    </span>
  )
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
