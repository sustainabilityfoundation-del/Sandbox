import type { ReactNode } from 'react'
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger,
  Header,
  Heading,
  Keyboard,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover as AriaPopover,
  Separator,
  SubmenuTrigger,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps,
  type PopoverProps,
} from 'react-aria-components'
import { Button, IconButton, type ButtonVariant } from './Button'
import { cx } from './cx'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'

/*
 * Overlays. React Aria provides the behaviour: Escape dismisses, focus moves
 * into the overlay and back to the opening control, modal dialogs contain
 * focus, and popovers flip and shift to stay inside the viewport.
 */

const popoverSurface = 'ws-overlay z-[150] rounded-card border border-line bg-surface-2 text-fg shadow-2 outline-none'

export function Popover({ className, children, ...props }: Omit<PopoverProps, 'className'> & { className?: string; children: ReactNode }) {
  return (
    <AriaPopover offset={6} containerPadding={8} {...props} className={cx(popoverSurface, className)}>
      {children}
    </AriaPopover>
  )
}

// ---- Menus (commands) -----------------------------------------------------------------------

/**
 * A button that opens a menu of commands. Use Select for choosing a value and
 * ComboBox for searching options; menus only execute actions.
 */
export function MenuButton({
  label,
  icon,
  text,
  variant = 'quiet',
  children,
  onAction,
  placement = 'bottom end',
  className,
  menuProps,
  isDisabled,
}: {
  /** Accessible name (and tooltip, when there is no visible text). */
  label: string
  icon?: IconName
  text?: ReactNode
  variant?: ButtonVariant
  children: ReactNode
  onAction?: (key: React.Key) => void
  placement?: PopoverProps['placement']
  className?: string
  menuProps?: Pick<MenuProps<object>, 'selectionMode' | 'selectedKeys' | 'onSelectionChange' | 'disabledKeys'>
  isDisabled?: boolean
}) {
  return (
    <MenuTrigger>
      {text ? (
        <Button variant={variant} icon={icon} aria-label={label} className={className} isDisabled={isDisabled}>
          {text}
          <Icon name="chevron-down" size={18} className="-mr-1" />
        </Button>
      ) : (
        <IconButton label={label} icon={icon ?? 'more-vertical'} variant={variant === 'quiet' ? 'quiet' : 'tonal'} className={className} isDisabled={isDisabled} />
      )}
      <Popover placement={placement} className="min-w-52 max-w-[min(360px,calc(100vw-16px))] overflow-auto p-1">
        <Menu aria-label={label} onAction={onAction} {...menuProps}>
          {children}
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}

export function Menu<T extends object>({ className, ...props }: MenuProps<T> & { className?: string }) {
  return <AriaMenu {...props} className={cx('outline-none', className)} />
}

export interface MenuItemProps extends Omit<AriaMenuItemProps, 'className' | 'children'> {
  icon?: IconName
  /** Keyboard shortcut hint, e.g. "Ctrl K". */
  shortcut?: string
  description?: ReactNode
  /** Trailing content such as a favourite marker. */
  trailing?: ReactNode
  children: ReactNode
  tone?: 'default' | 'danger'
}

export function MenuItem({ icon, shortcut, description, trailing, children, tone = 'default', textValue, ...props }: MenuItemProps) {
  return (
    <AriaMenuItem
      textValue={textValue ?? (typeof children === 'string' ? children : undefined)}
      {...props}
      className={cx(
        'group flex min-h-[max(var(--ws-control-h),var(--ws-touch-target))] cursor-pointer items-center gap-3 rounded-sm px-3 py-1.5 text-ui-sm outline-none',
        tone === 'danger' ? 'text-error' : 'text-fg',
        'data-[hovered]:bg-hover data-[focused]:bg-hover data-[pressed]:bg-pressed',
        'data-[disabled]:cursor-default data-[disabled]:opacity-40',
        'data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
      )}
    >
      {({ isSelected, selectionMode, hasSubmenu }) => (
        <>
          {selectionMode !== 'none' ? (
            <Icon name="check" size={18} className={isSelected ? 'text-accent' : 'invisible'} />
          ) : icon ? (
            <Icon name={icon} size={18} className="text-fg-2" />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{children}</span>
            {description && <span className="truncate text-ui-xs text-fg-3">{description}</span>}
          </span>
          {trailing}
          {shortcut && <Keyboard className="font-mono text-ui-xs text-fg-3">{shortcut}</Keyboard>}
          {hasSubmenu && <Icon name="chevron-right" size={18} className="text-fg-3" />}
        </>
      )}
    </AriaMenuItem>
  )
}

export function MenuSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <AriaMenuSection className="[&:not(:first-child)]:mt-1 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line [&:not(:first-child)]:pt-1">
      {title && <Header className="px-3 pb-1 pt-2 text-ui-xs font-medium tracking-wide text-fg-3">{title}</Header>}
      {children}
    </AriaMenuSection>
  )
}

export function MenuSeparator() {
  return <Separator className="my-1 border-t border-line" />
}

export { SubmenuTrigger }

// ---- Popover with dialog content (settings, details) ---------------------------------------

/** A button that opens non-modal content (forms, settings) in a popover. */
export function PopoverButton({
  label,
  icon,
  text,
  variant = 'quiet',
  children,
  placement = 'bottom end',
  className,
  title,
  triggerClassName,
}: {
  label: string
  icon?: IconName
  text?: ReactNode
  variant?: ButtonVariant
  children: ReactNode | ((close: () => void) => ReactNode)
  placement?: PopoverProps['placement']
  className?: string
  title?: ReactNode
  triggerClassName?: string
}) {
  return (
    <DialogTrigger>
      {text ? (
        <AriaButton
          aria-label={label}
          className={cx(
            'inline-flex min-h-touch min-w-0 cursor-pointer items-center gap-2 rounded-control px-3 text-ui-sm outline-none',
            'data-[hovered]:bg-hover data-[pressed]:bg-pressed data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus',
            triggerClassName,
          )}
        >
          {icon && <Icon name={icon} size={18} />}
          {text}
        </AriaButton>
      ) : (
        <IconButton label={label} icon={icon ?? 'more-vertical'} variant={variant === 'quiet' ? 'quiet' : 'tonal'} className={triggerClassName} />
      )}
      <Popover placement={placement} className={cx('w-80 max-w-[calc(100vw-16px)] overflow-auto', className)}>
        <AriaDialog aria-label={label} className="p-4 outline-none">
          {({ close }) => (
            <>
              {title && <Heading slot="title" className="m-0 mb-3 text-title font-medium text-fg">{title}</Heading>}
              {typeof children === 'function' ? children(close) : children}
            </>
          )}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  )
}

// ---- Modal dialog, drawer, sheet ----------------------------------------------------------

const scrim = 'ws-scrim fixed inset-0 z-[160] bg-scrim'

/** Modal dialog: contains focus, Escape closes, focus returns to the opener. Full screen on phones. */
export function Dialog({
  title,
  isOpen,
  onOpenChange,
  children,
  footer,
  size = 'md',
  isDismissable = true,
}: {
  title: ReactNode
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode | ((close: () => void) => ReactNode)
  footer?: ReactNode | ((close: () => void) => ReactNode)
  size?: 'sm' | 'md' | 'lg'
  isDismissable?: boolean
}) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={isDismissable} className={cx(scrim, 'flex items-start justify-center pt-[8vh] max-sm:pt-0')}>
      <Modal
        className={cx(
          'ws-dialog flex max-h-[84dvh] flex-col overflow-hidden rounded-sheet bg-surface text-fg shadow-3',
          size === 'sm' ? 'w-[min(420px,calc(100vw-32px))]' : size === 'md' ? 'w-[min(560px,calc(100vw-32px))]' : 'w-[min(760px,calc(100vw-32px))]',
          'max-sm:h-[var(--visual-viewport-height,100dvh)] max-sm:max-h-none max-sm:w-full max-sm:rounded-none',
        )}
      >
        <AriaDialog className="flex min-h-0 flex-1 flex-col outline-none">
          {({ close }) => (
            <>
              <header className="flex items-center gap-2 border-b border-line py-2 pl-5 pr-2">
                <Heading slot="title" className="m-0 flex-1 text-title font-medium">
                  {title}
                </Heading>
                <IconButton label="Close" icon="close" onPress={close} />
              </header>
              <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{typeof children === 'function' ? children(close) : children}</div>
              {footer && (
                <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
                  {typeof footer === 'function' ? footer(close) : footer}
                </footer>
              )}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}

/** Side drawer for secondary panels on tablets and phones; modal with focus containment. */
export function Drawer({
  side,
  title,
  isOpen,
  onOpenChange,
  children,
  actions,
  fullWidth,
}: {
  side: 'left' | 'right'
  title: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  actions?: ReactNode
  fullWidth?: boolean
}) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={scrim}>
      <Modal
        className={cx(
          side === 'left' ? 'ws-drawer-left left-0 rounded-r-sheet' : 'ws-drawer-right right-0 rounded-l-sheet',
          'fixed top-0 bottom-0 flex flex-col overflow-hidden bg-surface text-fg shadow-3',
          fullWidth ? 'w-screen rounded-none' : 'w-[min(380px,88vw)]',
        )}
      >
        <AriaDialog aria-label={title} className="flex min-h-0 flex-1 flex-col outline-none" data-drawer={side}>
          {({ close }) => (
            <>
              <header className="flex h-[var(--ws-header-h)] flex-none items-center gap-1 border-b border-line pl-4 pr-2">
                <Heading slot="title" className="m-0 flex-1 text-ui font-medium">
                  {title}
                </Heading>
                {actions}
                <IconButton label={`Close ${title.toLowerCase()}`} icon="close" onPress={close} />
              </header>
              <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}

/** Full-height bottom sheet for phones; stays above the on-screen keyboard. */
export function Sheet({
  title,
  isOpen,
  onOpenChange,
  children,
  header,
}: {
  title: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** Replaces the default header (e.g. with tabs). */
  header?: (close: () => void) => ReactNode
}) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={scrim}>
      <Modal className="ws-sheet ws-sheet-full fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-sheet bg-surface text-fg shadow-3">
        <AriaDialog aria-label={title} className="flex min-h-0 flex-1 flex-col outline-none">
          {({ close }) => (
            <>
              {header ? (
                header(close)
              ) : (
                <header className="flex h-[var(--ws-header-h)] flex-none items-center gap-1 border-b border-line pl-4 pr-2">
                  <Heading slot="title" className="m-0 flex-1 text-ui font-medium">
                    {title}
                  </Heading>
                  <IconButton label={`Close ${title.toLowerCase()}`} icon="close" onPress={close} />
                </header>
              )}
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}
