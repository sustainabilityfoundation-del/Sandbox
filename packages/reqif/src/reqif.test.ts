import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ReqIFParseError, readReqIF, readReqifz, resolveReference, safeArchivePath, sanitizeXhtmlString, toReqifXhtml, writeReqIF, writeReqifz, toNcName } from './index'
import { schemasAvailable, validateAgainstSchema } from './schemaValidation'

const fixture = readFileSync(join(__dirname, 'fixtures', 'handwritten.reqif'))
const schemaDir = resolve(__dirname, '../../../.data/reqif-schemas')

describe('secure parsing (AC-R1)', () => {
  it('refuses DOCTYPE and entity declarations (XXE, entity expansion)', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><REQ-IF>&x;</REQ-IF>'
    expect(() => readReqIF(xxe)).toThrow(ReqIFParseError)
    const lol = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><REQ-IF>&b;</REQ-IF>'
    expect(() => readReqIF(lol)).toThrow(/DOCTYPE/)
  })
  it('refuses malformed XML and non-ReqIF roots', () => {
    expect(() => readReqIF('<REQ-IF><unclosed></REQ-IF>')).toThrow(ReqIFParseError)
    expect(() => readReqIF('<html/>')).toThrow(/not REQ-IF/)
  })
})

describe('reading the core exchange structures (AC-R3)', () => {
  const { document: doc, findings, unsupported } = readReqIF(fixture)
  it('reads the header', () => {
    expect(doc.header).toMatchObject({ identifier: 'hdr-1', repositoryId: 'fixture-repository', sourceToolId: 'handwritten fixture', title: 'Pump specification', reqifVersion: '1.0' })
  })
  it('reads datatypes, enumeration values and typed attribute definitions', () => {
    expect(doc.datatypes.map((d) => d.kind).sort()).toEqual(['BOOLEAN', 'DATE', 'ENUMERATION', 'INTEGER', 'REAL', 'STRING', 'XHTML'])
    expect(doc.datatypes.find((d) => d.kind === 'ENUMERATION')!.values!.map((v) => [v.identifier, v.key, v.otherContent])).toEqual([
      ['ev-high', 1, 'high'],
      ['ev-low', 2, 'low'],
    ])
    expect(doc.specTypes.find((t) => t.identifier === 't-req')!.attributes).toHaveLength(9)
  })
  it('reads typed values, enumeration selections and sanitised XHTML', () => {
    const o = doc.specObjects.find((x) => x.identifier === 'so-1')!
    const v = Object.fromEntries(o.values.map((x) => [x.definitionRef, x]))
    expect(v['ad-prio'].value).toEqual(['ev-high'])
    expect(v['ad-count'].value).toBe(100000)
    expect(v['ad-mass'].value).toBe(12.5)
    expect(v['ad-safety'].value).toBe(true)
    expect(v['ad-due'].value).toBe('2027-03-31T00:00:00.000Z')
    const x = v['ad-text'].xhtml!
    expect(x.plain).toContain('at least 40 l/min at 2 bar')
    expect(x.sanitized).toContain('<b>40 l/min</b>')
    expect(x.sanitized).not.toMatch(/onclick|javascript/)
    expect(x.removed.join(' ')).toMatch(/onclick/)
    expect(x.objects).toEqual([{ data: 'files/curve.png', type: 'image/png', name: undefined }])
    expect(x.raw).toContain('onclick') // the original is kept, never rendered
  })
  it('reads ordered hierarchy, relations, relation groups and tool extensions', () => {
    const spec = doc.specifications[0]
    expect(spec.children[0].objectRef).toBe('so-h1')
    expect(spec.children[0].children.map((c) => c.objectRef)).toEqual(['so-1', 'so-2'])
    expect(doc.specRelations.map((r) => [r.sourceRef, r.targetRef, r.typeRef])).toEqual([
      ['so-2', 'so-1', 't-derived'],
      ['so-1', 'so-2', 't-satisfies'],
    ])
    expect(doc.relationGroups[0].relationRefs).toEqual(['sr-1'])
    expect(doc.toolExtensions[0]).toContain('urn:example:fixture')
    expect(unsupported.map((u) => u.kind)).toEqual(['REQ-IF-TOOL-EXTENSION', 'RELATION-GROUP'])
    expect(findings.filter((f) => f.severity === 'error')).toEqual([])
  })
  it('reports dangling references and duplicate identifiers', () => {
    const broken = fixture.toString().replace('<SPEC-OBJECT-REF>so-2</SPEC-OBJECT-REF></OBJECT>', '<SPEC-OBJECT-REF>so-missing</SPEC-OBJECT-REF></OBJECT>').replace('IDENTIFIER="so-2"', 'IDENTIFIER="so-1"')
    const r = readReqIF(broken)
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['dangling-reference', 'duplicate-identifier']))
  })
})

