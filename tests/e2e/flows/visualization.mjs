// Visualization service against the running stack (concept-visualization-contracts.md §1, §4): generation jobs with
// the FAKE TEST ADAPTER only (labelled test assets; no provider is called and nothing is charged), idempotent repeats,
// a batch where one item fails and the others keep their images, cancel and retry, events, and the asset shown in a
// browser. It never requests the real adapter, so a person's connected account is never used.
//
// Start the stack with `npm run ai:dev:fake` (registers the fake test adapter). Run: `npm run e2e -- visualization`.
import { randomUUID } from 'node:crypto'
import { env, launchOptions, shotsDir } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const P = 'PRJ-ACT100'
const V = `${env.api}/api/visualization/v1`
const H = { 'x-dev-user': 'ada', 'content-type': 'application/json' }
const shots = shotsDir('visualization')
let failures = 0
const check = (cond, msg) => (console.log(`[visualization] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const call = async (method, path, body) => {
  const r = await fetch(`${V}${path}`, { method, headers: H, body: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body) })
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }
}
const run = randomUUID()
const subject = { module: 'conceptualize', type: 'concept', id: randomUUID(), revision: 1 }
const req = (instruction) => ({ kind: 'illustration', subject, instruction: `${instruction} (${run})`, adapter: 'fake-test' })
async function settle(id) {
  for (let i = 0; i < 300; i++) {
    const j = (await call('GET', `/projects/${P}/jobs/${id}`)).body
    if (['succeeded', 'failed', 'cancelled'].includes(j.state)) return j
    await new Promise((r) => setTimeout(r, 100))
  }
  return { state: 'timeout' }
}

const adapters = await call('GET', `/adapters?projectId=${P}`)
const fake = adapters.body.adapters?.find((a) => a.id === 'fake-test')
if (!fake) {
  console.error('[visualization] FAIL the fake test adapter is not registered: start the stack with npm run ai:dev:fake.')
  process.exit(1)
}
check(fake.available && fake.testOnly, 'the fake test adapter is offered as test-only on this development server')
const real = adapters.body.adapters.find((a) => a.id === 'openai-images')
check(!!real && (real.available || !!real.unavailableReason), `the OpenAI adapter reports its availability with a reason (${real?.available ? 'available' : real?.unavailableCode})`)

// Events: open the stream before creating jobs.
const events = []
const controller = new AbortController()
void (async () => {
  try {
    const res = await fetch(`${V}/projects/${P}/events`, { headers: { 'x-dev-user': 'ada', accept: 'text/event-stream' }, signal: controller.signal })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (const frame of buf.split('\n\n').slice(0, -1)) {
        const data = frame.split('\n').find((l) => l.startsWith('data:'))
        if (data) events.push(JSON.parse(data.slice(5)))
      }
      buf = buf.slice(buf.lastIndexOf('\n\n') + 2)
    }
  } catch {
    /* closed */
  }
})()
await new Promise((r) => setTimeout(r, 500))

const first = await call('POST', `/projects/${P}/jobs`, req('A clip-on holder'))
const repeat = await call('POST', `/projects/${P}/jobs`, req('A clip-on holder'))
check(first.status === 201 && repeat.status === 200 && repeat.body.job.id === first.body.job.id, 'an identical request returns the same job (no second generation)')
const done = await settle(first.body.job.id)
check(done.state === 'succeeded' && done.output?.asset?.testAsset === true, `the job succeeded with a labelled test asset (${done.state})`)

const batch = await call('POST', `/projects/${P}/batches`, { items: [req('Option A'), req('Option B [fake:fail]'), req('Option C')] })
const results = await Promise.all(batch.body.items.map((i) => settle(i.job.id)))
check(results.map((r) => r.state).join(',') === 'succeeded,failed,succeeded', `one failed item keeps the others' images (${results.map((r) => r.state).join(', ')})`)
const retried = await call('POST', `/projects/${P}/jobs/${results[1].id}/retry`)
check(retried.body.attempt === 2 && (await settle(results[1].id)).state === 'failed', 'retry runs the same job again (attempt 2; the test hook keeps failing it)')

const slow = await call('POST', `/projects/${P}/jobs`, req('Slow option [fake:slow]'))
await new Promise((r) => setTimeout(r, 600))
await call('POST', `/projects/${P}/jobs/${slow.body.job.id}/cancel`)
const cancelled = await settle(slow.body.job.id)
check(cancelled.state === 'cancelled' && !cancelled.output, 'cancel stops a job and keeps no output')

await new Promise((r) => setTimeout(r, 1500))
controller.abort()
const mine = events.filter((e) => e.subject?.id === subject.id)
check(mine.some((e) => e.state === 'running') && mine.some((e) => e.state === 'succeeded') && mine.some((e) => e.state === 'cancelled'), `job events arrive over SSE (${mine.length} events)`)

// The asset displays in a browser (the image a Conceptualize card would show).
const browser = await chromium.launch({ ...launchOptions })
const page = await browser.newPage({ extraHTTPHeaders: { 'x-dev-user': 'ada' } })
const response = await page.goto(`${env.api}${done.output.asset.contentUrl}`)
check(response?.headers()['content-type'] === 'image/svg+xml' && response?.headers()['x-test-asset'] === 'true', 'the asset is served as a marked test asset')
check((await page.content()).includes('TEST ASSET'), 'the test image says it is a test asset')
await page.screenshot({ path: `${shots}/test-asset.png` })
await browser.close()
console.log(failures ? `[visualization] ${failures} FAILED` : '[visualization] ALL PASSED (fake test adapter; no live generation)')
process.exit(failures ? 1 : 0)
