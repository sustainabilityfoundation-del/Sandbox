// Fixture for the command-surface browser tests and screenshots: one surface per page, each with commands in all four
// states. ?c=menubar|palette|context|session|dock|bar|quick  ?layout=desktop|tablet|phone  ?theme=dark  ?keytips=1
// Every invocation is recorded in window.__calls so a test can prove a planned command never ran.
import '../../../theme/index.css'
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '../../Button'
import type { CommandBarCommand, CommandBarGroup, CommandBarLayout, CommandBarTab } from '../../CommandBar'
import { CommandBar, QuickBar } from '../../CommandBar'
import { CommandSessionStrip } from '../../CommandSessionStrip'
import { ContextCommands } from '../../ContextCommands'
import { DockPanel } from '../../DockPanel'
import { MenuBar, type MenuBarMenu } from '../../MenuBar'
import { MenuButton, MenuItem, MenuSection } from '../../Overlays'
import { ToolPalette } from '../../ToolPalette'

declare global {
  interface Window {
    __calls: string[]
    __help: string[]
  }
}
window.__calls = []
window.__help = []

const params = new URLSearchParams(location.search)
const surface = params.get('c') ?? 'bar'
const layout = (params.get('layout') as CommandBarLayout | null) ?? undefined
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark'

const call = (name: string) => () => window.__calls.push(name)
const planned = (id: string, label: string, over: Partial<CommandBarCommand> = {}): CommandBarCommand => ({
  id,
  label,
  icon: 'cmd-modify',
  description: `${label} is planned.`,
  state: { kind: 'planned', info: { status: 'Planned', backlog: ['BL-X-1'] } },
  ...over,
})
const ready = (id: string, label: string, over: Partial<CommandBarCommand> = {}): CommandBarCommand => ({
  id,
  label,
  icon: 'cmd-create',
  description: `${label} now.`,
  state: { kind: 'ready', onInvoke: call(id) },
  ...over,
})
const partial = (id: string, label: string): CommandBarCommand => ({
  id,
  label,
  icon: 'cmd-exchange',
  description: `${label} with limits.`,
  state: { kind: 'partial', limitation: 'geometry only', onInvoke: call(id) },
})
const unavailable = (id: string, label: string): CommandBarCommand => ({
  id,
  label,
  icon: 'undo',
  description: `${label} later.`,
  state: { kind: 'unavailable', reason: 'Open a document first' },
})

// ---- Menu bar ---------------------------------------------------------------------------------------

