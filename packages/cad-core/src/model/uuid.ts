/**
 * Stable UUIDs for entities inside a document (parts now; assemblies and configurations later).
 * Name-based UUID version 5 (RFC 9562): namespace = the document UUID, name = the document-local
 * entity ID ("part-1"). Any implementation reproduces it from the native file, the value never
 * changes while the IDs do not, and it is globally unique because the document UUID is.
 */

function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length * 8
  const withPad = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
  withPad.set(bytes)
  withPad[bytes.length] = 0x80
  const view = new DataView(withPad.buffer)
  view.setUint32(withPad.length - 4, ml >>> 0)
  view.setUint32(withPad.length - 8, Math.floor(ml / 2 ** 32))
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (x << 1) | (x >>> 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const ov = new DataView(out.buffer)
  ;[h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h))
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) return sha1(utf8(uuid)).slice(0, 16)
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** RFC 9562 version-5 UUID of `name` in `namespace` (a UUID; other strings are hashed into one). */
export function uuidV5(namespace: string, name: string): string {
  const ns = uuidBytes(namespace)
  const n = utf8(name)
  const input = new Uint8Array(ns.length + n.length)
  input.set(ns)
  input.set(n, ns.length)
  const h = sha1(input).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Stable UUID of a document-local entity (part, later assembly or configuration). */
export function entityUuid(documentId: string, entityId: string): string {
  return uuidV5(documentId, entityId)
}
