import { Menu, MenuButton, MenuItem, MenuSection, Popover, SubmenuTrigger } from '@ews/design-system'
import type { HelpModuleInfo } from '@ews/platform-sdk'
import { useEntitlements } from '../platform/entitlements'
import { ABOUT_TOPIC } from './HelpCentre'
import { openContextualHelp } from './contextual'
import { startTutorial } from './tours'
import { useHelpCentre, workspaceHelp } from './workspaceHelp'

/**
 * The header's Help (?) menu. Module submenus come from the Help Service, which reads the tool
 * registry and the subscription, so installed, enabled and permitted modules appear without any
 * change here.
 */
export function HelpMenu() {
  // Re-render when the subscription changes.
  useEntitlements((s) => s.plan.id)
  const modules = workspaceHelp.modules().filter((m) => m.moduleId !== 'platform')
  const show = (id: string | null) => useHelpCentre.getState().show(id)
  const firstApi = workspaceHelp.modules().map((m) => m.topicsByKind.api?.[0]).find(Boolean)

  const run = (key: React.Key) => {
    const k = String(key)
    if (k === 'centre') show(null)
    else if (k === 'context') openContextualHelp()
    else if (k === 'getting-started') show('platform.getting-started')
    else if (k === 'shortcuts') show('platform.shortcuts')
    else if (k === 'api') firstApi ? show(firstApi) : useHelpCentre.getState().show(null, 'No API documentation is available for your modules.')
    else if (k === 'about') show(ABOUT_TOPIC)
  }

  return (
    <span data-help-id="platform.header.help">
      <MenuButton label="Help" icon="help" onAction={run} className="text-header-fg">
        <MenuSection>
          <MenuItem id="centre" icon="book">Help Centre</MenuItem>
          <MenuItem id="context" icon="help" shortcut="F1">Contextual help</MenuItem>
          <MenuItem id="getting-started" icon="tour">Getting started</MenuItem>
          <MenuItem id="shortcuts" icon="keyboard">Keyboard shortcuts</MenuItem>
        </MenuSection>
        <MenuSection title="Modules">
          {modules.map((m) => (
            <ModuleSubmenu key={m.moduleId} module={m} />
          ))}
        </MenuSection>
        <MenuSection>
          <MenuItem id="api" icon="link">API documentation</MenuItem>
          <MenuItem id="about" icon="info">About and versions</MenuItem>
        </MenuSection>
      </MenuButton>
    </span>
  )
}

function ModuleSubmenu({ module: m }: { module: HelpModuleInfo }) {
  const tutorials = workspaceHelp.tutorials(m.moduleId)
  const first = (kind: keyof HelpModuleInfo['topicsByKind']) => m.topicsByKind[kind]?.[0]
  const items: { id: string; label: string; topic?: string; tutorial?: (typeof tutorials)[number] }[] = m.landingTopic
    ? [
        { id: 'guide', label: 'User guide', topic: m.landingTopic },
        ...(first('reference') ? [{ id: 'reference', label: 'Feature reference', topic: first('reference') }] : []),
        ...tutorials.map((t) => ({ id: `tutorial:${t.id}`, label: `Tutorial: ${t.title}`, tutorial: t })),
        ...(first('shortcuts') ? [{ id: 'shortcuts', label: 'Keyboard shortcuts', topic: first('shortcuts') }] : []),
        ...(first('troubleshooting') ? [{ id: 'troubleshooting', label: 'Troubleshooting', topic: first('troubleshooting') }] : []),
        ...(first('api') ? [{ id: 'api', label: 'API documentation', topic: first('api') }] : []),
      ]
    : []
  return (
    <SubmenuTrigger>
      <MenuItem id={`module:${m.moduleId}`} data-help-menu-module={m.moduleId}>
        {m.displayName}
      </MenuItem>
      <Popover placement="start top" className="min-w-52 max-w-[min(320px,calc(100vw-16px))] overflow-auto p-1">
        <Menu
          aria-label={`${m.displayName} help`}
          onAction={(key) => {
            const item = items.find((i) => i.id === key)
            if (item?.tutorial) void startTutorial(item.tutorial)
            else if (item?.topic) useHelpCentre.getState().show(item.topic)
          }}
        >
          {items.length ? (
            items.map((i) => (
              <MenuItem key={i.id} id={i.id} icon={i.tutorial ? 'tour' : 'book'}>
                {i.label}
              </MenuItem>
            ))
          ) : (
            <MenuItem id="none" isDisabled>
              No documentation yet
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </SubmenuTrigger>
  )
}
