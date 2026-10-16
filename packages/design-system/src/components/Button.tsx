import { forwardRef, type ReactNode, type Ref } from 'react'
import {
  Button as AriaButton,
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  Tooltip as AriaTooltip,
  TooltipTrigger,
  type ButtonProps as AriaButtonProps,
  type Key,
  type ToggleButtonProps as AriaToggleButtonProps,
  type TooltipProps,
} from 'react-aria-components'
import { cx } from './cx'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import { Spinner } from './Status'

/**
 * Button roles (Focused Canvas: compact, precise, 4 px corners):
 *   filled   – the one primary action in a region
 *   tonal    – important secondary actions
 *   outlined – medium emphasis
 *   text     – low emphasis inline actions
 *   quiet    – neutral toolbar-style actions
 *   danger   – destructive actions
 * All sizes respect density and grow to a ~44 px target on touch.
 */

const base =
  'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium outline-none ' +
  'min-h-touch cursor-pointer transition-[background-color,color,box-shadow,border-color] duration-[var(--ws-motion-short)] ease-standard ' +
  'data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus ' +
  'data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[pending]:cursor-progress'

export const buttonVariants = {
  filled:
    'bg-accent text-on-accent data-[hovered]:bg-accent-strong data-[pressed]:bg-accent-strong',
  tonal: 'bg-selected text-selected-fg data-[hovered]:bg-accent-line data-[pressed]:bg-accent-line',
  outlined: 'border border-line-strong bg-transparent text-accent data-[hovered]:bg-hover data-[pressed]:bg-pressed',
  text: 'bg-transparent text-accent data-[hovered]:bg-hover data-[pressed]:bg-pressed',
  quiet: 'bg-transparent text-fg-2 data-[hovered]:bg-hover data-[hovered]:text-fg data-[pressed]:bg-pressed',
  danger: 'border border-error-line bg-transparent text-error data-[hovered]:bg-error-soft data-[pressed]:bg-error-soft',
} as const

const sizes = {
  md: 'h-ctl px-3 text-ui-sm',
  sm: 'h-ctl-sm px-2 text-ui-sm',
} as const

export type ButtonVariant = keyof typeof buttonVariants

export interface ButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  variant?: ButtonVariant
  size?: keyof typeof sizes
  /** Leading icon (semantic name). */
  icon?: IconName
  className?: string
  children?: ReactNode
}

function renderIcon(icon: IconName | undefined, size: number, filled?: boolean) {
  return icon ? <Icon name={icon} size={size} filled={filled} /> : null
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outlined', size = 'md', icon, className, children, isPending, ...rest },
  ref,
) {
  const iconSize = 16
  return (
    <AriaButton
      ref={ref}
      isPending={isPending}
      className={cx(base, buttonVariants[variant], sizes[size], icon && children ? (size === 'md' ? 'pl-2.5' : 'pl-1.5') : '', className)}
      {...rest}
    >
      {isPending ? <Spinner size={iconSize} /> : renderIcon(icon, iconSize)}
      {children}
    </AriaButton>
  )
})

// ---- Tooltip ----------------------------------------------------------------------------

