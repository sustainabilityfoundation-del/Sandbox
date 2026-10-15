import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { Badge, Button, Checkbox, CheckboxGroup, Dialog, EmptyState, LoadingState, Notice, SearchField, Select, Tab, TabList, TabPanel, Tabs, TextField } from '@ews/design-system'
import { getProjectsClient, type ActivityEntry, type Member, type Milestone, type Project, type ProjectContext, type ProjectTemplate } from '@ews/projects-client'
import { workspaceServices } from '../platform/services'
import { useCurrentProject } from './bootstrap'
import { currentProjectId, switchProject } from './currentProject'

/**
 * Project Home (CR-PM-WS-1, brief §6): recent projects, search, filter and sort, templates and the New Project
 * wizard; the open project's overview (description, lifecycle status, modules, members, milestones, activity) and
 * its lifecycle actions. Every action calls the Project Management API; the server enforces roles and states.
 */
type HomeTab = 'projects' | 'new' | 'overview'

const useProjectHome = create<{ open: boolean; tab: HomeTab }>()(() => ({ open: false, tab: 'projects' }))

export function openProjectHome(tab: HomeTab = 'projects') {
  useProjectHome.setState({ open: true, tab })
}

const client = () => (workspaceServices.projects ? getProjectsClient(workspaceServices.projects) : undefined)
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const STATUS_LABEL: Record<Project['status'], string> = { planning: 'Planning', active: 'Active', 'on-hold': 'On hold', completed: 'Completed', cancelled: 'Cancelled' }
const DISCIPLINES = ['systems', 'mechanical', 'electrical', 'electronics', 'software', 'controls', 'thermal', 'structural', 'manufacturing', 'quality', 'safety', 'other']

/** A key suggestion from the name: initials of up to four words, else the first letters (EEP for "Example Engineering Product"). */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const key = words.length >= 2 ? words.slice(0, 4).map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 6)
  return /^[A-Z]/.test(key) ? key.padEnd(2, 'X') : ''
}

export function ProjectHome() {
  const { open, tab } = useProjectHome()
  const available = !!client()
  return (
    <Dialog title="Projects" isOpen={open} onOpenChange={(o) => useProjectHome.setState({ open: o })} size="lg">
      {!available ? (
        <Notice tone="warning" title="Project Management needs the backend">
          The workspace runs in demo mode, which has only the example project. Switch the service mode to the API (header, Services) to create and open projects.
        </Notice>
      ) : (
        <Tabs selectedKey={tab} onSelectionChange={(k) => useProjectHome.setState({ tab: k as HomeTab })}>
          <TabList aria-label="Project Home">
            <Tab id="projects">Projects</Tab>
            <Tab id="new">New project</Tab>
            <Tab id="overview">This project</Tab>
          </TabList>
          <TabPanel id="projects" className="pt-3">
            <ProjectList />
          </TabPanel>
          <TabPanel id="new" className="pt-3">
            <NewProjectWizard />
          </TabPanel>
          <TabPanel id="overview" className="pt-3">
            <ProjectOverview />
          </TabPanel>
        </Tabs>
      )}
    </Dialog>
  )
}

function ProjectRow({ project, current }: { project: Project; current: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2" data-help-id="projects.home.project">
      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-ui-sm text-fg-2">{project.key}</span>
          <strong className="text-ui font-medium">{project.name}</strong>
          {current && <Badge tone="info">Open</Badge>}
          {project.legacy && <Badge tone="neutral">Example</Badge>}
          {project.state !== 'active' && <Badge tone="warning">{project.state === 'archived' ? 'Archived' : 'Deleted'}</Badge>}
        </div>
        <div className="text-ui-sm text-fg-3">
          {STATUS_LABEL[project.status]} · {project.role ?? 'member'} · updated {new Date(project.updatedAt).toLocaleString()}
        </div>
      </div>
      {project.state !== 'deleted' && !current && (
        <Button size="sm" variant="filled" onPress={() => switchProject(project.id)}>
          Open
        </Button>
      )}
    </li>
  )
}

