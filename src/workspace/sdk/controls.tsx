import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type ComponentType,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type SVGProps,
  type TextareaHTMLAttributes,
} from 'react'

/**
 * Shared controls for the workspace and every tool. They take all colours and
 * sizes from the design tokens (theme/tokens.css) through Tailwind's semantic
 * utilities, follow the density setting, and grow to touch size on coarse
 * pointers. Tools must use these instead of raw form elements.
 */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const controlBase =
  'inline-flex items-center justify-center gap-1.5 rounded-ctl border font-medium whitespace-nowrap select-none ' +
  'min-h-touch cursor-pointer transition-colors disabled:cursor-default disabled:opacity-50'

const buttonVariants = {
  primary: 'bg-accent border-accent text-on-accent hover:enabled:bg-accent-strong hover:enabled:border-accent-strong',
  secondary: 'bg-surface border-line-strong text-fg hover:enabled:bg-surface-2',
  ghost:
    'bg-transparent border-transparent text-fg-2 hover:enabled:bg-surface-3 hover:enabled:text-fg ' +
    'aria-pressed:bg-selected aria-pressed:text-selected-fg aria-pressed:border-accent-line',
  danger: 'bg-surface border-error-line text-error hover:enabled:bg-error-soft',
} as const

const buttonSizes = {
  md: 'h-ctl px-3 text-ui-sm',
  sm: 'h-ctl-sm px-2 text-ui-xs',
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
  icon?: Icon
  /** Shows a spinner and disables the button. */
  busy?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: IconComponent, busy, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      className={cx(controlBase, buttonVariants[variant], buttonSizes[size], className)}
      {...rest}
    >
      {busy ? <Spinner small /> : IconComponent && <IconComponent width={14} height={14} aria-hidden="true" />}
      {children}
    </button>
  )
})

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also shown as a tooltip. Required, since the button has no text. */
  label: string
  icon: Icon
  size?: 'md' | 'sm'
  variant?: 'ghost' | 'secondary'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: IconComponent, size = 'md', variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        controlBase,
        buttonVariants[variant],
        size === 'md' ? 'size-ctl min-w-touch' : 'size-ctl-sm min-w-touch',
        'p-0',
        className,
      )}
      {...rest}
    >
      <IconComponent width={size === 'md' ? 16 : 14} height={size === 'md' ? 16 : 14} aria-hidden="true" />
    </button>
  )
})

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        'inline-block shrink-0 animate-spin rounded-full border-2 border-line border-t-accent align-middle',
        small ? 'size-3' : 'size-4',
      )}
    />
  )
}

const fieldControl =
  'w-full min-h-touch rounded-ctl border border-line-strong bg-surface px-2 text-ui text-fg placeholder:text-fg-3 ' +
  'disabled:opacity-60 pointer-coarse:text-[16px]'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(fieldControl, 'h-ctl', className)} {...rest} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(fieldControl, 'py-1.5 resize-y', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(fieldControl, 'h-ctl w-auto pr-6', className)} {...rest}>
      {children}
    </select>
  )
})

export function Checkbox({
  label,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return (
    <label className={cx('inline-flex min-h-touch cursor-pointer items-center gap-1.5 text-ui', className)}>
      <input type="checkbox" className="size-4 accent-accent" {...rest} />
      <span>{label}</span>
    </label>
  )
}

/** A labelled form field; renders its control via a render prop so the label targets it. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('mb-3 flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-ui-xs font-semibold text-fg-2">
        {label}
      </label>
      {children(id)}
      {hint && <span className="text-ui-xs text-fg-3">{hint}</span>}
      {error && <span className="text-ui-xs text-error">{error}</span>}
    </div>
  )
}

/** Group of related checkboxes or radios with a visible legend. */
export function FieldGroup({ legend, children, className }: { legend: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx('mb-3 min-w-0 border-0 p-0', className)}>
      <legend className="mb-1 p-0 text-ui-xs font-semibold text-fg-2">{legend}</legend>
      {children}
    </fieldset>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

/** Mutually exclusive options (view modes, tabs within a tool). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  role = 'radiogroup',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  size?: 'md' | 'sm'
  role?: 'radiogroup' | 'tablist'
}) {
  return (
    <div role={role} aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-ctl border border-line-strong bg-surface">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role={role === 'tablist' ? 'tab' : 'radio'}
            aria-checked={role === 'radiogroup' ? selected : undefined}
            aria-selected={role === 'tablist' ? selected : undefined}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-touch cursor-pointer whitespace-nowrap border-l border-line px-2.5 first:border-l-0',
              size === 'md' ? 'h-ctl text-ui-sm' : 'h-ctl-sm text-ui-xs',
              selected ? 'bg-selected font-semibold text-selected-fg' : 'text-fg-2 hover:bg-surface-3',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A horizontally scrollable table container that also acts as a size container for responsive layouts. */
export function TableContainer({ children, className, scrollRef, label }: { children: ReactNode; className?: string; scrollRef?: (el: HTMLDivElement | null) => void; label?: string }) {
  return (
    <div ref={scrollRef} role="region" aria-label={label} tabIndex={label ? 0 : undefined} className={cx('ws-table-wrap', className)}>
      {children}
    </div>
  )
}
