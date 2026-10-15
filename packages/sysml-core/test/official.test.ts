/**
 * Official-corpus conformance measurement: runs the parser on the official SysML v2 release
 * examples, training models and standard library (fetched into .data/sysml-release/<tag>/ by
 * scripts/fetch-official.ts; never committed). Low pass rates do not fail the suite (it is a
 * measurement); a parser exception does (a crash bug). Reports are written next to the corpus.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LIBRARY_SOURCES, loadLibrary, loadText, parse, type Diagnostic, type Model } from '../src'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const releaseRoot = join(repoRoot, '.data', 'sysml-release')

function compareTags(a: string, b: string): number {
  const pa = a.split(/[-.]/).map(Number)
  const pb = b.split(/[-.]/).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function newestTagDir(): string | undefined {
  if (!existsSync(releaseRoot)) return undefined
  const tags = readdirSync(releaseRoot).filter((t) => /^\d{4}-\d{2}(\.\d+)?$/.test(t) && existsSync(join(releaseRoot, t, 'sysml', 'src')))
  tags.sort(compareTags)
  const tag = tags.at(-1)
  return tag ? join(releaseRoot, tag) : undefined
}

function sysmlFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sysmlFiles(p))
    else if (name.endsWith('.sysml')) out.push(p)
  }
  return out.sort()
}

type Status = 'PASS' | 'UNSUPPORTED' | 'SYNTAX' | 'CRASH'
interface FileResult {
  file: string
  status: Status
  diagnostics: number
  /** Diagnostic counts by rule ID. */
  rules: Record<string, number>
  first?: string
  crash?: string
}

const TOLERATED = new Set(['SYSML-SYNTAX-UNSUPPORTED', 'SYSML-RESOLVE'])

function describeDiagnostic(d: Pick<Diagnostic, 'ruleId' | 'message' | 'range'>): string {
  return `${d.ruleId} ${d.range ? `${d.range.start.line}:${d.range.start.column}` : ''} ${d.message}`.replace(/\s+/g, ' ').trim()
}

/** Removes identifiers so that messages differing only in names group together. */
function normalizeMessage(message: string): string {
  return message.replace(/name “[^”]*”/g, 'name “…”')
}

function unresolvedName(message: string): string | undefined {
  return /“([^”]*)”/.exec(message)?.[1]
}

function crashText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`
  return String(e)
}

class Counter {
  private readonly counts = new Map<string, { count: number; example: string }>()
  add(key: string, example: string): void {
    const c = this.counts.get(key)
    if (c) c.count++
    else this.counts.set(key, { count: 1, example })
  }
  top(n: number): Array<{ key: string; count: number; example: string }> {
    return [...this.counts.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, n)
  }
}

/**
 * A resolution library made of the official library's SysML files (EPL-2.0, read locally, never
 * bundled), plus the platform subset's packages for the names the official SysML files do not
 * define (the kernel libraries are KerML files, which this parser does not read).
 */
function officialLibrary(dir: string): { model: Model; files: number; platformPackages: string[]; problems: number } {
  const official = sysmlFiles(join(dir, 'sysml.library')).map((p) => ({ file: relative(dir, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))
  const defined = new Set<string>()
  for (const o of official) for (const m of parse(o.text).model.members) if (m.kind === 'package' && m.name) defined.add(m.name)
  const platform: { file: string; text: string }[] = []
  const platformPackages: string[] = []
  for (const src of LIBRARY_SOURCES) {
    for (const chunk of src.text.split(/^(?=library package )/m)) {
      const name = /^library package (\w+)/.exec(chunk)?.[1]
      if (name && !defined.has(name)) {
        platform.push({ file: `platform:${name}`, text: chunk })
        platformPackages.push(name)
      }
    }
  }
  const lib = loadLibrary([...official, ...platform])
  return { model: lib.model, files: official.length, platformPackages, problems: lib.diagnostics.length }
}

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`)

const tagDir = newestTagDir()
if (!tagDir) console.log(`Official SysML v2 corpus not found under ${releaseRoot}. Fetch it with: npx tsx packages/sysml-core/scripts/fetch-official.ts`)

