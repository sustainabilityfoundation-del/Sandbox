import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

/**
 * Content-addressed blob store (ADR-0066). Keys are `sha256/<2>/<hash>`: identical content is stored once,
 * keys never contain user input, and integrity is checkable from the key alone. PostgreSQL holds the
 * catalogue (projects.blobs) and the meaning (document versions); the bytes live here. Bytes are never
 * deleted through the application.
 */
export interface BlobStore {
  put(bytes: Uint8Array): Promise<{ key: string; sha256: string; byteSize: number }>
  /** Reads the bytes; with `verify` the content hash is checked against the key (BlobIntegrityError). */
  get(key: string, options?: { verify?: boolean }): Promise<Uint8Array>
  has(key: string): Promise<boolean>
  readonly description: string
}

export const BLOB_KEY = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/

export class BlobIntegrityError extends Error {
  constructor(readonly key: string, readonly actualSha256: string) {
    super(`Stored content for ${key} does not match its hash (found ${actualSha256}).`)
    this.name = 'BlobIntegrityError'
  }
}

export class BlobNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No stored content for ${key}.`)
    this.name = 'BlobNotFoundError'
  }
}

export const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export const keyOf = (sha256: string) => `sha256/${sha256.slice(0, 2)}/${sha256}`

function checkKey(key: string) {
  if (!BLOB_KEY.test(key)) throw new Error(`Invalid blob key ${key}`)
}

function verified(key: string, bytes: Uint8Array, verify: boolean | undefined): Uint8Array {
  if (verify) {
    const actual = sha256Of(bytes)
    if (keyOf(actual) !== key) throw new BlobIntegrityError(key, actual)
  }
  return bytes
}

/** Local filesystem adapter (development: STORAGE_DIR, default `.data/objects`, git-ignored). Atomic writes. */
export function localBlobStore(root: string): BlobStore {
  const base = resolve(root)
  const pathOf = (key: string) => {
    checkKey(key)
    const p = resolve(base, ...key.split('/'))
    if (!p.startsWith(base + sep)) throw new Error('Blob key escapes the storage root')
    return p
  }
  return {
    description: `local filesystem (${base})`,
    async put(bytes) {
      const sha256 = sha256Of(bytes)
      const key = keyOf(sha256)
      const path = pathOf(key)
      const exists = await stat(path).then(
        () => true,
        () => false,
      )
      if (!exists) {
        await mkdir(dirname(path), { recursive: true })
        const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
        await writeFile(tmp, bytes)
        await rename(tmp, path)
      }
      return { key, sha256, byteSize: bytes.byteLength }
    },
    async get(key, options) {
      const bytes = await readFile(pathOf(key)).then(
        (b) => new Uint8Array(b),
        (e: NodeJS.ErrnoException) => {
          throw e.code === 'ENOENT' ? new BlobNotFoundError(key) : e
        },
      )
      return verified(key, bytes, options?.verify)
    },
    async has(key) {
      return stat(pathOf(key)).then(
        () => true,
        () => false,
      )
    },
  }
}

/** In-memory adapter (tests). `corrupt` replaces stored bytes to exercise integrity checks. */
export function memoryBlobStore(): BlobStore & { corrupt(key: string, bytes: Uint8Array): void; drop(key: string): void } {
  const map = new Map<string, Uint8Array>()
  return {
    description: 'in-memory',
    async put(bytes) {
      const sha256 = sha256Of(bytes)
      const key = keyOf(sha256)
      if (!map.has(key)) map.set(key, new Uint8Array(bytes))
      return { key, sha256, byteSize: bytes.byteLength }
    },
    async get(key, options) {
      checkKey(key)
      const v = map.get(key)
      if (!v) throw new BlobNotFoundError(key)
      return verified(key, v, options?.verify)
    },
    async has(key) {
      return map.has(key)
    },
    corrupt(key, bytes) {
      map.set(key, bytes)
    },
    drop(key) {
      map.delete(key)
    },
  }
}
