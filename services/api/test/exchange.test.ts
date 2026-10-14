import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE, REQIF_SAMPLES, REQIF_SCHEMAS, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

const fixture = readFileSync(resolve(__dirname, '../../../packages/reqif/src/fixtures/handwritten.reqif'), 'utf8')
const schemas = existsSync(join(REQIF_SCHEMAS, 'omg-20110401-reqif.xsd'))

let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => env?.close())

async function preview(user: string, body: string | Uint8Array, fileName: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams({ fileName, ...query }).toString()
  return env.call(user, 'POST', `${BASE}/imports?${qs}`, typeof body === 'string' ? body : body, { 'content-type': /\.(reqifz|zip)$/.test(fileName) ? 'application/zip' : 'application/xml', ...idem() })
}
const apply = (user: string, jobId: string, body: Record<string, unknown> = {}) => env.call(user, 'POST', `${BASE}/imports/${jobId}/apply`, body)
const byKey = (job: any, key: string) => job.preview.records.find((r: { key: string }) => r.key === key)

describe('ReqIF import preview and apply (AC-R3–R7)', () => {
  let jobId: string
  it('previews new records, mappings, unsupported content and findings without changing anything', async () => {
    const res = await preview('eli', fixture, 'pump.reqif')
    expect(res.status).toBe(201)
    await expectConforms(env, 'previewImport', 201, res.body)
    jobId = res.body.id
    const p = res.body.preview
    expect(p.counts).toMatchObject({ new: 5, unsupported: 1 })
    expect(byKey(res.body, 'spec-object:so-1')).toMatchObject({ kind: 'requirement', state: 'new', label: 'Flow rate' })
    expect(byKey(res.body, 'spec-object:so-h1')).toMatchObject({ kind: 'heading', state: 'new' })
    expect(byKey(res.body, 'spec-relation:sr-1')).toMatchObject({ kind: 'relationship', state: 'new' })
    expect(byKey(res.body, 'spec-relation:sr-2')).toMatchObject({ state: 'unsupported' })
    expect(p.attributeMappings.find((m: { name: string }) => m.name === 'ReqIF.Text').target).toBe('statement')
    expect(p.attributeMappings.find((m: { name: string }) => m.name === 'Priority').target).toBe('preserved for re-export') // editors cannot define attributes
    expect(p.relationshipMappings.find((m: { name: string }) => m.name === 'Derived from').target).toBe('derives-from')
    expect(p.source).toMatchObject({ key: 'fixture-repository', matchedSourceId: null })
    expect(p.findings.map((f: { code: string }) => f.code)).toEqual(expect.arrayContaining(['unresolved-object', 'xhtml-sanitised']))
    if (schemas) expect(p.schemaValidation).toMatchObject({ performed: true, valid: false })
    expect(p.unsupported.map((u: { kind: string }) => u.kind)).toEqual(expect.arrayContaining(['REQ-IF-TOOL-EXTENSION', 'RELATION-GROUP']))
    expect(p.policies.join(' ')).toMatch(/Nothing is deleted/)
    const count = await env.pool.query(`SELECT count(*)::int AS n FROM requirements.requirement_revisions WHERE title = 'Flow rate'`)
    expect(count.rows[0].n).toBe(0)
  })

  it('applies: creates requirements (draft), sanitised rich text, derives-from link and the collection structure', async () => {
    const res = await apply('eli', jobId)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('applied')
    expect(res.body.result).toMatchObject({ requirementsCreated: 2, relationshipsCreated: 1, collectionsCreated: 1, headings: 1 })
    const list = await env.call('rho', 'GET', `${BASE}/requirements?text=pump`)
    const flow = list.body.items.find((r: { title: string }) => r.title === 'Flow rate')
    expect(flow).toMatchObject({ status: 'draft', rationale: 'Process demand' })
    expect(flow.statement).toContain('at least 40 l/min at 2 bar')
    expect(flow.statementXhtml).toContain('<b>40 l/min</b>')
    expect(flow.statementXhtml).not.toMatch(/onclick|javascript/)
    const refs = await env.call('rho', 'GET', `${BASE}/requirements/${flow.id}/external-references`)
    expect(refs.body.find((r: { externalId: string }) => r.externalId === 'so-1')).toBeTruthy()
    const inlet = list.body.items.find((r: { title: string }) => r.title === 'Inlet pressure')
    const rels = await env.call('rho', 'GET', `${BASE}/requirements/${inlet.id}/relationships`)
    expect(rels.body).toEqual([expect.objectContaining({ type: 'derives-from', fromId: inlet.id, toRequirementId: flow.id })])
    const cols = await env.call('rho', 'GET', `${BASE}/collections`)
    const col = cols.body.find((c: { name: string }) => c.name === 'Pump specification')
    const tree = await env.call('rho', 'GET', `${BASE}/collections/${col.id}`)
    expect(tree.body.nodes.map((n: { number: string; kind: string; heading: string | null; requirementId: string | null }) => [n.number, n.kind, n.heading ?? n.requirementId])).toEqual([
      ['1', 'heading', 'Hydraulics'],
      ['1.1', 'requirement', flow.id],
      ['1.2', 'requirement', inlet.id],
    ])
  })

  it('re-imports the same file without duplicates (AC-R5) and never deletes absent records (AC-R6)', async () => {
    const again = await preview('eli', fixture, 'pump.reqif')
    expect(again.body.preview.counts).toMatchObject({ new: 0, changed: 0, conflicting: 0 })
    expect(again.body.preview.source.matchedSourceId).toBeTruthy()
    const applied = await apply('eli', again.body.id)
    expect(applied.body.result).toMatchObject({ requirementsCreated: 0, requirementsUpdated: 0, collectionsCreated: 0, relationshipsCreated: 0 })
    const n = await env.pool.query(`SELECT count(*)::int AS n FROM requirements.requirements r JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision WHERE v.title IN ('Flow rate', 'Inlet pressure')`)
    expect(n.rows[0].n).toBe(2)
    // A file without so-2: nothing is deleted.
    const without = fixture.replace(/<SPEC-OBJECT IDENTIFIER="so-2"[\s\S]*?<\/SPEC-OBJECT>/, '').replace(/<SPEC-HIERARCHY IDENTIFIER="sh-2"[\s\S]*?<\/SPEC-HIERARCHY>/, '').replace(/<SPEC-RELATION IDENTIFIER="sr-[12]"[\s\S]*?<\/SPEC-RELATION>/g, '').replace(/<SPEC-RELATION-GROUPS>[\s\S]*<\/SPEC-RELATION-GROUPS>/, '')
    const p = await preview('eli', without, 'pump-v2.reqif')
    expect(p.body.preview.policies[0]).toMatch(/1 previously imported requirement/)
    await apply('eli', p.body.id)
    const still = await env.call('rho', 'GET', `${BASE}/requirements?text=inlet`)
    expect(still.body.items.some((r: { title: string }) => r.title === 'Inlet pressure')).toBe(true)
  })

  it('classifies changed and conflicting records and keeps local versions by default (conflict handling)', async () => {
    const inlet = (await env.call('rho', 'GET', `${BASE}/requirements?text=inlet`)).body.items[0]
    await env.call('eli', 'PATCH', `${BASE}/requirements/${inlet.id}`, { expectedRevision: inlet.revision, statement: 'The inlet shall tolerate 0.4 bar to 3 bar.' })
    const changed = fixture
      .replace('The inlet shall tolerate 0.5 bar to 3 bar.', 'The inlet shall tolerate 0.5 bar to 3.5 bar.')
      .replace('<SPEC-OBJECT IDENTIFIER="so-2" LAST-CHANGE="2026-10-01T10:00:00.000Z"', '<SPEC-OBJECT IDENTIFIER="so-2" LAST-CHANGE="2026-10-05T10:00:00.000Z"')
      .replace('at least <xhtml:b>40 l/min</xhtml:b>', 'at least <xhtml:b>45 l/min</xhtml:b>')
      .replace('<SPEC-OBJECT IDENTIFIER="so-1" LAST-CHANGE="2026-10-01T10:00:00.000Z"', '<SPEC-OBJECT IDENTIFIER="so-1" LAST-CHANGE="2026-10-05T10:00:00.000Z"')
    const p = await preview('eli', changed, 'pump-v3.reqif')
    expect(byKey(p.body, 'spec-object:so-1').state).toBe('changed')
    expect(byKey(p.body, 'spec-object:so-1').changes.map((c: { field: string }) => c.field)).toEqual(expect.arrayContaining(['statement']))
    expect(byKey(p.body, 'spec-object:so-2').state).toBe('conflicting')
    const res = await apply('eli', p.body.id)
    expect(res.body.result).toMatchObject({ requirementsUpdated: 1, keptLocal: 1 })
    const after = (await env.call('rho', 'GET', `${BASE}/requirements/${inlet.id}`)).body
    expect(after.statement).toBe('The inlet shall tolerate 0.4 bar to 3 bar.')
    const flow = (await env.call('rho', 'GET', `${BASE}/requirements?text=flow`)).body.items.find((r: { title: string }) => r.title === 'Flow rate')
    expect(flow.statement).toContain('45 l/min')
  })

  it('refuses to apply when data changed after the preview', async () => {
    const changed = fixture.replace('Inlet pressure', 'Inlet pressure range').replace('<SPEC-OBJECT IDENTIFIER="so-2" LAST-CHANGE="2026-10-01T10:00:00.000Z"', '<SPEC-OBJECT IDENTIFIER="so-2" LAST-CHANGE="2026-10-09T10:00:00.000Z"')
    const p = await preview('eli', changed, 'pump-v4.reqif')
    const inlet = (await env.call('rho', 'GET', `${BASE}/requirements?text=inlet`)).body.items[0]
    await env.call('eli', 'PATCH', `${BASE}/requirements/${inlet.id}`, { expectedRevision: inlet.revision, rationale: 'Edited meanwhile' })
    const res = await apply('eli', p.body.id)
    expect(res.status).toBe(409)
  })

  it('keeps mappings per source: the same identifiers from another source create separate requirements', async () => {
    const p = await preview('eli', fixture, 'pump.reqif', { sourceKey: 'other-supplier' })
    expect(p.body.preview.counts.new).toBe(5)
    expect(p.body.preview.source.matchedSourceId).toBeNull()
  })

  it('lets administrators import unmapped attributes as typed custom attributes', async () => {
    const p = await preview('ada', fixture, 'pump.reqif', { sourceKey: 'admin-source' })
    expect(p.body.preview.attributeMappings.find((m: { name: string }) => m.name === 'Priority').target).toMatch(/custom attribute reqif-priority \(will be created\)/)
    const res = await apply('ada', p.body.id)
    expect(res.body.result.attributeDefinitionsCreated).toBeGreaterThanOrEqual(5)
    const defs = (await env.call('ada', 'GET', `${BASE}/attribute-definitions`)).body
    const prio = defs.find((d: { key: string }) => d.key === 'reqif-priority')
    expect(prio).toMatchObject({ dataType: 'enumeration', enumValues: [expect.objectContaining({ key: 'high' }), expect.objectContaining({ key: 'low' })] })
    const mass = defs.find((d: { key: string }) => d.key === 'reqif-mass-budget')
    const flow = (await env.call('rho', 'GET', `${BASE}/requirements?text=flow`)).body.items.find((r: { attributes: Record<string, unknown> }) => r.attributes[prio.id])
    expect(flow.attributes[prio.id]).toEqual(['high'])
    expect(flow.attributes[mass.id]).toBe(12.5)
  })

  it('refuses DOCTYPE/entity declarations and malformed files with a clear error', async () => {
    const res = await preview('eli', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><REQ-IF>&e;</REQ-IF>', 'evil.reqif')
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/DOCTYPE/)
    expect((await preview('rho', fixture, 'x.reqif')).status).toBe(403)
  })
})

