import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { create } from 'zustand'
import { Button, IconButton } from '../sdk/controls'
import { Icons } from '../sdk/icons'

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// ---- Menu ----------------------------------------------------------------------------------

/**
 * A button that opens a panel of actions or settings. Closes on outside click
 * or Escape (returning focus to the button). On narrow screens the panel is a
 * bottom sheet.
 */
export function Menu({
  label,
  icon,
  text,
  children,
  align = 'end',
  tone = 'surface',
  className,
}: {
  label: string
  icon?: typeof Icons.grid
  text?: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  tone?: 'surface' | 'header'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const IconComponent = icon
  return (
    <div className={cx('relative', className)} ref={root}>
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={text ? undefined : label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex h-ctl min-h-touch min-w-touch cursor-pointer items-center justify-center gap-1.5 rounded-ctl border px-2 text-ui-sm whitespace-nowrap',
          tone === 'header'
            ? 'border-header-line bg-header-input text-header-fg hover:bg-header-raised'
            : 'border-transparent text-fg-2 hover:bg-surface-3 hover:text-fg aria-expanded:bg-surface-3',
        )}
      >
        {IconComponent && <IconComponent width={15} height={15} aria-hidden="true" />}
        {text}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cx(
            'z-50 border border-line bg-surface text-fg shadow-panel',
            'absolute top-full mt-1 w-72 max-w-[calc(100vw-16px)] rounded-panel p-3',
            align === 'end' ? 'right-0' : 'left-0',
            'max-sm:fixed max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none max-sm:max-h-[85dvh] max-sm:overflow-auto max-sm:rounded-b-none max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]',
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1.5 text-ui-xs font-semibold tracking-wide text-fg-3 uppercase">{title}</h3>
      {children}
    </section>
  )
}

// ---- Dialog ----------------------------------------------------------------------------

/** Modal dialog; a full-screen sheet on phones. */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-scrim pt-[8vh] max-sm:pt-0" onPointerDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onPointerDown={(e) => e.stopPropagation()}
        className={cx(
          'flex max-h-[84dvh] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-panel bg-surface text-fg shadow-panel',
          wide && 'w-[min(760px,calc(100vw-32px))]',
          'max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:rounded-none',
        )}
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-2">
          <h2 id={titleId} className="m-0 flex-1 text-ui font-semibold">
            {title}
          </h2>
          <IconButton label="Close" icon={Icons.close} onClick={onClose} />
        </header>
        <div className="flex-1 overflow-auto px-4 py-3">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-2">{footer}</footer>}
      </div>
    </div>
  )
}

// ---- Resize handle ------------------------------------------------------------------------

/**
 * Accessible splitter: drag with mouse, pen or touch, or focus it and use the
 * arrow keys (Home/End for min/max). Double-click restores the default.
 */
export function ResizeHandle({
  orientation,
  label,
  value,
  min,
  max,
  onChange,
  onReset,
  invert = false,
  step = 16,
  className,
}: {
  /** 'vertical' separates columns (resizes widths); 'horizontal' separates rows. */
  orientation: 'vertical' | 'horizontal'
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onReset?: () => void
  /** Dragging right/down makes the value smaller (e.g. a panel on the right). */
  invert?: boolean
  step?: number
  className?: string
}) {
  const drag = useRef<{ start: number; value: number } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const coordinate = (e: ReactPointerEvent) => (orientation === 'vertical' ? e.clientX : e.clientY)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { start: coordinate(e), value }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const delta = coordinate(e) - drag.current.start
    onChange(clamp(drag.current.value + (invert ? -delta : delta)))
  }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const grow = orientation === 'vertical' ? (invert ? 'ArrowLeft' : 'ArrowRight') : invert ? 'ArrowUp' : 'ArrowDown'
    const shrink = orientation === 'vertical' ? (invert ? 'ArrowRight' : 'ArrowLeft') : invert ? 'ArrowDown' : 'ArrowUp'
    if (e.key === grow) onChange(clamp(value + step))
    else if (e.key === shrink) onChange(clamp(value - step))
    else if (e.key === 'Home') onChange(min)
    else if (e.key === 'End') onChange(max)
    else if (e.key === 'Enter' && onReset) onReset()
    else return
    e.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      title={`${label} (drag, or use the arrow keys)`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cx(
        'ws-resize-handle shrink-0 touch-none select-none',
        orientation === 'vertical' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize',
        className,
      )}
    />
  )
}

// ---- Toasts --------------------------------------------------------------------------------

export interface Toast {
  id: number
  tone: 'info' | 'warning' | 'error' | 'success'
  title: string
  body?: string
  /** A link the user can follow, e.g. to open a window the browser blocked. */
  link?: { label: string; href: string; target?: string }
}

let toastSeq = 0

export const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void }>()(
  (set) => ({
    toasts: [],
    push: (t) => {
      const toast = { ...t, id: ++toastSeq }
      set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }))
      if (!t.link) setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== toast.id) })), 6000)
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  }),
)

const TOAST_TONE = {
  info: 'border-info-line bg-info-soft',
  success: 'border-success bg-success-soft',
  warning: 'border-warning-line bg-warning-soft',
  error: 'border-error-line bg-error-soft',
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-3 bottom-3 z-[120] flex w-[min(380px,calc(100vw-24px))] flex-col gap-2 max-sm:top-2 max-sm:bottom-auto"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status'}
          className={cx('pointer-events-auto flex items-start gap-2 rounded-panel border p-3 text-fg shadow-panel', TOAST_TONE[t.tone])}
        >
          <div className="min-w-0 flex-1">
            <strong className="block text-ui">{t.title}</strong>
            {t.body && <p className="m-0 mt-0.5 text-ui-sm text-fg-2">{t.body}</p>}
            {t.link && (
              <a
                className="mt-1.5 inline-flex min-h-touch items-center font-semibold text-accent underline"
                href={t.link.href}
                target={t.link.target ?? '_blank'}
                rel="opener"
                onClick={() => dismiss(t.id)}
              >
                {t.link.label}
              </a>
            )}
          </div>
          <IconButton label="Dismiss" icon={Icons.close} size="sm" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  )
}

export { Button, cx }
