import { useMemo } from 'react'
import { outputFreshness, type OutputRecord } from '@ews/model-service'
import { Badge, Button, EmptyState, Icon, Notice } from '@ews/design-system'
import { formatTime } from '@ews/platform-sdk/react'
import { toolName } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { showOutput } from './assistant/MessageText'

export interface ValidationSummary {
  /** Saved artifacts in the active configuration whose inputs changed since they were saved. */
  stale: { output: OutputRecord; reasons: string[] }[]
  /** The last failed save, if any. */
  writeError: string | null
}

/**
 * Workspace-level validation status from real platform data: potentially stale evidence (input revisions changed)
 * and save failures. Module validation (for example SysML Modeler's validation tab) stays in its module.
 */
export function useValidationSummary(): ValidationSummary {
  const model = useWorkspaceStore((s) => s.model)
  const outputs = useWorkspaceStore((s) => s.outputs)
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
  const writeError = useWorkspaceStore((s) => s.lastWriteError)
  const stale = useMemo(() => {
    if (!model) return []
    return outputs
      .filter((o) => o.configurationId === configurationId)
      .map((o) => ({ output: o, freshness: outputFreshness(o, model) }))
      .filter((x) => x.freshness.stale)
      .map((x) => ({ output: x.output, reasons: x.freshness.reasons }))
  }, [model, outputs, configurationId])
  return { stale, writeError }
}

/** Bottom-panel Validation tab (Review preset): what needs attention, each item linked to its object. */
export function ValidationView() {
  const { stale, writeError } = useValidationSummary()
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
  const dismiss = useWorkspaceStore((s) => s.dismissWriteError)
  return (
    <div className="ws-validation-view" data-testid="validation-panel">
      {writeError && (
        <Notice tone="danger" title="Last save failed" actions={<Button size="sm" variant="text" onPress={dismiss}>Dismiss</Button>}>
          {writeError}
        </Notice>
      )}
      {stale.length === 0 && !writeError ? (
        <EmptyState icon="success" title="No issues">
          No saved artifact in {configurationId} is potentially stale, and the last save succeeded. Module checks (for
          example SysML validation) are in their modules.
        </EmptyState>
      ) : (
        <ul className="ws-validation-list" aria-label="Potentially stale artifacts">
          {stale.map(({ output, reasons }) => (
            <li key={output.id} className="ws-validation-row">
              <Icon name="stale" size={16} className="text-warning-solid" />
              <span className="font-mono">{output.id}</span>
              <span className="ws-validation-title">{output.title}</span>
              <Badge tone="warning">Potentially stale</Badge>
              <span className="ws-validation-reason" title={reasons.join('\n')}>
                {reasons[0]}
                {reasons.length > 1 ? ` (+${reasons.length - 1})` : ''}
              </span>
              <span className="text-fg-3">
                {toolName(output.toolId)} · {formatTime(output.createdAt)}
              </span>
              <Button size="sm" variant="text" onPress={() => showOutput(output)}>
                Show
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
