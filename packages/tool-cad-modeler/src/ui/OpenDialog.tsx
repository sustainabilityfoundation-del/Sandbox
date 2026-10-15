import type { CadDocumentSummary, CadRevisionInfo } from '@ews/cad-client'
import { Button, Dialog, EmptyState, LoadingState, Notice, Select, useToasts } from '@ews/design-system'
import { formatTime, useToolApi } from '@ews/platform-sdk/react'
import { useEffect, useState } from 'react'
import { chooseFile } from '../files'
import { cadSession } from '../session'
import type { CadModelerViewState } from '../viewState'

/** Open: documents of the current project in the CAD service (any revision), or a native file. */
export function OpenDialog({ projectId, onClose, onOpened }: { projectId: string; onClose: () => void; onOpened: (documentId: string) => void }) {
  const api = useToolApi<CadModelerViewState>()
  const store = cadSession.storeClient
  const [docs, setDocs] = useState<CadDocumentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<CadRevisionInfo[]>([])
  const [revision, setRevision] = useState<string>('current')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    cadSession.listStored(projectId).then(
      (d) => live && (setDocs(d), setSelected(d[0]?.id ?? null)),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [projectId])
  useEffect(() => {
    setRevision('current')
    if (!selected || !store) return setRevisions([])
    let live = true
    store.revisions(projectId, selected).then((r) => live && setRevisions(r), () => live && setRevisions([]))
    return () => {
      live = false
    }
  }, [selected, projectId, store])

  const open = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const d = await cadSession.openFromStore(projectId, selected, revision === 'current' ? undefined : Number(revision))
      useToasts.getState().push({ tone: 'success', title: `Opened ${d.engine.document.metadata.title}`, body: `Revision ${revision === 'current' ? d.stored?.revision : revision} from project ${projectId}, regenerated.` })
      onOpened(d.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={`Open a CAD document · ${projectId}`}
      isOpen
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Button variant="outlined" icon="artifact" onPress={() => (onClose(), chooseFile(api))}>
            Open file…
          </Button>
          <Button variant="quiet" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="filled" icon="check" isDisabled={!selected || busy} isPending={busy} onPress={open}>
            Open
          </Button>
        </>
      }
    >
      <div className="cadm-panel-body" data-help-id="cad-modeler.document.open">
        {store?.mode === 'local' && <Notice tone="warning">Local store in this browser tab (harness or demo): documents disappear when the page reloads.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        {!docs && !error && <LoadingState label="Loading documents" />}
        {docs && !docs.length && <EmptyState icon="repository" title="No CAD documents in this project yet">Save a document to store it here, or open a file.</EmptyState>}
        {docs && !!docs.length && (
          <>
            <Select label="Document" value={selected} onChange={setSelected} options={docs.map((d) => ({ id: d.id, label: `${d.title} · revision ${d.revision} · ${d.updatedBy}, ${formatTime(d.updatedAt)}` }))} />
            <Select
              label="Revision"
              value={revision}
              onChange={setRevision}
              options={[{ id: 'current', label: 'Current revision' }, ...revisions.map((r) => ({ id: String(r.revision), label: `Revision ${r.revision}${r.message ? `: ${r.message}` : ''} · ${r.actor}${r.source.sourceKind === 'assistant' ? ' (assistant)' : ''}, ${formatTime(r.createdAt)}` }))]}
            />
            {revision !== 'current' && <p className="cadm-hint">An older revision opens for reading; saving it creates a new revision with this content (nothing is overwritten).</p>}
          </>
        )}
      </div>
    </Dialog>
  )
}
