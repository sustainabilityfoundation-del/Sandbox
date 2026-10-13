import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { create } from 'zustand'
import { IconButton } from './Button'
import { cx } from './cx'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import type { Tone } from './Status'

/*
 * Small layout components React Aria doesn't provide: panels, a resizable
 * separator and the notification region.
 */

/** A titled container for a group of related content (M3 outlined card). */
export function Panel({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-3 rounded-card border border-line bg-surface', className)}>
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-line px-4 py-1">
        <h3 className="m-0 text-ui-sm font-medium text-fg">{title}</h3>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

/**
 * Accessible splitter: drag with mouse, pen or touch, or focus it and use the
 * arrow keys (Home/End for min/max, Enter to reset). Double-click also resets.
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
  orientation: 'vertical' | 'horizontal'
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onReset?: () => void
  invert?: boolean
  step?: number
  className?: string
}) {
  const drag = useRef<{ start: number; value: number } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const coordinate = (e: ReactPointerEvent) => (orientation === 'vertical' ? e.clientX : e.clientY)
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
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { start: coordinate(e), value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const delta = coordinate(e) - drag.current.start
        onChange(clamp(drag.current.value + (invert ? -delta : delta)))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cx(
        'ws-resize-handle shrink-0 touch-none select-none outline-none',
        orientation === 'vertical' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize',
        className,
      )}
    />
  )
}

// ---- Notifications ---------------------------------------------------------------------

export interface Toast {
  id: number
  tone: Exclude<Tone, 'neutral'>
  title: string
  body?: string
  /** A link the user can follow, e.g. to open a window the browser blocked. */
  link?: { label: string; href: string; target?: string }
}

let toastSeq = 0

export const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void }>()((set) => ({
  toasts: [],
  push: (t) => {
    const toast = { ...t, id: ++toastSeq }
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }))
    // Messages with an action stay until dismissed; others clear themselves.
    if (!t.link && t.tone !== 'danger') setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== toast.id) })), 6000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

const TOAST_ICON: Record<Toast['tone'], IconName> = { info: 'info', success: 'success', warning: 'warning', danger: 'error' }
const TOAST_TONE: Record<Toast['tone'], string> = { info: 'text-info', success: 'text-success', warning: 'text-warning', danger: 'text-error' }

/** Notification region (snackbars). Errors and warnings are announced assertively. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-3 right-3 z-[220] flex w-[min(400px,calc(100vw-24px))] flex-col gap-2 max-sm:bottom-auto max-sm:top-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'danger' || t.tone === 'warning' ? 'alert' : 'status'}
          className="ws-overlay pointer-events-auto flex items-start gap-3 rounded-card bg-inverse p-3 text-on-inverse shadow-3"
          data-entering=""
        >
          <Icon name={TOAST_ICON[t.tone]} size={20} className={cx('mt-0.5', TOAST_TONE[t.tone], 'brightness-150')} />
          <div className="min-w-0 flex-1">
            <strong className="block text-ui-sm font-medium">{t.title}</strong>
            {t.body && <p className="m-0 mt-0.5 text-ui-sm opacity-85">{t.body}</p>}
            {t.link && (
              <a
                className="mt-1.5 inline-flex min-h-touch items-center font-medium text-on-inverse underline"
                href={t.link.href}
                target={t.link.target ?? '_blank'}
                rel="opener"
                onClick={() => dismiss(t.id)}
              >
                {t.link.label}
              </a>
            )}
          </div>
          <IconButton label="Dismiss notification" icon="close" size="sm" onPress={() => dismiss(t.id)} className="text-on-inverse data-[hovered]:text-on-inverse" />
        </div>
      ))}
    </section>
  )
}