const menus: MenuBarMenu[] = [
  {
    id: 'file',
    label: 'File',
    mnemonic: 'f',
    items: [
      { kind: 'command', command: ready('new', 'New', { icon: 'add', shortcut: 'Control+N' }), mnemonic: 'n' },
      { kind: 'command', command: ready('save', 'Save', { icon: 'save', shortcut: 'Control+S' }), mnemonic: 's' },
      { kind: 'submenu', id: 'export', label: 'Export', mnemonic: 'e', items: [{ kind: 'command', command: partial('export-step', 'STEP') }, { kind: 'command', command: planned('export-iges', 'IGES') }] },
      { kind: 'separator', id: 's1' },
      { kind: 'command', command: unavailable('reopen', 'Reopen') },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    mnemonic: 'e',
    items: [
      { kind: 'command', command: ready('undo', 'Undo', { icon: 'undo' }) },
      { kind: 'command', command: planned('fillet', 'Fillet') },
    ],
  },
  {
    id: 'view',
    label: 'View',
    mnemonic: 'v',
    items: [
      { kind: 'section', id: 'show', title: 'Show', items: [{ kind: 'command', command: ready('grid', 'Grid', { mode: 'toggle', icon: 'layout' }), checked: true }, { kind: 'command', command: ready('axes', 'Axes', { mode: 'toggle', icon: 'layout' }), checked: false }] },
      { kind: 'command', command: planned('perspective', 'Perspective') },
    ],
  },
]

function MenuBarPage() {
  return (
    <div className="flex h-10 items-center border-b border-line bg-surface px-2">
      <MenuBar ariaLabel="Main menu" menus={menus} layout={layout} keyTips={!!params.get('keytips')} onHelp={(id) => window.__help.push(id)} />
      <Button id="after" className="ml-4">
        after
      </Button>
    </div>
  )
}

// ---- Palette ----------------------------------------------------------------------------------------

function PalettePage() {
  const [armed, setArmed] = useState<string | null>(null)
  const tool = (id: string, label: string, icon: CommandBarCommand['icon']): CommandBarCommand => ({
    id,
    label,
    icon,
    mode: 'tool',
    description: `Draw a ${label.toLowerCase()}.`,
    state: {
      kind: 'ready',
      active: armed === id,
      onInvoke: () => {
        window.__calls.push(`arm:${id}`)
        setArmed((cur) => (cur === id ? null : id))
      },
    },
  })
  return (
    <div className="flex h-[520px] bg-bg">
      <ToolPalette
        ariaLabel="Sketch tools"
        layout={layout}
        onDisarm={(id) => {
          window.__calls.push(`disarm:${id}`)
          setArmed(null)
        }}
        groups={[
          { id: 'draw', label: 'Draw', icon: 'cmd-draw', commands: [tool('line', 'Line', 'cad-sketch'), tool('circle', 'Circle', 'cmd-draw'), planned('spline', 'Spline', { mode: 'tool', icon: 'cmd-draw' })] },
          { id: 'constrain', label: 'Constrain', icon: 'cmd-constrain', commands: [tool('coincident', 'Coincident', 'constraint'), planned('tangent', 'Tangent', { mode: 'tool' })] },
          { id: 'later', label: 'Pattern', icon: 'cmd-pattern', collapsed: true, commands: [planned('linear', 'Linear pattern')] },
        ]}
      />
      <div className="p-4 text-ui-sm text-fg-2">Armed: {armed ?? 'none'}</div>
    </div>
  )
}

// ---- Context commands -------------------------------------------------------------------------------

function ContextPage() {
  const anchor = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(layout !== undefined && layout !== 'desktop')
  return (
    <div className="p-4">
      <div ref={anchor} className="h-24 w-48 rounded-card border border-line bg-surface p-2 text-ui-sm">
        Selected edge
      </div>
      <Button id="open-context" onPress={() => setOpen(true)} className="mt-3">
        Selection commands
      </Button>
      <ContextCommands
        ariaLabel="Selection commands"
        layout={layout}
        isOpen={open}
        onOpenChange={setOpen}
        anchorRef={anchor}
        className="mt-3"
        commands={[ready('delete', 'Delete', { icon: 'close' }), ready('hide', 'Hide', { icon: 'hidden' }), { type: 'separator', id: 'sep' }, planned('fillet-edge', 'Fillet edge'), unavailable('isolate', 'Isolate')]}
      />
    </div>
  )
}

// ---- Session strip ----------------------------------------------------------------------------------

function SessionPage() {
  const [depth, setDepth] = useState(10)
  const [preview, setPreview] = useState(false)
  const [open, setOpen] = useState(true)
  return (
    <div>
      {open ? (
        <CommandSessionStrip
          title="Extrude"
          fields={[{ type: 'number', id: 'depth', label: 'Depth', unit: 'mm', value: depth, min: 0, max: 500, step: 0.5, onChange: setDepth }, { type: 'text', id: 'note', text: 'Blind' }]}
          preview={{ on: preview, onChange: setPreview }}
          okUnavailableReason={params.get('blocked') ? 'Select a profile first' : depth <= 0 ? 'Depth must be greater than 0' : undefined}
          onOk={() => {
            window.__calls.push(`ok:${depth}`)
            setOpen(false)
          }}
          onCancel={() => {
            window.__calls.push('cancel')
            setOpen(false)
          }}
        />
      ) : (
        <p id="closed" className="p-3 text-ui-sm">
          Session closed
        </p>
      )}
    </div>
  )
}

// ---- Dock panel -------------------------------------------------------------------------------------

function DockPage() {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex h-[360px] bg-bg">
      <DockPanel title="Browser" icon="tree" side="start" role="browser" layout={layout} isOpen={open} onOpenChange={setOpen}>
        <p className="m-0 p-3 text-ui-sm text-fg-2">Model tree</p>
      </DockPanel>
      <div className="flex-1 p-4">
        <Button id="toggle" onPress={() => setOpen((v) => !v)}>
          Browser
        </Button>
      </div>
    </div>
  )
}

