// AI connection with the scripted FAKE provider (no AI account): Settings beside Help → AI and reasoning → Connect →
// ask → proposal saved in the assistant service → reopened in a fresh browser session → Apply; access policy (module
// off, refused operation told to the person and the model); audit; Disconnect; the drill bit holder demo plan; phone
// and dark theme. Real services: API, PostgreSQL, Conceptualize, Requirements; the model is the fake provider.
//
// Start the API with the fake provider registered (development only):
//   npm run ai:dev:fake            (workspace :5173 + API :8787, EWS_ASSISTANT_FAKE_PROVIDER=1)
// Run: npm run e2e -- ai-fake-provider   (E2E_BASE / E2E_API for other ports, see tests/e2e/README.md)
// The flow resets the AI connection and AI settings of development user eli first.
import { env, launchOptions, shotsDir } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const base = env.base
const shots = shotsDir('ai-fake-provider')
const KEY = 'fake-browser-key-1234'

// Reset: eli has no connection and no AI settings of their own.
const API = env.api
const H = { 'X-Dev-User': 'eli' }
await fetch(API + '/api/assistant/v1/connection?projectId=PRJ-ACT100', { method: 'DELETE', headers: H })
const cur = await (await fetch(API + '/api/settings/v1/values?projectId=PRJ-ACT100', { headers: H })).json()
const resetValues = Object.fromEntries(Object.keys(cur.user.values).filter((k) => k !== 'ai.connection.active').map((k) => [k, null]))
if (Object.keys(resetValues).length) await fetch(API + '/api/settings/v1/users/me/values?projectId=PRJ-ACT100', { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json', 'If-Match': cur.user.etag }, body: JSON.stringify({ values: resetValues }) })

const providers = await (await fetch(API + '/api/assistant/v1/providers', { headers: H })).json()
if (!providers.providers?.some((p) => p.id === 'fake')) {
  console.error('[ai-fake-provider] FAIL the fake provider is not registered: start the API with npm run ai:dev:fake (EWS_ASSISTANT_FAKE_PROVIDER=1).')
  process.exit(1)
}

const browser = await chromium.launch({ ...launchOptions })
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await context.newPage()
const problems = []
const requests = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('request', (r) => requests.push({ url: r.url(), body: r.postData() ?? '' }))

let failures = 0
const check = (cond, msg) => {
  console.log(`[ai-fake-provider] ${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}
const wait = (ms = 400) => page.waitForTimeout(ms)
const shot = (name, p = page) => p.screenshot({ path: `${shots}/${name}.png` })
const lastReply = () => page.locator('.as-assistant').last()
async function waitForReply(timeout = 20000) {
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.as-assistant')]
    const last = msgs[msgs.length - 1]
    return last && !last.querySelector('.as-thinking') && (last.querySelector('.as-text') || last.querySelector('.as-note'))
  }, null, { timeout })
  await wait(200)
}
async function ask(text) {
  await page.fill('.as-input textarea', text)
  await page.press('.as-input textarea', 'Enter')
  await waitForReply()
  return lastReply()
}
async function openSettings(pageLink) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.waitForSelector('[data-testid="settings-centre"]')
  if (pageLink) await page.click(`[data-settings-page="${pageLink}"]`)
  await wait(500)
}
async function choose(label, option) {
  const trigger = label.includes(".") ? page.locator(`[data-setting-id='${label}'] button`).first() : page.getByRole("button", { name: new RegExp(label + "$") }).first()
  await trigger.click()
  await page.getByRole("option", { name: option }).first().click()
  await wait(600)
}

await page.goto(base)
await page.evaluate(() => localStorage.clear())
await page.goto(base)
await page.waitForSelector('[data-testid="model-revision"]')

// --- Settings centre beside Help --------------------------------------------------------------------------
const settingsBox = await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox()
const helpBox = await page.getByRole('button', { name: 'Help', exact: true }).boundingBox()
check(settingsBox && helpBox && Math.abs(settingsBox.y - helpBox.y) < 8 && helpBox.x > settingsBox.x && helpBox.x - settingsBox.x < 80, 'Settings button sits beside the Help menu in the header')
await openSettings()
check(await page.isVisible('[data-testid="settings-platform"]'), 'Settings centre opens on the Platform page')
check((await page.locator('[data-settings-page]').allTextContents()).join('|') === 'Platform|AI and reasoning', 'pages: Platform and AI and reasoning (no placeholder module pages)')
check(new URL(page.url()).searchParams.get('settings') === 'platform', 'deep link reflects the open page (?settings=platform)')
await choose('platform.appearance.theme', 'Dark')
check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'Platform → Theme Dark applies the same preference as the header')
await shot('01-platform-dark')
await choose('platform.appearance.theme', 'Light')
await page.fill('input[aria-label="Search settings"], [aria-label="Search settings"] input', 'timeout').catch(async () => page.getByLabel('Search settings').fill('timeout'))
await wait(400)
check((await page.textContent('[data-testid="settings-results"]')).includes('Request timeout'), 'search finds a setting on another page')
await page.getByLabel('Search settings').fill('')

// --- AI and reasoning: connect with the second (fake) provider ---------------------------------------------
await page.click('[data-settings-page="ai"]')
await page.waitForSelector('[data-testid="ai-connect-form"]', { timeout: 15000 })
check(new URL(page.url()).searchParams.get('settings') === 'ai', 'deep link ?settings=ai')
check(await page.getByRole('button', { name: 'Continue with ChatGPT' }).isVisible(), 'Continue with ChatGPT is offered (local installation)')
await shot('02-ai-connect')
await choose('Provider', /Fake provider/)
await page.getByLabel('Fake provider key').fill('fake-invalid-key-1')
await page.getByRole('button', { name: 'Connect', exact: true }).click()
await page.waitForSelector('text=Nothing was stored', { timeout: 10000 })
check(true, 'an invalid key is refused with an explanation')
await page.getByLabel('Fake provider key').fill(KEY)
check((await page.getByLabel('Fake provider key').getAttribute('type')) === 'password', 'the key field is a password field')
await page.getByRole('button', { name: 'Connect', exact: true }).click()
await page.waitForSelector('[data-testid="ai-connected"]', { timeout: 10000 })
const account = await page.textContent('[data-testid="ai-connected-account"]')
check(account.includes('key ending 1234'), `connected status shows only the last 4 characters (${account.trim()})`)
check(!(await page.content()).includes(KEY), 'the page does not contain the key after connecting')
await page.getByRole('button', { name: 'Test connection' }).click()
await page.waitForSelector('text=Connection works', { timeout: 10000 })
check(true, 'Test connection works')
await shot('03-ai-connected')

// Data sharing preview
await page.getByRole('button', { name: 'Preview what is sent with each request' }).click()
await page.waitForSelector('[data-testid="ai-preview-context"]', { timeout: 10000 })
const ctx = await page.textContent('[data-testid="ai-preview-context"]')
check(ctx.includes('"projectId":"PRJ-ACT100"') && ctx.includes('modelRevision'), 'preview shows the context sent with a request')
await shot('04-ai-preview')
await page.keyboard.press('Escape')
await wait(400)

// --- Ask through the connected backend → proposal → Apply -------------------------------------------------
await page.click('[data-dock-tab="assistant"]')
await page.waitForSelector('[data-testid="assistant-connection"][data-assistant-kind="remote"]', { timeout: 10000 })
check(true, 'assistant panel shows the connected provider (no longer the demo)')
check(!(await page.locator('[data-dock-tab="assistant"] .ws-dock-demo').count()), 'dock tab no longer says Demo')
const revBefore = Number(await page.textContent('[data-testid="model-revision"]'))
const reply = await ask('Set ROD-120 diameter to 28 mm')
check((await reply.textContent()).includes('Fake provider'), 'answer came from the connected (fake) provider via the backend')
const apply = reply.getByRole('button', { name: 'Apply' })
check(await apply.isVisible(), 'the model tool call produced a preview that needs Apply')
check(Number(await page.textContent('[data-testid="model-revision"]')) === revBefore, 'nothing changed before Apply')
await apply.click()
await page.waitForSelector('.as-event.is-success', { timeout: 10000 })
check(Number(await page.textContent('[data-testid="model-revision"]')) === revBefore + 1, 'Apply committed one new model revision')
await shot('05-applied')
const respondCalls = requests.filter((r) => r.url.includes('/api/assistant/v1/respond'))
check(respondCalls.length >= 2, `the browser called our backend's respond endpoint (${respondCalls.length} calls), not the provider`)
check(!requests.some((r) => /openai\.com/.test(r.url)), 'the browser never contacted a provider directly')
check(!requests.some((r) => r.body.includes(KEY) && !r.url.includes('/connection/api-key')), 'the key was sent only once, to /connection/api-key')

// --- A proposal saved in the assistant service reopens in a fresh browser session (C9) ---------------------
const pending = await ask('Set ROD-120 diameter to 27 mm')
const pendingId = await pending.locator('[data-proposal-id]').first().getAttribute('data-proposal-id')
await wait(800) // saved asynchronously
const conversationTag = await page.evaluate(async () => (await import('/workspace/src/assistant/conversation.ts')).useConversation.getState().conversationId.slice(-4))
const fresh = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
await fresh.addInitScript(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' })))
const page2 = await fresh.newPage()
await page2.goto(base)
await page2.waitForSelector('[data-testid="model-revision"]', { timeout: 60000 })
await page2.click('[data-dock-tab="assistant"]')
await page2.waitForSelector('[data-testid="reopened-proposals"]', { timeout: 15000 })
const reopenedCard = page2.locator(`[data-testid="reopened-proposals"] [data-proposal-id="${pendingId}·${conversationTag}"]`)
check(await reopenedCard.isVisible(), `${pendingId} reopens in a fresh browser session (no local conversation) from the assistant service`)
check((await reopenedCard.textContent()).includes('From an earlier session'), 'the reopened proposal is labelled as coming from an earlier session')
const rev2 = Number(await page2.textContent('[data-testid="model-revision"]'))
// The workspace twin lives in each browser's storage (R1): in this fresh session ROD-120 has another revision, so the
// revision check refuses the reopened proposal and explains it; nothing is overwritten.
await reopenedCard.getByRole('button', { name: 'Apply', exact: true }).click()
await page2.waitForTimeout(1000)
const refusedText = await reopenedCard.textContent()
check(/changed from rev [0-9]+ to rev [0-9]+/.test(refusedText) && Number(await page2.textContent('[data-testid="model-revision"]')) === rev2, 'a stale reopened proposal is refused with an explanation ("changed from rev … to rev …") and nothing is written')
// The person reviews the refreshed preview and applies it deliberately.
await reopenedCard.getByRole('button', { name: 'Apply refreshed preview' }).click()
await page2.waitForFunction((n) => Number(document.querySelector('[data-testid="model-revision"]')?.textContent) === n + 1, rev2, { timeout: 15000 })
check(true, 'after reviewing the refreshed preview, Apply commits one new model revision')
await shot('05b-reopened', page2)
await fresh.close()
await page.reload()
await page.waitForSelector('[data-testid="model-revision"]')
await page.click('[data-dock-tab="assistant"]').catch(() => {})

// --- Policy: module off → its operations are refused ---------------------------------------------------------
await openSettings('ai')
await page.waitForSelector('[data-setting-id="ai.access.workspace"]')
await choose('ai.access.workspace', 'AI off')
const saved = await page.evaluate(async () => (await (await fetch('/api/settings/v1/values?projectId=PRJ-ACT100', { headers: { 'X-Dev-User': 'eli' } })).json()).effective['ai.access.workspace'])
check(saved === 'off', 'the server stored AI off for Shared model (' + saved + ')')
await page.keyboard.press('Escape')
await wait(800)
const refused = await ask('Set ROD-120 diameter to 30 mm')
check((await refused.textContent()).includes('may not propose'), 'with Shared model off, propose_changes is not offered to the model')
// A model that asks for an operation of a module that is off: refused by the server, shown, told to the model.
await openSettings('ai')
await page.waitForSelector('[data-setting-id="ai.access.requirements"]')
await choose('ai.access.requirements', 'AI off')
await page.keyboard.press('Escape')
await wait(800)
await ask('forge requirements.update')
const refusedEvent = page.locator('.as-event', { hasText: 'The platform refused requirements.update' })
check(await refusedEvent.count() > 0, 'a refused operation is shown to the person ("The platform refused requirements.update …")')
const followUp = requests.length
await ask('hello again')
const nextRespond = requests.slice(followUp).find((r) => r.url.includes('/api/assistant/v1/respond'))
check(!!nextRespond && nextRespond.body.includes('"event":"refused"'), 'the refusal is sent with the next request, so the model learns about it')
await openSettings('ai')
await page.waitForSelector('[data-setting-id="ai.access.requirements"]')
await choose('ai.access.requirements', 'Read and propose changes')
await page.waitForSelector('[data-setting-id="ai.access.workspace"]')
await choose('ai.access.workspace', 'Read and propose changes')
// Audit
await page.getByRole('button', { name: 'Refresh' }).click()
await wait(600)
check((await page.textContent('[data-testid="ai-audit"]')).includes('propose_changes'), 'audit lists the operations of recent calls')
await shot('06-ai-policy-audit')

// --- Disconnect ---------------------------------------------------------------------------------------------
await page.getByRole('button', { name: 'Disconnect' }).click()
await page.waitForSelector('[data-testid="ai-connect-form"]', { timeout: 10000 })
check(true, 'Disconnect returns to the connect form')
await page.keyboard.press('Escape')
await page.waitForSelector('[data-testid="assistant-connection"][data-assistant-kind="demo"]', { timeout: 10000 })
check(true, 'the panel falls back to the labelled demo assistant')

// --- Drill bit holder demo plan (no account) --------------------------------------------------------------
const start = await ask('Start the drill bit holder example')
check((await start.textContent()).includes('Scripted demo plan'), 'drill demo is labelled as a scripted demo plan')
await start.getByRole('button', { name: 'Apply' }).click()
await page.waitForSelector('.as-event.is-success >> nth=1', { timeout: 15000 })
const dec = await ask('Decompose the drill bit holder')
check(/CON-\d+/.test(await dec.textContent()), 'demo finds the applied Concept and prepares its decomposition')
await dec.getByRole('button', { name: 'Apply' }).click()
await page.waitForSelector('.as-event.is-success >> nth=2', { timeout: 15000 })
const alts = await ask('Propose alternatives for the drill bit holder')
check((await alts.textContent()).includes('Weighted total'), 'alternatives step shows the trade study')
for (let i = 0; i < 3; i++) {
  const b = alts.getByRole('button', { name: 'Apply', exact: true }).first()
  if (!(await b.count())) break
  await b.click()
  await wait(1500)
}
const reqs = await ask('Draft requirements for the drill bit holder')
check((await reqs.textContent()).includes('draft requirements'), 'requirements step prepares draft requirements')
const okBefore = await page.locator('.as-event.is-success').count()
await reqs.getByRole('button', { name: 'Apply', exact: true }).first().click()
await page.waitForFunction((n) => document.querySelectorAll('.as-event.is-success').length > n, okBefore, { timeout: 15000 })
const lastEvent = await page.locator('.as-event').last().textContent()
check(/draft requirement/i.test(lastEvent), 'applying creates draft requirements linked to the Concept (' + lastEvent.trim().slice(0, 120) + ')')
await shot('07-drill-demo')
await page.evaluate(() => localStorage.setItem('ews.preferences.v1', JSON.stringify({ theme: 'dark', density: 'comfortable' })))
await page.goto(base + '?settings=ai')
await page.waitForSelector('[data-testid="settings-ai"]')
await wait(1500)
await shot('09-ai-dark')

// --- Phone layout -----------------------------------------------------------------------------------------
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await phone.goto(`${base}?settings=ai`)
await phone.waitForSelector('[data-testid="settings-ai"]', { timeout: 15000 })
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check(overflow <= 1, `phone: AI settings page opens from the deep link without horizontal overflow (${overflow}px)`)
await shot('08-phone-ai', phone)

const unexpected = problems.filter((p) => !/422/.test(p)) // the deliberately invalid key
check(unexpected.length === 0, `no unexpected console errors${unexpected.length ? `: ${unexpected.join(' | ')}` : ''}`)
console.log(failures ? `[ai-fake-provider] ${failures} FAILED` : '[ai-fake-provider] ALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
