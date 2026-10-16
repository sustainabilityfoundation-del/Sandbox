import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button as AriaButton, MenuTrigger } from 'react-aria-components'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import { Button } from './Button'
import { CommandInfoPopover, commandAccessibleName, type CommandBarCommand, type CommandBarLayout } from './CommandBar'
import { CommandRow, SheetHeading, useViewportLayout } from './commandSurfaces'
import { activateCommand, commandStateText } from './commandCore'
import { cx } from './cx'
import { SearchField } from './Fields'
import { Menu, MenuItem, MenuSection, MenuSeparator, Popover, Sheet, SubmenuTrigger } from './Overlays'

/*
 * MenuBar: the main menu (capability-registry.md, Amendment CT-2c). A neutral model of menus; the host builds it from
 * the registry. Desktop follows the WAI-ARIA menubar pattern, composed from React Aria MenuTrigger and SubmenuTrigger
 * (no second behaviour library): one tab stop, Left and Right move between menus (and move the open menu), Home and
 * End jump to the first and last, Down, Enter and Space open, Escape closes and returns to the menu. Tablet shows one
 * "Menu" button whose submenus are the menus; a phone shows a full-screen sheet with search first.
 *
 * Every entry is a command with one of four states. A planned or unavailable entry is listed, muted and explained, and
 * can never be invoked: choosing it opens the explanation (the type has no `onInvoke`, and `activateCommand` checks).
 */

export type MenuBarNode =
  | {
      kind: 'command'
      command: CommandBarCommand
      /** A checked item (a view option): announced as checked, with a check mark. */
      checked?: boolean
      /** Letter that invokes the item while its menu is open and key tips are active. */
      mnemonic?: string
    }
  | { kind: 'submenu'; id: string; label: string; icon?: IconName; mnemonic?: string; items: MenuBarNode[] }
  | { kind: 'section'; id: string; title?: string; items: MenuBarNode[] }
  | { kind: 'separator'; id: string }

export interface MenuBarMenu {
  id: string
  label: string
  /** Letter that opens the menu from the menu bar (Alt+letter in the host's key-tip mode); underlined while key tips are shown. */
  mnemonic?: string
  items: MenuBarNode[]
}

export interface MenuBarProps {
  ariaLabel: string
  menus: MenuBarMenu[]
  /** Forced layout; default: the viewport (phone below 520 px, tablet below 840 px). */
  layout?: CommandBarLayout
  /** The host says key tips are active (F10 or a lone Alt tap): mnemonic letters are underlined. */
  keyTips?: boolean
  onHelp?: (helpId: string) => void
  /** Text of the tablet and phone button. Default "Menu". */
  menuLabel?: string
  className?: string
}

// ---- Helpers --------------------------------------------------------------------------------------

/** A label with the mnemonic letter underlined while key tips are active. */
function MnemonicLabel({ label, mnemonic, show }: { label: string; mnemonic?: string; show?: boolean }) {
  if (!show || !mnemonic) return <>{label}</>
  const i = label.toLowerCase().indexOf(mnemonic.toLowerCase())
  if (i < 0) return <>{label}</>
  return (
    <>
      {label.slice(0, i)}
      <u data-mnemonic={mnemonic.toLowerCase()} className="underline underline-offset-2">
        {label[i]}
      </u>
      {label.slice(i + 1)}
    </>
  )
}

interface FlatEntry {
  command: CommandBarCommand
  checked?: boolean
  path: string[]
}

/** Every command in a node list, with the menu path ("File", "Export") that leads to it. */
export function flattenMenuNodes(nodes: MenuBarNode[], path: string[] = []): FlatEntry[] {
  return nodes.flatMap((n): FlatEntry[] => {
    switch (n.kind) {
      case 'command':
        return [{ command: n.command, checked: n.checked, path }]
      case 'submenu':
        return flattenMenuNodes(n.items, [...path, n.label])
      case 'section':
        return flattenMenuNodes(n.items, path)
      case 'separator':
        return []
    }
  })
}

interface RenderCtx {
  keyTips?: boolean
  act: (command: CommandBarCommand) => void
}

