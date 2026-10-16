// SBOM and vulnerability report (ADR-0073). Uses npm's built-in `npm sbom` and `npm audit`; adds no dependency.
//   node scripts/deps-sbom.mjs          CycloneDX + SPDX SBOMs into dist/sbom/
//   node scripts/deps-sbom.mjs --audit  also write dist/sbom/npm-audit.json and print a summary; never fails the build
// The files are build outputs (dist/ is ignored); CI uploads them as an artifact instead of committing them.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'dist', 'sbom')
mkdirSync(outDir, { recursive: true })
// Under `npm run`, npm_execpath is npm's own JS entry; run it with node so no shell is needed.
const npmCli = process.env.npm_execpath?.endsWith('.js') ? process.env.npm_execpath : null

function run(argv) {
  const [cmd, full] = npmCli ? [process.execPath, [npmCli, ...argv]] : [process.platform === 'win32' ? 'npm.cmd' : 'npm', argv]
  return spawnSync(cmd, full, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: !npmCli && process.platform === 'win32' })
}

for (const [format, file] of [['cyclonedx', 'sbom.cdx.json'], ['spdx', 'sbom.spdx.json']]) {
  const r = run(['sbom', '--sbom-format', format])
  if (r.status !== 0) {
    console.error(r.stderr || `npm sbom --sbom-format ${format} failed`)
    process.exit(1)
  }
  writeFileSync(path.join(outDir, file), r.stdout)
  console.log(`Wrote dist/sbom/${file}`)
}

if (process.argv.includes('--audit')) {
  // npm audit exits 1 when it finds vulnerabilities; this report is non-blocking at first (ADR-0073).
  const r = run(['audit', '--json'])
  try {
    const report = JSON.parse(r.stdout)
    writeFileSync(path.join(outDir, 'npm-audit.json'), JSON.stringify(report, null, 2))
    const v = report.metadata?.vulnerabilities ?? {}
    console.log('npm audit (non-blocking): ' + Object.entries(v).map(([k, n]) => `${k} ${n}`).join(', '))
  } catch {
    console.log('npm audit produced no report (registry unreachable?). Not failing the build.')
    console.log((r.stderr || '').slice(0, 500))
  }
}
