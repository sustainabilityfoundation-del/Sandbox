import { useState } from 'react'
import { resolvedTheme, usePreferences } from '@ews/design-system/preferences'
import {
  Badge,
  Button,
  Cell,
  Checkbox,
  CheckboxGroup,
  Column,
  ComboBox,
  Dialog,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
  LoadingState,
  Menu,
  MenuButton,
  MenuItem,
  MenuSection,
  MenuSeparator,
  Notice,
  Panel,
  Popover,
  PopoverButton,
  Row,
  STATUS,
  SearchField,
  SegmentedControl,
  Select,
  Sheet,
  Spinner,
  StatusBadge,
  SubmenuTrigger,
  Tab,
  TabList,
  TabPanel,
  Table,
  TableBody,
  TableHeader,
  Tabs,
  TextField,
  Toaster,
  ToggleButton,
  ToggleIconButton,
  Toolbar,
  ToolbarSeparator,
  useToasts,
  type ButtonVariant,
  type StatusKind,
} from '@ews/design-system'

/**
 * Development-only gallery of the component library (open /workspace/?showcase
 * with `npm run dev`). Not included in production builds.
 */

const VARIANTS: ButtonVariant[] = ['filled', 'tonal', 'outlined', 'text', 'quiet', 'danger']

const ROWS = [
  { id: 'REQ-001', title: 'Rod shall not buckle at 1.5× operating load', status: 'compliant' as StatusKind, owner: 'Structures' },
  { id: 'REQ-002', title: 'Full stroke in under 2.0 s', status: 'not-assessed' as StatusKind, owner: 'Controls' },
  { id: 'REQ-003', title: 'Housing mass below 4.2 kg', status: 'non-compliant' as StatusKind, owner: 'Design' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line py-6">
      <h2 className="m-0 text-title font-medium">{title}</h2>
      {children}
    </section>
  )
}