describe('.reqifz packaging with attachments (AC-R7)', () => {
  it('stores referenced files through object storage and serves them; unsafe paths are ignored', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const zip = zipSync({ 'spec/pump.reqif': strToU8(fixture.replace('fixture-repository', 'zip-repository')), 'spec/files/curve.png': png, '../../outside.txt': strToU8('x') })
    const p = await preview('eli', zip, 'pump.reqifz')
    expect(p.status).toBe(201)
    expect(p.body.preview.findings.map((f: { message: string }) => f.message).join(' ')).toMatch(/outside\.txt/)
    expect(p.body.preview.findings.some((f: { code: string }) => f.code === 'unresolved-object')).toBe(false)
    const res = await apply('eli', p.body.id)
    expect(res.body.result.attachments).toBe(1)
    const flow = (await env.call('rho', 'GET', `${BASE}/requirements?text=flow&limit=200`)).body.items.find((r: { statementXhtml: string | null }) => r.statementXhtml?.includes('attachment:'))
    const id = /attachment:([0-9a-f-]{36})/.exec(flow.statementXhtml)![1]
    const content = await env.server.app.inject({ method: 'GET', url: `${BASE}/attachments/${id}/content`, headers: { 'x-dev-user': 'rho' } })
    expect(content.statusCode).toBe(200)
    expect(content.headers['content-type']).toBe('image/png')
    expect(content.headers['x-content-type-options']).toBe('nosniff')
    expect(new Uint8Array(content.rawPayload)).toEqual(png)
    // Export as .reqifz includes the file again.
    const exp = await env.call('eli', 'POST', `${BASE}/exports`, { format: 'reqifz', requirementIds: [flow.id] })
    const bytes = await env.server.app.inject({ method: 'GET', url: `${BASE}/exports/${exp.body.id}/content`, headers: { 'x-dev-user': 'eli' } })
    const files = Object.keys(unzipSync(new Uint8Array(bytes.rawPayload)))
    expect(files.some((f) => /^files\/[0-9a-f-]{36}\.png$/.test(f))).toBe(true)
  })
})

