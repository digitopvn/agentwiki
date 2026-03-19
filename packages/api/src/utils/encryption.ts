/** AES-256-GCM encryption for storing AI provider API keys at rest */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Derive AES-256-GCM key from secret using PBKDF2 */
async function getAesKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('agentwiki-ai-keys'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt plaintext string, returns base64-encoded IV+ciphertext */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await getAesKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/** Decrypt base64-encoded IV+ciphertext, returns plaintext string */
export async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getAesKey(secret)
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return decoder.decode(plaintext)
}