export default function Showcase() {
  const theme = usePreferences((s) => s.theme)
  const density = usePreferences((s) => s.density)
  const push = useToasts((s) => s.push)
  const [dialog, setDialog] = useState(false)
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null)
  const [sheet, setSheet] = useState(false)
  const [select, setSelect] = useState('cfg-a')
  const [text, setText] = useState('')
  const [methods, setMethods] = useState(['Analysis'])
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('a')
  const [selected, setSelected] = useState(false)

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2 shadow-1">
        <h1 className="m-0 mr-auto text-headline font-medium">Component showcase</h1>
        <SegmentedControl
          label="Theme"
          size="sm"
          value={resolvedTheme(theme)}
          onChange={(t) => usePreferences.getState().setTheme(t)}
          options={[
            { value: 'light', label: 'Light', icon: 'theme-light' },
            { value: 'dark', label: 'Dark', icon: 'theme-dark' },
          ]}
        />
        <SegmentedControl
          label="Density"
          size="sm"
          value={density}
          onChange={(d) => usePreferences.getState().setDensity(d)}
          options={[
            { value: 'comfortable', label: 'Comfortable', icon: 'density-comfortable' },
            { value: 'compact', label: 'Compact', icon: 'density-compact' },
          ]}
        />
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <Section title="Buttons">
          {VARIANTS.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-ui-xs text-fg-3">{v}</span>
              <Button variant={v}>Default</Button>
              <Button variant={v} icon="save">
                With icon
              </Button>
              <Button variant={v} size="sm">
                Small
              </Button>
              <Button variant={v} isDisabled>
                Disabled
              </Button>
              <Button variant={v} isPending>
                Pending
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-ui-xs text-fg-3">icon / toggle</span>
            <IconButton label="Settings" icon="settings" />
            <IconButton label="Close" icon="close" size="sm" />
            <IconButton label="Disabled" icon="failed" isDisabled />
            <ToggleIconButton label="Pin" icon={selected ? 'pin' : 'pin'} isSelected={selected} onChange={setSelected} />
            <ToggleButton icon="filter" isSelected={selected} onChange={setSelected}>
              Filter
            </ToggleButton>
            <SegmentedControl
              label="Segmented"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'a', label: 'Details' },
                { value: 'b', label: 'Trace' },
                { value: 'c', label: 'History' },
              ]}
            />
          </div>
        </Section>

        <Section title="Menus, popovers and overlays">
          <div className="flex flex-wrap items-center gap-2">
            <MenuButton label="Actions" text="Actions" icon="more-vertical" onAction={(k) => push({ tone: 'info', title: `Chose ${String(k)}` })}>
              <MenuSection title="Edit">
                <MenuItem id="edit" icon="edit" shortcut="E">
                  Edit
                </MenuItem>
                <MenuItem id="link" icon="link" description="Allocate to components">
                  Link
                </MenuItem>
                <MenuItem id="disabled" icon="rejected" isDisabled>
                  Unavailable
                </MenuItem>
              </MenuSection>
              <MenuSeparator />
              <SubmenuTrigger>
                <MenuItem id="more" icon="tune">
                  More
                </MenuItem>
                <Popover placement="end top">
                  <Menu aria-label="More" onAction={(k) => push({ tone: 'info', title: `Chose ${String(k)}` })}>
                  <MenuItem id="sub-a">Sub action A</MenuItem>
                  <MenuItem id="sub-b">Sub action B</MenuItem>
                  </Menu>
                </Popover>
              </SubmenuTrigger>
              <MenuItem id="delete" icon="failed" tone="danger">
                Delete
              </MenuItem>
            </MenuButton>
            <PopoverButton label="Popover" text="Popover" icon="info">
              <div className="flex max-w-72 flex-col gap-2 text-ui-sm">
                <strong>Popover content</strong>
                <span className="text-fg-2">Escape closes it and focus returns to the trigger.</span>
              </div>
            </PopoverButton>
            <Button variant="outlined" onPress={() => setDialog(true)}>
              Dialog
            </Button>
            <Button variant="outlined" onPress={() => setDrawer('left')}>
              Drawer (left)
            </Button>
            <Button variant="outlined" onPress={() => setDrawer('right')}>
              Drawer (right)
            </Button>
            <Button variant="outlined" onPress={() => setSheet(true)}>
              Sheet
            </Button>
            <Button variant="tonal" onPress={() => push({ tone: 'success', title: 'Saved REQ-001' })}>
              Toast
            </Button>
            <Button variant="tonal" onPress={() => push({ tone: 'danger', title: 'Could not reach the repository', body: 'Your changes are kept. Try again.' })}>
              Error toast
            </Button>
          </div>
        </Section>

        <Section title="Forms">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Title" description="Shown in the requirement table" value={text} onChange={setText} placeholder="Requirement title" />
            <TextField label="Operating load" unit="kN" inputMode="decimal" errorMessage="Enter a positive number" defaultValue="-3" />
            <Select
              label="Configuration"
              value={select}
              onChange={setSelect}
              options={[
                { id: 'cfg-a', label: 'Baseline' },
                { id: 'cfg-b', label: 'Lightweight', description: 'Aluminium housing' },
                { id: 'cfg-c', label: 'Archived', isDisabled: true },
              ]}
            />
            <ComboBox
              label="Find object"
              placeholder="Type an ID or name"
              onSelect={(o) => push({ tone: 'info', title: `Selected ${o.label}` })}
              options={ROWS.map((r) => ({ id: r.id, label: `${r.id} ${r.title}`, icon: 'requirements' }))}
            />
            <SearchField label="Search" placeholder="Search the showcase" />
            <TextField label="Notes" multiline rows={3} placeholder="Multiline text" />
            <CheckboxGroup label="Verification methods" value={methods} onChange={setMethods}>
              {['Analysis', 'Test', 'Inspection'].map((m) => (
                <Checkbox key={m} value={m}>
                  {m}
                </Checkbox>
              ))}
            </CheckboxGroup>
            <Checkbox isDisabled>Disabled checkbox</Checkbox>
          </div>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS) as StatusKind[]).map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(['neutral', 'info', 'success', 'warning', 'danger'] as const).map((t) => (
              <Badge key={t} tone={t} icon="info">
                {t}
              </Badge>
            ))}
            <Spinner label="Loading" />
          </div>
          <Notice tone="warning" title="Inputs changed since this run" actions={<Button size="sm" variant="outlined">Run again</Button>}>
            A saved result would be marked potentially stale.
          </Notice>
          <Notice tone="danger" title="Could not save">
            The repository rejected the change. Your edits are kept.
          </Notice>
          <LoadingState label="Loading tool…" />
          <EmptyState icon="info" title="Nothing selected">
            Select an object to see its properties.
          </EmptyState>
        </Section>

        <Section title="Tabs, toolbar and panel">
          <Toolbar aria-label="Example toolbar" className="flex flex-wrap items-center gap-1 rounded-card border border-line bg-surface p-1">
            <Button variant="filled" size="sm" icon="run">
              Run
            </Button>
            <ToolbarSeparator />
            <ToggleButton size="sm" icon="filter" isSelected={selected} onChange={setSelected}>
              Filter
            </ToggleButton>
            <Button variant="quiet" size="sm" icon="link">
              Link
            </Button>
            <IconButton label="More actions" icon="more" size="sm" />
          </Toolbar>
          <Tabs>
            <TabList aria-label="Example tabs">
              <Tab id="one">
                <Icon name="requirements" size={18} /> Requirements
              </Tab>
              <Tab id="two">
                <Icon name="approved" size={18} /> Verification
              </Tab>
              <Tab id="three" isDisabled>
                Disabled
              </Tab>
            </TabList>
            <TabPanel id="one" className="p-3">
              <Panel title="Panel" actions={<IconButton label="Panel settings" icon="settings" size="sm" />}>
                Panels group related content.
              </Panel>
            </TabPanel>
            <TabPanel id="two" className="p-3">
              Second tab.
            </TabPanel>
          </Tabs>
        </Section>

        <Section title="Table (cards below 620 px container width)">
          <div className="[container:tool/inline-size] rounded-card border border-line bg-surface">
            <Table aria-label="Example requirements" cards selectionMode="single" selectionBehavior="replace">
              <TableHeader>
                <Column isRowHeader width={100}>
                  ID
                </Column>
                <Column>Title</Column>
                <Column width={160}>Compliance</Column>
                <Column width={120}>Owner</Column>
              </TableHeader>
              <TableBody>
                {ROWS.map((r) => (
                  <Row key={r.id} id={r.id}>
                    <Cell title className="font-mono">
                      {r.id}
                    </Cell>
                    <Cell label="Title" wide>
                      {r.title}
                    </Cell>
                    <Cell label="Compliance">
                      <StatusBadge status={r.status} />
                    </Cell>
                    <Cell label="Owner">{r.owner}</Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </main>

      <Dialog
        title="Discard changes?"
        isOpen={dialog}
        onOpenChange={setDialog}
        footer={
          <>
            <Button variant="text" onPress={() => setDialog(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onPress={() => setDialog(false)}>
              Discard
            </Button>
          </>
        }
      >
        Focus is contained in this dialog; Escape closes it and focus returns to the button that opened it.
      </Dialog>
      <Drawer side={drawer ?? 'left'} title="Drawer" isOpen={drawer !== null} onOpenChange={(o) => !o && setDrawer(null)}>
        <div className="p-4">Drawers hold secondary panels on tablets and phones.</div>
      </Drawer>
      <Sheet title="Sheet" isOpen={sheet} onOpenChange={setSheet}>
        <div className="flex flex-col gap-3 p-4">
          <p className="m-0">Sheets hold inspection and ChatGPT on phones and stay above the on-screen keyboard.</p>
          <TextField label="Message" multiline rows={2} />
        </div>
      </Sheet>
      <Toaster />
    </div>
  )
}
