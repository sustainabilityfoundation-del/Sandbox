import { failures, referenceRepairs, type CadEngine, type DryRunResult, type EngineState, type FailureCause, type ReferenceRepair } from '@ews/cad-core'
import { Badge, Button, EmptyState, Notice, Select } from '@ews/design-system'
import { formatTime } from '@ews/platform-sdk/react'
import { useState } from 'react'
import type { SessionSnapshot } from '../session'
import type { CheckPanelState } from '../checkStore'
import type { CadModelerViewState } from '../viewState'
import { CheckPanel } from './CheckPanel'
import { fmtNum, makeRun } from './common'

/** Model diagnostics (brief §8, §9.2): kernel, regeneration, failures, exports and the operation log. */
export function DiagnosticsPanel({ engine, state, session, update, check, stale, onCheck }: { engine: CadEngine; state: EngineState; session: SessionSnapshot; update?: (u: Partial<CadModelerViewState>) => void; check?: CheckPanelState; stale?: boolean; onCheck?: () => void }) {
  const regen = state.regen
  const issues = failures(regen)
  const repairs = referenceRepairs(state.doc, regen)
  const log = engine.operations(25).slice().reverse()
  const k = session.kernel
  const exp = session.lastExport
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.diagnostics">
      <CheckPanel check={check} stale={stale} onRun={() => onCheck?.()} canRun={!!onCheck} />
      <section className="cadm-section" aria-label="Kernel">
        <h4 className="cadm-subtitle">Geometric kernel</h4>
        <dl className="cadm-props">
          <dt>Kernel</dt>
          <dd>{k.info?.name ?? 'not started'}</dd>
          <dt>Status</dt>
          <dd>
            <Badge tone={k.status === 'ready' ? 'success' : k.status === 'failed' ? 'danger' : 'info'}>{k.status}</Badge> {k.loadMs ? `loaded in ${fmtNum(k.loadMs, 0)} ms` : ''} {k.error ?? ''}
          </dd>
          <dt>Runs in</dt>
          <dd>{k.info?.execution === 'worker' ? 'a Web Worker (off the UI thread)' : k.info?.execution ?? '—'}</dd>
          <dt>Licences</dt>
          <dd>{k.info?.licence ?? '—'}</dd>
        </dl>
      </section>
      <section className="cadm-section" aria-label="Regeneration">
        <h4 className="cadm-subtitle">Regeneration</h4>
        {state.regenError && <Notice tone="danger" title="Kernel error">{state.regenError.message}</Notice>}
        {regen ? (
          <dl className="cadm-props">
            <dt>Model version</dt>
            <dd>
              {regen.documentVersion} {state.regenerating ? '(regenerating newer version…)' : regen.documentVersion === state.doc.version ? '(current)' : '(stale)'}
            </dd>
            <dt>Regeneration runs in</dt>
            <dd>{regen.location === 'worker' ? 'the kernel worker (sketch solving and geometry off the UI thread)' : 'this thread (in-process)'}</dd>
            <dt>Duration</dt>
            <dd>{fmtNum(regen.durationMs, 1)} ms</dd>
            {regen.parts.map((p) => (
              <div key={p.partId} className="cadm-props-group">
                <dt>Rebuilt</dt>
                <dd className="cadm-mono">{p.rebuilt.join(', ') || 'nothing (all from cache)'}</dd>
                <dt>Reused</dt>
                <dd className="cadm-mono">{p.reused.join(', ') || '—'}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="cadm-muted">Not regenerated yet.</p>
        )}
        <Button size="sm" variant="outlined" icon="sync" onPress={() => engine.regenerate({ full: true })}>
          Full regeneration
        </Button>
      </section>
      {repairs.length > 0 && (
        <section className="cadm-section" aria-label="Repair reference" data-help-id="cad-modeler.repair-reference">
          <h4 className="cadm-subtitle">Repair reference ({repairs.length})</h4>
          <p className="cadm-hint">A face or edge that a feature used no longer exists after an upstream change. Nothing is re-bound for you: choose the replacement, preview it, then repair. Candidates are ordered by name similarity only.</p>
          {repairs.map((r) => (
            <RepairCard key={r.featureId} engine={engine} repair={r} />
          ))}
        </section>
      )}
      <section className="cadm-section" aria-label="Failures">
        <h4 className="cadm-subtitle">Failures and warnings ({issues.length})</h4>
        {issues.length === 0 ? (
          <EmptyState icon="success" title="No regeneration problems" />
        ) : (
          issues.map((f) => {
            const cause = f.error?.details?.cause as FailureCause | undefined
            return (
              <Notice
                key={f.featureId}
                tone={f.status === 'failed' ? 'danger' : 'warning'}
                title={`${f.name} (${f.featureId}): ${f.status}`}
                actions={
                  cause && update ? (
                    <Button size="sm" variant="outlined" onPress={() => update({ tab: 'model', selection: [{ kind: 'feature', id: cause.featureId }] })}>
                      Show {cause.name}
                    </Button>
                  ) : undefined
                }
              >
                {f.error?.message}
                {f.warnings.map((w) => w.message).join(' ')}
              </Notice>
            )
          })
        )}
      </section>
      {exp && (
        <section className="cadm-section" aria-label="Last STEP export">
          <h4 className="cadm-subtitle">Last STEP export</h4>
          <dl className="cadm-props">
            <dt>File</dt>
            <dd>{exp.fileName} (model version {exp.documentVersion})</dd>
            <dt>Schema</dt>
            <dd>{exp.inspection.applicationProtocol} <span className="cadm-muted cadm-mono">{exp.inspection.schema}</span></dd>
            <dt>Content</dt>
            <dd>
              {exp.inspection.entities.MANIFOLD_SOLID_BREP} solid(s), {exp.inspection.entities.ADVANCED_FACE} faces, {exp.inspection.entityCount} entities, unit {exp.inspection.lengthUnit ?? '—'}, products {exp.inspection.products.join(', ')}
            </dd>
            <dt>Structural check</dt>
            <dd>{exp.inspection.valid ? 'Passed' : exp.inspection.problems.join(' ')}</dd>
          </dl>
        </section>
      )}
      <section className="cadm-section" aria-label="Operation log">
        <h4 className="cadm-subtitle">Operation log</h4>
        <ol className="cadm-log">
          {log.map((o) => (
            <li key={o.sequence}>
              <Badge tone={o.kind === 'rejected' ? 'danger' : o.source === 'assistant' ? 'info' : 'neutral'}>{o.source}</Badge> <span>{o.label}</span>{' '}
              <span className="cadm-muted">
                {o.kind === 'rejected' ? `rejected: ${o.error?.message}` : `v${o.baseVersion} → v${o.version}`} · {formatTime(o.at)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

/**
 * One feature with a lost reference: for each lost name the person picks the replacement from the
 * candidates (best name match first), previews it (a dry run, nothing committed) and applies it with
 * the typed command repair_reference. There is no default choice and no automatic re-binding.
 */
function RepairCard({ engine, repair }: { engine: CadEngine; repair: ReferenceRepair }) {
  const run = makeRun(engine)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<{ name: string; result: DryRunResult } | null>(null)
  const call = (from: string) => ({ command: 'repair_reference', input: { featureId: repair.featureId, from, to: choice[from] } })
  const noun = repair.referenceKind === 'edge' ? 'edge' : 'face'
  return (
    <Notice tone="warning" title={`${repair.featureName} (${repair.featureId}): ${noun} reference lost`}>
      <span className="cadm-block">{repair.message.replace(/ Available:.*$/s, '')}</span>
      {repair.lost.map((l) => (
        <div key={l.name} className="cadm-repair" data-testid="repair-row">
          <span className="cadm-mono cadm-repair-lost">{l.name}</span>
          {l.candidates.length === 0 ? (
            <span className="cadm-muted">No similar {noun} exists on the body. Edit the feature to choose again.</span>
          ) : (
            <>
              <Select
                ariaLabel={`Replacement for ${l.name}`}
                size="sm"
                placeholder={`Choose the replacement ${noun}`}
                value={choice[l.name] ?? null}
                options={l.candidates.map((c) => ({ id: c.name, label: `${c.name} (${Math.round(c.similarity * 100)}% name match)` }))}
                onChange={(v) => {
                  setChoice((s) => ({ ...s, [l.name]: v }))
                  setPreview(null)
                }}
              />
              <div className="cadm-actions">
                <Button size="sm" variant="outlined" icon="visibility" isDisabled={!choice[l.name]} onPress={async () => setPreview({ name: l.name, result: await engine.dryRun({ commands: [call(l.name)] }) })}>
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="filled"
                  icon="check"
                  isDisabled={!choice[l.name]}
                  onPress={async () => {
                    await run([call(l.name)], 'Repair reference')
                    setPreview(null)
                  }}
                >
                  Repair reference
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {preview && (
        <Notice tone={preview.result.ok && !preview.result.after?.failures.some((f) => f.featureId === repair.featureId && f.status === 'failed') ? 'info' : 'warning'} title="Preview (not applied)">
          {preview.result.ok
            ? preview.result.after?.failures.length
              ? preview.result.after.failures.map((f) => <span key={f.featureId} className="cadm-block">{f.name}: {f.error?.message ?? f.warnings.map((w) => w.message).join(' ')}</span>)
              : 'The model regenerates without problems with this replacement.'
            : preview.result.error?.message}
        </Notice>
      )}
    </Notice>
  )
}
