// Prints the Key Value Store entry for the dev password gate: <salt>$<sha256 hex of salt + base64("user:password")>.
// The password is read without echo (or from a pipe) and is never printed, logged or written to a file. Only the salted hash is printed.
//   node scripts/gate-hash.mjs                 prompts for a user name and a password
//   node scripts/gate-hash.mjs --user ews      prompts for the password only
// Each run uses a new random salt, so two runs give two different entries for the same password (both are valid together,
// which is how a rotation overlaps). The function that checks the entry is functions/gate.js.
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
const userFlag = args.indexOf('--user')
let user = userFlag >= 0 ? args[userFlag + 1] : undefined

function ask(question, hidden) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Piped input: one line per answer.
      const rl = createInterface({ input: process.stdin })
      rl.once('line', (line) => { rl.close(); resolve(line) })
      return
    }
    process.stderr.write(question)
    const rl = createInterface({ input: process.stdin, terminal: true })
    if (hidden) rl._writeToOutput = () => undefined
    rl.question('', (answer) => {
      rl.close()
      process.stderr.write('\n')
      resolve(answer)
    })
  })
}

if (!user) user = (await ask('User name: ', false)).trim()
const password = await ask('Password (not shown): ', true)
if (!user || !password) {
  console.error('A user name and a password are required.')
  process.exit(1)
}
if (user.includes(':')) {
  console.error('The user name must not contain a colon.')
  process.exit(1)
}
if (password.length < 12) {
  console.error('Use at least 12 characters.')
  process.exit(1)
}
const salt = randomBytes(8).toString('hex')
const credential = Buffer.from(`${user}:${password}`, 'utf8').toString('base64')
const hash = createHash('sha256').update(salt + credential).digest('hex')
console.log(`${salt}$${hash}`)
