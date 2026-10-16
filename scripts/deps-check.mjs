// Licence policy check (ADR-0073, strategy §2 and §8). Exit 1 on restricted, commercial, prohibited or unknown
// licences that are not approved in docs/dependencies/policy.json, and on conditional ones not reviewed.
//   options: --lock <file> --policy <file>
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { buildRegister, checkRegister, countByCategory } from './lib/deps.mjs'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? path.resolve(args[i + 1]) : fallback
}
const lock = JSON.parse(readFileSync(opt('--lock', path.join(root, 'package-lock.json')), 'utf8'))
const policyFile = opt('--policy', path.join(root, 'docs/dependencies/policy.json'))
const policy = existsSync(policyFile) ? JSON.parse(readFileSync(policyFile, 'utf8')) : {}

const register = buildRegister(lock, policy)
const { failures, pending, reviewed } = checkRegister(register)
const counts = countByCategory(register)
const line = (r) => `  ${r.name}@${r.version}  ${r.license}  [${r.category}, ${r.scope}]  ${r.status}${r.adr && !String(r.status).includes(r.adr) ? ' (' + r.adr + ')' : ''}`

console.log(`Licence categories (${register.packageCount} third-party packages): ` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '))
if (reviewed.length) console.log(`\nApproved or reviewed in policy (${reviewed.length}):\n` + reviewed.map(line).join('\n'))
if (pending.length) console.log(`\nPENDING decisions, allowed for now but open (${pending.length}):\n` + pending.map(line).join('\n'))
const unknown = register.packages.filter((p) => p.licenseCategory === 'unknown')
if (unknown.length) console.log(`\nUNKNOWN licences (${unknown.length}):\n` + unknown.map((p) => `  ${p.name}@${p.version}  "${p.license}"  ${p.approval}`).join('\n'))
if (failures.length) {
  console.error(`\nFAILED: ${failures.length} package(s) violate the licence policy:\n` + failures.map((f) => `${line(f)}\n    ${f.reason}`).join('\n'))
  process.exit(1)
}
console.log('\nLicence policy check passed.')
