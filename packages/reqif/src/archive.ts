import { strToU8, unzipSync, zipSync } from 'fflate'

/**
 * `.reqifz` packaging: a ZIP archive with one or more `.reqif` files and the files their XHTML
 * `object` elements reference (convention used by ReqIF tools, e.g. ProSTEP iViP implementation
 * guide; not part of the OMG specification itself). Paths are constrained: no absolute paths,
 * drive letters, `..` segments or backslash tricks; entry count and sizes are limited.
 */

export const LIMITS = { entries: 10000, totalBytes: 512 * 1024 * 1024, entryBytes: 128 * 1024 * 1024 }

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchiveError'
  }
}

/** Normalises an archive-internal path, or returns null if it is not a safe relative path. */
export function safeArchivePath(p: string): string | null {
  if (!p || p.length > 1024 || /[\u0000-\u001f]/.test(p)) return null
  const s = p.replace(/\\/g, '/')
  if (s.startsWith('/') || /^[a-zA-Z]:/.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s)) return null
  const parts: string[] = []
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') return null
    parts.push(seg)
  }
  return parts.length ? parts.join('/') : null
}

/** Resolves an object data reference relative to the ReqIF file inside the archive. */
export function resolveReference(reqifPath: string, data: string): string | null {
  let d: string
  try {
    d = decodeURIComponent(data.trim())
  } catch {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(d)) return null // URLs and schemes are never followed
  const dir = reqifPath.includes('/') ? reqifPath.slice(0, reqifPath.lastIndexOf('/') + 1) : ''
  return safeArchivePath(dir + d)
}

export interface ReqifzContents {
  reqifFiles: { path: string; bytes: Uint8Array }[]
  files: Map<string, Uint8Array>
  rejected: string[]
}

export function readReqifz(bytes: Uint8Array): ReqifzContents {
  let total = 0
  let count = 0
  const rejected: string[] = []
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        count++
        if (count > LIMITS.entries) throw new ArchiveError(`The archive has more than ${LIMITS.entries} entries.`)
        if (f.originalSize > LIMITS.entryBytes) throw new ArchiveError(`Entry ${f.name} is larger than ${LIMITS.entryBytes} bytes.`)
        total += f.originalSize
        if (total > LIMITS.totalBytes) throw new ArchiveError('The archive expands to more than 512 MB.')
        if (f.name.endsWith('/')) return false
        if (!safeArchivePath(f.name)) {
          rejected.push(f.name)
          return false
        }
        return true
      },
    })
  } catch (e) {
    if (e instanceof ArchiveError) throw e
    throw new ArchiveError(`Not a valid ZIP archive: ${e instanceof Error ? e.message : String(e)}`)
  }
  const files = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(entries)) files.set(safeArchivePath(name)!, data)
  const reqifFiles = [...files.entries()].filter(([p]) => /\.reqif$/i.test(p)).map(([path, b]) => ({ path, bytes: b }))
  if (!reqifFiles.length) throw new ArchiveError('The archive contains no .reqif file.')
  return { reqifFiles, files, rejected }
}

export function writeReqifz(reqif: { path: string; xml: string }, attachments: { path: string; bytes: Uint8Array }[]): Uint8Array {
  const entries: Record<string, Uint8Array> = { [reqif.path]: strToU8(reqif.xml) }
  for (const a of attachments) {
    const p = safeArchivePath(a.path)
    if (!p) throw new ArchiveError(`Unsafe attachment path ${a.path}`)
    entries[p] = a.bytes
  }
  return zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') })
}