describe('ReqIF export (AC-R8, AC-R9)', () => {
  it('exports a collection schema-valid, reports lossy mappings, and re-imports its own export without changes', async () => {
    const cols = (await env.call('rho', 'GET', `${BASE}/collections`)).body
    const spec = cols.find((c: { name: string }) => c.name === 'ACT-100 System Requirements Specification')
    const exp = await env.call('rho', 'POST', `${BASE}/exports`, { format: 'reqif', collectionIds: [spec.id] })
    expect(exp.status).toBe(201)
    await expectConforms(env, 'createExport', 201, exp.body)
    expect(exp.body.report.requirements).toBe(6)
    expect(exp.body.report.relationships).toBe(2)
    expect(exp.body.report.lossy.join(' ')).toMatch(/Allocation to twin components/)
    expect(exp.body.report.lossy.join(' ')).toMatch(/EWS.LifecycleStatus/)
    if (schemas) expect(exp.body.report.schemaValidation).toMatchObject({ performed: true, valid: true, errors: [] })
    const file = await env.server.app.inject({ method: 'GET', url: `${BASE}/exports/${exp.body.id}/content`, headers: { 'x-dev-user': 'rho' } })
    const xml = file.body
    expect(xml).toContain('<REPOSITORY-ID>ews:PRJ-ACT100</REPOSITORY-ID>')
    expect(xml).toContain('_5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001')
    // Self round trip: matched by canonical ID; nothing new, nothing changed.
    const p = await preview('eli', xml, 'own.reqif')
    expect(p.body.preview.counts).toMatchObject({ new: 0, changed: 0, conflicting: 0 })
    expect(byKey(p.body, 'spec-object:_5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001')).toMatchObject({ state: 'unchanged', localKey: 'REQ-001' })
  })

  it('exports a baseline with pinned revisions and a configuration filter', async () => {
    const bl = (await env.call('rho', 'GET', `${BASE}/baselines`)).body.find((b: { name: string }) => b.name === 'Seed baseline')
    const exp = await env.call('rho', 'POST', `${BASE}/exports`, { format: 'reqif', baselineId: bl.id })
    expect(exp.body.report.requirements).toBe(6)
    const xml = (await env.server.app.inject({ method: 'GET', url: `${BASE}/exports/${exp.body.id}/content`, headers: { 'x-dev-user': 'rho' } })).body
    expect(xml).toMatch(/EWS.Revision/)
    const json = await env.call('rho', 'POST', `${BASE}/exports`, { format: 'json', configurationId: 'CFG-HD' })
    expect(json.status).toBe(201)
  })

  it('exports back to a source with its identifiers, types and preserved values', async () => {
    const sources = (await env.call('rho', 'GET', `${BASE}/exchange-sources`)).body
    const src = sources.find((s: { sourceKey: string }) => s.sourceKey === 'fixture-repository')
    const exp = await env.call('rho', 'POST', `${BASE}/exports`, { format: 'reqif', sourceId: src.id })
    const xml = (await env.server.app.inject({ method: 'GET', url: `${BASE}/exports/${exp.body.id}/content`, headers: { 'x-dev-user': 'rho' } })).body
    expect(xml).toContain('IDENTIFIER="so-1"')
    expect(xml).toContain('<SPEC-OBJECT-TYPE-REF>t-req</SPEC-OBJECT-TYPE-REF>')
    expect(xml).toContain('<ENUM-VALUE-REF>ev-high</ENUM-VALUE-REF>') // preserved value
    if (schemas) expect(exp.body.report.schemaValidation.valid).toBe(true)
  })
})

