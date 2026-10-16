import type { ReactNode } from 'react'
import {
  Cell as AriaCell,
  Group,
  Column as AriaColumn,
  Row as AriaRow,
  Separator,
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Tabs as AriaTabs,
  Toolbar as AriaToolbar,
  type CellProps,
  type ColumnProps,
  type RowProps,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TableProps,
  type TabsProps,
  type ToolbarProps,
} from 'react-aria-components'
import { cx } from './cx'

// ---- Tabs ----------------------------------------------------------------------------------

/** Tabs: arrow keys move between tabs; the selected tab shows a 2 px accent indicator. */
export function Tabs({ className, ...props }: Omit<TabsProps, 'className'> & { className?: string }) {
  return <AriaTabs {...props} className={cx('flex min-h-0 min-w-0 flex-col', className)} />
}

export function TabList<T extends object>({ className, ...props }: Omit<TabListProps<T>, 'className'> & { className?: string }) {
  return <AriaTabList {...props} className={cx('flex min-w-0 items-stretch gap-0.5 overflow-x-auto', className)} />
}

export function Tab({ className, children, ...props }: Omit<TabProps, 'className' | 'children'> & { className?: string; children: ReactNode }) {
  return (
    <AriaTab
      {...props}
      className={cx(
        'relative flex min-h-touch cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 text-ui-sm font-medium text-fg-2 outline-none',
        'transition-colors duration-[var(--ws-motion-short)] ease-standard',
        'data-[hovered]:bg-hover data-[hovered]:text-fg data-[pressed]:bg-pressed',
        'data-[selected]:text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-transparent data-[selected]:after:bg-accent',
        'after:transition-colors after:duration-[var(--ws-motion-medium)]',
        'data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
        'data-[disabled]:opacity-40',
        className,
      )}
    >
      {children}
    </AriaTab>
  )
}

export function TabPanel({ className, ...props }: Omit<TabPanelProps, 'className'> & { className?: string }) {
  return <AriaTabPanel {...props} className={cx('min-h-0 min-w-0 outline-none data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus', className)} />
}

// ---- Toolbar ------------------------------------------------------------------------------

/** Group of controls; arrow keys move between them and Tab leaves the toolbar. */
export function Toolbar({ className, ...props }: Omit<ToolbarProps, 'className'> & { className?: string }) {
  return <AriaToolbar {...props} className={cx('flex min-w-0 items-center gap-1', className)} />
}

export function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-5 w-px flex-none self-center bg-line" />
}

/** A labelled group of related toolbar controls (selection tools, zoom, view modes). */
export function ToolbarGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Group aria-label={label} className={cx('ws-toolbar-group flex flex-none items-center gap-0.5', className)}>
      {children}
    </Group>
  )
}

// ---- Data table --------------------------------------------------------------------------------

/**
 * Data table (React Aria Table): keyboard navigation across rows and cells,
 * optional row selection. With `cards`, rows become labelled cards in narrow
 * tool containers; give cells a `label` for that layout.
 */
export function Table<T extends object>({
  className,
  cards,
  ...props
}: Omit<TableProps, 'className'> & { className?: string; cards?: boolean; children?: ReactNode; items?: T[] }) {
  return <AriaTable {...props} className={cx('ws-dtable', cards && 'ws-dtable-cards', className)} />
}

export const TableHeader = AriaTableHeader
export const TableBody = AriaTableBody

export function Column({ className, width, ...props }: Omit<ColumnProps, 'className' | 'width'> & { className?: string; width?: number }) {
  return <AriaColumn {...props} className={className} style={width ? { width } : undefined} />
}

export function Row<T extends object>({ className, ...props }: Omit<RowProps<T>, 'className'> & { className?: string }) {
  return <AriaRow {...props} className={className} />
}

export function Cell({
  label,
  wide,
  title,
  className,
  ...props
}: Omit<CellProps, 'className'> & {
  /** Shown above the value in the narrow card layout. */
  label?: string
  /** Spans the full card width in the narrow layout. */
  wide?: boolean
  /** The card's heading in the narrow layout (no label shown). */
  title?: boolean
  className?: string
}) {
  return (
    <AriaCell
      {...props}
      className={className}
      data-label={label}
      data-wide={wide || title ? '' : undefined}
      data-title={title ? '' : undefined}
    />
  )
}
