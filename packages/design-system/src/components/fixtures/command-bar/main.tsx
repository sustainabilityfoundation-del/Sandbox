// Fixture for the CommandBar browser test and its screenshots: one command in each state, served by Vite.
// ?layout=desktop|tablet|phone forces the layout; ?theme=dark switches the theme; ?tabs=1 adds a second tab.
import '../../../theme/index.css'
import { createRoot } from 'react-dom/client'
import { Button } from '../../Button'
import { CommandBar, type CommandBarTab } from '../../CommandBar'

declare global {
  interface Window {
    __calls: string[]
    __help: string[]
  }
}
window.__calls = []
window.__help = []

const params = new URLSearchParams(location.search)
const layout = params.get('layout') as 'desktop' | 'tablet' | 'phone' | null
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark'

const call = (name: string) => () => window.__calls.push(name)

const home: CommandBarTab = {
  id: 'home',
  label: 'Home',
  groups: [
    {
      id: 'file',
      label: 'File',
      icon: 'artifact',
      commands: [
        { id: 'save', label: 'Save', icon: 'save', description: 'Save the document.', primary: true, state: { kind: 'ready', onInvoke: call('save') } },
        { id: 'export', label: 'Export STEP', icon: 'artifact', description: 'Write a STEP file.', priority: 'secondary', state: { kind: 'partial', limitation: 'geometry only', onInvoke: call('export') } },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: 'reset',
      commands: [
        { id: 'fillet', label: 'Fillet', icon: 'cad-extrude', description: 'Round the selected edges.', helpId: 'cad.fillet', priority: 'secondary', state: { kind: 'planned', info: { status: 'Planned', backlog: ['BL-CAD-12'], helpId: 'cad.fillet' } } },
        { id: 'reopen', label: 'Reopen', icon: 'undo', description: 'Reopen the last document.', priority: 'secondary', state: { kind: 'unavailable', reason: 'Open a document first' } },
      ],
    },
  ],
}

const tabs: CommandBarTab[] = params.get('tabs') ? [home, { id: 'view', label: 'View', groups: [{ id: 'zoom', label: 'Zoom', commands: [{ id: 'fit', label: 'Fit', description: 'Fit to window.', state: { kind: 'ready', onInvoke: call('fit') } }] }] }] : [home]

createRoot(document.getElementById('root')!).render(
  <div className="bg-bg text-fg">
    <CommandBar ariaLabel="Demo toolbar" tabs={tabs} layout={layout ?? undefined} onHelp={(id) => window.__help.push(id)} />
    <Button id="after">after</Button>
  </div>,
)