describe('JSON exchange', () => {
  it('round-trips the module format; a newer local revision is a conflict', async () => {
    const exp = await env.call('rho', 'POST', `${BASE}/exports`, { format: 'json' })
    const bytes = (await env.server.app.inject({ method: 'GET', url: `${BASE}/exports/${exp.body.id}/content`, headers: { 'x-dev-user': 'rho' } })).rawPayload
    const data = JSON.parse(bytes.toString())
    expect(data.format).toBe('ews-requirements')
    const p1 = await preview('eli', new Uint8Array(bytes), 'all.json')
    expect(p1.body.preview.counts).toMatchObject({ new: 0, changed: 0, conflicting: 0 })
    const r = data.requirements.find((x: { key: string }) => x.key === 'REQ-004')
    await env.call('eli', 'PATCH', `${BASE}/requirements/${r.id}`, { expectedRevision: r.revision, statement: 'Changed after export.' })
    const p2 = await preview('eli', new Uint8Array(bytes), 'all.json')
    expect(byKey(p2.body, `requirement:${r.id}`).state).toBe('conflicting')
  })
})

// ---- externally produced files through the API -----------------------------------------------------

const files = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : /\.reqifz?$/i.test(n) ? [join(d, n)] : [])) : [])
const samples = files(REQIF_SAMPLES)

