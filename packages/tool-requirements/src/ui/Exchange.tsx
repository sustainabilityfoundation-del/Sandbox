import { Badge, Button, Checkbox, Notice, Select, TextField } from '@ews/design-system'
import { useSharedContext } from '@ews/platform-sdk/react'
import type { ExportJob, ExportRequest, ImportJob, ImportPreviewRecord } from '@ews/requirements-client'
import { useRef, useState } from 'react'
import { useModuleData, useResource } from '../data'
import { ApiErrorNotice, formatDate } from './common'

const STATE_TONE = { new: 'success', changed: 'warning', unchanged: 'neutral', conflicting: 'danger', unsupported: 'info' } as const

function saveBytes(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function PreviewRecords({ records, decisions, setDecision, applied }: { records: ImportPreviewRecord[]; decisions: Record<string, string>; setDecision: (k: string, v: string) => void; applied: boolean }) {
  const [filter, setFilter] = useState<string>('attention')
  const shown = records.filter((r) => (filter === 'all' ? true : filter === 'attention' ? r.state !== 'unchanged' : r.state === filter))
  return (
    <>
      <Select
        label="Show"
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'attention', label: 'New, changed, conflicting, unsupported' },
          { id: 'all', label: 'All records' },
          { id: 'conflicting', label: 'Conflicting only' },
          { id: 'new', label: 'New only' },
          { id: 'changed', label: 'Changed only' },
          { id: 'unchanged', label: 'Unchanged only' },
        ]}
      />
      <ul className="req-import-records">
        {shown.slice(0, 300).map((r) => (
          <li key={r.key} data-state={r.state}>
            <div className="req-finding-head">
              <Badge tone={STATE_TONE[r.state]}>{r.state}</Badge>
              <span className="text-ui-xs text-fg-3">{r.kind}</span>
              <strong>{r.label}</strong>
              {r.localKey && <span className="font-mono text-fg-3">→ {r.localKey}</span>}
            </div>
            {r.changes.length > 0 && (
              <ul className="req-changes">
                {r.changes.map((c) => (
                  <li key={c.field}>
                    <span className="text-fg-3">{c.field}:</span> {JSON.stringify(c.from)} → {JSON.stringify(c.to)}
                  </li>
                ))}
              </ul>
            )}
            {r.notes.map((n) => (
              <p key={n} className="m-0 text-ui-xs text-fg-3">
                {n}
              </p>
            ))}
            {!applied && (r.state === 'conflicting' || r.state === 'new' || r.state === 'changed') && (
              <Select
                ariaLabel={`Decision for ${r.label}`}
                size="sm"
                value={decisions[r.key] ?? (r.state === 'conflicting' ? 'keep-local' : 'take-incoming')}
                onChange={(v) => setDecision(r.key, v)}
                options={[
                  { id: 'take-incoming', label: r.state === 'new' ? 'Import' : 'Take incoming' },
                  ...(r.state !== 'new' ? [{ id: 'keep-local', label: 'Keep local' }] : []),
                  { id: 'skip', label: 'Skip' },
                ]}
              />
            )}
          </li>
        ))}
      </ul>
      {shown.length > 300 && <p className="ws-hint">Showing 300 of {shown.length}.</p>}
    </>
  )
}

/**
 * Import with preview (ReqIF .reqif/.reqifz or JSON) and export of selections, configurations and
 * baselines. Absent records are never deleted; conflicts default to keeping the local version.
 */