describe('writing and semantic round trip (AC-R8, AC-R9)', () => {
  it('preserves identifiers, values, enumeration selections, hierarchy, relations and rich text', () => {
    const first = readReqIF(fixture).document
    // Write sanitised XHTML (as an exporter would), then read again.
    for (const o of first.specObjects) for (const v of o.values) if (v.xhtml) v.xhtml.raw = toReqifXhtml(v.xhtml.sanitized, v.xhtml.plain)
    const xml = writeReqIF(first)
    const second = readReqIF(xml).document
    const strip = (d: typeof first) => ({
      header: d.header,
      datatypes: d.datatypes,
      specTypes: d.specTypes,
      objects: d.specObjects.map((o) => ({ ...o, values: o.values.map((v) => ({ ...v, xhtml: v.xhtml && { sanitized: v.xhtml.sanitized, plain: v.xhtml.plain } })) })),
      relations: d.specRelations,
      specifications: d.specifications,
      groups: d.relationGroups,
    })
    const a = strip(first)
    const b = strip(second)
    expect(b.objects.map((o) => o.values.find((v) => v.kind === 'XHTML')?.xhtml?.sanitized)).toEqual(a.objects.map((o) => o.values.find((v) => v.kind === 'XHTML')?.xhtml?.sanitized))
    expect(b).toEqual(a)
    expect(second.toolExtensions[0]).toContain('fx:layout')
  })

  it('creates NCName identifiers from UUIDs', () => {
    expect(toNcName('5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001')).toBe('_5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001')
    expect(toNcName('REQ-001')).toBe('REQ-001')
  })

  it.runIf(schemasAvailable(schemaDir))('validates against the official OMG schemas: the fixture with unsafe attributes is invalid, the sanitised export is valid (AC-R2)', async () => {
    const original = await validateAgainstSchema(fixture.toString(), schemaDir)
    expect(original.performed).toBe(true)
    expect(original.valid).toBe(false)
    expect(original.errors.join('\n')).toMatch(/onclick/)
    const doc = readReqIF(fixture).document
    for (const o of doc.specObjects) for (const v of o.values) if (v.xhtml) v.xhtml.raw = toReqifXhtml(v.xhtml.sanitized, v.xhtml.plain)
    const exported = await validateAgainstSchema(writeReqIF(doc), schemaDir)
    expect(exported.errors).toEqual([])
    expect(exported.valid).toBe(true)
  }, 60_000)
})

describe('XHTML sanitising (AC-R7)', () => {
  it('keeps safe structure and removes scripts, handlers, styles and unsafe links', () => {
    const s = sanitizeXhtmlString('<p style="color:red" onmouseover="x()">Hi <script>alert(1)</script><a href="https://example.org">ok</a><a href="javascript:x">bad</a><img src="x"/></p>')
    expect(s.markup).toBe('<p>Hi <a href="https://example.org">ok</a><a>bad</a></p>')
    expect(s.removed.join(' ')).toMatch(/script/)
    expect(s.removed.join(' ')).toMatch(/style/)
    expect(s.removed.join(' ')).toMatch(/onmouseover/)
  })
  it('wraps plain text as ReqIF XHTML content', () => {
    expect(toReqifXhtml(null, 'A < B\n\nSecond')).toBe('<xhtml:div><xhtml:p>A &lt; B</xhtml:p><xhtml:p>Second</xhtml:p></xhtml:div>')
  })
})

describe('.reqifz packaging with constrained paths (AC-R7)', () => {
  it('rejects absolute, drive-letter, parent and URL paths', () => {
    for (const bad of ['/etc/passwd', 'C:/x', '..\\x', 'a/../../x', 'https://example.org/x', 'file:///x']) expect(safeArchivePath(bad), bad).toBeNull()
    expect(safeArchivePath('files\\img.png')).toBe('files/img.png')
    expect(resolveReference('spec/a.reqif', 'files/curve.png')).toBe('spec/files/curve.png')
    expect(resolveReference('a.reqif', '../escape.png')).toBeNull()
    expect(resolveReference('a.reqif', 'http://evil/x.png')).toBeNull()
  })
  it('reads archives, drops unsafe entries, and writes them back', () => {
    const zip = zipSync({ 'spec.reqif': new Uint8Array(fixture), 'files/curve.png': strToU8('PNG'), '../evil.txt': strToU8('x') })
    const c = readReqifz(zip)
    expect(c.reqifFiles.map((f) => f.path)).toEqual(['spec.reqif'])
    expect(c.files.has('files/curve.png')).toBe(true)
    expect(c.rejected).toEqual(['../evil.txt'])
    const again = readReqifz(writeReqifz({ path: 'export.reqif', xml: 'x' }, [{ path: 'files/a.png', bytes: strToU8('a') }]))
    expect([...again.files.keys()].sort()).toEqual(['export.reqif', 'files/a.png'])
  })
})
