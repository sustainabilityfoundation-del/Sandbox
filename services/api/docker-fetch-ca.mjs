// Build-time helper (Dockerfile, "certs" stage): downloads the Amazon RDS certificate bundle so the API can verify the database's TLS
// certificate. Arguments: <url> <output file> [expected sha256 hex]. With a checksum, a mismatch fails the build.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const [url, out, want] = process.argv.slice(2)
if (!url || !out) throw new Error('usage: docker-fetch-ca.mjs <url> <out> [sha256]')
const res = await fetch(url)
if (!res.ok) throw new Error(`certificate bundle download failed: HTTP ${res.status}`)
const text = await res.text()
if (!text.includes('BEGIN CERTIFICATE')) throw new Error('the download is not a certificate bundle')
if (want && createHash('sha256').update(text).digest('hex') !== want.toLowerCase()) throw new Error('certificate bundle checksum mismatch')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, text)
console.log(`wrote ${out} (${text.length} bytes, sha256 ${createHash('sha256').update(text).digest('hex')})`)
