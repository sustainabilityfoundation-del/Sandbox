import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * XML Schema validation against the official OMG ReqIF schemas (reqif.xsd dtc/11-04-05,
 * driver.xsd dtc/11-04-06) and the W3C XHTML modularization schemas they import, using libxml2
 * compiled to WebAssembly (xmllint-wasm). The schemas are downloaded by `npm run
 * req:reqif:schemas` into a local directory; without them validation is reported as not performed.
 * Node only.
 */
export interface SchemaValidationResult {
  performed: boolean
  valid: boolean | null
  schema: string
  errors: string[]
}

export const SCHEMA_ENTRY = 'omg-20110401-reqif.xsd'
export const SCHEMA_LABEL = 'OMG ReqIF 1.2 reqif.xsd (dtc/11-04-05) + driver.xsd (dtc/11-04-06) + W3C XHTML Modularization 1.1 schemas'

export function schemasAvailable(dir: string): boolean {
  return existsSync(join(dir, SCHEMA_ENTRY))
}

export async function validateAgainstSchema(xml: string, dir: string): Promise<SchemaValidationResult> {
  if (!schemasAvailable(dir)) {
    return { performed: false, valid: null, schema: `${SCHEMA_LABEL} — not downloaded (run npm run req:reqif:schemas)`, errors: [] }
  }
  const { validateXML } = await import('xmllint-wasm')
  const preload = readdirSync(dir)
    .filter((f) => f.endsWith('.xsd'))
    .map((f) => ({ fileName: f, contents: readFileSync(join(dir, f), 'utf8') }))
  const entry = preload.find((p) => p.fileName === SCHEMA_ENTRY)!
  const result = await validateXML({
    xml: [{ fileName: 'document.reqif', contents: xml }],
    schema: entry,
    preload: preload.filter((p) => p !== entry),
    initialMemoryPages: 512,
    maxMemoryPages: 16384,
  })
  return { performed: true, valid: result.valid, schema: SCHEMA_LABEL, errors: result.errors.slice(0, 200).map((e) => e.message.trim()) }
}
