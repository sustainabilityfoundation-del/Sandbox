// Prints the Key Value Store entry for the dev password gate: <salt>$<sha256 hex of salt + base64("user:password")>.
// The password (at least 24 characters) is read without echo (or from a pipe), or generated when you press Enter (32 random
// characters, shown once on the terminal). It is never written to a file or put on a command line. Only the salted hash goes to stdout.
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
let password = await ask('Password, at least 24 characters (not shown); press Enter to generate a random one: ', true)
if (!user) {
  console.error('A user name is required.')
  process.exit(1)
}
if (!password) {
  // 24 random bytes = 32 URL-safe characters (192 bits). Shown once, on the terminal only (stderr); store it in a password manager.
  password = randomBytes(24).toString('base64url')
  console.error(`Generated password (shown once, copy it now): ${password}`)
}
if (user.includes(':')) {
  console.error('The user name must not contain a colon.')
  process.exit(1)
}
if (password.length < 24) {
  console.error('Use at least 24 characters (or let the script generate one).')
  process.exit(1)
}
const salt = randomBytes(8).toString('hex')
const credential = Buffer.from(`${user}:${password}`, 'utf8').toString('base64')
const hash = createHash('sha256').update(salt + credential).digest('hex')
console.log(`${salt}$${hash}`)
