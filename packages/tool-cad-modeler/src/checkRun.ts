import type { ConceptsService } from '@ews/platform-sdk'
import pkg from '../package.json'
import { runChecks, type CheckReport, type CheckRequest } from './checks'
import { cadSession, type OpenDocument } from './session'

/** The geometric kernel is not available, so nothing can be measured. */
export class NoKernelError extends Error {
  constructor() {
    super('The model could not be regenerated (no kernel).')
    this.name = 'NoKernelError'
  }
}

export interface DocumentCheckOptions {
  projectId: string
  concepts?: Pick<ConceptsService, 'getConstraint'>
  requests?: CheckRequest[]
  /** Check every parameter bound to a Conceptualize constraint (default true). */
  bindings?: boolean
}

/**
 * The one code path of `cad-modeler.check`: regenerate the open document, measure it and compare with the bounds read
 * from Conceptualize. Used by the assistant operation and by the toolbar command ("Check against constraints"), so both
 * produce the same report. Read-only: nothing in the document or the project changes.
 */
export async function checkOpenDocument(d: OpenDocument, options: DocumentCheckOptions): Promise<CheckReport> {
  const regen = await d.engine.regenerate()
  if (!regen) throw new NoKernelError()
  const report = await runChecks(d.engine.document, regen, {
    projectId: options.projectId,
    concepts: options.concepts,
    requests: options.requests ?? [],
    bindings: options.bindings !== false,
    storedRevision: d.stored?.revision ?? null,
    unsavedChanges: !!d.stored && cadSession.isDirty(d),
    toolVersion: pkg.version,
  })
  if (d.remoteRevision) report.assumptions.push(`A newer revision (${d.remoteRevision}) of this document was saved elsewhere; the results refer to revision ${d.stored?.revision}.`)
  return report
}