export function Tooltip({
  children,
  shortcut,
  className,
  ...props
}: Omit<TooltipProps, 'children'> & {
  children: ReactNode
  /** Keyboard shortcut hint, e.g. "Ctrl K". */
  shortcut?: string
  className?: string
}) {
  return (
    <AriaTooltip
      offset={6}
      {...props}
      className={cx(
        'ws-tooltip z-[200] flex max-w-72 items-center gap-2 rounded-sm bg-inverse px-2 py-1 text-ui-xs text-on-inverse shadow-2',
        className,
      )}
    >
      <span>{children}</span>
      {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
    </AriaTooltip>
  )
}

/**
 * A keyboard shortcut hint ("Ctrl K"). Decorative next to a labelled control; controls announce their
 * shortcut with aria-keyshortcuts.
 */
export function Kbd({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'inverse' | 'shell'; className?: string }) {
  return (
    <kbd
      className={cx(
        'ws-kbd inline-flex h-[18px] items-center whitespace-nowrap rounded-xs border px-1 font-mono text-ui-xs leading-none font-normal',
        tone === 'inverse' ? 'border-on-inverse/40 text-on-inverse' : tone === 'shell' ? 'border-shell-line text-shell-fg-2' : 'border-line text-fg-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

// ---- Icon button ------------------------------------------------------------------------

export interface IconButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  /** Accessible name, also shown as the tooltip. Required: the button has no visible text. */
  label: string
  icon: IconName
  variant?: 'quiet' | 'tonal' | 'filled' | 'outlined'
  size?: 'md' | 'sm'
  className?: string
  tooltipPlacement?: TooltipProps['placement']
  /** Keyboard shortcut shown in the tooltip and announced (aria-keyshortcuts), e.g. "Control+K". */
  shortcut?: string
}

/** "Control+Shift+K" → "Ctrl Shift K" for display. */
export function shortcutLabel(shortcut: string | undefined): string | undefined {
  return shortcut?.replace(/Control/g, 'Ctrl').replace(/\+/g, ' ')
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'quiet', size = 'md', className, tooltipPlacement = 'bottom', isPending, shortcut, ...rest },
  ref,
) {
  return (
    <TooltipTrigger delay={500} closeDelay={100}>
      <AriaButton
        ref={ref}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        isPending={isPending}
        className={cx(
          base,
          buttonVariants[variant],
          size === 'md' ? 'size-ctl' : 'size-ctl-sm',
          'min-w-touch p-0',
          className,
        )}
        {...rest}
      >
        {isPending ? <Spinner size={size === 'md' ? 18 : 16} /> : renderIcon(icon, size === 'md' ? 18 : 16)}
      </AriaButton>
      <Tooltip placement={tooltipPlacement} shortcut={shortcutLabel(shortcut)}>
        {label}
      </Tooltip>
    </TooltipTrigger>
  )
})

// ---- Toggle buttons -----------------------------------------------------------------------

const toggleSelected =
  'data-[selected]:bg-selected data-[selected]:text-selected-fg data-[selected]:border-accent-line'

export interface ToggleButtonProps extends Omit<AriaToggleButtonProps, 'className' | 'children'> {
  icon?: IconName
  size?: 'md' | 'sm'
  className?: string
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/** A two-state button (on/off), e.g. a display mode or panel toggle. */
export function ToggleButton({ icon, size = 'md', className, children, ...rest }: ToggleButtonProps) {
  return (
    <AriaToggleButton
      className={cx(base, buttonVariants.quiet, toggleSelected, 'border border-transparent', sizes[size], className)}
      {...rest}
    >
      {({ isSelected }) => (
        <>
          {renderIcon(icon, 16, isSelected)}
          {children}
        </>
      )}
    </AriaToggleButton>
  )
}

/** Icon-only toggle with tooltip. */
export function ToggleIconButton({
  label,
  icon,
  size = 'md',
  className,
  shortcut,
  tooltipPlacement = 'bottom',
  ...rest
}: Omit<AriaToggleButtonProps, 'className' | 'children'> & {
  label: string
  icon: IconName
  size?: 'md' | 'sm'
  className?: string
  /** Keyboard shortcut shown in the tooltip and announced, e.g. "Control+B". */
  shortcut?: string
  tooltipPlacement?: TooltipProps['placement']
}) {
  return (
    <TooltipTrigger delay={500} closeDelay={100}>
      <AriaToggleButton
        aria-label={label}
        aria-keyshortcuts={shortcut}
        className={cx(base, buttonVariants.quiet, toggleSelected, 'border border-transparent p-0 min-w-touch', size === 'md' ? 'size-ctl' : 'size-ctl-sm', className)}
        {...rest}
      >
        {({ isSelected }) => renderIcon(icon, size === 'md' ? 18 : 16, isSelected)}
      </AriaToggleButton>
      <Tooltip placement={tooltipPlacement} shortcut={shortcutLabel(shortcut)}>
        {label}
      </Tooltip>
    </TooltipTrigger>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: IconName
  /** Accessible name when the label is not plain text. */
  textValue?: string
}

/**
 * Segmented control (single choice among a few visible options), e.g. theme or
 * density. Arrow keys move between options.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'md' | 'sm'
  className?: string
}) {
  return (
    <AriaToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys: Set<Key>) => {
        const next = [...keys][0]
        if (next !== undefined) onChange(next as T)
      }}
      className={cx('inline-flex max-w-full overflow-hidden rounded-control border border-line-strong', className)}
    >
      {options.map((o) => (
        <AriaToggleButton
          key={o.value}
          id={o.value}
          aria-label={o.textValue}
          className={cx(
            'inline-flex min-h-touch cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-l border-line-strong px-2.5 font-medium outline-none first:border-l-0',
            'text-fg-2 transition-colors duration-[var(--ws-motion-short)] ease-standard',
            'data-[hovered]:bg-hover data-[pressed]:bg-pressed data-[selected]:bg-selected data-[selected]:text-selected-fg',
            'data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
            size === 'md' ? 'h-ctl text-ui-sm' : 'h-ctl-sm text-ui-sm',
          )}
        >
          {({ isSelected }) => (
            <>
              {isSelected ? <Icon name="check" size={16} /> : o.icon ? <Icon name={o.icon} size={16} /> : null}
              {o.label}
            </>
          )}
        </AriaToggleButton>
      ))}
    </AriaToggleButtonGroup>
  )
}
