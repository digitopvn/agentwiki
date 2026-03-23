/** Middleware for internal API endpoints — validates shared secret from VPS extraction service */

import type { Context, Next } from 'hono'
import type { Env } from '../env'

/** Timing-safe string comparison using native crypto.subtle.timingSafeEqual (CF Workers) */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  // Encode first, then pad byte arrays to equal length (handles multi-byte UTF-8 correctly)
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  const maxLen = Math.max(aBytes.length, bBytes.length) || 1
  const aBuf = new Uint8Array(maxLen)
  const bBuf = new Uint8Array(maxLen)
  aBuf.set(aBytes)
  bBuf.set(bBytes)
  return crypto.subtle.timingSafeEqual(aBuf, bBuf)
}

/** Validate X-Internal-Secret header against EXTRACTION_INTERNAL_SECRET env var */
export async function internalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  // Fail-closed: reject all requests if secret is not configured
  if (!c.env.EXTRACTION_INTERNAL_SECRET) {
    console.error('EXTRACTION_INTERNAL_SECRET is not configured')
    return c.json({ error: 'Service misconfigured' }, 503)
  }
  const secret = c.req.header('X-Internal-Secret')
  if (!secret || !timingSafeEqual(secret, c.env.EXTRACTION_INTERNAL_SECRET)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
