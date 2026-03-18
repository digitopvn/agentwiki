/** JWT and cryptographic utilities using Web Crypto API */

import type { JwtPayload } from '@agentwiki/shared'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Import HMAC key for JWT signing/verification */
async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Base64url encode */
function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Base64url decode */
function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Sign a JWT with HMAC-SHA256 */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)))
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await getHmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))

  return `${signingInput}.${base64urlEncode(signature)}`
}

/** Verify and decode a JWT */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await getHmacKey(secret)
  const signature = base64urlDecode(signatureB64)
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(signingInput))
  if (!valid) return null

  const payload: JwtPayload = JSON.parse(decoder.decode(base64urlDecode(payloadB64)))
  if (payload.exp && payload.exp * 1000 < Date.now()) return null

  return payload
}

/** SHA-256 hash a string (for refresh tokens) */
export async function hashToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return base64urlEncode(hash)
}

/** Generate cryptographically secure random token */
export function generateRandomToken(length = 48): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64urlEncode(bytes)
}

/** Hash an API key with PBKDF2 + salt */
export async function hashApiKey(key: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return base64urlEncode(derived)
}

/** Generate a unique ID using nanoid-style approach */
export function generateId(length = 21): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let id = ''
  for (let i = 0; i < length; i++) id += chars[bytes[i] % chars.length]
  return id
}
