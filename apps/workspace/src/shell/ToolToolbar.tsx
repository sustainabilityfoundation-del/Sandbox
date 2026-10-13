import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TooltipTrigger } from 'react-aria-components'
import type { EngineeringObject } from '@ews/model-service'
import { getToolApi, sharedContextOf } from '../platform/api'
import { useWorkspaceStore } from '../platform/store'
import type { ToolbarItem } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import { toolIdOfView } from '../platform/views'
import { Button, Icon, MenuButton, MenuItem, Select, ToggleButton, Toolbar, ToolbarSeparator, Tooltip, cx } from '@ews/design-system'

type Item = ToolbarItem

/** Selects, text, filled buttons and explicitly primary actions never move into the overflow menu. */
function isPrimary(item: Item): boolean {
  if (item.type === 'separator') return false
  if (item.type !== 'button') return true
  return !!item.primary || item.priority === 'primary'
}

function tooltipFor(item: Extract<Item, { type: 'button' }>) {
  const base = item.title ?? item.label
  return item.illustrative ? `${base} (illustrative in this mockup)` : base
}

function Control({ item, measuring }: { item: Item; measuring?: boolean }) {
  switch (item.type) {
    case 'separator':
      return <ToolbarSeparator />
    case 'text':
      return <span className={cx('whitespace-nowrap px-2 text-ui-sm', item.tone === 'warning' ? 'text-warning' : 'text-fg-3')}>{item.text}</span>
    case 'select':
      return (
        <div className="flex items-center gap-1.5 px-1">
          <span className="ws-tb-label whitespace-nowrap text-ui-xs text-fg-3">{item.label}</span>
          <Select
            ariaLabel={item.label}
            size="sm"
            value={item.value}
            isDisabled={item.disabled}
            onChange={item.onChange}
            options={item.options.map((o) => ({ id: o.value, label: o.label }))}
            className="min-w-36"
          />
        </div>
      )
    case 'button': {
      const label = (
        <span className={cx('ws-tb-label', item.illustrative && 'underline decoration-dotted underline-offset-4')}>{item.label}</span>
      )
      const dataProps = measuring ? {} : { 'data-toolbar-id': item.id }
      const control =
        item.active !== undefined && !item.primary ? (
          <ToggleButton
            size="sm"
            icon={item.icon}
            isSelected={item.active}
            onChange={() => item.onClick()}
            isDisabled={item.disabled}
            aria-label={item.label}
            className={cx('ws-tbtn', item.icon && 'has-icon')}
            {...dataProps}
          >
            {label}
          </ToggleButton>
        ) : (
          <Button
            size="sm"
            variant={item.primary ? 'filled' : 'quiet'}
            icon={item.icon}
            isPending={item.busy}
            isDisabled={item.disabled}
            onPress={item.onClick}
            aria-label={item.label}
            className={cx('ws-tbtn', item.icon && 'has-icon')}
            {...dataProps}
          >
            {label}
          </Button>
        )
      return (
        <TooltipTrigger delay={600} closeDelay={100}>
          {control}
          <Tooltip placement="bottom">{tooltipFor(item)}</Tooltip>
        </TooltipTrigger>
      )
    }
  }
}

/**
 * Renders a tool's toolbar contribution for one view instance. Primary actions
 * always stay visible; as the toolbar narrows, secondary actions move into a
 * "More actions" menu (in their original order), and labels collapse to icons
 * in very narrow containers. Arrow keys move between toolbar controls.
 */
export function ToolToolbar({
  tool,
  viewId = tool.id,
  trailing,
}: {
  tool: AnyToolDefinition
  viewId?: string
  trailing?: ReactNode
}) {
  const state = useWorkspaceStore()
  const viewState = state.viewStates[viewId] ?? state.initialViewStates[toolIdOfView(viewId)]
  const model = state.model!
  const context = sharedContextOf(state, viewId)
  const selection = useMemo(
    () => context.selectedIds.map((id) => model.get(id)).filter((o): o is EngineeringObject => !!o),
    [context.selectedIds, model],
  )
  const items = tool.toolbar({ api: getToolApi(tool.id, viewId), viewState, context, model, selection })
  const hasIllustrative = items.some((i) => i.type === 'button' && i.illustrative)

  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const trailingRef = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const signature = items.map((i) => `${i.id}:${i.type === 'button' ? i.label : ''}`).join('|')

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => {
      const widths = new Map<string, number>()
      measure.querySelectorAll<HTMLElement>('[data-measure-id]').forEach((el) => widths.set(el.dataset.measureId!, el.offsetWidth + 4))
      const available = row.clientWidth - (trailingRef.current?.offsetWidth ?? 0) - 16
      const width = (i: Item) => widths.get(i.id) ?? 0
      let used = items.filter(isPrimary).reduce((sum, i) => sum + width(i), 0)
      const secondary = items.filter((i) => !isPrimary(i))
      const next = new Set<string>()
      if (used + secondary.reduce((sum, i) => sum + width(i), 0) > available) {
        used += 48 // the "More actions" button
        for (const i of secondary) {
          if (i.type !== 'separator' && used + width(i) <= available) used += width(i)
          else next.add(i.id)
        }
        // Drop separators that no longer separate visible groups.
        items.forEach((i, idx) => {
          if (i.type !== 'separator') return
          const after = items.slice(idx + 1).find((x) => x.type !== 'separator' && !next.has(x.id))
          if (!after) next.add(i.id)
        })
      }
      setHidden((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next))
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(row)
    observer.observe(measure)
    return () => observer.disconnect()
    // Recompute when the set of items or their labels changes.
  }, [signature])

  const overflow = items.filter((i): i is Extract<Item, { type: 'button' }> => i.type === 'button' && hidden.has(i.id))

  return (
    <div className="ws-toolbar-row" ref={rowRef}>
      <Toolbar aria-label={`${tool.name} toolbar`} className="ws-toolbar">
        {items
          .filter((i) => !hidden.has(i.id))
          .map((item) => (
            <Control key={item.id} item={item} />
          ))}
        {overflow.length > 0 && (
          <MenuButton
            label="More actions"
            icon="more"
            onAction={(key) => overflow.find((i) => i.id === key)?.onClick()}
          >
            {overflow.map((i) => (
              <MenuItem
                key={i.id}
                id={i.id}
                icon={i.icon}
                isDisabled={i.disabled}
                description={i.illustrative ? 'Illustrative in this mockup' : undefined}
                trailing={i.active ? <Icon name="check" size={18} className="text-accent" /> : undefined}
              >
                {i.label}
              </MenuItem>
            ))}
          </MenuButton>
        )}
        {hasIllustrative && !hidden.size && (
          <span className="ws-toolbar-legend" title="Controls with a dotted underline are illustrative in this mockup">
            <span className="underline decoration-dotted underline-offset-4">Dotted</span> = illustrative
          </span>
        )}
      </Toolbar>
      {trailing && (
        <div className="ws-toolbar-trailing" ref={trailingRef}>
          {trailing}
        </div>
      )}
      {/* Off-screen copy used only to measure each control's natural width. */}
      <div ref={measureRef} className="ws-toolbar-measure" aria-hidden="true" inert>
        {items.map((item) => (
          <span key={item.id} data-measure-id={item.id} className="inline-flex">
            <Control item={item} measuring />
          </span>
        ))}
      </div>
    </div>
  )
}
