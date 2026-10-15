import { Badge, Cell, Column, Dialog, EmptyState, Notice, Row, SearchField, Select, Table, TableBody, TableHeader, type Tone } from '@ews/design-system'
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { CAPABILITIES, summarize, type AiCoverage, type CapabilityModule, type ImplementationStatus } from '../assistant/capabilities'

/**
 * AI capability coverage (AI Interface sprint 1): what people can do in the product, and whether
 * the assistant can do the same, through which operation and how real it is. Read-only.
 */
export const useCoverageDialog = create<{ isOpen: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
}))

const COVERAGE: Record<AiCoverage, { label: string; tone: Tone; help: string }> = {
  shared: { label: 'Shared operation', tone: 'success', help: 'The assistant calls the same operation as the UI.' },
  equivalent: { label: 'Equivalent', tone: 'success', help: 'Different entry point, same repository or API validation and ownership checks.' },
  partial: { label: 'Partial', tone: 'warning', help: 'Only part of it, or only under conditions (see the note).' },
  none: { label: 'No AI path', tone: 'danger', help: 'A coverage gap: people can do this, the assistant cannot.' },
  restricted: { label: 'Restricted', tone: 'neutral', help: 'Deliberately unavailable to the assistant (approval, identity, destructive demo controls, or not built).' },
}

const STATUS: Record<ImplementationStatus, { label: string; tone: Tone }> = {
  implemented: { label: 'Implemented', tone: 'neutral' },
  experimental: { label: 'Experimental', tone: 'info' },
  mock: { label: 'Mock', tone: 'warning' },
  restricted: { label: 'Not available', tone: 'neutral' },
}

const MODULES: { id: 'all' | CapabilityModule; label: string }[] = [
  { id: 'all', label: 'All modules' },
  { id: 'platform', label: 'Platform' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'sysml', label: 'SysML' },
  { id: 'cad', label: 'CAD' },
]

export function CoverageDialog() {
  const isOpen = useCoverageDialog((s) => s.isOpen)
  const setOpen = useCoverageDialog((s) => s.setOpen)
  const [module, setModule] = useState<'all' | CapabilityModule>('all')
  const [coverage, setCoverage] = useState<'all' | AiCoverage>('all')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return CAPABILITIES.filter(
      (c) =>
        (module === 'all' || c.module === module) &&
        (coverage === 'all' || c.coverage === coverage) &&
        (!q || [c.label, c.id, c.note ?? '', ...(c.aiOperations ?? []), ...(c.apiOperations ?? [])].some((t) => t.toLowerCase().includes(q))),
    )
  }, [module, coverage, search])
  const summary = summarize(module === 'all' ? CAPABILITIES : CAPABILITIES.filter((c) => c.module === module))

  return (
    <Dialog title="AI capability coverage" isOpen={isOpen} onOpenChange={setOpen} size="lg">
      <div className="flex flex-col gap-3" data-testid="ai-coverage">
        <p className="m-0 text-fg-2">
          What you can do in the product, and whether the assistant can do the same. This inventory is an inspection aid: it grants
          nothing, and every assistant change still needs your preview approval.
        </p>
        <div className="flex flex-wrap items-center gap-2" data-testid="ai-coverage-summary">
          <strong>
            {Math.round(summary.coveredShare * 100)}% covered
          </strong>
          <span className="text-fg-3">of {summary.total - summary.byCoverage.restricted} capabilities (restricted ones excluded)</span>
          <span data-testid="ai-coverage-engineering" title="Queries, domain changes, jobs, exports and imports">
            <Badge tone="info">Engineering operations: {Math.round(summary.engineering.coveredShare * 100)}% ({summary.engineering.covered} of {summary.engineering.eligible})</Badge>
          </span>
          <span data-testid="ai-coverage-view" title="Panels, filters, cameras, selection and windows">
            <Badge tone="neutral">View controls: {Math.round(summary.view.coveredShare * 100)}% ({summary.view.covered} of {summary.view.eligible})</Badge>
          </span>
          {(Object.keys(COVERAGE) as AiCoverage[]).map((k) => (
            <span key={k} title={COVERAGE[k].help} data-coverage-count={k}>
              <Badge tone={COVERAGE[k].tone}>
                {COVERAGE[k].label}: {summary.byCoverage[k]}
              </Badge>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SearchField label="Search capabilities" placeholder="Capability, operation or note" value={search} onChange={setSearch} className="min-w-0 flex-1" />
          <Select label="Module" size="sm" value={module} onChange={(v) => setModule(v as typeof module)} options={MODULES} />
          <Select
            label="AI coverage"
            size="sm"
            value={coverage}
            onChange={(v) => setCoverage(v as typeof coverage)}
            options={[{ id: 'all', label: 'Any' }, ...(Object.keys(COVERAGE) as AiCoverage[]).map((k) => ({ id: k, label: COVERAGE[k].label, description: COVERAGE[k].help }))]}
          />
        </div>
        <div className="ws-table-wrap ws-coverage-table max-h-[55vh]">
          <Table aria-label="AI capability coverage" cards>
            <TableHeader>
              <Column isRowHeader>Capability</Column>
              <Column>Status</Column>
              <Column>AI coverage</Column>
              <Column>Assistant operations</Column>
            </TableHeader>
            <TableBody renderEmptyState={() => <EmptyState icon="search" title="No capabilities match" />}>
              {rows.map((c) => (
                <Row key={c.id} id={c.id} textValue={c.label} data-capability-id={c.id} data-coverage={c.coverage}>
                  <Cell title>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-ui-xs text-fg-3">
                      {MODULES.find((m) => m.id === c.module)?.label} · {c.surface} · {c.effect}
                      {c.apiOperations?.length ? ` · API: ${c.apiOperations.join(', ')}` : ''}
                    </div>
                    {c.note && <div className="text-ui-xs text-fg-2">{c.note}</div>}
                  </Cell>
                  <Cell label="Status">
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  </Cell>
                  <Cell label="AI coverage">
                    <span title={COVERAGE[c.coverage].help}>
                      <Badge tone={COVERAGE[c.coverage].tone}>{COVERAGE[c.coverage].label}</Badge>
                    </span>
                  </Cell>
                  <Cell label="Assistant operations">
                    {c.aiOperations?.length ? <span className="font-mono text-ui-xs">{c.aiOperations.join(', ')}</span> : <span className="text-fg-3">None</span>}
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        </div>
        <Notice tone="info" title="Not yet implemented">
          A shared capability registry, server-side execution gateway and model provider (development plan sprints 2–4). Today the
          assistant is a scripted demo that validates in the browser.
        </Notice>
      </div>
    </Dialog>
  )
}