function ProjectList() {
  const [q, setQ] = useState('')
  const [state, setState] = useState('active')
  const [sort, setSort] = useState('-updated')
  const [items, setItems] = useState<Project[] | null>(null)
  const [recent, setRecent] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const c = client()!
    const timer = setTimeout(() => {
      Promise.all([c.listProjects({ q: q || undefined, state, sort, limit: 100 }), c.recentProjects()])
        .then(([page, rec]) => {
          if (cancelled) return
          setItems(page.items)
          setRecent(rec.slice(0, 5))
          setError(null)
        })
        .catch((e) => !cancelled && setError(message(e)))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, state, sort])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <SearchField label="Search projects" placeholder="Key, name or description" value={q} onChange={setQ} className="min-w-[14rem] flex-1" />
        <Select
          label="Show"
          size="sm"
          value={state}
          onChange={setState}
          options={[
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
            { id: 'deleted', label: 'Deleted (restorable)' },
            { id: 'all', label: 'All' },
          ]}
        />
        <Select
          label="Sort"
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { id: '-updated', label: 'Recently changed' },
            { id: '-opened', label: 'Recently opened' },
            { id: 'name', label: 'Name' },
            { id: 'key', label: 'Key' },
            { id: '-created', label: 'Newest' },
          ]}
        />
        <Button icon="add" variant="filled" onPress={() => useProjectHome.setState({ tab: 'new' })}>
          New project
        </Button>
      </div>
      {error && <Notice tone="danger" title="Projects could not be loaded">{error}</Notice>}
      {!q && state === 'active' && recent.length > 0 && (
        <section aria-label="Recently opened">
          <h3 className="m-0 text-ui-sm font-medium text-fg-2">Recently opened</h3>
          <ul className="m-0 list-none p-0">
            {recent.map((p) => (
              <ProjectRow key={`r-${p.id}`} project={p} current={p.id === currentProjectId} />
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Projects">
        <h3 className="m-0 text-ui-sm font-medium text-fg-2">Your projects</h3>
        {items === null && !error ? (
          <LoadingState label="Loading projects" />
        ) : items && items.length === 0 ? (
          <EmptyState icon="repository" title="No projects match">
            Create one, or change the search and filter.
          </EmptyState>
        ) : (
          <ul className="m-0 list-none p-0">
            {(items ?? []).map((p) => (
              <ProjectRow key={p.id} project={p} current={p.id === currentProjectId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function NewProjectWizard() {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [disciplines, setDisciplines] = useState<string[]>([])
  const [units, setUnits] = useState('si')
  const [templateId, setTemplateId] = useState('blank')
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    client()!.templates().then(setTemplates, (e) => setError(message(e)))
  }, [])
  const effectiveKey = keyEdited ? key : suggestKey(name)
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const p = await client()!.createProject({
        key: effectiveKey,
        name: name.trim(),
        description: description.trim(),
        disciplines: disciplines.length ? disciplines : undefined,
        templateId,
        settings: { 'projects.units.system': units },
      })
      switchProject(p.id)
    } catch (e) {
      setError(message(e))
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-3"
      data-help-id="projects.wizard"
      onSubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <TextField label="Project name" value={name} onChange={setName} isRequired autoFocus />
      <TextField
        label="Key"
        description="A short display identifier (letters, digits, hyphens), for example EEP. It never changes the project's identity."
        value={effectiveKey}
        onChange={(v) => {
          setKey(v.toUpperCase())
          setKeyEdited(true)
        }}
        isRequired
      />
      <TextField label="Description" value={description} onChange={setDescription} multiline rows={3} />
      <CheckboxGroup label="Engineering disciplines" value={disciplines} onChange={setDisciplines}>
        {DISCIPLINES.map((d) => (
          <Checkbox key={d} value={d}>
            {d[0].toUpperCase() + d.slice(1)}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <Select
        label="Unit system"
        value={units}
        onChange={setUnits}
        options={[
          { id: 'si', label: 'SI' },
          { id: 'imperial', label: 'Imperial (US customary)' },
          { id: 'mixed', label: 'Mixed (as entered)' },
        ]}
      />
      <Select label="Template" value={templateId} onChange={setTemplateId} options={templates.map((t) => ({ id: t.id, label: t.name, description: t.description }))} />
      <Notice tone="info">A new project starts with no engineering artifacts in any module. Templates add configuration and planning items only.</Notice>
      {error && <Notice tone="danger" title="The project was not created">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="filled" icon="add" isDisabled={!name.trim() || !effectiveKey || busy} isPending={busy}>
          Create and open
        </Button>
      </div>
    </form>
  )
}

function ProjectOverview() {
  const opened = useCurrentProject((s) => s.opened)
  const warning = useCurrentProject((s) => s.warning)
  const [ctx, setCtx] = useState<ProjectContext | null>(opened?.context ?? null)
  const [members, setMembers] = useState<Member[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState('')
  const projectId = opened?.current.projectId
  const reload = useMemo(
    () => async () => {
      if (!projectId) return
      const c = client()!
      try {
        const [context, m, ms, act] = await Promise.all([c.context(projectId), c.members(projectId), c.milestones(projectId), c.activity(projectId, { limit: 15 })])
        setCtx(context)
        setMembers(m)
        setMilestones(ms)
        setActivity(act)
      } catch (e) {
        setError(message(e))
      }
    },
    [projectId],
  )
  useEffect(() => void reload(), [reload])
  if (!opened || !projectId) return <LoadingState label="Opening the project" />
  if (!ctx) return warning ? <Notice tone="warning">{warning}</Notice> : <LoadingState label="Loading the project" />
  const p = ctx.project
  const can = (perm: string) => ctx.permissions.includes(perm)
  const update = async (input: Partial<Project>) => {
    setError(null)
    try {
      const next = await client()!.updateProject(projectId, p.revision, input)
      setSaved(`All changes saved · revision ${next.revision}`)
      await reload()
    } catch (e) {
      setError(message(e))
    }
  }
  const transition = async (kind: 'archive' | 'restore' | 'delete') => {
    setError(null)
    try {
      if (kind === 'delete') await client()!.deleteProject(projectId, confirmKey)
      else if (kind === 'archive') await client()!.archiveProject(projectId)
      else await client()!.restoreProject(projectId)
      switchProject(projectId)
    } catch (e) {
      setError(message(e))
    }
  }
  return (
    <div className="flex flex-col gap-4" data-help-id="projects.overview">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-ui-sm text-fg-2">{p.key}</span>
        <strong className="text-title font-medium">{p.name}</strong>
        <Badge tone="neutral">{ctx.role}</Badge>
        {p.state !== 'active' && <Badge tone="warning">{p.state}</Badge>}
      </div>
      {p.state === 'archived' && <Notice tone="warning" title="Archived: read-only">Every module refuses changes until an administrator restores the project.</Notice>}
      <TextField label="Description" defaultValue={p.description} multiline rows={3} isReadOnly={!can('edit') || p.state !== 'active'} onBlur={(e) => e.target.value !== p.description && void update({ description: e.target.value })} />
      <Select
        label="Lifecycle status"
        value={p.status}
        isDisabled={!can('edit') || p.state !== 'active'}
        onChange={(v) => void update({ status: v as Project['status'] })}
        options={Object.entries(STATUS_LABEL).map(([id, label]) => ({ id, label }))}
      />
      {saved && <span className="text-ui-sm text-fg-2" role="status">{saved}</span>}
      {error && <Notice tone="danger">{error}</Notice>}
      <section aria-label="Modules">
        <h3 className="m-0 text-ui-sm font-medium text-fg-2">Modules</h3>
        <ul className="m-0 list-none p-0">
          {ctx.modules.map((m) => (
            <li key={m.module} className="flex flex-wrap gap-2 py-1 text-ui-sm">
              <strong className="font-medium">{m.name}</strong>
              <Badge tone={m.status === 'failed' ? 'danger' : m.status === 'pending' ? 'warning' : 'neutral'}>{m.status}</Badge>
              {!m.enabled && <Badge tone="neutral">disabled</Badge>}
              {m.reason && <span className="text-fg-3">{m.reason}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Members">
        <h3 className="m-0 text-ui-sm font-medium text-fg-2">Members</h3>
        <p className="m-0 text-ui-sm">{members.map((m) => `${m.name} (${m.role})`).join(', ') || '—'}</p>
      </section>
      <section aria-label="Milestones">
        <h3 className="m-0 text-ui-sm font-medium text-fg-2">Milestones</h3>
        {milestones.length ? (
          <ul className="m-0 list-none p-0 text-ui-sm">
            {milestones.map((m) => (
              <li key={m.id}>
                {m.key} {m.name} {m.due ? `· due ${m.due}` : ''} · {m.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-ui-sm text-fg-3">No milestones.</p>
        )}
      </section>
      <section aria-label="Recent activity">
        <h3 className="m-0 text-ui-sm font-medium text-fg-2">Recent activity</h3>
        <ul className="m-0 list-none p-0 text-ui-sm">
          {activity.map((a) => (
            <li key={a.id} className="text-fg-2">
              {new Date(a.occurredAt).toLocaleString()} · {a.actor} · {a.entityType} {a.action}
            </li>
          ))}
        </ul>
      </section>
      {can('administer') && (
        <section aria-label="Lifecycle" className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="m-0 text-ui-sm font-medium text-fg-2">Lifecycle</h3>
          <div className="flex flex-wrap gap-2">
            {p.state === 'active' && (
              <Button icon="archive" onPress={() => void transition('archive')}>
                Archive
              </Button>
            )}
            {p.state !== 'active' && <Button onPress={() => void transition('restore')}>Restore</Button>}
          </div>
          {p.state !== 'deleted' && !p.legacy && (
            <div className="flex flex-wrap items-end gap-2">
              <TextField label={`Type ${p.key} to delete (restorable for the retention period; module data is never deleted)`} value={confirmKey} onChange={setConfirmKey} className="min-w-[14rem] flex-1" />
              <Button variant="outlined" isDisabled={confirmKey.toUpperCase() !== p.key} onPress={() => void transition('delete')}>
                Delete project
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** The header's project switcher: shows the open project and opens Project Home. */
export function ProjectSwitcher() {
  const opened = useCurrentProject((s) => s.opened)
  if (!opened) return null
  return (
    <Button size="sm" variant="quiet" icon="repository" onPress={() => openProjectHome(workspaceServices.projects ? 'projects' : 'overview')} aria-label={`Project ${opened.current.key} ${opened.current.name}. Open Projects`} data-help-id="projects.switcher">
      <span className="font-mono">{opened.current.key}</span> <span className="ws-ctx-project-name">{opened.current.name}</span>
    </Button>
  )
}