describe.runIf(samples.length > 0)('external ReqIF files through the import API (AC-R10)', () => {
  const report: Record<string, unknown>[] = []
  for (const path of samples) {
    const name = relative(REQIF_SAMPLES, path).replace(/\\/g, '/')
    it(`imports and re-imports ${name}`, async () => {
      const bytes = new Uint8Array(readFileSync(path))
      const key = `sample:${name}`
      const p = await preview('ada', bytes, name.split('/').pop()!, { sourceKey: key })
      expect([201, 422]).toContain(p.status)
      if (p.status === 422) {
        report.push({ file: name, previewStatus: 422, error: p.body.error.message })
        return
      }
      const errors = p.body.preview.findings.filter((f: { severity: string }) => f.severity === 'error')
      const entry: Record<string, unknown> = { file: name, counts: p.body.preview.counts, errors: errors.map((e: { message: string }) => e.message).slice(0, 3), schemaValid: p.body.preview.schemaValidation.valid }
      if (!errors.length) {
        const a = await apply('ada', p.body.id)
        if (a.status !== 200) console.log('APPLYERR', name, JSON.stringify(a.body).slice(0, 600))
        expect(a.status).toBe(200)
        entry.result = a.body.result
        const again = await preview('ada', bytes, name.split('/').pop()!, { sourceKey: key })
        expect(again.body.preview.counts.new).toBe(0)
        expect(again.body.preview.counts.changed).toBe(0)
        entry.reimport = again.body.preview.counts
      }
      report.push(entry)
      writeFileSync(resolve(REQIF_SAMPLES, '..', 'reqif-api-import-report.json'), JSON.stringify(report, null, 2))
    }, 120_000)
  }
})
