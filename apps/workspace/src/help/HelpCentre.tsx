import { Badge, Button, Dialog, EmptyState, Notice, SearchField } from '@ews/design-system'
import { SDK_VERSION, type HelpModuleInfo, type HelpTopicKind } from '@ews/platform-sdk'
import { useMemo } from 'react'
import { useEntitlements } from '../platform/entitlements'
import { HelpMarkdown } from './HelpMarkdown'
import { startTutorial } from './tours'
import { useHelpCentre, workspaceHelp } from './workspaceHelp'
import pkg from '../../package.json'

const KIND_LABEL: Record<HelpTopicKind, string> = {
  overview: 'Overview',
  guide: 'Guide',
  reference: 'Reference',
  tutorial: 'Tutorial',
  shortcuts: 'Keyboard shortcuts',
  troubleshooting: 'Troubleshooting',
  api: 'API',
}

/** Topic ID of the version and about page (rendered by the Help Centre itself). */
export const ABOUT_TOPIC = 'platform.about'

/**
 * Help Centre: one place to search and read the documentation of every module the user may use,
 * start tutorials and see versions. Content comes from the Help Service, so it matches what the
 * assistant reads.
 */
export function HelpCentre() {
  const { isOpen, topicId, query, notice, show, setQuery, close } = useHelpCentre()
  // Re-render when the subscription changes (modules appear or disappear).
  useEntitlements((s) => s.plan.id)
  const modules = workspaceHelp.modules()
  const hits = useMemo(() => (query.trim() ? workspaceHelp.search(query, { limit: 30 }) : []), [query])
  const current = topicId && topicId !== ABOUT_TOPIC ? workspaceHelp.topic(topicId) : undefined
  const module = current ? modules.find((m) => m.moduleId === current.moduleId) : undefined
  const tutorials = current ? workspaceHelp.tutorials(current.moduleId).filter((t) => t.topic === current.topic.id) : []
  const apiRefs = current?.topic.kind === 'api' ? (module?.apiReferences ?? []).filter((a) => a.url) : []

  return (
    <Dialog title="Help Centre" isOpen={isOpen} onOpenChange={(open) => !open && close()} size="lg">
      <div className="ws-help" data-testid="help-centre">
        <nav className="ws-help-nav" aria-label="Help topics">
          <SearchField label="Search help" placeholder="Search all documentation" value={query} onChange={setQuery} />
          {query.trim() ? (
            <ul className="ws-help-results" aria-label="Search results" data-testid="help-results">
              {hits.length === 0 && <li className="text-fg-3">No topics match “{query}”.</li>}
              {hits.map((h) => (
                <li key={h.id}>
                  <a href={`#help:${h.id}`} className="ws-help-link" onClick={(e) => (e.preventDefault(), show(h.id))} data-help-result={h.id}>
                    {h.title}
                  </a>
                  <span className="text-ui-xs text-fg-3"> {modules.find((m) => m.moduleId === h.moduleId)?.displayName} · {KIND_LABEL[h.kind]}</span>
                  <div className="text-ui-xs text-fg-2">{h.summary}</div>
                </li>
              ))}
            </ul>
          ) : (
            <ModuleIndex modules={modules} currentId={topicId} onOpen={(id) => show(id)} />
          )}
        </nav>
        <article className="ws-help-topic" aria-live="polite" data-help-topic={current?.topic.id ?? topicId ?? ''}>
          {notice && (
            <Notice tone="warning" title="Help not available">
              {notice}
            </Notice>
          )}
          {topicId === ABOUT_TOPIC ? (
            <About modules={modules} />
          ) : current ? (
            <>
              <header className="mb-2">
                <h2 className="m-0 text-ui-lg font-medium">{current.topic.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-ui-xs text-fg-3">
                  <Badge>{KIND_LABEL[current.topic.kind]}</Badge>
                  <span>
                    {current.displayName} · documentation for version {current.docsVersion}
                  </span>
                </div>
                {module?.versionMismatch && (
                  <Notice tone="warning" title="Documentation may be out of date">
                    Written for version {module.docsVersion}; version {module.moduleVersion} is installed.
                  </Notice>
                )}
              </header>
              <HelpMarkdown source={current.topic.body} onNavigate={(id) => show(id)} />
              {tutorials.map((t) => (
                <div key={t.id} className="mt-3">
                  <Button variant="tonal" icon="tour" onPress={() => (close(), void startTutorial(t))}>
                    Start the tutorial: {t.title}
                  </Button>
                </div>
              ))}
              {apiRefs.length > 0 && (
                <ul className="ws-help-list">
                  {apiRefs.map((a) => (
                    <li key={a.title}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="ws-help-link">
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {(current.topic.related ?? []).length > 0 && (
                <section className="mt-4">
                  <h3 className="ws-help-h">Related</h3>
                  <ul className="ws-help-list">
                    {current.topic.related!.map((id) => {
                      const r = workspaceHelp.topic(id)
                      return <li key={id}>{r ? <a href={`#help:${id}`} className="ws-help-link" onClick={(e) => (e.preventDefault(), show(id))}>{r.topic.title}</a> : <span className="text-fg-3">{id} (not available)</span>}</li>
                    })}
                  </ul>
                </section>
              )}
              {current.topic.source && <p className="mt-4 text-ui-xs text-fg-3">Source: {current.topic.source}</p>}
            </>
          ) : !notice ? (
            <EmptyState icon="help" title="Search or choose a topic">
              Press F1 anywhere for help on what you are working on.
            </EmptyState>
          ) : null}
        </article>
      </div>
    </Dialog>
  )
}

function ModuleIndex({ modules, currentId, onOpen }: { modules: HelpModuleInfo[]; currentId: string | null; onOpen: (id: string) => void }) {
  return (
    <ul className="ws-help-modules" aria-label="Modules">
      {modules.map((m) => (
        <li key={m.moduleId} data-help-module={m.moduleId}>
          {m.landingTopic ? (
            <a href={`#help:${m.landingTopic}`} className="ws-help-link" aria-current={currentId === m.landingTopic ? 'page' : undefined} onClick={(e) => (e.preventDefault(), onOpen(m.landingTopic!))}>
              {m.displayName}
            </a>
          ) : (
            <span>
              {m.displayName} <span className="text-ui-xs text-fg-3">(no documentation yet)</span>
            </span>
          )}
        </li>
      ))}
      <li>
        <a href={`#help:${ABOUT_TOPIC}`} className="ws-help-link" onClick={(e) => (e.preventDefault(), onOpen(ABOUT_TOPIC))}>
          About and versions
        </a>
      </li>
    </ul>
  )
}

function About({ modules }: { modules: HelpModuleInfo[] }) {
  return (
    <div data-testid="help-about">
      <h2 className="m-0 text-ui-lg font-medium">About this workspace</h2>
      <p className="ws-help-p">
        Engineering Workspace {pkg.version} (prototype) · platform SDK {SDK_VERSION} · help schema {workspaceHelp.schemaVersion}
      </p>
      <div className="ws-help-table-wrap">
        <table className="ws-help-table">
          <thead>
            <tr>
              <th scope="col">Module</th>
              <th scope="col">Version</th>
              <th scope="col">Documentation</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.moduleId}>
                <td>{m.displayName}</td>
                <td>{m.moduleVersion}</td>
                <td>{m.topicCount ? `${m.topicCount} topics for ${m.docsVersion}${m.versionMismatch ? ' (older version)' : ''}` : 'Not available yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ws-help-p text-fg-3">Capability status (implemented, experimental, planned): command palette → About this platform.</p>
    </div>
  )
}