function CommandItem({ node, ctx }: { node: Extract<MenuBarNode, { kind: 'command' }>; ctx: RenderCtx }) {
  const c = node.command
  return (
    <MenuItem
      id={c.id}
      icon={c.icon}
      shortcut={c.shortcut?.replace(/Control/g, 'Ctrl').replace(/\+/g, ' ')}
      textValue={commandAccessibleName(c)}
      aria-label={commandAccessibleName(c)}
      aria-keyshortcuts={c.shortcut}
      data-state={c.state.kind}
      description={commandStateText(c)}
      onAction={() => ctx.act(c)}
      tone={c.state.kind === 'planned' || c.state.kind === 'unavailable' ? 'muted' : 'default'}
    >
      <MnemonicLabel label={c.label} mnemonic={node.mnemonic} show={ctx.keyTips} />
    </MenuItem>
  )
}

function renderNodes(nodes: MenuBarNode[], ctx: RenderCtx): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  while (i < nodes.length) {
    const n = nodes[i]
    if (n.kind === 'command' && n.checked !== undefined) {
      // Consecutive checked items are one block of checkboxes (aria-checked through the section's selection).
      const block: Extract<MenuBarNode, { kind: 'command' }>[] = []
      while (i < nodes.length) {
        const m = nodes[i]
        if (m.kind !== 'command' || m.checked === undefined) break
        block.push(m)
        i += 1
      }
      out.push(
        <MenuSection key={`checks-${block[0].command.id}`} flush label="Options" selectionMode="multiple" selectedKeys={block.filter((b) => b.checked).map((b) => b.command.id)}>
          {block.map((b) => (
            <CommandItem key={b.command.id} node={b} ctx={ctx} />
          ))}
        </MenuSection>,
      )
      continue
    }
    i += 1
    switch (n.kind) {
      case 'command':
        out.push(<CommandItem key={n.command.id} node={n} ctx={ctx} />)
        break
      case 'separator':
        out.push(<MenuSeparator key={n.id} />)
        break
      case 'section':
        out.push(
          <MenuSection key={n.id} title={n.title} label={n.title ? undefined : n.id}>
            {renderNodes(n.items, ctx)}
          </MenuSection>,
        )
        break
      case 'submenu':
        out.push(
          <SubmenuTrigger key={n.id}>
            <MenuItem id={n.id} icon={n.icon} textValue={n.label} aria-label={n.label}>
              <MnemonicLabel label={n.label} mnemonic={n.mnemonic} show={ctx.keyTips} />
            </MenuItem>
            <Popover placement="end top" offset={-4} className="min-w-52 max-w-[min(360px,calc(100vw-16px))] overflow-auto p-1">
              <Menu aria-label={n.label}>{renderNodes(n.items, ctx)}</Menu>
            </Popover>
          </SubmenuTrigger>,
        )
        break
    }
  }
  return out
}

// ---- Desktop: the menubar ------------------------------------------------------------------------

const triggerClass =
  'inline-flex h-ctl-sm cursor-pointer select-none items-center rounded-control px-2.5 text-ui-sm text-fg outline-none ' +
  'data-[hovered]:bg-hover data-[pressed]:bg-pressed data-[pressed]:bg-pressed data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus'

