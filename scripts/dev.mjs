// `npm run dev`: the workspace together with its backend (Requirements API and PostgreSQL).
//
// The API is started only when nothing answers on its port yet, so a separately started
// `npm run dev:api` (or Docker Compose with EWS_PG=external) is reused. Extra arguments go to
// the workspace dev server, e.g. `npm run dev -- --strictPort`. Ctrl+C stops both.
// `npm run dev:workspace` starts the workspace alone.
import { spawn } from 'node:child_process'

const API_PORT = Number(process.env.API_PORT ?? 8787)
// Run npm's own CLI with this Node binary: no shell, so arguments are passed exactly as given.
const npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('[dev] Start this with npm run dev.')
  process.exit(1)
}
const children = []

async function apiAnswers() {
  try {
    const response = await fetch(`http://127.0.0.1:${API_PORT}/api/health`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

function run(name, args) {
  const child = spawn(process.execPath, [npmCli, ...args], { stdio: ['inherit', 'pipe', 'pipe'] })
  const prefix = (stream, target) => {
    let buffered = ''
    stream.on('data', (chunk) => {
      buffered += chunk
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop()
      for (const line of lines) target.write(`[${name}] ${line}\n`)
    })
  }
  prefix(child.stdout, process.stdout)
  prefix(child.stderr, process.stderr)
  children.push(child)
  child.on('exit', (code) => {
    if (stopping) return
    console.error(`[dev] ${name} exited${code === null ? '' : ` with code ${code}`}; stopping.`)
    stop(code ?? 1)
  })
  return child
}

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode !== null) continue
    // On Windows the console delivers Ctrl+C to every child itself; otherwise end the process tree.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGINT')
  }
  setTimeout(() => process.exit(code), 3000).unref()
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

if (await apiAnswers()) {
  console.log(`[dev] Requirements API already running on port ${API_PORT}; reusing it.`)
} else {
  console.log('[dev] Starting the Requirements API and PostgreSQL (first start initialises the database; this can take a minute).')
  run('api', ['run', 'dev:api'])
}
run('workspace', ['run', 'dev', '-w', '@ews/workspace', '--', ...process.argv.slice(2)])