export function ExchangeView({ collectionId, baselineId }: { collectionId: string | null; baselineId: string | null }) {
  const { client, can, invalidate } = useModuleData()
  const { configurationId } = useSharedContext()
  const fileInput = useRef<HTMLInputElement>(null)
  const [job, setJob] = useState<ImportJob | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [sourceKey, setSourceKey] = useState('')
  const [collectionName, setCollectionName] = useState('')
  const [format, setFormat] = useState<ExportRequest['format']>('reqif')
  const [scopeCollection, setScopeCollection] = useState(true)
  const [useConfiguration, setUseConfiguration] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const sources = useResource(() => client.exchangeSources(), [client])
  const history = useResource(() => client.importJobs(), [client])

  const upload = async (file: File) => {
    setBusy('preview')
    setError(null)
    setJob(null)
    setDecisions({})
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      setJob(await client.previewImport(bytes, { fileName: file.name, sourceKey: sourceKey || undefined }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  const apply = async () => {
    if (!job) return
    setBusy('apply')
    setError(null)
    try {
      setJob(await client.applyImport(job.id, { decisions: decisions as Record<string, 'take-incoming'>, collectionName: collectionName || undefined }))
      invalidate()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  const runExport = async () => {
    setBusy('export')
    setError(null)
    try {
      const j = await client.exportFile({
        format,
        collectionIds: scopeCollection && collectionId ? [collectionId] : undefined,
        baselineId: baselineId ?? undefined,
        configurationId: useConfiguration ? configurationId : undefined,
      })
      setExportJob(j)
      saveBytes(await client.exportContent(j.id), j.fileName, j.mediaType)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  const p = job?.preview
  return (
    <div className="req-page">
      <h3 className="req-page-title">Import and export</h3>
      <section className="req-fieldset">
        <h4 className="req-subhead">Import (ReqIF 1.2 .reqif / .reqifz, or JSON)</h4>
        {can('import') ? (
          <>
            <TextField label="Exchange source key (optional)" value={sourceKey} onChange={setSourceKey} description="Records are matched by this source and their ReqIF identifiers. Leave empty to use the file's repository ID or tool ID." />
            <div className="req-actions-row">
              <Button variant="filled" icon="add" isPending={busy === 'preview'} onPress={() => fileInput.current?.click()}>
                Choose file and preview
              </Button>
              <input ref={fileInput} type="file" accept=".reqif,.reqifz,.xml,.zip,.json" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            </div>
          </>
        ) : (
          <p className="ws-hint m-0">Editors and administrators import.</p>
        )}
        {p && job && (
          <div className="req-import">
            <div className="req-import-summary">
              <strong>{job.fileName}</strong>
              <span className="text-fg-3">
                {p.format.toUpperCase()} · source “{p.source.name}” ({p.source.matchedSourceId ? `known, matched by ${p.source.matchedBy}` : 'new source'})
              </span>
              <div className="req-rule-counts">
                {Object.entries(p.counts).map(([k, n]) => (
                  <Badge key={k} tone={STATE_TONE[k as keyof typeof STATE_TONE]}>
                    {k}: {n}
                  </Badge>
                ))}
              </div>
              <span className="text-ui-xs">
                Schema validation: {p.schemaValidation.performed ? (p.schemaValidation.valid ? `valid against ${p.schemaValidation.schema}` : `INVALID against ${p.schemaValidation.schema}`) : `not performed (${p.schemaValidation.schema})`}
              </span>
            </div>
            {p.findings.length > 0 && (
              <Notice tone={p.findings.some((f) => f.severity === 'error') ? 'danger' : 'warning'} title="Validation findings">
                <ul className="req-field-errors">
                  {p.findings.slice(0, 50).map((f, i) => (
                    <li key={i}>
                      <strong>{f.severity}</strong> {f.message}
                      {f.path ? ` (${f.path})` : ''}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {p.unsupported.length > 0 && (
              <Notice tone="info" title="Unsupported or lossy content">
                <ul className="req-field-errors">
                  {p.unsupported.map((u) => (
                    <li key={u.kind}>
                      {u.count} × {u.kind}: {u.treatment}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            <details>
              <summary>Attribute mappings ({p.attributeMappings.length}) and relation mappings ({p.relationshipMappings.length})</summary>
              <ul className="req-changes">
                {p.attributeMappings.map((m) => (
                  <li key={m.externalId}>
                    {m.name} <span className="text-fg-3">({m.dataType})</span> → <strong>{m.target}</strong> {m.note && <span className="text-fg-3">— {m.note}</span>}
                  </li>
                ))}
                {p.relationshipMappings.map((m) => (
                  <li key={m.externalType}>
                    relation type {m.name} → <strong>{m.target}</strong> {m.note && <span className="text-fg-3">— {m.note}</span>}
                  </li>
                ))}
              </ul>
            </details>
            <ul className="req-policies">
              {p.policies.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <PreviewRecords records={p.records} decisions={decisions} setDecision={(k, v) => setDecisions((d) => ({ ...d, [k]: v }))} applied={job.status !== 'previewed'} />
            {job.status === 'previewed' ? (
              <div className="req-actions-row">
                <TextField label="Collection for imported specifications (optional)" value={collectionName} onChange={setCollectionName} />
                <Button variant="filled" icon="check" isPending={busy === 'apply'} isDisabled={p.findings.some((f) => f.severity === 'error')} onPress={() => void apply()}>
                  Apply import
                </Button>
                <Button
                  variant="text"
                  onPress={async () => {
                    await client.discardImport(job.id).catch(setError)
                    setJob(null)
                  }}
                >
                  Discard
                </Button>
              </div>
            ) : (
              <Notice tone={job.status === 'applied' ? 'success' : 'danger'} title={`Import ${job.status}`}>
                {JSON.stringify(job.result)}
              </Notice>
            )}
          </div>
        )}
      </section>
      <section className="req-fieldset">
        <h4 className="req-subhead">Export</h4>
        <Select
          label="Format"
          value={format}
          onChange={(v) => setFormat(v as ExportRequest['format'])}
          options={[
            { id: 'reqif', label: 'ReqIF 1.2 (.reqif)' },
            { id: 'reqifz', label: 'ReqIF archive with attachments (.reqifz)' },
            { id: 'json', label: 'JSON (complete module data)' },
          ]}
        />
        {collectionId && (
          <Checkbox isSelected={scopeCollection} onChange={setScopeCollection}>
            Only the selected collection
          </Checkbox>
        )}
        <Checkbox isSelected={useConfiguration} onChange={setUseConfiguration}>
          Only requirements applicable to {configurationId}
        </Checkbox>
        {baselineId && <Notice tone="info">Exports the baseline you are viewing (pinned revisions).</Notice>}
        <Button variant="outlined" icon="arrow-right" isPending={busy === 'export'} onPress={() => void runExport()}>
          Export
        </Button>
        {exportJob && (
          <Notice tone="success" title={`Exported ${exportJob.fileName}`}>
            {exportJob.report.requirements ?? 0} requirements, {exportJob.report.relationships ?? 0} relationships.
            {exportJob.report.schemaValidation && ` Schema validation: ${exportJob.report.schemaValidation.performed ? (exportJob.report.schemaValidation.valid ? 'valid' : 'invalid') : 'not performed'}.`}
            {exportJob.report.lossy?.length ? (
              <ul className="req-field-errors">
                {exportJob.report.lossy.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : null}
          </Notice>
        )}
      </section>
      {error ? <ApiErrorNotice error={error} title="Exchange failed" /> : null}
      <section>
        <h4 className="req-subhead">Exchange sources</h4>
        <ul className="req-rel-list">
          {sources.data?.map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong> <span className="font-mono text-fg-3">{s.sourceKey}</span> · {s.mappedRecords} mapped records
            </li>
          ))}
        </ul>
        {sources.data?.length === 0 && <p className="m-0 text-fg-3">No exchange sources yet.</p>}
        <h4 className="req-subhead">Recent imports</h4>
        <ul className="req-rel-list">
          {history.data?.slice(0, 10).map((j) => (
            <li key={j.id}>
              {j.fileName} · {j.status} · {j.createdBy} · {formatDate(j.createdAt)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