function DesktopMenuBar({ ariaLabel, menus, keyTips, ctx, className }: { ariaLabel: string; menus: MenuBarMenu[]; keyTips?: boolean; ctx: RenderCtx; className?: string }) {
  const base = useId()
  const [openId, setOpenId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState(menus[0]?.id ?? '')
  // The menu opened by the keyboard (arrow or mnemonic) puts focus on its first item.
  const [focusFirst, setFocusFirst] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const ids = menus.map((m) => m.id)
  const menuDomId = (id: string) => `${base}-menu-${id}`
  const tabStop = ids.includes(focusId) ? focusId : ids[0]

  // The trigger is a menubar item: React Aria's button has no role prop, so the role is set on the element.
  useEffect(() => {
    for (const el of refs.current.values()) el.setAttribute('role', 'menuitem')
  })

  const goto = (index: number) => {
    const id = ids[(index + ids.length) % ids.length]
    setFocusId(id)
    // An open menu moves with the arrow (its popover takes focus); a closed bar just moves focus.
    if (openId !== null) {
      setFocusFirst(id)
      setOpenId(id)
    } else refs.current.get(id)?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.target as HTMLElement
    const onTrigger = target.closest('[data-menubar-trigger]') !== null
    const inTopMenu = openId !== null && target.closest('[role="menu"]')?.id === menuDomId(openId)
    if (!onTrigger && !inTopMenu) return
    const current = ids.indexOf(openId ?? tabStop)
    switch (e.key) {
      case 'ArrowRight':
        // Inside a menu, Right on an item with a submenu belongs to React Aria.
        if (inTopMenu && target.closest('[role="menuitem"]')?.getAttribute('aria-haspopup')) return
        e.preventDefault()
        goto(current + 1)
        return
      case 'ArrowLeft':
        e.preventDefault()
        goto(current - 1)
        return
      case 'Home':
        if (!onTrigger) return
        e.preventDefault()
        goto(0)
        return
      case 'End':
        if (!onTrigger) return
        e.preventDefault()
        goto(ids.length - 1)
        return
    }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const letter = e.key.toLowerCase()
      if (onTrigger) {
        const index = menus.findIndex((m) => m.mnemonic?.toLowerCase() === letter)
        if (index >= 0) {
          e.preventDefault()
          setFocusId(menus[index].id)
          setFocusFirst(menus[index].id)
          setOpenId(menus[index].id)
        }
      }
    }
  }

  // An item mnemonic (while key tips are active) is taken before the menu's own type-ahead sees the letter.
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!keyTips || openId === null || e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return
    if ((e.target as HTMLElement).closest('[role="menu"]')?.id !== menuDomId(openId)) return
    const letter = e.key.toLowerCase()
    const hit = menus.find((m) => m.id === openId)?.items.find((n): n is Extract<MenuBarNode, { kind: 'command' }> => n.kind === 'command' && n.mnemonic?.toLowerCase() === letter)
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    setOpenId(null)
    refs.current.get(openId)?.focus()
    ctx.act(hit.command)
  }

  return (
    <div role="menubar" aria-label={ariaLabel} onKeyDown={onKeyDown} onKeyDownCapture={onKeyDownCapture} className={cx('ws-menubar inline-flex items-center gap-0.5', className)} data-key-tips={keyTips ? 'true' : undefined}>
      {menus.map((m) => (
        <MenuTrigger key={m.id} isOpen={openId === m.id} onOpenChange={(open) => setOpenId((cur) => (open ? m.id : cur === m.id ? null : cur))}>
          <AriaButton
            ref={(el) => {
              if (el) refs.current.set(m.id, el)
              else refs.current.delete(m.id)
            }}
            data-menubar-trigger={m.id}
            aria-label={m.label}
            aria-keyshortcuts={m.mnemonic ? `Alt+${m.mnemonic.toUpperCase()}` : undefined}
            excludeFromTabOrder={tabStop !== m.id}
            onFocus={() => setFocusId(m.id)}
            onHoverStart={() => setOpenId((cur) => (cur !== null && cur !== m.id ? m.id : cur))}
            className={triggerClass}
          >
            <MnemonicLabel label={m.label} mnemonic={m.mnemonic} show={keyTips} />
          </AriaButton>
          <Popover placement="bottom start" offset={2} className="min-w-52 max-w-[min(360px,calc(100vw-16px))] overflow-auto p-1">
            <Menu id={menuDomId(m.id)} aria-label={m.label} autoFocus={focusFirst === m.id ? 'first' : undefined}>
              {renderNodes(m.items, ctx)}
            </Menu>
          </Popover>
        </MenuTrigger>
      ))}
    </div>
  )
}

// ---- Tablet: one Menu button ---------------------------------------------------------------------

