// npm run cad:commands — writes the machine-readable command and query catalogue
// (docs/modules/cad/commands.json) from the authoritative registry in @ews/cad-core.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandCatalog } from '../src/index'

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/modules/cad/commands.json')
writeFileSync(target, JSON.stringify(commandCatalog(), null, 2) + '\n')
console.log(`Wrote ${target}`)
