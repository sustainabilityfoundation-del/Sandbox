import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { redirectPage, writeRootRedirect } from './root-redirect.mjs'

describe('root redirect', () => {
  it('sends / to /workspace/ with a meta refresh, a canonical link and a script that keeps the query and hash', () => {
    const html = redirectPage()
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/workspace/" />')
    expect(html).toContain('<link rel="canonical" href="/workspace/" />')
    expect(html).toContain('location.replace("/workspace/" + location.search + location.hash)')
    expect(html).toContain('href="/viewer/"')
  })

  it('writes dist/index.html and removes the old root viewer files, leaving the workspace and viewer alone', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'ews-dist-'))
    try {
      for (const d of ['assets', 'models', 'workspace', 'viewer']) mkdirSync(path.join(dist, d))
      writeFileSync(path.join(dist, 'favicon.svg'), '<svg/>')
      writeFileSync(path.join(dist, 'index.html'), 'old viewer')
      writeFileSync(path.join(dist, 'workspace', 'index.html'), 'workspace')
      writeFileSync(path.join(dist, 'viewer', 'index.html'), 'viewer')
      writeRootRedirect(dist)
      expect(readFileSync(path.join(dist, 'index.html'), 'utf8')).toContain('url=/workspace/')
      expect(existsSync(path.join(dist, 'assets'))).toBe(false)
      expect(existsSync(path.join(dist, 'models'))).toBe(false)
      expect(existsSync(path.join(dist, 'favicon.svg'))).toBe(false)
      expect(readFileSync(path.join(dist, 'workspace', 'index.html'), 'utf8')).toBe('workspace')
      expect(readFileSync(path.join(dist, 'viewer', 'index.html'), 'utf8')).toBe('viewer')
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
