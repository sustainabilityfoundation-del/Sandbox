import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Object storage for large content (import files, export files, attachments). Metadata and
 * provenance live in PostgreSQL; the bytes live here. Keys are content addresses
 * (`sha256/<2>/<hash>`), so identical content is stored once and keys never contain user input.
 */
export interface ObjectStorage {
  put(bytes: Uint8Array): Promise<{ key: string; sha256: string; byteSize: number }>
  get(key: string): Promise<Uint8Array>
  readonly description: string
}

const KEY = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/

/** Local filesystem adapter for development and tests. */
export function localObjectStorage(root: string): ObjectStorage {
  const base = resolve(root)
  const pathOf = (key: string) => {
    if (!KEY.test(key)) throw new Error(`Invalid storage key ${key}`)
    const p = resolve(base, ...key.split('/'))
    if (!p.startsWith(base + sep)) throw new Error('Storage key escapes the storage root')
    return p
  }
  return {
    description: `local filesystem (${base})`,
    async put(bytes) {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const key = `sha256/${sha256.slice(0, 2)}/${sha256}`
      const path = pathOf(key)
      const exists = await stat(path).then(() => true, () => false)
      if (!exists) {
        await mkdir(dirname(path), { recursive: true })
        const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
        await writeFile(tmp, bytes)
        await rename(tmp, path)
      }
      return { key, sha256, byteSize: bytes.byteLength }
    },
    async get(key) {
      return new Uint8Array(await readFile(pathOf(key)))
    },
  }
}

/** In-memory adapter (unit tests). */
export function memoryObjectStorage(): ObjectStorage {
  const map = new Map<string, Uint8Array>()
  return {
    description: 'in-memory',
    async put(bytes) {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const key = `sha256/${sha256.slice(0, 2)}/${sha256}`
      map.set(key, bytes)
      return { key, sha256, byteSize: bytes.byteLength }
    },
    async get(key) {
      const v = map.get(key)
      if (!v) throw new Error(`No object ${key}`)
      return v
    },
  }
}

export const joinPath = join
