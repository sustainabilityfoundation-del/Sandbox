/** Element identifiers: random UUIDs (v4) for model elements, name-based UUIDs (v5) for library elements. */

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  // Fallback (old runtimes): RFC 4122 v4 from Math.random. Not used in supported environments.
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  return format(b)
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Namespace for library element IDs (a fixed random UUID, chosen once). */
export const LIBRARY_NAMESPACE = '3f1c6a52-8d0e-4b8a-9a35-6a1b2c7d9e40'

/** RFC 4122 version 5 (SHA-1, name-based) UUID: deterministic IDs for library elements. */
export function uuidV5(name: string, namespace: string = LIBRARY_NAMESPACE): string {
  const ns = namespace.replace(/-/g, '').match(/../g)!.map((h) => parseInt(h, 16))
  const bytes = [...ns, ...utf8(name)]
  const hash = sha1(bytes)
  const b = hash.slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  return format(b)
}

function format(b: number[]): string {
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s))
}

/** Minimal synchronous SHA-1 (only for name-based UUIDs; not for security). */
function sha1(bytes: number[]): number[] {
  const ml = bytes.length * 8
  const msg = [...bytes, 0x80]
  while (msg.length % 64 !== 56) msg.push(0)
  for (let i = 7; i >= 0; i--) msg.push(i >= 4 ? 0 : (ml >>> (i * 8)) & 0xff)
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Array<number>(80)
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (x << 1) | (x >>> 31)
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6]
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }
  return [h0, h1, h2, h3, h4].flatMap((h) => [(h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff])
}
