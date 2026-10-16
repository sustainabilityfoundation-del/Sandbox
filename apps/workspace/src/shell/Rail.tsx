import type { ReactNode } from 'react'
import { Button as AriaButton, TooltipTrigger } from 'react-aria-components'
import { AppIcon, Icon, MenuButton, MenuItem, MenuSection, Tooltip, cx, type IconName } from '@ews/design-system'
import { useConversation } from '../assistant/conversation'
import { openToolOrExplain } from '../platform/api'
import { canOpenTool, useEntitlements } from '../platform/entitlements'
import { isDemoTool } from '../platform/demoTools'
import { getTools } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { PRESETS, PRESET_IDS, applyPreset, assistantOnRight, assistantVisibleRight, currentPreset, dockAssistant, restoreDefaultLayout, showAssistant } from './layout/presets'

/** One rail entry: icon over a short label, active background and accent indicator, tooltip when collapsed. */
function RailItem({
  icon,
  label,
  tooltip,
  active,
  pressed,
  expanded,
  onPress,
  badge,
  marker,
  dataProps,
}: {
  icon: IconName
  label: string
  tooltip?: string
  /** The current module (aria-current). */
  active?: boolean
  /** Toggle state for panel entries (aria-pressed). */
  pressed?: boolean
  expanded: boolean
  onPress: () => void
  badge?: ReactNode
  marker?: ReactNode
  dataProps?: Record<string, string>
}) {
  return (
    <TooltipTrigger delay={400} closeDelay={80}>
      <AriaButton
        onPress={onPress}
        aria-label={tooltip ?? label}
        aria-current={active ? 'page' : undefined}
        aria-pressed={pressed}
        data-active={active || pressed || undefined}
        className="ws-rail-item group outline-none data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus"
        {...dataProps}
      >
        <span className="ws-rail-icon">
          <AppIcon name={icon} size="nav" filled={active || pressed} />
          {badge}
        </span>
        {expanded && <span className="ws-rail-label">{label}</span>}
        {marker}
      </AriaButton>
      <Tooltip placement="right">{tooltip ?? label}</Tooltip>
    </TooltipTrigger>
  )
}

/**
 * Primary navigation rail (brief §4 B): the project explorer, every registered module (from the tool registry, so
 * new or newly entitled modules appear without shell changes), the assistant and the layout menu. Dark shell
 * tokens; collapsible to icons with tooltips.
 */
export function NavigationRail({ desktop, expanded }: { desktop: boolean; /** Labels shown (the preference, unless the window is narrow). */ expanded: boolean }) {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  useEntitlements((s) => s.plan.id) // re-render when the subscription changes
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)
  const demoAssistant = useConversation((s) => s.service?.info.kind !== 'remote')

  const right = assistantOnRight(layout, desktop)
  const assistantShown = right ? assistantVisibleRight(layout, desktop) : layout.activityOpen && layout.dockTab === 'assistant'
  const preset = currentPreset(layout)

  return (
    <nav className={cx('ws-rail ws-shell-scope', expanded && 'is-expanded')} aria-label="Workspace navigation" data-help-id="platform.rail">
      <div className="ws-rail-group">
        <RailItem
          icon="project"
          label="Project"
          tooltip={layout.treeOpen ? 'Hide project explorer' : 'Show project explorer'}
          pressed={layout.treeOpen && !layout.canvasMaximized}
          expanded={expanded}
          onPress={() => setLayout({ treeOpen: !(layout.treeOpen && !layout.canvasMaximized), canvasMaximized: false })}
        />
      </div>
      <div className="ws-rail-group ws-rail-modules" role="group" aria-label="Modules">
        {getTools().map((tool) => {
          const allowed = canOpenTool(tool.id)
          return (
            <RailItem
              key={tool.id}
              icon={tool.icon}
              label={tool.name}
              tooltip={`${tool.name}${isDemoTool(tool.id) ? ' (demo)' : ''}${allowed ? '' : ' (not in your subscription)'}`}
              active={activeToolId === tool.id}
              expanded={expanded}
              onPress={() => openToolOrExplain(tool.id)}
              dataProps={{ 'data-rail-tool': tool.id }}
              badge={!allowed ? <Icon name="locked" size={12} className="ws-rail-badge-icon" /> : undefined}
            />
          )
        })}
      </div>
      <div className="ws-rail-group ws-rail-end">
        <RailItem
          icon="assistant"
          label="Assistant"
          tooltip={assistantShown ? 'Assistant (open)' : 'Show the assistant'}
          pressed={assistantShown}
          expanded={expanded}
          onPress={showAssistant}
          // Committed browser flows open the assistant through [data-dock-tab="assistant"]; when the assistant is
          // docked on the right, this entry is that control (the bottom panel has no Assistant tab then).
          dataProps={right ? { 'data-dock-tab': 'assistant' } : { 'data-rail': 'assistant' }}
          badge={
            pending > 0 ? (
              <span className="ws-nav-badge" aria-label={`${pending} change previews awaiting review`}>
                {pending}
              </span>
            ) : undefined
          }
          marker={right && demoAssistant ? <span className="ws-dock-demo ws-rail-demo" title="Demo assistant (not connected to an AI model)">Demo</span> : undefined}
        />
        <MenuButton
          label="Workspace layout"
          icon="layout"
          placement="right bottom"
          className="ws-rail-menu"
          onAction={(key) => {
            const k = String(key)
            if (k === 'restore') restoreDefaultLayout()
            else if (k === 'maximize') setLayout({ canvasMaximized: !layout.canvasMaximized })
            else if (k === 'dock-right') dockAssistant('right')
            else if (k === 'dock-bottom') dockAssistant('bottom')
            else if (k === 'rail') setLayout({ railExpanded: !layout.railExpanded })
            else if (k.startsWith('preset:')) applyPreset(k.slice(7) as (typeof PRESET_IDS)[number])
          }}
        >
          <MenuSection title={`Presets${preset ? '' : ' (current layout: custom)'}`}>
            {PRESET_IDS.map((id) => (
              <MenuItem key={id} id={`preset:${id}`} icon={PRESETS[id].icon} description={PRESETS[id].description} trailing={preset === id ? <Icon name="check" size={16} className="text-accent" /> : undefined}>
                {PRESETS[id].label}
              </MenuItem>
            ))}
          </MenuSection>
          <MenuSection title="Panels">
            <MenuItem id="maximize" icon={layout.canvasMaximized ? 'minimize' : 'maximize'}>
              {layout.canvasMaximized ? 'Restore panels' : 'Maximize the canvas'}
            </MenuItem>
            {desktop && (
              <MenuItem id={right ? 'dock-bottom' : 'dock-right'} icon={right ? 'dock-bottom' : 'dock-right'}>
                {right ? 'Dock the assistant at the bottom' : 'Dock the assistant on the right'}
              </MenuItem>
            )}
            <MenuItem id="rail" icon={layout.railExpanded ? 'collapse' : 'expand'}>
              {layout.railExpanded ? 'Collapse the navigation rail' : 'Expand the navigation rail'}
            </MenuItem>
            <MenuItem id="restore" icon="reset">
              Restore the default layout
            </MenuItem>
          </MenuSection>
        </MenuButton>
      </div>
    </nav>
  )
}
