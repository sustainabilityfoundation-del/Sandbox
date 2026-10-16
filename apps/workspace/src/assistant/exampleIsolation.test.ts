import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Demonstration D1 rule: example-specific text, numbers and IDs live in isolated fixtures, tutorials or tests, never
 * in product logic. This scans the product source of the AI and settings code paths (assistant execution, demo
 * assistant, settings, the assistant and settings services) for the drill bit holder example's vocabulary.
 * Fixtures (apps/workspace/fixtures), help pages and test files are allowed to contain it.
 */
const repo = resolve(__dirname, '../../../..')
const PRODUCT_DIRS = ['apps/workspace/src', 'services/assistant/src', 'services/settings/src']
const EXAMPLE_VOCABULARY = /drill|milwaukee|bit[ -]?holder|hex[ -]?shank|belt[ -]?clip|\bM1[28]\b|6\.35\s*mm/i

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name.startsWith('dist')) return []
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('example isolation (D1)', () => {
  it('keeps example vocabulary out of product source', () => {
    const hits = PRODUCT_DIRS.flatMap((d) => sources(join(repo, d)))
      .flatMap((file) => readFileSync(file, 'utf8').split(/\r?\n/).map((line, i) => ({ file, line: i + 1, text: line })))
      .filter((l) => EXAMPLE_VOCABULARY.test(l.text))
      .map((l) => `${relative(repo, l.file)}:${l.line}: ${l.text.trim().slice(0, 100)}`)
    expect(hits).toEqual([])
  })

  it('the guard itself recognizes example vocabulary', () => {
    expect(EXAMPLE_VOCABULARY.test('Drill bit holder for a cordless drill')).toBe(true)
    expect(EXAMPLE_VOCABULARY.test('Read before you propose')).toBe(false)
  })
})
