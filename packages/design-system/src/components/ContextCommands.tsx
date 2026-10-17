import { useRef, useState, type RefObject } from 'react'
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay, Popover as AriaPopover } from 'react-aria-components'
import { IconButton } from './Button'
import { Toolbar, ToolbarSeparator } from './Collections'
import { CommandInfoPopover, SplitCommandButton, commandAccessibleName, type CommandBarCommand, type CommandBarEntry, type CommandBarLayout } from './CommandBar'
import { CommandRow, useViewportLayout } from './commandSurfaces'
import { activateCommand, commandStateText, isCommand } from './commandCore'
import { cx } from './cx'
import { Menu, MenuItem, MenuSeparator } from './Overlays'

/*
 * ContextCommands: the commands for the current selection or view (capability-registry.md, Amendment CT-2c, one
 * `contextSets` model), rendered three ways:
 *   floating  a small toolbar near the selection; the host positions it with `className` and keeps it in the tool
 *   menu      a context menu (right-click, long press, Shift+F10 or the ContextMenu key) anchored to `anchorRef`
 *   sheet     a bottom sheet on a phone; every target is at least 40 px high
 * A planned or unavailable command is listed, muted and explained, and can never be invoked on any rendering.
 */

export type ContextRendering = 'floating' | 'menu' | 'sheet'

export interface ContextCommandsProps {
  /** Accessible name, e.g. "Selection commands". */
  ariaLabel: string
  /** Commands and separators. */
  commands: CommandBarEntry[]
  /** How to render; default from `layout`: desktop floating, tablet menu, phone sheet. */
  rendering?: ContextRendering
  layout?: CommandBarLayout
  /** Menu and sheet: whether it is open. */
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Menu: the element the menu opens next to (the selection, or a zero-size element at the pointer). */
  anchorRef?: RefObject<Element | null>
  onHelp?: (helpId: string) => void
  /** Floating: positioning and size from the host. */
  className?: string
}

export function contextRenderingFor(layout: CommandBarLayout): ContextRendering {
  return layout === 'desktop' ? 'floating' : layout === 'tablet' ? 'menu' : 'sheet'
}

function Floating({ ariaLabel, commands, onHelp, className }: Pick<ContextCommandsProps, 'ariaLabel' | 'commands' | 'onHelp' | 'className'>) {
  return (
    <Toolbar aria-label={ariaLabel} className={cx('ws-context-floating flex-none rounded-card border border-line bg-surface-2 p-0.5 shadow-2', className)}>
      {commands.map((e) =>
        isCommand(e) ? <SplitCommandButton key={e.id} command={e} onHelp={onHelp} iconOnly /> : e.type === 'separator' ? <ToolbarSeparator key={e.id} /> : null,
      )}
    </Toolbar>
  )
}

function ContextMenu({ ariaLabel, commands, isOpen, onOpenChange, anchorRef, onHelp }: ContextCommandsProps) {
  const fallback = useRef<HTMLSpanElement>(null)
  const triggerRef = (anchorRef ?? fallback) as RefObject<HTMLElement | null>
  const [info, setInfo] = useState<CommandBarCommand | null>(null)
  const find = (key: React.Key) => commands.filter(isCommand).find((c) => c.id === key)
  return (
    <>
      {!anchorRef && <span ref={fallback} className="inline-block size-0" />}
      <AriaPopover
        triggerRef={triggerRef}
        isOpen={!!isOpen}
        onOpenChange={onOpenChange}
        placement="bottom start"
        offset={4}
        containerPadding={8}
        className="ws-overlay z-[150] min-w-52 max-w-[min(360px,calc(100vw-16px))] overflow-auto rounded-card border border-line bg-surface-2 p-1 text-fg shadow-2 outline-none"
      >
        <Menu
          aria-label={ariaLabel}
          autoFocus="first"
          onAction={(key) => {
            const c = find(key)
            if (c) activateCommand(c, setInfo)
          }}
        >
          {commands.map((e) =>
            isCommand(e) ? (
              <MenuItem
                key={e.id}
                id={e.id}
                icon={e.icon}
                textValue={commandAccessibleName(e)}
                aria-label={commandAccessibleName(e)}
                shortcut={e.shortcut?.replace(/Control/g, 'Ctrl').replace(/\+/g, ' ')}
                description={commandStateText(e)}
              >
                {e.label}
              </MenuItem>
            ) : e.type === 'separator' ? (
              <MenuSeparator key={e.id} />
            ) : null,
          )}
        </Menu>
      </AriaPopover>
      {info && <CommandInfoPopover command={info} triggerRef={triggerRef} isOpen onOpenChange={(o) => !o && setInfo(null)} onHelp={onHelp} />}
    </>
  )
}

function BottomSheet({ ariaLabel, commands, isOpen, onOpenChange }: ContextCommandsProps) {
  const close = () => onOpenChange?.(false)
  return (
    <ModalOverlay isOpen={!!isOpen} onOpenChange={onOpenChange} isDismissable className="ws-scrim fixed inset-0 z-[160] bg-scrim">
      <Modal className="ws-sheet fixed inset-x-0 bottom-0 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-sheet bg-surface text-fg shadow-3">
        <AriaDialog aria-label={ariaLabel} className="flex min-h-0 flex-1 flex-col outline-none" data-context-sheet>
          <header className="flex flex-none items-center gap-1 border-b border-line pl-4 pr-1">
            <Heading slot="title" className="m-0 flex-1 py-2 text-ui font-medium">
              {ariaLabel}
            </Heading>
            <IconButton label="Close" icon="close" onPress={close} />
          </header>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {commands.map((e) =>
              isCommand(e) ? <CommandRow key={e.id} command={e} onDone={close} /> : e.type === 'separator' ? <MenuSeparator key={e.id} /> : null,
            )}
          </div>
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}

/** Commands for the current selection: a floating toolbar, a context menu or a bottom sheet. */
export function ContextCommands(props: ContextCommandsProps) {
  const layout = useViewportLayout(props.layout)
  const rendering = props.rendering ?? contextRenderingFor(layout)
  if (rendering === 'floating') return <Floating {...props} />
  if (rendering === 'menu') return <ContextMenu {...props} />
  return <BottomSheet {...props} />
}