function TabletMenu({ menus, menuLabel, ctx, className }: { menus: MenuBarMenu[]; menuLabel: string; ctx: RenderCtx; className?: string }) {
  return (
    <MenuTrigger>
      <Button variant="quiet" size="sm" aria-label={menuLabel} className={className}>
        {menuLabel}
        <Icon name="chevron-down" size={16} className="-mr-0.5" />
      </Button>
      <Popover placement="bottom start" className="min-w-52 max-w-[min(360px,calc(100vw-16px))] overflow-auto p-1">
        <Menu aria-label={menuLabel}>
          {menus.map((m) => (
            <SubmenuTrigger key={m.id}>
              <MenuItem id={m.id} textValue={m.label}>
                {m.label}
              </MenuItem>
              <Popover placement="end top" offset={-4} className="min-w-52 max-w-[min(360px,calc(100vw-16px))] overflow-auto p-1">
                <Menu aria-label={m.label}>{renderNodes(m.items, ctx)}</Menu>
              </Popover>
            </SubmenuTrigger>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}

// ---- Phone: full-screen sheet with search first --------------------------------------------------

function PhoneMenu({ menus, menuLabel, className }: { menus: MenuBarMenu[]; menuLabel: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const all = menus.map((m) => ({ menu: m, entries: flattenMenuNodes(m.items) }))
  const results = q
    ? all.flatMap(({ menu, entries }) => entries.filter((e) => `${menu.label} ${e.path.join(' ')} ${e.command.label}`.toLowerCase().includes(q)).map((e) => ({ ...e, path: [menu.label, ...e.path] })))
    : []
  return (
    <>
      <Button variant="quiet" size="sm" aria-label={menuLabel} className={className} onPress={() => setOpen(true)} icon="more">
        {menuLabel}
      </Button>
      <Sheet title={menuLabel} isOpen={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <div className="flex-none border-b border-line p-3">
          <SearchField label="Search commands" placeholder="Search commands" value={query} onChange={setQuery} autoFocus />
        </div>
        <div className="min-h-0 flex-1 overflow-auto pb-4" data-menu-sheet-body>
          {q ? (
            results.length === 0 ? (
              <p className="m-0 px-4 py-6 text-ui-sm text-fg-3">No commands match.</p>
            ) : (
              results.map((r) => <CommandRow key={`${r.path.join('/')}/${r.command.id}`} command={r.command} checked={r.checked} detail={r.path.join(' › ')} onDone={close} />)
            )
          ) : (
            all.map(({ menu, entries }) => (
              <section key={menu.id} aria-label={menu.label}>
                <SheetHeading>{menu.label}</SheetHeading>
                {entries.map((e) => (
                  <CommandRow key={`${e.path.join('/')}/${e.command.id}`} command={e.command} checked={e.checked} detail={e.path.length ? e.path.join(' › ') : undefined} onDone={close} />
                ))}
              </section>
            ))
          )}
        </div>
      </Sheet>
    </>
  )
}

// ---- MenuBar --------------------------------------------------------------------------------------

/**
 * The main menu. Desktop: a WAI-ARIA menubar. Tablet: one "Menu" button with submenus. Phone: a full-screen sheet with
 * search first. A planned or unavailable entry opens its explanation and invokes nothing.
 */
export function MenuBar({ ariaLabel, menus, layout, keyTips, onHelp, menuLabel = 'Menu', className }: MenuBarProps) {
  const mode = useViewportLayout(layout)
  const anchor = useRef<HTMLSpanElement>(null)
  const [info, setInfo] = useState<CommandBarCommand | null>(null)
  const ctx: RenderCtx = { keyTips, act: (c) => void activateCommand(c, setInfo) }
  if (menus.length === 0) return null
  return (
    <span ref={anchor} className="inline-flex" data-layout={mode}>
      {mode === 'desktop' ? (
        <DesktopMenuBar ariaLabel={ariaLabel} menus={menus} keyTips={keyTips} ctx={ctx} className={className} />
      ) : mode === 'tablet' ? (
        <TabletMenu menus={menus} menuLabel={menuLabel} ctx={ctx} className={className} />
      ) : (
        <PhoneMenu menus={menus} menuLabel={menuLabel} className={className} />
      )}
      {info && <CommandInfoPopover command={info} triggerRef={anchor} isOpen onOpenChange={(o) => !o && setInfo(null)} onHelp={onHelp} />}
    </span>
  )
}
