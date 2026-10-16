// Generate docs/dependencies/register.json from package-lock.json and docs/dependencies/policy.json (ADR-0073).
//   node scripts/deps-register.mjs            write the register
//   node scripts/deps-register.mjs --check    fail if the committed register is out of date
//   options: --lock <file> --policy <file> --out <file>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { buildRegister, serializeRegister } from './lib/deps.mjs'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? path.resolve(args[i + 1]) : fallback
}
const lockFile = opt('--lock', path.join(root, 'package-lock.json'))
const policyFile = opt('--policy', path.join(root, 'docs/dependencies/policy.json'))
const outFile = opt('--out', path.join(root, 'docs/dependencies/register.json'))

const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
const policy = existsSync(policyFile) ? JSON.parse(readFileSync(policyFile, 'utf8')) : {}
const text = serializeRegister(buildRegister(lock, policy))

if (args.includes('--check')) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
  if (current !== text) {
    console.error(`${path.relative(root, outFile)} is out of date. Run: npm run deps:register`)
    process.exit(1)
  }
  console.log('Dependency register is up to date.')
} else {
  mkdirSync(path.dirname(outFile), { recursive: true })
  writeFileSync(outFile, text)
  console.log(`Wrote ${path.relative(root, outFile)}`)
}