// ---- Command bar with every new capability ------------------------------------------------------------

function barTabs(many: boolean): CommandBarTab[] {
  const [active, setActive] = useState('select')
  const mode = (id: string, label: string): CommandBarCommand => ({
    id,
    label,
    icon: 'select',
    mode: 'toggle',
    description: `${label} mode.`,
    state: { kind: 'ready', active: active === id, onInvoke: () => { window.__calls.push(`mode:${id}`); setActive(id) } },
  })
  const home: CommandBarGroup[] = [
    {
      id: 'create',
      label: 'Create',
      icon: 'cmd-create',
      counts: true,
      commands: [
        ready('extrude', 'Extrude', { icon: 'cad-extrude', split: [ready('extrude-cut', 'Extrude cut'), planned('extrude-thin', 'Thin extrude'), partial('extrude-surface', 'Extrude surface')] }),
        { id: 'tool', label: 'Sketch', icon: 'cad-sketch', mode: 'tool', description: 'Arm the sketch tool.', state: { kind: 'ready', active: true, onInvoke: call('sketch') } },
      ],
    },
    { id: 'mode', label: 'Mode', exclusive: true, commands: [mode('select', 'Select'), mode('pan', 'Pan'), mode('zoom', 'Zoom')] },
    {
      id: 'later',
      label: 'Simulation',
      icon: 'analysis',
      commands: [planned('s1', 'Static'), planned('s2', 'Modal'), planned('s3', 'Thermal'), planned('s4', 'Fatigue'), planned('s5', 'Buckling'), planned('s6', 'Drop test')],
    },
  ]
  const extra = ['Insert', 'Layout', 'Annotate', 'Analyse', 'Inspect', 'Manufacture', 'Collaborate', 'Automation'].map((label) => ({ id: label.toLowerCase(), label, groups: [{ id: `${label}-g`, label, commands: [ready(`${label}-c`, `${label} item`)] }] }))
  return [{ id: 'home', label: 'Home', groups: home }, ...(many ? extra : [])]
}

function BarPage() {
  const tabs = barTabs(!!params.get('many'))
  return (
    <div className="bg-bg text-fg">
      <CommandBar ariaLabel="Demo toolbar" tabs={tabs} layout={layout} quick={params.get('quick') ? [ready('q-save', 'Save', { icon: 'save' }), ready('q-undo', 'Undo', { icon: 'undo' }), planned('q-redo', 'Redo', { icon: 'reset' })] : undefined} onHelp={(id) => window.__help.push(id)} />
    </div>
  )
}

function QuickPage() {
  return <QuickBar commands={[ready('q-save', 'Save', { icon: 'save' }), partial('q-export', 'Export'), planned('q-redo', 'Redo', { icon: 'reset' }), unavailable('q-open', 'Reopen')]} />
}

// A MenuSection with checked items: every selection change is recorded as "select:<sorted ids>".
function SectionPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['grid']))
  return (
    <MenuButton label="Show" text="Show">
      <MenuSection
        title="Overlays"
        selectionMode="multiple"
        selectedKeys={selected}
        onSelectionChange={(keys) => {
          const next = keys === 'all' ? new Set(['grid', 'axes']) : keys
          window.__calls.push(`select:${[...next].sort().join(',')}`)
          setSelected(next)
        }}
      >
        <MenuItem id="grid">Grid</MenuItem>
        <MenuItem id="axes">Axes</MenuItem>
      </MenuSection>
    </MenuButton>
  )
}

function Page() {
  switch (surface) {
    case 'menubar':
      return <MenuBarPage />
    case 'palette':
      return <PalettePage />
    case 'context':
      return <ContextPage />
    case 'session':
      return <SessionPage />
    case 'dock':
      return <DockPage />
    case 'quick':
      return <QuickPage />
    case 'section':
      return <SectionPage />
    default:
      return <BarPage />
  }
}

createRoot(document.getElementById('root')!).render(
  <div className="bg-bg text-fg">
    <Page />
  </div>,
)
