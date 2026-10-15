import { failures, type CadEngine, type EngineState } from '@ews/cad-core'
import { Badge, Button, EmptyState, Notice } from '@ews/design-system'
import { formatTime } from '@ews/platform-sdk/react'
import type { SessionSnapshot } from '../session'
import { fmtNum } from './common'

/** Model diagnostics (brief §8, §9.2): kernel, regeneration, failures, exports and the operation log. */
export function DiagnosticsPanel({ engine, state, session }: { engine: CadEngine; state: EngineState; session: SessionSnapshot }) {
  const regen = state.regen
  const issues = failures(regen)
  const log = engine.operations(25).slice().reverse()
  const k = session.kernel
  const exp = session.lastExport
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.diagnostics">
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
      <section className="cadm-section" aria-label="Failures">
        <h4 className="cadm-subtitle">Failures and warnings ({issues.length})</h4>
        {issues.length === 0 ? (
          <EmptyState icon="success" title="No regeneration problems" />
        ) : (
          issues.map((f) => (
            <Notice key={f.featureId} tone={f.status === 'failed' ? 'danger' : 'warning'} title={`${f.name} (${f.featureId}): ${f.status}`}>
              {f.error?.message}
              {f.warnings.map((w) => w.message).join(' ')}
            </Notice>
          ))
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
