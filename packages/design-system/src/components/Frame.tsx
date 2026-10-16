import type { ReactNode } from 'react'
import {
  Button as AriaButton,
  Disclosure,
  DisclosurePanel,
  Heading,
  Link as AriaLink,
} from 'react-aria-components'
import { cx } from './cx'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'

/*
 * Frame components for dense engineering layouts: panel headers, collapsible
 * property sections, breadcrumbs, status bar items and avatars. They carry no
 * application state; the shell and tools compose them.
 */

// ---- Panel header ---------------------------------------------------------------------------

/**
 * The compact header of a docked panel (explorer, inspector, assistant): a title, optional
 * leading icon and trailing actions, on the panel's chrome surface. Height follows density
 * (`--ws-panel-header-h`, 36 px comfortable).
 */
export function PanelHeader({
  title,
  icon,
  actions,
  children,
  className,
  headingLevel = 2,
}: {
  title: ReactNode
  icon?: IconName
  /** Trailing controls (IconButtons, MenuButtons). */
  actions?: ReactNode
  /** Extra content under the title row (tabs, a search field). */
  children?: ReactNode
  className?: string
  headingLevel?: 2 | 3
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <div className={cx('ws-panel-header flex flex-none flex-col border-b border-line bg-[var(--ws-panel-header-bg)]', className)}>
      <div className="flex h-panel-header min-w-0 items-center gap-1.5 pl-3 pr-1">
        {icon && <Icon name={icon} size={16} className="text-fg-2" />}
        <H className="m-0 min-w-0 flex-1 truncate text-15 font-strong text-fg">{title}</H>
        {actions && <div className="flex flex-none items-center gap-0.5">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

// ---- Collapsible section -------------------------------------------------------------------

/**
 * A titled, collapsible group (inspector property sections, explorer groups). Uses React Aria
 * Disclosure: the heading is a button with aria-expanded; Enter or Space toggles.
 */
export function CollapsibleSection({
  title,
  count,
  actions,
  children,
  defaultExpanded = true,
  isExpanded,
  onExpandedChange,
  className,
  id,
}: {
  title: ReactNode
  /** Shown after the title, e.g. the number of items. */
  count?: number
  /** Controls at the end of the heading row (outside the toggle button). */
  actions?: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  isExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  className?: string
  id?: string
}) {
  return (
    <Disclosure
      id={id}
      defaultExpanded={defaultExpanded}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      className={cx('ws-section group/section border-b border-line last:border-b-0', className)}
    >
      {({ isExpanded: open }) => (
        <>
          <Heading level={3} className="m-0 flex min-h-[var(--ws-row-h)] items-center gap-1 pr-1">
            <AriaButton
              slot="trigger"
              className={cx(
                'flex min-h-[var(--ws-row-h)] min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-sm py-1 pl-1 text-left text-13 font-strong text-fg outline-none',
                'data-[hovered]:bg-hover data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
              )}
            >
              <Icon name="chevron-right" size={14} className={cx('text-fg-3 transition-transform duration-[var(--ws-motion-short)]', open && 'rotate-90')} />
              <span className="truncate">{title}</span>
              {count !== undefined && <span className="font-normal text-fg-3">({count})</span>}
            </AriaButton>
            {actions && <span className="flex flex-none items-center gap-0.5">{actions}</span>}
          </Heading>
          <DisclosurePanel className="ws-section-body pb-2 pl-6 pr-2 text-ui-sm">{children}</DisclosurePanel>
        </>
      )}
    </Disclosure>
  )
}

// ---- Breadcrumbs ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  id: string
  label: ReactNode
  /** Accessible text when the label is not a string. */
  textValue?: string
  icon?: IconName
  /** Navigates to this level; the last item is the current location and is not a link. */
  onPress?: () => void
}

/**
 * Location trail: a navigation landmark with an ordered list; the last item is the current location
 * (aria-current). Items with `onPress` are links (React Aria Link: keyboard and press handling); the others
 * are plain text. (Plain markup rather than React Aria Breadcrumbs, whose collection cannot render inside
 * other React Aria collections such as Tabs.)
 */
export function Breadcrumbs({ items, label = 'Location', className }: { items: BreadcrumbItem[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx('ws-breadcrumbs min-w-0', className)}>
      <ol className="m-0 flex min-w-0 list-none items-center gap-1 p-0 text-ui-sm text-fg-2">
        {items.map((item, index) => {
          const current = index === items.length - 1
          const content = (
            <>
              {item.icon && <Icon name={item.icon} size={14} className="text-fg-3" />}
              <span className="truncate">{item.label}</span>
            </>
          )
          return (
            <li key={item.id} className={cx('flex min-w-0 items-center gap-1', current ? 'flex-shrink' : 'flex-none')}>
              {item.onPress && !current ? (
                <AriaLink
                  onPress={item.onPress}
                  aria-label={item.textValue}
                  className="flex min-w-0 cursor-pointer items-center gap-1 rounded-xs px-0.5 outline-none data-[hovered]:text-accent data-[hovered]:underline data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus"
                >
                  {content}
                </AriaLink>
              ) : (
                <span aria-current={current ? 'location' : undefined} className={cx('flex min-w-0 items-center gap-1 px-0.5', current && 'font-medium text-fg')}>
                  {content}
                </span>
              )}
              {!current && <Icon name="chevron-right" size={12} className="flex-none text-fg-3" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---- Status bar ---------------------------------------------------------------------------

/**
 * One item of the status bar: an icon and short text, optionally a button that opens details.
 * The icon is paired with text, so status never depends on colour alone.
 */
export function StatusBarItem({
  icon,
  tone = 'neutral',
  children,
  label,
  onPress,
  spin,
  className,
  testId,
}: {
  icon?: IconName
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  children: ReactNode
  /** Accessible name when the visible text is abbreviated. */
  label?: string
  onPress?: () => void
  spin?: boolean
  className?: string
  testId?: string
}) {
  const toneClass =
    tone === 'success' ? 'text-success-solid' : tone === 'warning' ? 'text-warning-solid' : tone === 'danger' ? 'text-error-solid' : tone === 'info' ? 'text-accent' : 'text-fg-3'
  const content = (
    <>
      {icon && <Icon name={icon} size={14} className={cx(toneClass, spin && 'ws-spin')} />}
      <span className="truncate">{children}</span>
    </>
  )
  const base = 'ws-status-item flex h-full min-w-0 flex-none items-center gap-1.5 px-2 text-ui-xs text-fg-2 whitespace-nowrap'
  if (onPress) {
    return (
      <AriaButton
        aria-label={label}
        onPress={onPress}
        data-testid={testId}
        className={cx(base, 'cursor-pointer outline-none data-[hovered]:bg-hover data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus', className)}
      >
        {content}
      </AriaButton>
    )
  }
  return (
    <span className={cx(base, className)} aria-label={label} data-testid={testId}>
      {content}
    </span>
  )
}

/** Separator between status bar groups. */
export function StatusBarSeparator() {
  return <span aria-hidden="true" className="h-3.5 w-px flex-none bg-line" />
}

// ---- Avatar --------------------------------------------------------------------------------

/** Initials in a circle (user account, conversation participants). Decorative unless labelled. */
export function Avatar({ name, size = 28, tone = 'accent', label, className }: { name: string; size?: number; tone?: 'accent' | 'neutral'; label?: string; className?: string }) {
  const initials =
    name
      .split(/[\s._@-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        'ws-avatar inline-grid flex-none place-items-center rounded-full font-strong',
        tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-surface-4 text-fg-2',
        size <= 24 ? 'text-[10px]' : 'text-ui-xs',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  )
}
