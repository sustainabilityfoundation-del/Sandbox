import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Credential encryption at rest (AES-256-GCM, random 96-bit IV, authenticated with a context string so a
 * ciphertext cannot be moved to another user's record) and signing of tool calls the server issued.
 * The key comes from the server environment (EWS_ASSISTANT_KEY, 32 bytes as base64 or hex). It is never
 * logged and never sent anywhere.
 */
export class CredentialVault {
  private readonly key: Buffer
  private readonly macKey: Buffer

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('The assistant credential key must be 32 bytes (EWS_ASSISTANT_KEY, base64 or hex).')
    this.key = key
    this.macKey = createHash('sha256').update(Buffer.concat([Buffer.from('ews-assistant-call-signing:'), key])).digest()
  }

  /** Parses EWS_ASSISTANT_KEY (base64 or 64 hex characters). */
  static parseKey(text: string): Buffer {
    const t = text.trim()
    return /^[0-9a-f]{64}$/i.test(t) ? Buffer.from(t, 'hex') : Buffer.from(t, 'base64')
  }

  static randomKey(): Buffer {
    return randomBytes(32)
  }

  encrypt(plaintext: string, context: string): Buffer {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(context))
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    // Format: version byte 1 | iv (12) | tag (16) | ciphertext
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body])
  }

  decrypt(blob: Buffer, context: string): string {
    if (blob[0] !== 1) throw new Error('Unknown credential format.')
    const decipher = createDecipheriv('aes-256-gcm', this.key, blob.subarray(1, 13))
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(blob.subarray(13, 29))
    return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]).toString('utf8')
  }

  /** Signature binding a tool call to the user, its name and exact arguments. */
  sign(parts: string[]): string {
    return createHmac('sha256', this.macKey).update(parts.join('\u0000')).digest('base64url').slice(0, 22)
  }

  verify(parts: string[], signature: string): boolean {
    const expected = Buffer.from(this.sign(parts))
    const given = Buffer.from(signature)
    return expected.length === given.length && timingSafeEqual(expected, given)
  }
}

/** Deterministic JSON (sorted keys) for signing arguments. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  return `{${Object.keys(v as object)
    .sort()
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
