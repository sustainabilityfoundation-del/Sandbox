// Runs the committed browser flows against a running workspace and API (`npm run dev`).
// Usage: npm run e2e [-- <flow> ...]   e.g. npm run e2e -- platform help
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const flowsDir = join(dirname(fileURLToPath(import.meta.url)), 'flows')
const all = readdirSync(flowsDir).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort()
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all
const unknown = wanted.filter((w) => !all.includes(w))
if (unknown.length) {
  console.error(`Unknown flow(s): ${unknown.join(', ')}. Available: ${all.join(', ')}`)
  process.exit(2)
}
const results = []
for (const flow of wanted) {
  const started = Date.now()
  const r = spawnSync(process.execPath, [join(flowsDir, `${flow}.mjs`)], { stdio: 'inherit', env: process.env })
  results.push({ flow, ok: r.status === 0, seconds: Math.round((Date.now() - started) / 1000) })
}
console.log('\nBrowser flows:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.flow} (${r.seconds} s)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
