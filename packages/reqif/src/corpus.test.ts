import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readReqIF, readReqifz, toReqifXhtml, writeReqIF, type ReqIFDocument } from './index'
import { schemasAvailable, validateAgainstSchema } from './schemaValidation'

/**
 * Interoperability corpus: externally produced ReqIF files (npm run req:reqif:samples). Skipped
 * when the corpus is not downloaded. Writes a JSON report to .data/reqif-interop-report.json.
 */
const repo = resolve(__dirname, '../../..')
const dir = resolve(repo, process.env.EWS_REQIF_SAMPLES ?? '.data/reqif-samples')
const schemaDir = resolve(repo, '.data/reqif-schemas')
const files = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : /\.reqifz?$/i.test(n) ? [join(d, n)] : [])) : [])
const samples = files(dir)

const summary = (d: ReqIFDocument) => ({
  objects: d.specObjects.map((o) => [o.identifier, o.typeRef, o.values.map((v) => [v.definitionRef, v.kind === 'XHTML' ? v.xhtml?.sanitized : v.value])]),
  relations: d.specRelations.map((r) => [r.identifier, r.sourceRef, r.targetRef, r.typeRef]),
  hierarchy: JSON.stringify(d.specifications.map((s) => [s.identifier, s.children])),
  datatypes: d.datatypes.map((t) => [t.identifier, t.kind, t.values?.map((v) => v.identifier)]),
})

describe.runIf(samples.length > 0)('externally produced ReqIF files (AC-R10)', () => {
  const report: Record<string, unknown>[] = []
  for (const path of samples) {
    const name = relative(dir, path).replace(/\\/g, '/')
    it(`reads, round-trips and validates ${name}`, async () => {
      const bytes = readFileSync(path)
      const xml = /\.reqifz$/i.test(path) ? Buffer.from(readReqifz(bytes).reqifFiles[0].bytes).toString('utf8') : bytes.toString('utf8')
      const first = readReqIF(xml)
      const doc = first.document
      // Export with sanitised XHTML, as the service does, then read again.
      for (const o of [...doc.specObjects, ...doc.specRelations, ...doc.specifications]) for (const v of o.values) if (v.xhtml) v.xhtml.raw = toReqifXhtml(v.xhtml.sanitized, v.xhtml.plain)
      const written = writeReqIF(doc)
      const second = readReqIF(written).document
      expect(summary(second)).toEqual(summary(doc))
      const entry: Record<string, unknown> = {
        file: name,
        sourceTool: doc.header.sourceToolId,
        reqifTool: doc.header.reqifToolId,
        specObjects: doc.specObjects.length,
        specRelations: doc.specRelations.length,
        specifications: doc.specifications.length,
        datatypes: [...new Set(doc.datatypes.map((d) => d.kind))].sort().join(','),
        errors: first.findings.filter((f) => f.severity === 'error').map((f) => f.message).slice(0, 5),
        warnings: first.findings.filter((f) => f.severity === 'warning').length,
        semanticRoundTrip: true,
      }
      if (schemasAvailable(schemaDir)) {
        const original = await validateAgainstSchema(xml, schemaDir)
        const exported = await validateAgainstSchema(written, schemaDir)
        entry.originalSchemaValid = original.valid
        entry.originalSchemaErrors = original.errors.slice(0, 3)
        entry.exportSchemaValid = exported.valid
        entry.exportSchemaErrors = exported.errors.slice(0, 3)
        // Whatever the input, our export must be schema-valid unless the input itself breaks
        // identifier rules we cannot repair without renaming.
        if (original.valid) expect(exported.errors).toEqual([])
      }
      report.push(entry)
      writeFileSync(resolve(repo, '.data/reqif-interop-report.json'), JSON.stringify(report, null, 2))
    }, 120_000)
  }
})
