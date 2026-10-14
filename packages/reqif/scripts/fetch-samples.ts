// npm run req:reqif:samples — downloads externally produced ReqIF files used for interoperability
// tests into .data/reqif-samples/ (gitignored; not redistributed here). Source: the test corpus of
// strictdoc-project/reqif (Apache-2.0 repository) at a pinned commit; it collects files exported by
// IBM DOORS, Polarion, ReqIF Studio, Eclipse RMF (ReqIF Implementor Forum test cases), Enterprise
// Architect and others. Provenance of each file is listed in docs/specifications/requirements-reqif.md.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT = 'b36694051d6b0502682bcd8f83567d4e1f387d1b'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const out = resolve(repo, process.env.EWS_REQIF_SAMPLES ?? '.data/reqif-samples')
const tmp = join(repo, '.data', 'tmp-reqif-corpus')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(dirname(tmp), { recursive: true })
execFileSync('git', ['clone', '--quiet', '--filter=blob:none', 'https://github.com/strictdoc-project/reqif.git', tmp], { stdio: 'inherit' })
execFileSync('git', ['-C', tmp, 'checkout', '--quiet', COMMIT], { stdio: 'inherit' })
if (existsSync(out)) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(join(tmp, 'tests', 'integration', 'reqif_software'), join(out, 'reqif_software'), { recursive: true })
cpSync(join(tmp, 'tests', 'integration', 'examples', '04_convert_reqif_to_json'), join(out, 'examples'), { recursive: true })
rmSync(tmp, { recursive: true, force: true })
console.log(`Samples from strictdoc-project/reqif@${COMMIT.slice(0, 12)} in ${out}`)