describe.skipIf(!tagDir)('official SysML v2 corpus conformance (measurement)', () => {
  it('loads every example and training model without crashing, and reports the results', () => {
    const dir = tagDir!
    const tag = relative(releaseRoot, dir)
    const files = [...sysmlFiles(join(dir, 'sysml', 'src', 'examples')), ...sysmlFiles(join(dir, 'sysml', 'src', 'training'))]
    expect(files.length).toBeGreaterThan(0)

    const results: FileResult[] = []
    const constructs = new Counter()
    const syntaxMessages = new Counter()
    const unresolved = new Counter()
    for (const path of files) {
      const file = relative(dir, path).replace(/\\/g, '/')
      const text = readFileSync(path, 'utf8')
      let diagnostics: Diagnostic[]
      try {
        diagnostics = loadText(text).diagnostics
      } catch (e) {
        results.push({ file, status: 'CRASH', diagnostics: 0, rules: {}, crash: crashText(e) })
        continue
      }
      const rules: Record<string, number> = {}
      for (const d of diagnostics) {
        rules[d.ruleId] = (rules[d.ruleId] ?? 0) + 1
        if (d.ruleId === 'SYSML-SYNTAX-UNSUPPORTED') constructs.add(d.construct ?? '(none)', file)
        else if (d.ruleId === 'SYSML-RESOLVE') unresolved.add(unresolvedName(d.message) ?? d.message, file)
        else syntaxMessages.add(`${d.ruleId}: ${normalizeMessage(d.message)}`, `${file}:${d.range ? `${d.range.start.line}:${d.range.start.column}` : ''}`)
      }
      const status: Status = diagnostics.length === 0 ? 'PASS' : diagnostics.every((d) => TOLERATED.has(d.ruleId)) ? 'UNSUPPORTED' : 'SYNTAX'
      results.push({ file, status, diagnostics: diagnostics.length, rules, ...(diagnostics[0] ? { first: describeDiagnostic(diagnostics[0]) } : {}) })
    }

    // Library: syntax only (no resolution).
    const libraryFiles = sysmlFiles(join(dir, 'sysml.library'))
    const library: Array<{ file: string; ok: boolean; first?: string; crash?: string }> = []
    const librarySyntax = new Counter()
    for (const path of libraryFiles) {
      const file = relative(dir, path).replace(/\\/g, '/')
      try {
        const { diagnostics } = parse(readFileSync(path, 'utf8'))
        for (const d of diagnostics) librarySyntax.add(d.ruleId === 'SYSML-SYNTAX-UNSUPPORTED' ? `unsupported: ${d.construct ?? '?'}` : normalizeMessage(d.message), file)
        library.push({ file, ok: diagnostics.length === 0, ...(diagnostics[0] ? { first: describeDiagnostic(diagnostics[0]) } : {}) })
      } catch (e) {
        library.push({ file, ok: false, crash: crashText(e) })
      }
    }

    const count = (s: Status) => results.filter((r) => r.status === s).length
    const resolveOnly = results.filter((r) => r.status === 'UNSUPPORTED' && !r.rules['SYSML-SYNTAX-UNSUPPORTED']).length
    const crashes = [...results.filter((r) => r.crash).map((r) => ({ file: r.file, crash: r.crash! })), ...library.filter((r) => r.crash).map((r) => ({ file: r.file, crash: r.crash! }))]
    const manifestPath = join(dir, 'manifest.json')
    const manifest: unknown = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined
    const report = {
      tag,
      generatedAt: new Date().toISOString(),
      manifest,
      totals: {
        files: results.length,
        pass: count('PASS'),
        unsupported: count('UNSUPPORTED'),
        unsupportedResolveOnly: resolveOnly,
        syntax: count('SYNTAX'),
        crash: count('CRASH'),
        passRate: pct(count('PASS'), results.length),
        passOrUnsupportedRate: pct(count('PASS') + count('UNSUPPORTED'), results.length),
      },
      library: { files: library.length, syntaxPass: library.filter((l) => l.ok).length, syntaxPassRate: pct(library.filter((l) => l.ok).length, library.length), topProblems: librarySyntax.top(25), perFile: library },
      topUnsupportedConstructs: constructs.top(30),
      topSyntaxMessages: syntaxMessages.top(30),
      topUnresolvedNames: unresolved.top(30),
      crashes,
      perFile: results,
    }
    // Second measurement: the same files resolved against the official library (plus platform gaps).
    const lib = officialLibrary(dir)
    const withOfficial = { pass: 0, unsupported: 0, resolveOnly: 0, syntax: 0, unresolved: new Counter() }
    for (const path of files) {
      const file = relative(dir, path).replace(/\\/g, '/')
      let diagnostics: Diagnostic[]
      try {
        diagnostics = loadText(readFileSync(path, 'utf8'), { library: lib.model }).diagnostics
      } catch {
        continue
      }
      for (const d of diagnostics) if (d.ruleId === 'SYSML-RESOLVE') withOfficial.unresolved.add(unresolvedName(d.message) ?? d.message, file)
      if (diagnostics.length === 0) withOfficial.pass++
      else if (diagnostics.every((d) => TOLERATED.has(d.ruleId))) {
        withOfficial.unsupported++
        if (!diagnostics.some((d) => d.ruleId === 'SYSML-SYNTAX-UNSUPPORTED')) withOfficial.resolveOnly++
      } else withOfficial.syntax++
    }
    const officialLibraryReport = { libraryFiles: lib.files, platformPackages: lib.platformPackages, libraryProblems: lib.problems, pass: withOfficial.pass, passRate: pct(withOfficial.pass, files.length), unsupported: withOfficial.unsupported, unsupportedResolveOnly: withOfficial.resolveOnly, syntax: withOfficial.syntax, topUnresolvedNames: withOfficial.unresolved.top(30) }
    Object.assign(report, { withOfficialLibrary: officialLibraryReport })
    writeFileSync(join(dir, 'conformance-report.json'), JSON.stringify(report, null, 2) + '\n')

    const t = report.totals
    const table = (rows: Array<{ key: string; count: number; example: string }>, head: string) => [`| ${head} | Count | Example |`, '| --- | ---: | --- |', ...rows.map((r) => `| ${r.key.replace(/\|/g, '\\|')} | ${r.count} | ${r.example} |`)].join('\n')
    const md = [
      `# Official SysML v2 corpus conformance: ${tag}`,
      '',
      `Generated ${report.generatedAt}. Measurement only: the SysML Modeler supports a documented subset and is not SysML v2 conformant.`,
      '',
      '## Examples and training (loadText)',
      '',
      `- Files: ${t.files}`,
      `- PASS (no diagnostics): ${t.pass} (${t.passRate})`,
      `- UNSUPPORTED (only unsupported-construct and/or resolution diagnostics): ${t.unsupported} (${pct(t.unsupported, t.files)}); of which resolution only: ${t.unsupportedResolveOnly}`,
      `- SYNTAX (other syntax errors): ${t.syntax} (${pct(t.syntax, t.files)})`,
      `- CRASH (parser exception): ${t.crash}`,
      '',
      'Resolution failures are expected: the official models import standard library packages that the platform library subset does not contain.',
      '',
      '## Examples and training resolved against the official library',
      '',
      `Library: the ${officialLibraryReport.libraryFiles} official SysML library files (read locally, EPL-2.0, not bundled) plus the platform subset for ${officialLibraryReport.platformPackages.join(', ')} (kernel libraries are KerML files, which are not read). ${officialLibraryReport.libraryProblems} library problems (syntax and resolution).`,
      '',
      `- PASS (no diagnostics): ${officialLibraryReport.pass} (${officialLibraryReport.passRate})`,
      `- UNSUPPORTED: ${officialLibraryReport.unsupported}; of which resolution only: ${officialLibraryReport.unsupportedResolveOnly}`,
      `- SYNTAX: ${officialLibraryReport.syntax}`,
      '',
      table(officialLibraryReport.topUnresolvedNames, 'Unresolved name (with the official library)'),
      '',
      '## Library (parse only, no resolution)',
      '',
      `- Files: ${report.library.files}; syntax pass: ${report.library.syntaxPass} (${report.library.syntaxPassRate})`,
      '',
      table(report.library.topProblems, 'Problem'),
      '',
      '## Most frequent unsupported constructs',
      '',
      table(report.topUnsupportedConstructs, 'Construct'),
      '',
      '## Most frequent syntax error messages (normalized)',
      '',
      table(report.topSyntaxMessages, 'Message'),
      '',
      '## Most frequent unresolved names',
      '',
      table(report.topUnresolvedNames, 'Name'),
      '',
      '## Crashes',
      '',
      crashes.length === 0 ? 'None.' : crashes.map((c) => `- ${c.file}\n\n  \`\`\`\n  ${c.crash.replace(/\n/g, '\n  ')}\n  \`\`\``).join('\n'),
      '',
      '## Per file',
      '',
      '| File | Status | Diagnostics | First diagnostic |',
      '| --- | --- | ---: | --- |',
      ...results.map((r) => `| ${r.file} | ${r.status} | ${r.diagnostics} | ${(r.crash ?? r.first ?? '').split('\n')[0].replace(/\|/g, '\\|')} |`),
      '',
    ].join('\n')
    writeFileSync(join(dir, 'conformance-report.md'), md)
    console.log(`Official corpus ${tag}: ${t.files} files, PASS ${t.pass} (${t.passRate}), UNSUPPORTED ${t.unsupported}, SYNTAX ${t.syntax}, CRASH ${t.crash}; library syntax pass ${report.library.syntaxPass}/${report.library.files} (${report.library.syntaxPassRate}); with the official library: PASS ${officialLibraryReport.pass} (${officialLibraryReport.passRate}), resolution only ${officialLibraryReport.unsupportedResolveOnly}. Report: ${join(dir, 'conformance-report.md')}`)

    expect(crashes, `Parser crashes:\n${crashes.map((c) => `${c.file}: ${c.crash}`).join('\n')}`).toEqual([])
  })
})
